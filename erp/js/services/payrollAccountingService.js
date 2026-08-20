/**
 * Payroll ↔ Accounting bridge (Phase 3).
 * Creates COA groups/ledgers and Journal/Payment vouchers via existing coaService + voucherService.
 * Does not implement a parallel accounting engine.
 */

import {
  PAYROLL_ACCOUNTING_CLASS,
  PAYROLL_ACCOUNTING_STATUS,
  PAYROLL_RUN_STATUS,
  SALARY_HEAD_TYPES,
  VOUCHER_TYPES,
} from '../core/constants.js';
import { ACCOUNT_NATURES } from '../core/accountTypes.js';
import { uuid } from '../core/uuid.js';
import { nowIso, toDateInput } from '../utils/date.js';
import { roundMoney } from '../utils/money.js';
import * as coaService from './coaService.js';
import * as voucherService from './voucherService.js';
import * as bookService from './bookService.js';
import * as peopleService from './peopleService.js';
import * as payrollService from './payrollService.js';
import {
  employeePayrollAccountRepository,
  payrollRunRepository,
  salaryHeadRepository,
} from '../repositories/payrollRepositories.js';

/**
 * @param {object} settings
 */
export function isPayrollAccountingConfigured(settings) {
  return Boolean(
    settings?.salaryMasterGroupId &&
      settings?.deductionMasterGroupId &&
      settings?.taxMasterGroupId,
  );
}

/**
 * @param {string} bookId
 */
export async function getPayrollAccountMapping(bookId) {
  const settings = await payrollService.getPayrollSettings(bookId);
  const groups = await coaService.listGroups(bookId);
  const byId = new Map(groups.map((g) => [g.id, g]));

  const resolve = (groupId) => {
    if (!groupId) return null;
    const g = byId.get(groupId);
    if (!g) return { id: groupId, name: '(missing)', path: '(missing)', nature: null };
    return { id: g.id, name: g.name, path: groupPath(g, byId), nature: g.nature };
  };

  return {
    settings,
    configured: isPayrollAccountingConfigured(settings),
    salary: resolve(settings.salaryMasterGroupId),
    deductions: resolve(settings.deductionMasterGroupId),
    tax: resolve(settings.taxMasterGroupId),
    payable: resolve(settings.salariesPayableGroupId),
    groups,
  };
}

/**
 * @param {object} group
 * @param {Map<string, object>} byId
 */
function groupPath(group, byId) {
  const parts = [group.name];
  let cur = group;
  const guard = new Set();
  while (cur.parentId && !guard.has(cur.id)) {
    guard.add(cur.id);
    cur = byId.get(cur.parentId);
    if (!cur) break;
    parts.unshift(cur.name);
  }
  return parts.join(' → ');
}

/**
 * Save the three master group mappings (future postings only).
 * @param {string} bookId
 * @param {{
 *   salaryMasterGroupId?: string|null,
 *   deductionMasterGroupId?: string|null,
 *   taxMasterGroupId?: string|null,
 *   salariesPayableGroupId?: string|null,
 * }} patch
 */
export async function updatePayrollAccountMapping(bookId, patch) {
  const next = { ...patch };
  // Ensure payable parent: default child under deduction master when not set
  if (next.deductionMasterGroupId && !next.salariesPayableGroupId) {
    const settings = await payrollService.getPayrollSettings(bookId);
    if (!settings.salariesPayableGroupId) {
      const payable = await ensureNamedChildGroup(
        bookId,
        next.deductionMasterGroupId,
        'Salaries Payable',
        ACCOUNT_NATURES.LIABILITY,
      );
      next.salariesPayableGroupId = payable.id;
    }
  }
  return payrollService.updatePayrollSettings(bookId, next);
}

/**
 * Create a ledger group under a parent (or root) via coaService.
 * @param {string} bookId
 * @param {{ name: string, parentId: string|null, nature?: string, code?: string }} input
 */
export async function createPayrollMasterGroup(bookId, input) {
  const parentId = input.parentId || null;
  let nature = input.nature || ACCOUNT_NATURES.EXPENSE;
  if (parentId) {
    const parent = await coaService.getGroup(parentId);
    if (!parent || parent.bookId !== bookId) throw new Error('Parent group not found');
    nature = parent.nature;
  }
  return coaService.createGroup({
    bookId,
    name: String(input.name || '').trim(),
    code: input.code || '',
    nature,
    parentId,
  });
}

/**
 * @param {string} bookId
 * @param {string} parentGroupId
 * @param {string} name
 * @param {string} [natureHint]
 */
async function ensureNamedChildGroup(bookId, parentGroupId, name, natureHint) {
  const groups = await coaService.listGroups(bookId);
  const existing = groups.find((g) => g.parentId === parentGroupId && g.name === name);
  if (existing) return existing;
  let groupName = name;
  if (groups.some((g) => g.name === groupName)) {
    groupName = `${name} · ${parentGroupId.slice(0, 6)}`;
    const again = groups.find((g) => g.parentId === parentGroupId && g.name === groupName);
    if (again) return again;
  }
  const parent = await coaService.getGroup(parentGroupId);
  if (!parent) throw new Error('Parent group not found');
  return coaService.createGroup({
    bookId,
    name: groupName,
    nature: parent.nature || natureHint || ACCOUNT_NATURES.LIABILITY,
    parentId: parentGroupId,
  });
}

/**
 * Resolve accounting class for a head (defaults from headType).
 * @param {object} head
 */
export function resolveAccountingClass(head) {
  if (head?.accountingClass) return head.accountingClass;
  if (head?.headType === SALARY_HEAD_TYPES.DEDUCTION) return PAYROLL_ACCOUNTING_CLASS.DEDUCTION;
  return PAYROLL_ACCOUNTING_CLASS.SALARY;
}

/**
 * Ensure employee Salary / Deductions / Tax / Payable ledgers exist (idempotent).
 * @param {string} bookId
 * @param {object} employee
 * @param {object} settings
 */
export async function ensureEmployeePayrollAccounts(bookId, employee, settings) {
  if (!isPayrollAccountingConfigured(settings)) {
    throw new Error('Payroll accounting is not fully configured.');
  }

  let row = (await employeePayrollAccountRepository.findByBook(bookId)).find(
    (r) => r.employeeId === employee.id,
  );
  if (row?.salaryLedgerId && row?.payableLedgerId) {
    // Refresh ledgers still exist
    const salary = await coaService.getLedger(row.salaryLedgerId);
    const payable = await coaService.getLedger(row.payableLedgerId);
    if (salary && payable) return row;
  }

  const code = employee.employeeCode || employee.id.slice(0, 8);
  const label = `${code} ${employee.name}`.trim();

  const empGroup = await ensureNamedChildGroup(
    bookId,
    settings.salaryMasterGroupId,
    label,
    ACCOUNT_NATURES.EXPENSE,
  );

  const salaryLedger = await ensureLedgerInGroup(
    bookId,
    empGroup.id,
    `${code} — Salary`,
    `payroll-emp:${employee.id}:salary`,
  );
  const deductionLedger = await ensureLedgerInGroup(
    bookId,
    empGroup.id,
    `${code} — Deductions`,
    `payroll-emp:${employee.id}:deduction`,
  );
  const taxLedger = await ensureLedgerInGroup(
    bookId,
    empGroup.id,
    `${code} — Tax`,
    `payroll-emp:${employee.id}:tax`,
  );

  let payableGroupId = settings.salariesPayableGroupId;
  if (!payableGroupId) {
    const payableParent = await ensureNamedChildGroup(
      bookId,
      settings.deductionMasterGroupId,
      'Salaries Payable',
      ACCOUNT_NATURES.LIABILITY,
    );
    payableGroupId = payableParent.id;
    await payrollService.updatePayrollSettings(bookId, { salariesPayableGroupId: payableGroupId });
  }

  const payableLedger = await ensureLedgerInGroup(
    bookId,
    payableGroupId,
    `${code} — Payable`,
    `payroll-emp:${employee.id}:payable`,
  );

  const at = nowIso();
  row = {
    id: row?.id || uuid(),
    bookId,
    employeeId: employee.id,
    employeeGroupId: empGroup.id,
    salaryLedgerId: salaryLedger.id,
    deductionLedgerId: deductionLedger.id,
    taxLedgerId: taxLedger.id,
    payableLedgerId: payableLedger.id,
    createdAt: row?.createdAt || at,
    updatedAt: at,
  };
  await employeePayrollAccountRepository.save(row);
  return row;
}

/**
 * Ensure a liability ledger under deduction/tax master for a salary head.
 * @param {string} bookId
 * @param {object} head
 * @param {object} settings
 */
export async function ensureSalaryHeadLedger(bookId, head, settings) {
  const cls = resolveAccountingClass(head);
  if (cls === PAYROLL_ACCOUNTING_CLASS.SALARY) {
    return null;
  }
  if (head.ledgerId) {
    const existing = await coaService.getLedger(head.ledgerId);
    if (existing) return existing;
  }
  const parentGroupId =
    cls === PAYROLL_ACCOUNTING_CLASS.TAX
      ? settings.taxMasterGroupId
      : settings.deductionMasterGroupId;
  if (!parentGroupId) throw new Error('Payroll accounting is not fully configured.');

  const ledger = await ensureLedgerInGroup(
    bookId,
    parentGroupId,
    head.name,
    `payroll-head:${head.id}`,
  );
  await salaryHeadRepository.save({
    ...head,
    ledgerId: ledger.id,
    updatedAt: nowIso(),
  });
  return ledger;
}

/**
 * Find or create ledger in a group. Book-wide name uniqueness is handled by coaService.
 * @param {string} bookId
 * @param {string} groupId
 * @param {string} name
 * @param {string} [code]
 */
async function ensureLedgerInGroup(bookId, groupId, name, code = '') {
  const ledgers = await coaService.listLedgers(bookId);
  const byCode = code ? ledgers.find((l) => l.code === code) : null;
  if (byCode) return byCode;
  const byName = ledgers.find((l) => l.name === name && l.groupId === groupId);
  if (byName) return byName;
  let ledgerName = name;
  const clash = ledgers.find((l) => l.name === ledgerName);
  if (clash) {
    if (clash.groupId === groupId) return clash;
    ledgerName = `${name} (Payroll)`;
    const renamed = ledgers.find((l) => l.name === ledgerName);
    if (renamed) return renamed;
  }
  return coaService.createLedger({
    bookId,
    groupId,
    name: ledgerName,
    code: code || '',
    notes: 'Created by Payroll accounting',
  });
}

/**
 * Classify payroll item component amounts into salary / deduction / tax.
 * @param {object} item
 * @param {Map<string, object>} headsById
 */
export function classifyItemAmounts(item, headsById) {
  let gross = roundMoney(item.gross ?? item.totalEarnings ?? 0);
  let deductions = 0;
  let tax = 0;

  for (const c of item.components || []) {
    const amt = roundMoney(c.amount || 0);
    if (!amt) continue;
    if (c.headType === SALARY_HEAD_TYPES.EARNING || c.headType === 'Earning') continue;

    const head = c.salaryHeadId ? headsById.get(c.salaryHeadId) : null;
    const cls = head
      ? resolveAccountingClass(head)
      : c.headType === SALARY_HEAD_TYPES.DEDUCTION
        ? PAYROLL_ACCOUNTING_CLASS.DEDUCTION
        : PAYROLL_ACCOUNTING_CLASS.DEDUCTION;

    if (cls === PAYROLL_ACCOUNTING_CLASS.TAX) tax += amt;
    else deductions += amt;
  }

  deductions = roundMoney(deductions);
  tax = roundMoney(tax);
  const net = roundMoney(gross - deductions - tax);
  return { gross, deductions, tax, net };
}

/**
 * Post a finalized payroll as one Journal voucher.
 * @param {string} runId
 * @param {{ postingDate?: string }} [opts]
 */
export async function postPayrollToAccounting(runId, opts = {}) {
  const run = await payrollService.getPayrollRun(runId);
  if (!run) throw new Error('Payroll run not found');
  if (run.status !== PAYROLL_RUN_STATUS.FINALIZED) {
    throw new Error('Finalize payroll before posting to accounting');
  }
  if (
    run.accountingStatus === PAYROLL_ACCOUNTING_STATUS.POSTED ||
    run.accountingStatus === PAYROLL_ACCOUNTING_STATUS.PAID
  ) {
    throw new Error('This payroll has already been posted to accounting.');
  }

  const bookId = run.bookId;
  const settings = await payrollService.getPayrollSettings(bookId);
  if (!isPayrollAccountingConfigured(settings)) {
    throw new Error('Payroll accounting is not fully configured.');
  }

  const session = await bookService.getSessionContext();
  const fyId = session.financialYear?.id;
  if (!fyId || session.book?.id !== bookId) {
    throw new Error('Open this book with an active financial year to post payroll');
  }

  const [items, heads, employees] = await Promise.all([
    payrollService.listPayrollItems(runId),
    payrollService.listSalaryHeads(bookId),
    peopleService.listEmployees(bookId, { includeInactive: true }),
  ]);
  if (!items.length) throw new Error('No payroll items to post — calculate first');

  const headsById = new Map(heads.map((h) => [h.id, h]));
  const empById = new Map(employees.map((e) => [e.id, e]));

  // Ensure head ledgers for deduction/tax classes
  for (const head of heads) {
    const cls = resolveAccountingClass(head);
    if (cls === PAYROLL_ACCOUNTING_CLASS.DEDUCTION || cls === PAYROLL_ACCOUNTING_CLASS.TAX) {
      await ensureSalaryHeadLedger(bookId, head, settings);
    }
  }
  // Reload heads after ledger assignment
  const headsFresh = await payrollService.listSalaryHeads(bookId);
  const headsByIdFresh = new Map(headsFresh.map((h) => [h.id, h]));

  /** @type {import('../engine/accountingEngine.js').LineInput[]} */
  const lines = [];
  let lineNarrationBase = `Payroll ${run.label || run.periodStart}`;

  /** @type {Map<string, number>} head ledger credits */
  const headCredits = new Map();

  for (const item of items) {
    const emp = empById.get(item.employeeId);
    if (!emp) continue;
    const accounts = await ensureEmployeePayrollAccounts(bookId, emp, settings);
    const classified = classifyItemAmounts(item, headsByIdFresh);

    if (classified.gross > 0) {
      lines.push({
        ledgerId: accounts.salaryLedgerId,
        debit: classified.gross,
        credit: 0,
        narration: `${emp.employeeCode} gross · ${lineNarrationBase}`,
      });
    }

    // Mirror totals on employee Deduction/Tax ledgers (contra under Salary tree) for drill-down.
    // Liability detail is posted to head ledgers — to avoid double-counting liabilities we do NOT
    // also credit liability masters with employee lumps. Employee Deduction/Tax ledgers under the
    // Salary expense group are credited so net expense = net pay cost; head ledgers hold payable types.
    // Actually: if we Cr Emp.Deduction under Expense AND Cr PF under Liability, we need matching Drs.
    // Correct single entry (no double count):
    //   Dr Emp.Salary gross
    //   Cr Deduction/Tax HEAD ledgers (liability)
    //   Cr Emp.Payable net
    // Emp.Deduction / Emp.Tax ledgers are created for structure but not used in auto-post.

    for (const c of item.components || []) {
      const amt = roundMoney(c.amount || 0);
      if (!amt) continue;
      if (c.headType === SALARY_HEAD_TYPES.EARNING || c.headType === 'Earning') continue;
      const head = c.salaryHeadId ? headsByIdFresh.get(c.salaryHeadId) : null;
      if (!head?.ledgerId) {
        // Adjustment without head — fold into a generic bucket under deduction master
        const bucketName =
          resolveAccountingClass(head || { headType: SALARY_HEAD_TYPES.DEDUCTION }) ===
          PAYROLL_ACCOUNTING_CLASS.TAX
            ? 'Other Tax'
            : 'Other Deduction';
        const parentId =
          resolveAccountingClass(head || { accountingClass: PAYROLL_ACCOUNTING_CLASS.DEDUCTION }) ===
          PAYROLL_ACCOUNTING_CLASS.TAX
            ? settings.taxMasterGroupId
            : settings.deductionMasterGroupId;
        const bucket = await ensureLedgerInGroup(bookId, parentId, bucketName, `payroll-bucket:${bucketName}`);
        headCredits.set(bucket.id, roundMoney((headCredits.get(bucket.id) || 0) + amt));
        continue;
      }
      const cls = resolveAccountingClass(head);
      if (cls === PAYROLL_ACCOUNTING_CLASS.SALARY) continue;
      headCredits.set(head.ledgerId, roundMoney((headCredits.get(head.ledgerId) || 0) + amt));
    }

    if (classified.net > 0) {
      lines.push({
        ledgerId: accounts.payableLedgerId,
        debit: 0,
        credit: classified.net,
        narration: `${emp.employeeCode} net payable · ${lineNarrationBase}`,
      });
    }

    // Persist classification snapshot on item for payslip / payment
    await payrollService.savePayrollItemPatch(item.id, {
      accountingSnapshot: {
        gross: classified.gross,
        deductions: classified.deductions,
        tax: classified.tax,
        net: classified.net,
        salaryLedgerId: accounts.salaryLedgerId,
        payableLedgerId: accounts.payableLedgerId,
      },
    });
  }

  for (const [ledgerId, credit] of headCredits) {
    if (credit <= 0) continue;
    lines.push({
      ledgerId,
      debit: 0,
      credit,
      narration: lineNarrationBase,
    });
  }

  if (!lines.length) throw new Error('Nothing to post — all amounts are zero');

  const postingDate = opts.postingDate || run.payDate || run.periodEnd || toDateInput(new Date());
  const result = await voucherService.createVoucher({
    bookId,
    financialYearId: fyId,
    voucherType: VOUCHER_TYPES.JOURNAL,
    date: postingDate,
    narration: `Payroll ${run.label || `${run.periodStart} → ${run.periodEnd}`} · ${items.length} employee(s)`,
    lines,
  });

  const updated = {
    ...run,
    accountingStatus: PAYROLL_ACCOUNTING_STATUS.POSTED,
    journalVoucherId: result.voucher.id,
    journalVoucherNumber: result.voucher.voucherNumber,
    postingDate,
    reversalVoucherId: null,
    updatedAt: nowIso(),
  };
  await payrollRunRepository.save(updated);
  touchPayroll();
  return { run: updated, voucher: result.voucher, lines: result.lines };
}

/**
 * Reverse a posted payroll journal (does not delete the original).
 * @param {string} runId
 */
export async function reversePayrollAccounting(runId) {
  const run = await payrollService.getPayrollRun(runId);
  if (!run) throw new Error('Payroll run not found');
  if (run.accountingStatus !== PAYROLL_ACCOUNTING_STATUS.POSTED) {
    throw new Error('Only a posted (unpaid) payroll can be reversed');
  }
  if (!run.journalVoucherId) throw new Error('Missing journal reference');

  const original = await voucherService.getVoucherWithLines(run.journalVoucherId);
  if (!original?.voucher) throw new Error('Original journal not found');

  const session = await bookService.getSessionContext();
  const fyId = session.financialYear?.id;
  if (!fyId) throw new Error('Active financial year required');

  const reverseLines = (original.lines || []).map((l) => ({
    ledgerId: l.ledgerId,
    debit: l.credit || 0,
    credit: l.debit || 0,
    narration: `Reversal of ${original.voucher.voucherNumber}`,
  }));

  const result = await voucherService.createVoucher({
    bookId: run.bookId,
    financialYearId: fyId,
    voucherType: VOUCHER_TYPES.JOURNAL,
    date: toDateInput(new Date()),
    narration: `Reversal · Payroll ${run.label || run.periodStart} (was ${original.voucher.voucherNumber})`,
    lines: reverseLines,
  });

  const updated = {
    ...run,
    accountingStatus: PAYROLL_ACCOUNTING_STATUS.REVERSED,
    reversalVoucherId: result.voucher.id,
    updatedAt: nowIso(),
  };
  await payrollRunRepository.save(updated);
  return { run: updated, voucher: result.voucher };
}

/**
 * Pay net salaries: Payment voucher Dr Payable / Cr Bank (or Cash).
 * @param {string} runId
 * @param {{ bankLedgerId: string, paymentDate?: string, employeeId?: string|null }} input
 */
export async function payPayroll(runId, input) {
  const run = await payrollService.getPayrollRun(runId);
  if (!run) throw new Error('Payroll run not found');
  if (
    run.accountingStatus !== PAYROLL_ACCOUNTING_STATUS.POSTED &&
    run.accountingStatus !== PAYROLL_ACCOUNTING_STATUS.PAID
  ) {
    throw new Error('Post payroll to accounting before recording payment');
  }
  if (!input.bankLedgerId) throw new Error('Select a cash/bank ledger');

  const bank = await coaService.getLedger(input.bankLedgerId);
  if (!bank || bank.bookId !== run.bookId) throw new Error('Payment ledger not found');

  const session = await bookService.getSessionContext();
  const fyId = session.financialYear?.id;
  if (!fyId) throw new Error('Active financial year required');

  const settings = await payrollService.getPayrollSettings(run.bookId);
  const items = await payrollService.listPayrollItems(runId);
  const employees = await peopleService.listEmployees(run.bookId, { includeInactive: true });
  const empById = new Map(employees.map((e) => [e.id, e]));
  const heads = await payrollService.listSalaryHeads(run.bookId);
  const headsById = new Map(heads.map((h) => [h.id, h]));

  const selected = input.employeeId
    ? items.filter((i) => i.employeeId === input.employeeId)
    : items;

  /** @type {import('../engine/accountingEngine.js').LineInput[]} */
  const lines = [];
  let total = 0;

  for (const item of selected) {
    const emp = empById.get(item.employeeId);
    if (!emp) continue;
    const accounts = await ensureEmployeePayrollAccounts(run.bookId, emp, settings);
    const classified = item.accountingSnapshot || classifyItemAmounts(item, headsById);
    const net = roundMoney(classified.net ?? item.net ?? 0);
    if (net <= 0) continue;
    total += net;
    lines.push({
      ledgerId: accounts.payableLedgerId,
      debit: net,
      credit: 0,
      narration: `Pay ${emp.employeeCode} · Payroll ${run.label || run.periodStart}`,
    });
  }

  if (!lines.length) throw new Error('Nothing to pay');

  lines.push({
    ledgerId: input.bankLedgerId,
    debit: 0,
    credit: roundMoney(total),
    narration: `Payroll payment ${run.label || run.periodStart}`,
  });

  const result = await voucherService.createVoucher({
    bookId: run.bookId,
    financialYearId: fyId,
    voucherType: VOUCHER_TYPES.PAYMENT,
    date: input.paymentDate || toDateInput(new Date()),
    narration: `Payroll payment · ${run.label || run.periodStart}${input.employeeId ? ' (single employee)' : ''}`,
    lines,
  });

  const paymentIds = Array.isArray(run.paymentVoucherIds) ? [...run.paymentVoucherIds] : [];
  if (run.paymentVoucherId) paymentIds.push(run.paymentVoucherId);
  paymentIds.push(result.voucher.id);

  const updated = {
    ...run,
    accountingStatus: PAYROLL_ACCOUNTING_STATUS.PAID,
    paymentVoucherId: result.voucher.id,
    paymentVoucherIds: [...new Set(paymentIds)],
    paidAt: nowIso(),
    updatedAt: nowIso(),
  };
  await payrollRunRepository.save(updated);
  return { run: updated, voucher: result.voucher, amount: roundMoney(total) };
}

/**
 * @param {string} bookId
 */
export async function purgeEmployeePayrollAccounts(bookId) {
  await employeePayrollAccountRepository.deleteByBook(bookId);
}
