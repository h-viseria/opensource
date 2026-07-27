/**
 * Budgets CRUD.
 */

import * as bookService from '../../services/bookService.js';
import * as financeService from '../../services/personalFinanceService.js';
import { CSV_LABELS, CSV_SAMPLES, importBudgets } from '../../services/csvBulkImport.js';
import { BUDGET_PERIODS } from '../../core/constants.js';
import { showToast } from '../toast.js';
import { confirmModal, formModal, escapeHtml } from '../modal.js';
import { csvImportPanelHtml, wireCsvImport } from '../csvImport.js';
import { formatMoney } from '../../utils/money.js';
import * as router from '../../core/router.js';

/**
 * @param {import('../../core/router.js').RouteContext} ctx
 * @param {HTMLElement} outlet
 */
export async function renderBudgets(ctx, outlet) {
  const { book } = await bookService.getSessionContext();
  if (!book) {
    outlet.innerHTML = `<p class="muted">No active book.</p>`;
    return;
  }

  const periodType =
    ctx.query.periodType === BUDGET_PERIODS.YEAR ? BUDGET_PERIODS.YEAR : BUDGET_PERIODS.MONTH;
  const periodKey =
    ctx.query.period ||
    (periodType === BUDGET_PERIODS.YEAR
      ? financeService.yearKey()
      : financeService.monthKey());

  const [budgets, ledgers, variance] = await Promise.all([
    financeService.listBudgets(book.id, { periodKey, periodType }),
    financeService.listBudgetLedgers(book.id),
    financeService.budgetVarianceReport(book.id, { periodKey, periodType }),
  ]);
  const currency = book.currency || 'INR';
  const varianceById = new Map(variance.rows.map((r) => [r.budget.id, r]));

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/finance">Personal finance</a> / Budgets</p>
        <h1 class="page-header__title">Budgets</h1>
        <p class="page-header__desc">
          Set spending or income targets per ledger. Actuals come from voucher lines in the period.
        </p>
      </div>
      <div class="page-header__actions">
        <a class="btn btn--secondary" href="#/reports/budget-variance?period=${encodeURIComponent(periodKey)}&periodType=${periodType}">Variance report</a>
        <button type="button" class="btn btn--primary" id="btn-new">New budget</button>
      </div>
    </div>

    ${csvImportPanelHtml()}

    <form class="toolbar" id="period-filter">
      <label class="field" style="margin:0">
        <span class="field__label">Type</span>
        <select class="input" name="periodType">
          <option value="month" ${periodType === 'month' ? 'selected' : ''}>Month</option>
          <option value="year" ${periodType === 'year' ? 'selected' : ''}>Year</option>
        </select>
      </label>
      <label class="field" style="margin:0">
        <span class="field__label">Period</span>
        <input class="input" name="period" type="${periodType === 'year' ? 'number' : 'month'}"
               value="${escapeHtml(periodKey)}" ${periodType === 'year' ? 'min="2000" max="2100"' : ''} />
      </label>
      <button type="submit" class="btn btn--secondary btn--sm" style="align-self:end">Filter</button>
    </form>

    <div class="stat-grid" style="margin-top:1rem">
      <div class="stat-tile">
        <div class="stat-tile__label">Budgeted</div>
        <div class="stat-tile__value mono">${formatMoney(variance.totals.budgeted, currency)}</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__label">Actual</div>
        <div class="stat-tile__value mono">${formatMoney(variance.totals.actual, currency)}</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__label">Variance</div>
        <div class="stat-tile__value mono">${formatMoney(variance.totals.variance, currency)}</div>
      </div>
    </div>

    <div class="list">
      ${
        budgets.length === 0
          ? `<div class="panel empty-state"><p class="muted">No budgets for ${escapeHtml(periodKey)}. Create one for an expense or income ledger.</p></div>`
          : budgets
              .map((b) => {
                const v = varianceById.get(b.id);
                return `
          <div class="list-item" data-id="${b.id}">
            <div class="list-item__body">
              <div class="list-item__title">
                ${escapeHtml(b.name)}
                ${v?.overBudget ? '<span class="badge badge--danger">Over budget</span>' : ''}
              </div>
              <div class="list-item__meta">
                ${escapeHtml(v?.ledger?.name || '—')} · ${escapeHtml(b.periodKey)}
                · Budget <span class="mono">${formatMoney(b.amount, currency)}</span>
                ${v ? ` · Actual <span class="mono">${formatMoney(v.actual, currency)}</span> (${v.pctUsed}%)` : ''}
              </div>
            </div>
            <div class="list-item__actions">
              <button type="button" class="btn btn--ghost btn--sm" data-action="edit">Edit</button>
              <button type="button" class="btn btn--ghost btn--sm" data-action="delete">Delete</button>
            </div>
          </div>`;
              })
              .join('')
      }
    </div>
  `;

  outlet.querySelector('#period-filter')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(/** @type {HTMLFormElement} */ (e.target));
    const pt = String(fd.get('periodType') || 'month');
    const p = String(fd.get('period') || '');
    const params = new URLSearchParams({ periodType: pt });
    if (p) params.set('period', p);
    router.navigate(`/finance/budgets?${params}`);
  });

  outlet.querySelector('#btn-new')?.addEventListener('click', async () => {
    if (!ledgers.length) {
      showToast('Create Income/Expense ledgers first', 'info');
      return;
    }
    const fd = await formModal({
      title: 'New budget',
      confirmLabel: 'Create',
      fieldsHtml: budgetFields({ ledgers, periodType, periodKey }),
    });
    if (!fd) return;
    try {
      await financeService.createBudget(book.id, readBudgetForm(fd));
      showToast('Budget created', 'success');
      await renderBudgets(ctx, outlet);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  });

  outlet.querySelectorAll('.list-item').forEach((el) => {
    const id = el.getAttribute('data-id');
    const budget = budgets.find((b) => b.id === id);
    if (!budget) return;

    el.querySelector('[data-action="edit"]')?.addEventListener('click', async () => {
      const fd = await formModal({
        title: 'Edit budget',
        confirmLabel: 'Save',
        fieldsHtml: budgetFields({ ledgers, periodType, periodKey, budget }),
      });
      if (!fd) return;
      try {
        await financeService.updateBudget(id, readBudgetForm(fd));
        showToast('Budget updated', 'success');
        await renderBudgets(ctx, outlet);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed', 'error');
      }
    });

    el.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
      const ok = await confirmModal({
        title: 'Delete budget?',
        bodyHtml: `<p>Delete <strong>${escapeHtml(budget.name)}</strong>?</p>`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;
      try {
        await financeService.deleteBudget(id);
        showToast('Budget deleted', 'success');
        await renderBudgets(ctx, outlet);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed', 'error');
      }
    });
  });

  wireCsvImport(outlet, {
    labels: CSV_LABELS.budgets,
    sampleRows: CSV_SAMPLES.budgets,
    fileName: 'budgets_template.csv',
    onRows: (rows) => importBudgets(book.id, rows),
    onDone: async (result) => {
      if (result.created > 0) await renderBudgets(ctx, outlet);
    },
  });
}

/**
 * @param {{ ledgers: any[], periodType: string, periodKey: string, budget?: any }} opts
 */
function budgetFields(opts) {
  const b = opts.budget;
  const ledOpts = opts.ledgers
    .map(
      (l) =>
        `<option value="${l.id}" ${b?.ledgerId === l.id ? 'selected' : ''}>${escapeHtml(l.name)} (${escapeHtml(l.nature)})</option>`
    )
    .join('');
  return `
    <label class="field"><span class="field__label">Name *</span>
      <input class="input" name="name" required value="${escapeHtml(b?.name || '')}" /></label>
    <label class="field"><span class="field__label">Ledger *</span>
      <select class="input" name="ledgerId" required>${ledOpts}</select></label>
    <label class="field"><span class="field__label">Period type *</span>
      <select class="input" name="periodType">
        <option value="month" ${(b?.periodType || opts.periodType) === 'month' ? 'selected' : ''}>Month</option>
        <option value="year" ${(b?.periodType || opts.periodType) === 'year' ? 'selected' : ''}>Year</option>
      </select></label>
    <label class="field"><span class="field__label">Period *</span>
      <input class="input" name="periodKey" required value="${escapeHtml(b?.periodKey || opts.periodKey)}" placeholder="YYYY-MM or YYYY" /></label>
    <label class="field"><span class="field__label">Amount *</span>
      <input class="input" name="amount" type="number" min="0" step="0.01" required value="${b?.amount ?? 0}" /></label>
    <label class="field"><span class="field__label">Notes</span>
      <textarea class="input" name="notes" rows="2">${escapeHtml(b?.notes || '')}</textarea></label>
  `;
}

/** @param {FormData} fd */
function readBudgetForm(fd) {
  return {
    name: String(fd.get('name') || ''),
    ledgerId: String(fd.get('ledgerId') || ''),
    periodType: String(fd.get('periodType') || 'month'),
    periodKey: String(fd.get('periodKey') || ''),
    amount: Number(fd.get('amount') || 0),
    notes: String(fd.get('notes') || ''),
  };
}
