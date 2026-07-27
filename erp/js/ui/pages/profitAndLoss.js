/**
 * Profit & Loss report — hierarchical groups with subtotals.
 */

import * as reportService from '../../services/reportService.js';
import {
  rangeFilterHtml,
  bindRangeFilter,
  parseRangeQuery,
  hierarchyAmountRowsHtml,
} from '../reportHelpers.js';
import { escapeHtml } from '../modal.js';
import { formatMoney } from '../../utils/money.js';
import { wireReportDownloads } from '../reportExport.js';

/**
 * @param {import('../../core/router.js').RouteContext} ctx
 * @param {HTMLElement} outlet
 */
export async function renderProfitAndLoss(ctx, outlet) {
  const defaults = await reportService.getDefaultRange();
  const fyOptions = await reportService.listFyFilterOptions(defaults.book.id);
  const range = parseRangeQuery(ctx.query, defaults);
  const selectedFyValue = reportService.matchFyFilterValue(
    range.fromDate,
    range.toDate,
    fyOptions
  );
  const report = await reportService.profitAndLoss(defaults.book.id, range);
  const currency = defaults.book.currency;

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/reports">Reports</a> / Profit &amp; Loss</p>
        <h1 class="page-header__title">Profit &amp; Loss</h1>
        <p class="page-header__desc">
          ${escapeHtml(defaults.book.name)} · ${escapeHtml(range.fromDate)} to ${escapeHtml(range.toDate)}
        </p>
      </div>
    </div>

    ${rangeFilterHtml({ ...range, fyOptions, selectedFyValue })}

    <div class="pnl-grid">
      <div class="panel">
        <h2 class="panel__title">Income</h2>
        <div class="table-wrap">
          <table class="data-table">
            <tbody>
              ${hierarchyAmountRowsHtml(report.incomeRows, currency, {
                fromDate: range.fromDate,
                toDate: range.toDate,
                emptyText: 'No income in this period.',
              })}
            </tbody>
            <tfoot>
              <tr class="report-total">
                <td><strong>Total income</strong></td>
                <td class="num mono"><strong>${formatMoney(report.incomeTotal, currency)}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div class="panel">
        <h2 class="panel__title">Expenses</h2>
        <div class="table-wrap">
          <table class="data-table">
            <tbody>
              ${hierarchyAmountRowsHtml(report.expenseRows, currency, {
                fromDate: range.fromDate,
                toDate: range.toDate,
                emptyText: 'No expenses in this period.',
              })}
            </tbody>
            <tfoot>
              <tr class="report-total">
                <td><strong>Total expenses</strong></td>
                <td class="num mono"><strong>${formatMoney(report.expenseTotal, currency)}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>

    <div class="panel pnl-result ${report.isProfit ? 'pnl-result--profit' : 'pnl-result--loss'}">
      <div class="pnl-result__label">${report.isProfit ? 'Net Profit' : 'Net Loss'}</div>
      <div class="pnl-result__value mono">${formatMoney(Math.abs(report.netProfit), currency)}</div>
    </div>
  `;

  bindRangeFilter(outlet, '/reports/profit-loss');
  wireReportDownloads(outlet, { fileBase: 'profit-and-loss' });
}
