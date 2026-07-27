/**
 * Budget variance report.
 */

import * as bookService from '../../services/bookService.js';
import * as financeService from '../../services/personalFinanceService.js';
import { BUDGET_PERIODS } from '../../core/constants.js';
import { escapeHtml } from '../modal.js';
import { formatMoney } from '../../utils/money.js';
import * as router from '../../core/router.js';
import { wireReportDownloads } from '../reportExport.js';

/**
 * @param {import('../../core/router.js').RouteContext} ctx
 * @param {HTMLElement} outlet
 */
export async function renderBudgetVariance(ctx, outlet) {
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

  const report = await financeService.budgetVarianceReport(book.id, { periodKey, periodType });
  const currency = book.currency || 'INR';

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/reports">Reports</a> / Budget Variance</p>
        <h1 class="page-header__title">Budget variance</h1>
        <p class="page-header__desc">
          ${escapeHtml(book.name)} · ${escapeHtml(periodKey)} ·
          ${escapeHtml(report.range.fromDate)} to ${escapeHtml(report.range.toDate)}
        </p>
      </div>
      <div class="page-header__actions">
        <a class="btn btn--secondary" href="#/finance/budgets">Manage budgets</a>
      </div>
    </div>

    <form class="toolbar" id="bv-filter">
      <label class="field" style="margin:0">
        <span class="field__label">Type</span>
        <select class="input" name="periodType">
          <option value="month" ${periodType === 'month' ? 'selected' : ''}>Month</option>
          <option value="year" ${periodType === 'year' ? 'selected' : ''}>Year</option>
        </select>
      </label>
      <label class="field" style="margin:0">
        <span class="field__label">Period</span>
        <input class="input" name="period" value="${escapeHtml(periodKey)}" />
      </label>
      <button type="submit" class="btn btn--secondary btn--sm" style="align-self:end">Apply</button>
    </form>

    <div class="stat-grid" style="margin-top:1rem">
      <div class="stat-tile">
        <div class="stat-tile__label">Budgeted</div>
        <div class="stat-tile__value mono">${formatMoney(report.totals.budgeted, currency)}</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__label">Actual</div>
        <div class="stat-tile__value mono">${formatMoney(report.totals.actual, currency)}</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__label">Variance</div>
        <div class="stat-tile__value mono">${formatMoney(report.totals.variance, currency)}</div>
        <div class="stat-tile__hint">Positive = under budget</div>
      </div>
    </div>

    ${
      report.rows.length === 0
        ? `<div class="panel empty-state"><p class="muted">No budgets for this period.</p>
           <p><a href="#/finance/budgets">Create a budget</a></p></div>`
        : `
    <div class="panel table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Budget</th>
            <th>Ledger</th>
            <th>Nature</th>
            <th class="num">Budgeted</th>
            <th class="num">Actual</th>
            <th class="num">Variance</th>
            <th class="num">Used %</th>
          </tr>
        </thead>
        <tbody>
          ${report.rows
            .map(
              (r) => `
            <tr class="${r.overBudget ? 'is-warning' : ''}">
              <td>${escapeHtml(r.budget.name)}</td>
              <td>${escapeHtml(r.ledger?.name || '—')}</td>
              <td>${escapeHtml(r.ledger?.nature || '—')}</td>
              <td class="num mono">${formatMoney(r.budgeted, currency)}</td>
              <td class="num mono">${formatMoney(r.actual, currency)}</td>
              <td class="num mono">${formatMoney(r.variance, currency)}</td>
              <td class="num mono">${r.pctUsed}%${r.overBudget ? ' <span class="badge badge--danger">Over</span>' : ''}</td>
            </tr>`
            )
            .join('')}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3"><strong>Total</strong></td>
            <td class="num mono"><strong>${formatMoney(report.totals.budgeted, currency)}</strong></td>
            <td class="num mono"><strong>${formatMoney(report.totals.actual, currency)}</strong></td>
            <td class="num mono"><strong>${formatMoney(report.totals.variance, currency)}</strong></td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>`
    }
  `;

  outlet.querySelector('#bv-filter')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(/** @type {HTMLFormElement} */ (e.target));
    const params = new URLSearchParams();
    params.set('periodType', String(fd.get('periodType') || 'month'));
    const p = String(fd.get('period') || '');
    if (p) params.set('period', p);
    router.navigate(`/reports/budget-variance?${params}`);
  });

  wireReportDownloads(outlet, { fileBase: 'budget-variance' });
}
