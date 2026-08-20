/**
 * Payroll → Runs list + create.
 */

import { PAYROLL_RUN_STATUS } from '../../core/constants.js';
import * as bookService from '../../services/bookService.js';
import * as payrollService from '../../services/payrollService.js';
import { toDateInput } from '../../utils/date.js';
import { formatMoney } from '../../utils/money.js';
import { showToast } from '../toast.js';
import { confirmModal, formModal, escapeHtml } from '../modal.js';

/**
 * @param {import('../../core/router.js').RouteContext} _ctx
 * @param {HTMLElement} outlet
 */
export async function renderPayrollRuns(_ctx, outlet) {
  const { book } = await bookService.getSessionContext();
  if (!book) {
    outlet.innerHTML = `<p class="muted">No active book.</p>`;
    return;
  }

  await payrollService.ensurePayrollMasters(book.id, book.currency);
  const runs = await payrollService.listPayrollRuns(book.id);
  const currency = book.currency || 'INR';
  const defaultMonth = toDateInput(new Date()).slice(0, 7);

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/payroll">Payroll</a> / Runs</p>
        <h1 class="page-header__title">Payroll runs</h1>
        <p class="page-header__desc">
          Draft → Calculated → Reviewed → Finalized. Finalized runs are locked; use adjustments for corrections.
        </p>
      </div>
      <div class="page-header__actions">
        <button type="button" class="btn btn--primary" id="btn-new">New payroll</button>
      </div>
    </div>

    <div class="table-wrap panel">
      <table class="data-table">
        <thead>
          <tr>
            <th>Period</th>
            <th>Pay date</th>
            <th>Status</th>
            <th>Employees</th>
            <th>Gross</th>
            <th>Deductions</th>
            <th>Net</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${
            runs.length
              ? runs
                  .map(
                    (r) => `
            <tr>
              <td class="mono">${escapeHtml(r.label || `${r.periodStart} → ${r.periodEnd}`)}</td>
              <td class="mono">${escapeHtml(r.payDate || '—')}</td>
              <td><span class="badge ${statusBadge(r.status)}">${escapeHtml(r.status)}</span></td>
              <td class="mono">${r.totals?.employees ?? 0}</td>
              <td class="mono">${formatMoney(r.totals?.gross ?? 0, currency)}</td>
              <td class="mono">${formatMoney(r.totals?.deductions ?? 0, currency)}</td>
              <td class="mono">${formatMoney(r.totals?.net ?? 0, currency)}</td>
              <td>
                <a class="btn btn--ghost btn--sm" href="#/payroll/runs/${r.id}">Open</a>
                ${
                  r.status !== PAYROLL_RUN_STATUS.FINALIZED
                    ? `<button type="button" class="btn btn--ghost btn--sm" data-del="${r.id}">Delete</button>`
                    : ''
                }
              </td>
            </tr>`
                  )
                  .join('')
              : `<tr><td colspan="8" class="muted">No payroll runs yet. Create one for the current month.</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;

  outlet.querySelector('#btn-new')?.addEventListener('click', async () => {
    const fd = await formModal({
      title: 'New payroll run',
      confirmLabel: 'Create draft',
      fieldsHtml: `
        <label class="field"><span class="field__label">Month (YYYY-MM)</span>
          <input class="input" name="month" value="${escapeHtml(defaultMonth)}" pattern="\\d{4}-\\d{2}" required /></label>
        <label class="field"><span class="field__label">Pay date (optional)</span>
          <input class="input" type="date" name="payDate" /></label>
        <p class="muted" style="font-size:var(--text-sm)">All active employees are included. Attendance and leave for the month are pulled on Calculate.</p>
      `,
    });
    if (!fd) return;
    try {
      const run = await payrollService.createPayrollRun(book.id, {
        month: String(fd.get('month') || defaultMonth),
        payDate: fd.get('payDate') ? String(fd.get('payDate')) : undefined,
      });
      showToast('Draft payroll created', 'success');
      window.location.hash = `#/payroll/runs/${run.id}`;
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  });

  outlet.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-del');
      const ok = await confirmModal({
        title: 'Delete payroll run?',
        bodyHtml: '<p>Draft and calculated runs can be deleted. This removes items for the run.</p>',
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;
      try {
        await payrollService.deletePayrollRun(id);
        showToast('Deleted', 'success');
        await renderPayrollRuns(_ctx, outlet);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed', 'error');
      }
    });
  });
}

/** @param {string} status */
function statusBadge(status) {
  if (status === PAYROLL_RUN_STATUS.FINALIZED) return 'badge--success';
  if (status === PAYROLL_RUN_STATUS.REVIEWED) return 'badge--info';
  if (status === PAYROLL_RUN_STATUS.CALCULATED) return 'badge--warning';
  return 'badge--muted';
}
