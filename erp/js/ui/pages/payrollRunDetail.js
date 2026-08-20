/**
 * Payroll run detail — calculate, review, finalize, items, adjustments.
 */

import {
  PAYROLL_ACCOUNTING_STATUS,
  PAYROLL_RUN_STATUS,
  SALARY_HEAD_TYPES,
} from '../../core/constants.js';
import * as bookService from '../../services/bookService.js';
import * as peopleService from '../../services/peopleService.js';
import * as payrollService from '../../services/payrollService.js';
import * as payrollAccounting from '../../services/payrollAccountingService.js';
import * as coaService from '../../services/coaService.js';
import { ACCOUNT_NATURES } from '../../core/accountTypes.js';
import { formatMoney } from '../../utils/money.js';
import { showToast } from '../toast.js';
import { confirmModal, formModal, escapeHtml } from '../modal.js';
import { wireReportDownloads } from '../reportExport.js';

/**
 * @param {import('../../core/router.js').RouteContext} ctx
 * @param {HTMLElement} outlet
 */
export async function renderPayrollRunDetail(ctx, outlet) {
  const { book } = await bookService.getSessionContext();
  if (!book) {
    outlet.innerHTML = `<p class="muted">No active book.</p>`;
    return;
  }

  const runId = ctx.params?.id;
  const run = runId ? await payrollService.getPayrollRun(runId) : null;
  if (!run || run.bookId !== book.id) {
    outlet.innerHTML = `<p class="muted">Payroll run not found. <a href="#/payroll/runs">Back</a></p>`;
    return;
  }

  const [items, adjustments, employees, heads, mapping] = await Promise.all([
    payrollService.listPayrollItems(run.id),
    payrollService.listSalaryAdjustments(book.id, { payrollRunId: run.id }),
    peopleService.listEmployees(book.id, { includeInactive: true }),
    payrollService.listSalaryHeads(book.id, { activeOnly: true }),
    payrollAccounting.getPayrollAccountMapping(book.id),
  ]);
  const currency = book.currency || 'INR';
  const locked = run.status === PAYROLL_RUN_STATUS.FINALIZED;
  const acctStatus = run.accountingStatus || PAYROLL_ACCOUNTING_STATUS.NOT_POSTED;
  const selectedItemId = ctx.query?.itemId || items[0]?.id || '';
  const selected = items.find((i) => i.id === selectedItemId) || null;

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/payroll">Payroll</a> / <a href="#/payroll/runs">Runs</a> / ${escapeHtml(run.label)}</p>
        <h1 class="page-header__title">${escapeHtml(run.periodStart)} → ${escapeHtml(run.periodEnd)}</h1>
        <p class="page-header__desc">
          Status <span class="badge ${statusBadge(run.status)}">${escapeHtml(run.status)}</span>
          · Accounting <span class="badge ${acctBadge(acctStatus)}">${escapeHtml(acctStatus)}</span>
          · Pay date ${escapeHtml(run.payDate || '—')}
          · Working days <span class="mono">${run.workingDays}</span>
        </p>
      </div>
      <div class="page-header__actions" style="display:flex;flex-wrap:wrap;gap:0.5rem">
        ${!locked ? `<button type="button" class="btn btn--secondary" id="btn-calc">Calculate</button>` : ''}
        ${
          !locked && (run.status === PAYROLL_RUN_STATUS.CALCULATED || run.status === PAYROLL_RUN_STATUS.REVIEWED)
            ? `<button type="button" class="btn btn--secondary" id="btn-review">Mark reviewed</button>`
            : ''
        }
        ${
          !locked && (run.status === PAYROLL_RUN_STATUS.CALCULATED || run.status === PAYROLL_RUN_STATUS.REVIEWED)
            ? `<button type="button" class="btn btn--primary" id="btn-finalize">Finalize</button>`
            : ''
        }
        <a class="btn btn--ghost" href="#/payroll/runs">Back</a>
      </div>
    </div>

    <div class="stat-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(9rem,1fr));gap:0.75rem;margin-bottom:1rem">
      <div class="panel" style="margin:0"><div class="muted" style="font-size:var(--text-sm)">Employees</div><div class="mono" style="font-size:1.25rem">${run.totals?.employees ?? 0}</div></div>
      <div class="panel" style="margin:0"><div class="muted" style="font-size:var(--text-sm)">Gross</div><div class="mono" style="font-size:1.1rem">${formatMoney(run.totals?.gross ?? 0, currency)}</div></div>
      <div class="panel" style="margin:0"><div class="muted" style="font-size:var(--text-sm)">Deductions</div><div class="mono" style="font-size:1.1rem">${formatMoney(run.totals?.deductions ?? 0, currency)}</div></div>
      <div class="panel" style="margin:0"><div class="muted" style="font-size:var(--text-sm)">Net</div><div class="mono" style="font-size:1.1rem">${formatMoney(run.totals?.net ?? 0, currency)}</div></div>
    </div>

    ${accountingPanelHtml(run, acctStatus, mapping, locked)}

    ${
      (run.warnings || []).length
        ? `<div class="panel" style="border-color:var(--color-warning, #c9a227)">
            <h2 class="panel__title">Exceptions / warnings</h2>
            <ul>${run.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>
          </div>`
        : ''
    }

    <div class="panel" id="payroll-summary-panel">
      <div class="page-header" style="margin:0 0 0.75rem;padding:0">
        <h2 class="panel__title" style="margin:0">Employee summary</h2>
        <div data-report-export-slot></div>
      </div>
      <div class="table-wrap">
        <table class="data-table" data-report-table>
          <thead>
            <tr><th>Code</th><th>Employee</th><th>Gross</th><th>Deductions</th><th>Net</th><th></th></tr>
          </thead>
          <tbody>
            ${
              items.length
                ? items
                    .map(
                      (it) => `
              <tr class="${it.id === selectedItemId ? 'is-selected' : ''}">
                <td class="mono">${escapeHtml(it.employeeCode || '')}</td>
                <td>${escapeHtml(it.employeeName || '')}</td>
                <td class="mono">${formatMoney(it.gross ?? 0, currency)}</td>
                <td class="mono">${formatMoney(it.totalDeductions ?? 0, currency)}</td>
                <td class="mono">${formatMoney(it.net ?? 0, currency)}</td>
                <td>
                  <a class="btn btn--ghost btn--sm" href="#/payroll/runs/${run.id}?itemId=${it.id}">Detail</a>
                  <a class="btn btn--ghost btn--sm" href="#/payroll/payslips/${it.id}">Payslip</a>
                </td>
              </tr>`
                    )
                    .join('')
                : `<tr><td colspan="6" class="muted">Not calculated yet.</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </div>

    ${
      selected
        ? `<div class="panel">
            <h2 class="panel__title">${escapeHtml(selected.employeeName)} — calculation</h2>
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr><th>Head</th><th>Type</th><th>Amount</th></tr></thead>
                <tbody>
                  ${(selected.components || [])
                    .map(
                      (c) => `
                    <tr>
                      <td>${escapeHtml(c.name)}</td>
                      <td>${escapeHtml(c.headType)}</td>
                      <td class="mono">${formatMoney(c.amount ?? 0, currency)}</td>
                    </tr>`
                    )
                    .join('')}
                  <tr><td colspan="2"><strong>Gross</strong></td><td class="mono"><strong>${formatMoney(selected.gross ?? 0, currency)}</strong></td></tr>
                  <tr><td colspan="2"><strong>Deductions</strong></td><td class="mono"><strong>${formatMoney(selected.totalDeductions ?? 0, currency)}</strong></td></tr>
                  <tr><td colspan="2"><strong>Net</strong></td><td class="mono"><strong>${formatMoney(selected.net ?? 0, currency)}</strong></td></tr>
                </tbody>
              </table>
            </div>
            <p class="muted" style="margin-top:0.75rem">
              Attendance: Present ${selected.attendanceSnapshot?.present ?? '—'},
              Leave ${selected.attendanceSnapshot?.leave ?? '—'},
              Unpaid ${selected.attendanceSnapshot?.unpaidLeave ?? '—'},
              OT ${selected.attendanceSnapshot?.overtimeHours ?? '—'} hrs
              · Daily rate ${formatMoney(selected.dailyRate ?? 0, currency)}
              · Hourly ${formatMoney(selected.hourlyRate ?? 0, currency)}
            </p>
          </div>`
        : ''
    }

    <div class="panel">
      <div class="page-header" style="margin:0 0 0.75rem;padding:0">
        <h2 class="panel__title" style="margin:0">Adjustments</h2>
        ${!locked ? `<button type="button" class="btn btn--secondary btn--sm" id="btn-adj">Add adjustment</button>` : ''}
      </div>
      <p class="muted" style="font-size:var(--text-sm);margin-top:0">
        One-time or recurring earnings/deductions applied on Calculate.
        ${locked ? 'After finalize, add a new adjustment for a future run or reversal note — the finalized run stays unchanged.' : ''}
      </p>
      <div class="list">
        ${
          adjustments.length
            ? adjustments
                .map(
                  (a) => {
                    const emp = employees.find((e) => e.id === a.employeeId);
                    return `
              <div class="list-item">
                <div class="list-item__body">
                  <div class="list-item__title">
                    ${escapeHtml(a.description)}
                    <span class="badge ${a.headType === SALARY_HEAD_TYPES.EARNING ? 'badge--success' : 'badge--warning'}">${escapeHtml(a.headType)}</span>
                    ${a.recurring ? '<span class="badge badge--info">Recurring</span>' : ''}
                  </div>
                  <div class="list-item__meta">
                    ${escapeHtml(emp?.name || a.employeeId)} · <span class="mono">${formatMoney(a.amount, currency)}</span>
                  </div>
                </div>
                ${
                  !locked
                    ? `<div class="list-item__actions"><button type="button" class="btn btn--ghost btn--sm" data-del-adj="${a.id}">Remove</button></div>`
                    : ''
                }
              </div>`;
                  }
                )
                .join('')
            : `<p class="muted">No adjustments for this run.</p>`
        }
      </div>
      ${
        locked
          ? `<button type="button" class="btn btn--secondary btn--sm" id="btn-post-adj" style="margin-top:0.75rem">Record post-finalize adjustment note</button>`
          : ''
      }
    </div>
  `;

  wireReportDownloads(outlet.querySelector('#payroll-summary-panel'), {
    fileBase: `payroll-${run.label || run.periodStart}`,
    title: `Payroll ${run.label || run.periodStart}`,
    subtitle: `${book.name} · ${run.periodStart} → ${run.periodEnd}`,
  });

  outlet.querySelector('#btn-calc')?.addEventListener('click', async () => {
    try {
      showToast('Calculating…', 'info');
      await payrollService.calculatePayrollRun(run.id);
      showToast('Payroll calculated', 'success');
      await renderPayrollRunDetail(ctx, outlet);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  });

  outlet.querySelector('#btn-review')?.addEventListener('click', async () => {
    try {
      await payrollService.reviewPayrollRun(run.id);
      showToast('Marked reviewed', 'success');
      await renderPayrollRunDetail(ctx, outlet);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  });

  outlet.querySelector('#btn-finalize')?.addEventListener('click', async () => {
    const ok = await confirmModal({
      title: 'Finalize payroll?',
      bodyHtml:
        '<p>Finalized payroll is locked. Corrections use adjustments/reversals, not silent edits.</p>',
      confirmLabel: 'Finalize',
    });
    if (!ok) return;
    try {
      await payrollService.finalizePayrollRun(run.id);
      showToast('Payroll finalized', 'success');
      await renderPayrollRunDetail(ctx, outlet);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  });

  const openAdjModal = async (forFinalized) => {
    const fd = await formModal({
      title: forFinalized ? 'Post-finalize adjustment note' : 'Add adjustment',
      confirmLabel: 'Save',
      fieldsHtml: `
        <label class="field"><span class="field__label">Employee</span>
          <select class="input" name="employeeId" required>
            ${employees
              .filter((e) => e.status === 'Active' || forFinalized)
              .map((e) => `<option value="${e.id}">${escapeHtml(e.employeeCode)} — ${escapeHtml(e.name)}</option>`)
              .join('')}
          </select></label>
        <label class="field"><span class="field__label">Type</span>
          <select class="input" name="headType">
            <option value="${SALARY_HEAD_TYPES.EARNING}">Earning</option>
            <option value="${SALARY_HEAD_TYPES.DEDUCTION}">Deduction</option>
          </select></label>
        <label class="field"><span class="field__label">Salary head (optional)</span>
          <select class="input" name="salaryHeadId">
            <option value="">—</option>
            ${heads.map((h) => `<option value="${h.id}">${escapeHtml(h.name)}</option>`).join('')}
          </select></label>
        <label class="field"><span class="field__label">Description</span>
          <input class="input" name="description" value="${forFinalized ? 'Reversal / correction' : 'Adjustment'}" required /></label>
        <label class="field"><span class="field__label">Amount</span>
          <input class="input" type="number" step="0.01" name="amount" required /></label>
        ${
          forFinalized
            ? ''
            : `<label class="field field--check"><input type="checkbox" name="recurring" /> Recurring (applies to future runs)</label>`
        }
      `,
    });
    if (!fd) return;
    try {
      await payrollService.createSalaryAdjustment(book.id, {
        employeeId: String(fd.get('employeeId')),
        payrollRunId: forFinalized ? null : run.id,
        salaryHeadId: String(fd.get('salaryHeadId') || '') || null,
        headType: String(fd.get('headType')),
        description: String(fd.get('description') || 'Adjustment'),
        amount: Number(fd.get('amount')) || 0,
        recurring: fd.get('recurring') === 'on',
      });
      showToast(forFinalized ? 'Adjustment recorded for future use' : 'Adjustment added — recalculate to apply', 'success');
      await renderPayrollRunDetail(ctx, outlet);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  };

  outlet.querySelector('#btn-adj')?.addEventListener('click', () => openAdjModal(false));
  outlet.querySelector('#btn-post-adj')?.addEventListener('click', () => openAdjModal(true));

  outlet.querySelectorAll('[data-del-adj]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await payrollService.deleteSalaryAdjustment(btn.getAttribute('data-del-adj'));
        showToast('Removed', 'success');
        await renderPayrollRunDetail(ctx, outlet);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed', 'error');
      }
    });
  });

  outlet.querySelector('#btn-post-acct')?.addEventListener('click', async () => {
    const ok = await confirmModal({
      title: 'Post payroll to accounting?',
      bodyHtml:
        '<p>Creates one Journal voucher via the existing voucher engine. Employee and head ledgers are created under your mapped masters if needed.</p>',
      confirmLabel: 'Post to Accounting',
    });
    if (!ok) return;
    try {
      const result = await payrollAccounting.postPayrollToAccounting(run.id);
      showToast(`Posted as ${result.voucher.voucherNumber}`, 'success');
      await renderPayrollRunDetail(ctx, outlet);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  });

  outlet.querySelector('#btn-reverse-acct')?.addEventListener('click', async () => {
    const ok = await confirmModal({
      title: 'Reverse accounting?',
      bodyHtml: '<p>Posts a reversing journal. The original entry is kept.</p>',
      confirmLabel: 'Reverse',
      danger: true,
    });
    if (!ok) return;
    try {
      const result = await payrollAccounting.reversePayrollAccounting(run.id);
      showToast(`Reversal ${result.voucher.voucherNumber}`, 'success');
      await renderPayrollRunDetail(ctx, outlet);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  });

  outlet.querySelector('#btn-pay-payroll')?.addEventListener('click', async () => {
    const ledgers = await coaService.listLedgers(book.id);
    const banks = ledgers.filter((l) => l.nature === ACCOUNT_NATURES.ASSET && l.isActive !== false);
    const fd = await formModal({
      title: 'Pay payroll (net)',
      confirmLabel: 'Record payment',
      fieldsHtml: `
        <p class="muted" style="font-size:var(--text-sm)">Creates a Payment voucher: Dr Salaries Payable / Cr Cash or Bank.</p>
        <label class="field"><span class="field__label">Cash / Bank ledger</span>
          <select class="input" name="bankLedgerId" required>
            ${banks.map((l) => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join('') || '<option value="">No asset ledgers</option>'}
          </select></label>
        <label class="field"><span class="field__label">Payment date</span>
          <input class="input" type="date" name="paymentDate" /></label>
        <label class="field"><span class="field__label">Single employee (optional)</span>
          <select class="input" name="employeeId">
            <option value="">All employees</option>
            ${items.map((it) => `<option value="${it.employeeId}">${escapeHtml(it.employeeCode)} — ${escapeHtml(it.employeeName)}</option>`).join('')}
          </select></label>
      `,
    });
    if (!fd) return;
    try {
      const result = await payrollAccounting.payPayroll(run.id, {
        bankLedgerId: String(fd.get('bankLedgerId') || ''),
        paymentDate: fd.get('paymentDate') ? String(fd.get('paymentDate')) : undefined,
        employeeId: String(fd.get('employeeId') || '') || null,
      });
      showToast(`Payment ${result.voucher.voucherNumber} · ${formatMoney(result.amount, currency)}`, 'success');
      await renderPayrollRunDetail(ctx, outlet);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  });
}

/**
 * @param {object} run
 * @param {string} acctStatus
 * @param {object} mapping
 * @param {boolean} locked
 */
function accountingPanelHtml(run, acctStatus, mapping, locked) {
  const finalized = locked;
  return `
    <div class="panel">
      <h2 class="panel__title">Accounting</h2>
      <p>
        Status <span class="badge ${acctBadge(acctStatus)}">${escapeHtml(acctStatus)}</span>
        ${run.journalVoucherNumber ? ` · Journal <a href="#/transactions/${escapeHtml(run.journalVoucherId)}">${escapeHtml(run.journalVoucherNumber)}</a>` : ''}
        ${run.paymentVoucherId ? ` · <a href="#/transactions/${escapeHtml(run.paymentVoucherId)}">Payment voucher</a>` : ''}
      </p>
      ${
        !mapping.configured
          ? `<p class="muted">Payroll accounting is not fully configured.
              <a href="#/settings/payroll-accounts">Configure Payroll Account Mapping</a></p>`
          : ''
      }
      <div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-top:0.75rem">
        ${
          finalized &&
          mapping.configured &&
          (acctStatus === PAYROLL_ACCOUNTING_STATUS.NOT_POSTED ||
            acctStatus === PAYROLL_ACCOUNTING_STATUS.REVERSED)
            ? `<button type="button" class="btn btn--primary" id="btn-post-acct">Post to Accounting</button>`
            : ''
        }
        ${
          acctStatus === PAYROLL_ACCOUNTING_STATUS.POSTED
            ? `<button type="button" class="btn btn--secondary" id="btn-pay-payroll">Pay payroll</button>
               <button type="button" class="btn btn--ghost" id="btn-reverse-acct">Reverse accounting</button>`
            : ''
        }
        ${
          acctStatus === PAYROLL_ACCOUNTING_STATUS.PAID
            ? `<button type="button" class="btn btn--secondary" id="btn-pay-payroll">Record another payment</button>`
            : ''
        }
        <a class="btn btn--ghost" href="#/settings/payroll-accounts">Account mapping</a>
        ${run.journalVoucherId ? `<a class="btn btn--ghost" href="#/transactions/${escapeHtml(run.journalVoucherId)}">View journal</a>` : ''}
      </div>
    </div>`;
}

/** @param {string} status */
function statusBadge(status) {
  if (status === PAYROLL_RUN_STATUS.FINALIZED) return 'badge--success';
  if (status === PAYROLL_RUN_STATUS.REVIEWED) return 'badge--info';
  if (status === PAYROLL_RUN_STATUS.CALCULATED) return 'badge--warning';
  return 'badge--muted';
}

/** @param {string} status */
function acctBadge(status) {
  if (status === PAYROLL_ACCOUNTING_STATUS.PAID) return 'badge--success';
  if (status === PAYROLL_ACCOUNTING_STATUS.POSTED) return 'badge--info';
  if (status === PAYROLL_ACCOUNTING_STATUS.REVERSED) return 'badge--warning';
  return 'badge--muted';
}
