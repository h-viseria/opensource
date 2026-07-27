/**
 * Cash flow (Cash & Bank) report.
 */

import * as reportService from '../../services/reportService.js';
import {
  rangeFilterHtml,
  bindRangeFilter,
  parseRangeQuery,
} from '../reportHelpers.js';
import { escapeHtml } from '../modal.js';
import { formatDisplayDate } from '../../utils/date.js';
import { formatMoney } from '../../utils/money.js';
import { wireReportDownloads } from '../reportExport.js';

/**
 * @param {import('../../core/router.js').RouteContext} ctx
 * @param {HTMLElement} outlet
 */
export async function renderCashFlow(ctx, outlet) {
  const defaults = await reportService.getDefaultRange();
  const fyOptions = await reportService.listFyFilterOptions(defaults.book.id);
  const range = parseRangeQuery(ctx.query, defaults);
  const selectedFyValue = reportService.matchFyFilterValue(
    range.fromDate,
    range.toDate,
    fyOptions
  );
  const report = await reportService.cashFlow(defaults.book.id, range);
  const currency = defaults.book.currency;

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/reports">Reports</a> / Cash Flow</p>
        <h1 class="page-header__title">Cash Flow</h1>
        <p class="page-header__desc">
          Movements on Cash &amp; Bank ledgers · ${escapeHtml(range.fromDate)} to ${escapeHtml(range.toDate)}
        </p>
      </div>
    </div>

    ${rangeFilterHtml({ ...range, fyOptions, selectedFyValue })}

    <div class="stat-grid">
      <div class="stat-tile">
        <div class="stat-tile__label">Inflow</div>
        <div class="stat-tile__value" style="font-size:var(--text-lg)">${formatMoney(report.inflow, currency)}</div>
        <div class="stat-tile__hint">debits to cash/bank</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__label">Outflow</div>
        <div class="stat-tile__value" style="font-size:var(--text-lg)">${formatMoney(report.outflow, currency)}</div>
        <div class="stat-tile__hint">credits to cash/bank</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__label">Net</div>
        <div class="stat-tile__value" style="font-size:var(--text-lg)">${formatMoney(report.net, currency)}</div>
        <div class="stat-tile__hint">inflow − outflow</div>
      </div>
    </div>

    <div class="pnl-grid">
      <div class="panel">
        <h2 class="panel__title">Inflows</h2>
        ${flowTable(report.inflowRows, currency)}
      </div>
      <div class="panel">
        <h2 class="panel__title">Outflows</h2>
        ${flowTable(report.outflowRows, currency)}
      </div>
    </div>
  `;

  bindRangeFilter(outlet, '/reports/cash-flow');
  wireReportDownloads(outlet, { fileBase: 'cash-flow' });
}

/**
 * @param {any[]} rows
 * @param {string} currency
 */
function flowTable(rows, currency) {
  if (rows.length === 0) {
    return `<p class="muted">None in this period.</p>`;
  }
  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Account</th>
            <th class="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r) => `
            <tr>
              <td>${formatDisplayDate(r.date)}</td>
              <td>${escapeHtml(r.ledgerName)}
                ${r.voucherId ? ` · <a href="#/transactions/${r.voucherId}">view</a>` : ''}
              </td>
              <td class="num mono">${formatMoney(r.amount, currency)}</td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}
