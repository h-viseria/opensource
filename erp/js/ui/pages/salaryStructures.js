/**
 * Payroll → Employee salary structures (with effective-from history).
 */

import * as bookService from '../../services/bookService.js';
import * as peopleService from '../../services/peopleService.js';
import * as payrollService from '../../services/payrollService.js';
import { toDateInput } from '../../utils/date.js';
import { formatMoney } from '../../utils/money.js';
import { showToast } from '../toast.js';
import { formModal, escapeHtml } from '../modal.js';

/**
 * @param {import('../../core/router.js').RouteContext} ctx
 * @param {HTMLElement} outlet
 */
export async function renderSalaryStructures(ctx, outlet) {
  const { book } = await bookService.getSessionContext();
  if (!book) {
    outlet.innerHTML = `<p class="muted">No active book.</p>`;
    return;
  }

  await payrollService.ensurePayrollMasters(book.id, book.currency);
  const employees = await peopleService.listEmployees(book.id, { includeInactive: true });
  const employeeId = ctx.query?.employeeId || employees.find((e) => e.status === 'Active')?.id || employees[0]?.id || '';
  const asOf = ctx.query?.asOf || toDateInput(new Date());
  const currency = book.currency || 'INR';

  let structure = null;
  if (employeeId) {
    structure = await payrollService.getEmployeeSalaryStructure(book.id, employeeId, asOf);
  }

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/payroll">Payroll</a> / Structures</p>
        <h1 class="page-header__title">Salary structures</h1>
        <p class="page-header__desc">
          Assign salary heads per employee. Changes create a new effective-from row — history is kept.
        </p>
      </div>
    </div>

    <div class="panel">
      <form id="form-pick" class="form-grid" style="display:flex;flex-wrap:wrap;gap:0.75rem;align-items:end">
        <label class="field" style="min-width:16rem;flex:1"><span class="field__label">Employee</span>
          <select class="input" name="employeeId">
            ${employees
              .map(
                (e) =>
                  `<option value="${e.id}" ${e.id === employeeId ? 'selected' : ''}>${escapeHtml(e.employeeCode)} — ${escapeHtml(e.name)}${e.status !== 'Active' ? ' (inactive)' : ''}</option>`,
              )
              .join('')}
          </select></label>
        <label class="field"><span class="field__label">As of</span>
          <input class="input" type="date" name="asOf" value="${escapeHtml(asOf)}" /></label>
        <button type="submit" class="btn btn--secondary">Show</button>
      </form>
    </div>

    ${
      !employeeId
        ? `<p class="muted">Add employees first under <a href="#/people/employees">People</a>.</p>`
        : `
    <div class="panel">
      <div class="page-header" style="margin:0 0 0.75rem;padding:0">
        <h2 class="panel__title" style="margin:0">Effective lines (${escapeHtml(asOf)})</h2>
        <button type="button" class="btn btn--primary btn--sm" id="btn-add-line">Add / change line</button>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Head</th><th>Type</th><th>Amount / %</th><th>From</th><th></th></tr></thead>
          <tbody>
            ${(structure?.lines || [])
              .map(
                (l) => `
              <tr>
                <td>${escapeHtml(l.head?.name || l.salaryHeadId)}</td>
                <td>${escapeHtml(l.head?.headType || '—')}</td>
                <td class="mono">${
                  l.percentage != null
                    ? `${l.percentage}%`
                    : formatMoney(l.amount ?? 0, currency)
                }${l.multiplier != null && l.multiplier !== 1 ? ` ×${l.multiplier}` : ''}</td>
                <td class="mono">${escapeHtml(l.effectiveFrom)}</td>
                <td><button type="button" class="btn btn--ghost btn--sm" data-end="${l.id}">End</button></td>
              </tr>`
              )
              .join('') || `<tr><td colspan="5" class="muted">No effective lines — add Basic (and other heads) for this employee.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>

    <div class="panel">
      <h2 class="panel__title">History</h2>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Head</th><th>Amount / %</th><th>From</th><th>To</th><th>Notes</th></tr></thead>
          <tbody>
            ${(structure?.history || [])
              .map((l) => {
                const head = structure.heads.find((h) => h.id === l.salaryHeadId);
                return `
              <tr>
                <td>${escapeHtml(head?.name || l.salaryHeadId)}</td>
                <td class="mono">${l.percentage != null ? `${l.percentage}%` : formatMoney(l.amount ?? 0, currency)}</td>
                <td class="mono">${escapeHtml(l.effectiveFrom)}</td>
                <td class="mono">${escapeHtml(l.effectiveTo || '—')}</td>
                <td>${escapeHtml(l.notes || '')}</td>
              </tr>`;
              })
              .join('') || `<tr><td colspan="5" class="muted">No history yet.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`
    }
  `;

  outlet.querySelector('#form-pick')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const q = new URLSearchParams({
      employeeId: String(fd.get('employeeId') || ''),
      asOf: String(fd.get('asOf') || asOf),
    });
    window.location.hash = `#/payroll/structures?${q}`;
  });

  if (!employeeId || !structure) return;

  outlet.querySelector('#btn-add-line')?.addEventListener('click', async () => {
    const heads = structure.heads.filter((h) => h.isActive !== false);
    const fd = await formModal({
      title: 'Add / change salary line',
      confirmLabel: 'Save',
      fieldsHtml: `
        <label class="field"><span class="field__label">Salary head</span>
          <select class="input" name="salaryHeadId" required>
            ${heads.map((h) => `<option value="${h.id}">${escapeHtml(h.name)} (${escapeHtml(h.headType)})</option>`).join('')}
          </select></label>
        <label class="field"><span class="field__label">Amount</span>
          <input class="input" type="number" step="0.01" name="amount" /></label>
        <label class="field"><span class="field__label">Percentage (optional)</span>
          <input class="input" type="number" step="0.01" name="percentage" /></label>
        <label class="field"><span class="field__label">Multiplier</span>
          <input class="input" type="number" step="0.1" name="multiplier" value="1" /></label>
        <label class="field"><span class="field__label">Effective from</span>
          <input class="input" type="date" name="effectiveFrom" value="${escapeHtml(asOf)}" required /></label>
        <label class="field"><span class="field__label">Notes</span>
          <input class="input" name="notes" /></label>
      `,
    });
    if (!fd) return;
    try {
      const pct = fd.get('percentage');
      await payrollService.upsertEmployeeSalaryLine(book.id, employeeId, {
        salaryHeadId: String(fd.get('salaryHeadId')),
        amount: fd.get('amount') === '' ? undefined : Number(fd.get('amount')),
        percentage: pct === '' || pct == null ? null : Number(pct),
        multiplier: Number(fd.get('multiplier')) || 1,
        effectiveFrom: String(fd.get('effectiveFrom')),
        notes: String(fd.get('notes') || '') || null,
      });
      showToast('Salary line saved', 'success');
      await renderSalaryStructures(ctx, outlet);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  });

  outlet.querySelectorAll('[data-end]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const lineId = btn.getAttribute('data-end');
      try {
        await payrollService.endEmployeeSalaryLine(lineId, asOf);
        showToast('Line ended', 'success');
        await renderSalaryStructures(ctx, outlet);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed', 'error');
      }
    });
  });
}
