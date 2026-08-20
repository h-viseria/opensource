/**
 * Payroll module — salary heads, structures, runs, payslips (Phase 2).
 * No accounting posting (Phase 3).
 */

import {
  EMPLOYMENT_STATUS,
  EVENTS,
  PAYROLL_ACCOUNTING_CLASS,
  PAYROLL_ACCOUNTING_STATUS,
  PAYROLL_RUN_STATUS,
  SALARY_CALC_BASIS,
  SALARY_CALC_TYPES,
  SALARY_HEAD_TYPES,
} from '../core/constants.js';
import { emit } from '../core/eventBus.js';
import { uuid } from '../core/uuid.js';
import { nowIso, toDateInput } from '../utils/date.js';
import { roundMoney } from '../utils/money.js';
import { DEFAULT_SALARY_HEADS, createDefaultPayrollSettings } from '../data/payrollDefaults.js';
import {
  calculateEmployeePayroll,
  countPeriodWorkingDays,
  periodFromMonth,
  resolveEffectiveSalaryLines,
} from '../engine/payrollEngine.js';
import {
  employeePayrollAccountRepository,
  employeeSalaryLineRepository,
  payrollItemRepository,
  payrollRunRepository,
  payrollSettingsRepository,
  salaryAdjustmentRepository,
  salaryHeadRepository,
} from '../repositories/payrollRepositories.js';
import * as peopleService from './peopleService.js';

function touch() {
  emit(EVENTS.PAYROLL_CHANGED, { at: nowIso() });
}

/** Exported for payroll accounting bridge. */
export function touchPayroll() {
  touch();
}

/**
 * @param {string} bookId
 * @param {string} [currency]
 */
export async function ensurePayrollMasters(bookId, currency) {
  if (!bookId) return;
  await peopleService.ensurePeopleMasters(bookId);
  const at = nowIso();

  let settings = await payrollSettingsRepository.findByBook(bookId);
  if (!settings) {
    settings = createDefaultPayrollSettings(bookId, uuid(), at, currency || 'INR');
    await payrollSettingsRepository.save(settings);
  }

  const heads = await salaryHeadRepository.findByBook(bookId);
  if (!heads.length) {
    let order = 0;
    for (const h of DEFAULT_SALARY_HEADS) {
      await salaryHeadRepository.save({
        id: uuid(),
        bookId,
        ...h,
        basisSalaryHeadId: null,
        ledgerId: null, // Phase 3
        isSystem: true,
        isActive: true,
        sortOrder: order++,
        createdAt: at,
        updatedAt: at,
      });
    }
  } else {
    // Backfill accountingClass on older heads
    for (const h of heads) {
      if (h.accountingClass) continue;
      const accountingClass =
        h.headType === SALARY_HEAD_TYPES.DEDUCTION
          ? PAYROLL_ACCOUNTING_CLASS.DEDUCTION
          : PAYROLL_ACCOUNTING_CLASS.SALARY;
      await salaryHeadRepository.save({ ...h, accountingClass, updatedAt: at });
    }
  }
  // Do not call getPayrollSettings here — it calls ensurePayrollMasters (infinite loop).
  return settings;
}

/** @param {string} bookId */
export async function purgePayroll(bookId) {
  await Promise.all([
    salaryHeadRepository.deleteByBook(bookId),
    employeeSalaryLineRepository.deleteByBook(bookId),
    payrollSettingsRepository.deleteByBook(bookId),
    salaryAdjustmentRepository.deleteByBook(bookId),
    payrollRunRepository.deleteByBook(bookId),
    payrollItemRepository.deleteByBook(bookId),
    employeePayrollAccountRepository.deleteByBook(bookId),
  ]);
  touch();
}

/* ─── Settings ─── */

/** @param {string} bookId */
export async function getPayrollSettings(bookId) {
  await ensurePayrollMasters(bookId);
  return payrollSettingsRepository.findByBook(bookId);
}

/**
 * @param {string} bookId
 * @param {object} patch
 */
export async function updatePayrollSettings(bookId, patch) {
  const current = await getPayrollSettings(bookId);
  if (!current) throw new Error('Payroll settings not found');
  const next = { ...current, ...patch, id: current.id, bookId, updatedAt: nowIso() };
  await payrollSettingsRepository.save(next);
  touch();
  return next;
}

/* ─── Salary heads ─── */

/** @param {string} bookId */
export async function listSalaryHeads(bookId, { activeOnly = false } = {}) {
  await ensurePayrollMasters(bookId);
  let rows = await salaryHeadRepository.findByBook(bookId);
  if (activeOnly) rows = rows.filter((h) => h.isActive !== false);
  return rows.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
}

/**
 * @param {string} bookId
 * @param {object} input
 */
export async function createSalaryHead(bookId, input) {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('Salary head name is required');
  const existing = await listSalaryHeads(bookId);
  if (existing.some((h) => h.name.toLowerCase() === name.toLowerCase())) {
    throw new Error(`Salary head “${name}” already exists`);
  }
  const at = nowIso();
  const headType =
    input.headType === SALARY_HEAD_TYPES.DEDUCTION ? SALARY_HEAD_TYPES.DEDUCTION : SALARY_HEAD_TYPES.EARNING;
  let accountingClass = input.accountingClass || null;
  if (!accountingClass) {
    accountingClass =
      headType === SALARY_HEAD_TYPES.DEDUCTION
        ? PAYROLL_ACCOUNTING_CLASS.DEDUCTION
        : PAYROLL_ACCOUNTING_CLASS.SALARY;
  }
  const row = {
    id: uuid(),
    bookId,
    name,
    headType,
    accountingClass,
    calcType: input.calcType || SALARY_CALC_TYPES.FIXED,
    calcBasis: input.calcBasis || SALARY_CALC_BASIS.MANUAL,
    amount: input.amount != null ? Number(input.amount) : 0,
    percentage: input.percentage != null ? Number(input.percentage) : null,
    multiplier: input.multiplier != null ? Number(input.multiplier) : 1,
    formula: input.formula || null,
    basisSalaryHeadId: input.basisSalaryHeadId || null,
    recurring: input.recurring !== false,
    showOnPayslip: input.showOnPayslip !== false,
    isBasic: !!input.isBasic,
    includeWithoutStructure: !!input.includeWithoutStructure,
    ledgerId: input.ledgerId || null,
    isSystem: false,
    isActive: input.isActive !== false,
    sortOrder: existing.length,
    createdAt: at,
    updatedAt: at,
  };
  await salaryHeadRepository.save(row);
  touch();
  return row;
}

/**
 * @param {string} id
 * @param {object} patch
 */
export async function updateSalaryHead(id, patch) {
  const current = await salaryHeadRepository.findById(id);
  if (!current) throw new Error('Salary head not found');
  const next = { ...current, ...patch, id: current.id, bookId: current.bookId, updatedAt: nowIso() };
  await salaryHeadRepository.save(next);
  touch();
  return next;
}

/* ─── Employee salary structure (with history) ─── */

/**
 * @param {string} bookId
 * @param {string} employeeId
 * @param {string} [asOfDate]
 */
export async function getEmployeeSalaryStructure(bookId, employeeId, asOfDate) {
  const asOf = asOfDate || toDateInput(new Date());
  const [allLines, heads] = await Promise.all([
    employeeSalaryLineRepository.findByEmployee(employeeId),
    listSalaryHeads(bookId),
  ]);
  const mine = allLines.filter((l) => l.bookId === bookId);
  const effective = resolveEffectiveSalaryLines(mine, asOf);
  const headsById = new Map(heads.map((h) => [h.id, h]));
  return {
    asOf,
    lines: effective.map((l) => ({ ...l, head: headsById.get(l.salaryHeadId) || null })),
    history: mine.sort((a, b) => String(b.effectiveFrom).localeCompare(String(a.effectiveFrom))),
    heads,
  };
}

/**
 * Add or change a salary line. Never overwrites history — new effectiveFrom creates a new row.
 * @param {string} bookId
 * @param {string} employeeId
 * @param {object} input
 */
export async function upsertEmployeeSalaryLine(bookId, employeeId, input) {
  const emp = await peopleService.getEmployee(employeeId);
  if (!emp || emp.bookId !== bookId) throw new Error('Employee not found');
  const salaryHeadId = input.salaryHeadId;
  if (!salaryHeadId) throw new Error('Salary head is required');
  const head = await salaryHeadRepository.findById(salaryHeadId);
  if (!head || head.bookId !== bookId) throw new Error('Salary head not found');

  const effectiveFrom = String(input.effectiveFrom || toDateInput(new Date())).slice(0, 10);
  const at = nowIso();
  const row = {
    id: uuid(),
    bookId,
    employeeId,
    salaryHeadId,
    amount: input.amount != null ? Number(input.amount) : head.amount,
    percentage: input.percentage != null ? Number(input.percentage) : head.percentage,
    multiplier: input.multiplier != null ? Number(input.multiplier) : head.multiplier,
    calcType: input.calcType || null,
    calcBasis: input.calcBasis || null,
    basisSalaryHeadId: input.basisSalaryHeadId || null,
    effectiveFrom,
    effectiveTo: input.effectiveTo || null,
    notes: input.notes || null,
    createdAt: at,
    updatedAt: at,
  };
  await employeeSalaryLineRepository.save(row);
  touch();
  return row;
}

/**
 * Soft-end a salary line (set effectiveTo) rather than delete history.
 * @param {string} lineId
 * @param {string} [effectiveTo]
 */
export async function endEmployeeSalaryLine(lineId, effectiveTo) {
  const line = await employeeSalaryLineRepository.findById(lineId);
  if (!line) throw new Error('Salary line not found');
  const next = {
    ...line,
    effectiveTo: effectiveTo || toDateInput(new Date()),
    updatedAt: nowIso(),
  };
  await employeeSalaryLineRepository.save(next);
  touch();
  return next;
}

/* ─── Adjustments ─── */

/**
 * @param {string} bookId
 * @param {object} input
 */
export async function createSalaryAdjustment(bookId, input) {
  const at = nowIso();
  const row = {
    id: uuid(),
    bookId,
    employeeId: input.employeeId,
    payrollRunId: input.payrollRunId || null,
    salaryHeadId: input.salaryHeadId || null,
    headType: input.headType === SALARY_HEAD_TYPES.DEDUCTION ? SALARY_HEAD_TYPES.DEDUCTION : SALARY_HEAD_TYPES.EARNING,
    description: String(input.description || 'Adjustment').trim(),
    amount: Number(input.amount) || 0,
    recurring: !!input.recurring,
    createdAt: at,
    updatedAt: at,
  };
  if (!row.employeeId) throw new Error('Employee is required');
  await salaryAdjustmentRepository.save(row);
  touch();
  return row;
}

/** @param {string} id */
export async function deleteSalaryAdjustment(id) {
  await salaryAdjustmentRepository.delete(id);
  touch();
}

/**
 * @param {string} bookId
 * @param {{ employeeId?: string, payrollRunId?: string }} [filter]
 */
export async function listSalaryAdjustments(bookId, filter = {}) {
  let rows = await salaryAdjustmentRepository.findByBook(bookId);
  if (filter.employeeId) rows = rows.filter((r) => r.employeeId === filter.employeeId);
  if (filter.payrollRunId) {
    rows = rows.filter((r) => r.payrollRunId === filter.payrollRunId || (r.recurring && !r.payrollRunId));
  }
  return rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

/**
 * Delete a draft/calculated/reviewed run (not finalized).
 * @param {string} runId
 */
export async function deletePayrollRun(runId) {
  const run = await payrollRunRepository.findById(runId);
  if (!run) throw new Error('Payroll run not found');
  if (run.status === PAYROLL_RUN_STATUS.FINALIZED) {
    throw new Error('Finalized payroll cannot be deleted — use an adjustment/reversal instead');
  }
  const items = await payrollItemRepository.findByRun(runId);
  for (const item of items) await payrollItemRepository.delete(item.id);
  await payrollRunRepository.delete(runId);
  touch();
}

/* ─── Payroll runs ─── */

/** @param {string} bookId */
export async function listPayrollRuns(bookId) {
  await ensurePayrollMasters(bookId);
  const rows = await payrollRunRepository.findByBook(bookId);
  return rows.sort((a, b) => String(b.periodStart).localeCompare(String(a.periodStart)));
}

/** @param {string} id */
export async function getPayrollRun(id) {
  return payrollRunRepository.findById(id);
}

/**
 * @param {string} payrollRunId
 */
export async function listPayrollItems(payrollRunId) {
  const rows = await payrollItemRepository.findByRun(payrollRunId);
  return rows.sort((a, b) => String(a.employeeName || '').localeCompare(String(b.employeeName || '')));
}

/** @param {string} id */
export async function getPayrollItem(id) {
  return payrollItemRepository.findById(id);
}

/**
 * @param {string} id
 * @param {object} patch
 */
export async function savePayrollItemPatch(id, patch) {
  const current = await payrollItemRepository.findById(id);
  if (!current) throw new Error('Payroll item not found');
  const next = { ...current, ...patch, id: current.id, bookId: current.bookId, updatedAt: nowIso() };
  await payrollItemRepository.save(next);
  return next;
}

/**
 * Create a draft payroll run for a month (YYYY-MM) or custom dates.
 * @param {string} bookId
 * @param {{ month?: string, periodStart?: string, periodEnd?: string, payDate?: string, employeeIds?: string[]|null }} input
 */
export async function createPayrollRun(bookId, input) {
  await ensurePayrollMasters(bookId);
  let startDate = input.periodStart;
  let endDate = input.periodEnd;
  let label = '';
  if (input.month) {
    const p = periodFromMonth(input.month);
    startDate = p.startDate;
    endDate = p.endDate;
    label = input.month;
  }
  if (!startDate || !endDate) throw new Error('Payroll period is required');
  if (endDate < startDate) throw new Error('Period end must be on or after start');

  const existing = await listPayrollRuns(bookId);
  const dup = existing.find(
    (r) =>
      r.periodStart === startDate &&
      r.periodEnd === endDate &&
      r.status === PAYROLL_RUN_STATUS.FINALIZED,
  );
  if (dup) {
    throw new Error('A finalized payroll already exists for this period');
  }

  const attSettings = await peopleService.getAttendanceSettings(bookId);
  const workingDays = countPeriodWorkingDays(startDate, endDate, attSettings);
  const calendarDays =
    Math.round(
      (new Date(`${endDate}T12:00:00`).getTime() - new Date(`${startDate}T12:00:00`).getTime()) /
        86400000,
    ) + 1;

  const at = nowIso();
  const run = {
    id: uuid(),
    bookId,
    label: label || `${startDate} → ${endDate}`,
    periodStart: startDate,
    periodEnd: endDate,
    payDate: input.payDate || endDate,
    status: PAYROLL_RUN_STATUS.DRAFT,
    employeeIds: input.employeeIds || null,
    workingDays,
    calendarDays,
    totals: { employees: 0, gross: 0, deductions: 0, net: 0 },
    warnings: [],
    accountingStatus: PAYROLL_ACCOUNTING_STATUS.NOT_POSTED,
    journalVoucherId: null,
    journalVoucherNumber: null,
    postingDate: null,
    reversalVoucherId: null,
    paymentVoucherId: null,
    paymentVoucherIds: [],
    createdAt: at,
    updatedAt: at,
    finalizedAt: null,
  };
  await payrollRunRepository.save(run);
  touch();
  return run;
}

/**
 * Calculate / recalculate all items for a run.
 * @param {string} runId
 */
export async function calculatePayrollRun(runId) {
  const run = await payrollRunRepository.findById(runId);
  if (!run) throw new Error('Payroll run not found');
  if (run.status === PAYROLL_RUN_STATUS.FINALIZED) {
    throw new Error('Finalized payroll cannot be recalculated');
  }

  const bookId = run.bookId;
  const [settings, attSettings, heads, employees, leaveTypes] = await Promise.all([
    getPayrollSettings(bookId),
    peopleService.getAttendanceSettings(bookId),
    listSalaryHeads(bookId, { activeOnly: true }),
    peopleService.listEmployees(bookId, { includeInactive: true }),
    peopleService.listLeaveTypes(bookId),
  ]);

  const unpaidTypeIds = new Set(leaveTypes.filter((t) => !t.paid).map((t) => t.id));
  let selected = employees.filter((e) => e.status === EMPLOYMENT_STATUS.ACTIVE);
  if (Array.isArray(run.employeeIds) && run.employeeIds.length) {
    const allow = new Set(run.employeeIds);
    selected = employees.filter((e) => allow.has(e.id));
  }

  // Clear prior items
  const prior = await payrollItemRepository.findByRun(runId);
  for (const p of prior) await payrollItemRepository.delete(p.id);

  const monthKey = String(run.periodStart).slice(0, 7);
  const attSummary = await peopleService.getAttendanceSummary(bookId, monthKey);
  const attByEmp = new Map(attSummary.rows.map((r) => [r.employee.id, r]));

  const adjustments = (await salaryAdjustmentRepository.findByBook(bookId)).filter(
    (a) => a.payrollRunId === runId || (a.recurring && !a.payrollRunId),
  );

  /** @type {string[]} */
  const warnings = [];
  let gross = 0;
  let deductions = 0;
  let net = 0;
  let count = 0;

  const period = {
    startDate: run.periodStart,
    endDate: run.periodEnd,
    calendarDays: run.calendarDays,
    workingDays: run.workingDays,
  };

  for (const emp of selected) {
    if (emp.status !== EMPLOYMENT_STATUS.ACTIVE) {
      warnings.push(`${emp.employeeCode}: inactive`);
    }
    const structure = await getEmployeeSalaryStructure(bookId, emp.id, run.periodEnd);
    if (!structure.lines.length) {
      warnings.push(`${emp.employeeCode}: missing salary structure`);
    }

    const attRow = attByEmp.get(emp.id);
    const attendance = {
      present: attRow?.present ?? 0,
      leave: attRow?.leave ?? 0,
      unpaidLeave: attRow?.unpaidLeave ?? 0,
      overtimeHours: attRow?.overtimeHours ?? 0,
    };
    if (!attRow) warnings.push(`${emp.employeeCode}: no attendance summary for ${monthKey}`);

    // Refine unpaid leave from leave records in period
    const leaveRecs = await peopleService.listLeaveRecords(bookId, { employeeId: emp.id });
    let unpaidDays = 0;
    for (const lr of leaveRecs) {
      if (!unpaidTypeIds.has(lr.leaveTypeId)) continue;
      if (lr.endDate < run.periodStart || lr.startDate > run.periodEnd) continue;
      unpaidDays += Number(lr.days) || 0;
    }
    if (unpaidDays > 0) attendance.unpaidLeave = unpaidDays;

    const empAdj = adjustments.filter((a) => a.employeeId === emp.id);
    const result = calculateEmployeePayroll({
      heads,
      effectiveLines: structure.lines,
      attendance,
      adjustments: empAdj,
      settings,
      attendanceSettings: attSettings,
      period,
    });

    if (result.net < 0) warnings.push(`${emp.employeeCode}: negative net salary`);

    const at = nowIso();
    const item = {
      id: uuid(),
      bookId,
      payrollRunId: runId,
      employeeId: emp.id,
      employeeCode: emp.employeeCode,
      employeeName: emp.name,
      ...result,
      warnings: structure.lines.length ? [] : ['Missing salary structure'],
      createdAt: at,
      updatedAt: at,
    };
    await payrollItemRepository.save(item);
    gross += result.gross;
    deductions += result.totalDeductions;
    net += result.net;
    count += 1;
  }

  const updated = {
    ...run,
    status: PAYROLL_RUN_STATUS.CALCULATED,
    totals: {
      employees: count,
      gross: roundMoney(gross),
      deductions: roundMoney(deductions),
      net: roundMoney(net),
    },
    warnings,
    updatedAt: nowIso(),
  };
  await payrollRunRepository.save(updated);
  touch();
  return updated;
}

/**
 * @param {string} runId
 * @param {'Reviewed'|'Finalized'} status
 */
export async function setPayrollRunStatus(runId, status) {
  const run = await payrollRunRepository.findById(runId);
  if (!run) throw new Error('Payroll run not found');
  if (run.status === PAYROLL_RUN_STATUS.FINALIZED) {
    throw new Error('Finalized payroll is locked');
  }
  if (status === PAYROLL_RUN_STATUS.FINALIZED) {
    if (run.status !== PAYROLL_RUN_STATUS.CALCULATED && run.status !== PAYROLL_RUN_STATUS.REVIEWED) {
      throw new Error('Calculate payroll before finalizing');
    }
  }
  const next = {
    ...run,
    status,
    finalizedAt: status === PAYROLL_RUN_STATUS.FINALIZED ? nowIso() : run.finalizedAt,
    updatedAt: nowIso(),
  };
  await payrollRunRepository.save(next);
  touch();
  return next;
}

/**
 * Mark reviewed.
 * @param {string} runId
 */
export async function reviewPayrollRun(runId) {
  return setPayrollRunStatus(runId, PAYROLL_RUN_STATUS.REVIEWED);
}

/**
 * Finalize payroll (immutable).
 * @param {string} runId
 */
export async function finalizePayrollRun(runId) {
  return setPayrollRunStatus(runId, PAYROLL_RUN_STATUS.FINALIZED);
}

/**
 * Hub stats.
 * @param {string} bookId
 */
export async function getPayrollHubStats(bookId) {
  await ensurePayrollMasters(bookId);
  const [heads, runs, employees] = await Promise.all([
    listSalaryHeads(bookId),
    listPayrollRuns(bookId),
    peopleService.listEmployees(bookId, { includeInactive: false }),
  ]);
  return {
    salaryHeads: heads.length,
    employees: employees.length,
    runs: runs.length,
    lastRun: runs[0] || null,
  };
}

/**
 * Basic final settlement: draft payroll for one inactive (or exiting) employee for a month.
 * @param {string} bookId
 * @param {string} employeeId
 * @param {string} [month] YYYY-MM
 */
export async function createFinalSettlementRun(bookId, employeeId, month) {
  const emp = await peopleService.getEmployee(employeeId);
  if (!emp || emp.bookId !== bookId) throw new Error('Employee not found');
  const m = month || toDateInput(new Date()).slice(0, 7);
  const run = await createPayrollRun(bookId, {
    month: m,
    employeeIds: [employeeId],
  });
  run.label = `Final settlement · ${emp.employeeCode} · ${m}`;
  run.updatedAt = nowIso();
  await payrollRunRepository.save(run);
  touch();
  return run;
}

/**
 * Build printable payslip HTML.
 * @param {object} book
 * @param {object} run
 * @param {object} item
 */
export function buildPayslipHtml(book, run, item) {
  const currency = book.currency || 'INR';
  const earnings = (item.components || []).filter((c) => c.headType === SALARY_HEAD_TYPES.EARNING && c.showOnPayslip !== false);
  const deductions = (item.components || []).filter((c) => c.headType === SALARY_HEAD_TYPES.DEDUCTION && c.showOnPayslip !== false);
  const fmt = (n) =>
    roundMoney(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const rows = (list) =>
    list
      .map(
        (c) =>
          `<tr><td>${escape(c.name)}</td><td style="text-align:right;font-family:monospace">${fmt(c.amount)}</td></tr>`,
      )
      .join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Payslip — ${escape(item.employeeName)}</title>
<style>
  body{font-family:system-ui,sans-serif;color:#1a1c1b;padding:1.5rem;max-width:40rem;margin:0 auto}
  h1{font-size:1.25rem;margin:0 0 .25rem} h2{font-size:1rem;margin:1.25rem 0 .5rem}
  .muted{color:#5c635f;font-size:.875rem} table{width:100%;border-collapse:collapse;margin:.5rem 0}
  th,td{padding:.35rem .25rem;border-bottom:1px solid #ddd;font-size:.9rem}
  th{text-align:left} .tot td{font-weight:600;border-top:2px solid #333}
  @media print{button{display:none}}
</style></head><body>
  <button onclick="window.print()">Print / Save PDF</button>
  <h1>${escape(book.name || 'Company')}</h1>
  <p class="muted">${escape(book.legalName || '')} · ${escape(currency)}</p>
  <h2>Payslip</h2>
  <p>
    <strong>${escape(item.employeeName)}</strong> (${escape(item.employeeCode || '')})<br/>
    Period: ${escape(run.periodStart)} → ${escape(run.periodEnd)} · Pay date: ${escape(run.payDate || '—')}
  </p>
  <h2>Earnings</h2>
  <table><thead><tr><th>Head</th><th style="text-align:right">Amount</th></tr></thead>
  <tbody>${rows(earnings)}
  <tr class="tot"><td>Gross</td><td style="text-align:right;font-family:monospace">${fmt(item.gross)}</td></tr>
  </tbody></table>
  <h2>Deductions</h2>
  <table><thead><tr><th>Head</th><th style="text-align:right">Amount</th></tr></thead>
  <tbody>${rows(deductions)}
  <tr class="tot"><td>Total deductions</td><td style="text-align:right;font-family:monospace">${fmt(item.totalDeductions)}</td></tr>
  </tbody></table>
  <h2>Net pay: <span style="font-family:monospace">${fmt(item.net)}</span></h2>
  <p class="muted">Attendance: Present ${item.attendanceSnapshot?.present ?? '—'},
    Leave ${item.attendanceSnapshot?.leave ?? '—'},
    Unpaid leave ${item.attendanceSnapshot?.unpaidLeave ?? '—'},
    OT hrs ${item.attendanceSnapshot?.overtimeHours ?? '—'}</p>
  <p class="muted">Generated by PicoERP · offline payslip</p>
</body></html>`;
}

function escape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export { SALARY_CALC_TYPES, SALARY_CALC_BASIS, SALARY_HEAD_TYPES, PAYROLL_RUN_STATUS };
