/**
 * Payslip view — print / PDF via new window HTML.
 */

import * as bookService from '../../services/bookService.js';
import * as payrollService from '../../services/payrollService.js';
import { SALARY_HEAD_TYPES } from '../../core/constants.js';
import { formatMoney } from '../../utils/money.js';
import { showToast } from '../toast.js';
import { escapeHtml } from '../modal.js';

/**
 * @param {import('../../core/router.js').RouteContext} ctx
 * @param {HTMLElement} outlet
 */
export async function renderPayslip(ctx, outlet) {
  const { book } = await bookService.getSessionContext();
  if (!book) {
    outlet.innerHTML = `<p class="muted">No active book.</p>`;
    return;
  }

  const itemId = ctx.params?.id;
  const item = itemId ? await payrollService.getPayrollItem(itemId) : null;
  if (!item || item.bookId !== book.id) {
    outlet.innerHTML = `<p class="muted">Payslip not found. <a href="#/payroll/runs">Back to runs</a></p>`;
    return;
  }

  const run = await payrollService.getPayrollRun(item.payrollRunId);
  const currency = book.currency || 'INR';
  const earnings = (item.components || []).filter(
    (c) => c.headType === SALARY_HEAD_TYPES.EARNING && c.showOnPayslip !== false,
  );
  const deductions = (item.components || []).filter(
    (c) => c.headType === SALARY_HEAD_TYPES.DEDUCTION && c.showOnPayslip !== false,
  );

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/payroll">Payroll</a> / Payslip</p>
        <h1 class="page-header__title">${escapeHtml(item.employeeName)}</h1>
        <p class="page-header__desc">
          <span class="mono">${escapeHtml(item.employeeCode || '')}</span>
          · ${escapeHtml(run?.periodStart || '')} → ${escapeHtml(run?.periodEnd || '')}
          · Status ${escapeHtml(run?.status || '—')}
        </p>
      </div>
      <div class="page-header__actions" style="display:flex;gap:0.5rem">
        <button type="button" class="btn btn--primary" id="btn-print">Print / PDF</button>
        <a class="btn btn--ghost" href="#/payroll/runs/${escapeHtml(item.payrollRunId)}">Back to run</a>
      </div>
    </div>

    <div class="panel" id="payslip-body">
      <h2 class="panel__title">${escapeHtml(book.name)}</h2>
      <p class="muted">${escapeHtml(book.legalName || '')} · ${escapeHtml(currency)}</p>
      <p>
        <strong>${escapeHtml(item.employeeName)}</strong> (${escapeHtml(item.employeeCode || '')})<br/>
        Period: ${escapeHtml(run?.periodStart || '')} → ${escapeHtml(run?.periodEnd || '')}
        · Pay date: ${escapeHtml(run?.payDate || '—')}
      </p>

      <h3 style="margin:1rem 0 0.5rem;font-size:1rem">Earnings</h3>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Head</th><th style="text-align:right">Amount</th></tr></thead>
          <tbody>
            ${earnings
              .map(
                (c) =>
                  `<tr><td>${escapeHtml(c.name)}</td><td class="mono" style="text-align:right">${formatMoney(c.amount ?? 0, currency)}</td></tr>`,
              )
              .join('')}
            <tr><td><strong>Gross</strong></td><td class="mono" style="text-align:right"><strong>${formatMoney(item.gross ?? 0, currency)}</strong></td></tr>
          </tbody>
        </table>
      </div>

      <h3 style="margin:1rem 0 0.5rem;font-size:1rem">Deductions</h3>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Head</th><th style="text-align:right">Amount</th></tr></thead>
          <tbody>
            ${
              deductions.length
                ? deductions
                    .map(
                      (c) =>
                        `<tr><td>${escapeHtml(c.name)}</td><td class="mono" style="text-align:right">${formatMoney(c.amount ?? 0, currency)}</td></tr>`,
                    )
                    .join('')
                : `<tr><td colspan="2" class="muted">None</td></tr>`
            }
            <tr><td><strong>Total deductions</strong></td><td class="mono" style="text-align:right"><strong>${formatMoney(item.totalDeductions ?? 0, currency)}</strong></td></tr>
          </tbody>
        </table>
      </div>

      <p style="margin-top:1rem;font-size:1.15rem"><strong>Net pay:</strong> <span class="mono">${formatMoney(item.net ?? 0, currency)}</span></p>
      <p class="muted">
        Attendance: Present ${item.attendanceSnapshot?.present ?? '—'},
        Leave ${item.attendanceSnapshot?.leave ?? '—'},
        Unpaid leave ${item.attendanceSnapshot?.unpaidLeave ?? '—'},
        OT hrs ${item.attendanceSnapshot?.overtimeHours ?? '—'}
      </p>
    </div>
  `;

  outlet.querySelector('#btn-print')?.addEventListener('click', () => {
    try {
      const html = payrollService.buildPayslipHtml(book, run || {}, item);
      const w = window.open('', '_blank', 'noopener,noreferrer,width=720,height=900');
      if (!w) {
        showToast('Allow pop-ups to print the payslip', 'error');
        return;
      }
      w.document.open();
      w.document.write(html);
      w.document.close();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  });
}
