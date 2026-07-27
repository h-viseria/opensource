/**
 * Tax Payable report — Output − Input for a period.
 */

import * as reportService from '../../services/reportService.js';
import * as taxService from '../../services/taxService.js';
import {
  rangeFilterHtml,
  bindRangeFilter,
  parseRangeQuery,
  amountCell,
} from '../reportHelpers.js';
import { escapeHtml } from '../modal.js';
import { formatMoney } from '../../utils/money.js';
import { wireReportDownloads } from '../reportExport.js';

/**
 * @param {import('../../core/router.js').RouteContext} ctx
 * @param {HTMLElement} outlet
 */
export async function renderTaxPayable(ctx, outlet) {
  const defaults = await reportService.getDefaultRange();
  const fyOptions = await reportService.listFyFilterOptions(defaults.book.id);
  const range = parseRangeQuery(ctx.query, defaults);
  const selectedFyValue = reportService.matchFyFilterValue(range.fromDate, range.toDate, fyOptions);
  const report = await taxService.taxPayableReport(defaults.book.id, range);
  const currency = defaults.book.currency;
  const net = report.netPayable;
  const dueLabel = net >= 0 ? 'Tax payable' : 'Tax receivable (refund)';

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/reports">Reports</a> / Tax Payable</p>
        <h1 class="page-header__title">Tax payable</h1>
        <p class="page-header__desc">
          ${escapeHtml(defaults.book.name)} · ${escapeHtml(range.fromDate)} to ${escapeHtml(range.toDate)}
        </p>
      </div>
      <div class="page-header__actions">
        <a class="btn btn--secondary" href="#/tax">Tax hub</a>
      </div>
    </div>

    ${rangeFilterHtml({ ...range, fyOptions, selectedFyValue })}

    <div class="stat-grid" style="margin-top:1rem">
      <div class="stat-tile">
        <div class="stat-tile__label">Output tax collected</div>
        <div class="stat-tile__value mono">${formatMoney(report.totals.totalOutput, currency)}</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__label">Input tax claimed</div>
        <div class="stat-tile__value mono">${formatMoney(report.totals.totalInput, currency)}</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__label">${escapeHtml(dueLabel)}</div>
        <div class="stat-tile__value mono">${formatMoney(Math.abs(net), currency)}</div>
        <div class="stat-tile__hint">Output − Input</div>
      </div>
    </div>

    <div class="panel" style="margin-top:1rem">
      <h2 class="panel__title">Output tax</h2>
      ${rowsTable(report.outputRows, currency) || `<p class="muted">No output tax in this period.</p>`}
    </div>

    <div class="panel" style="margin-top:1rem">
      <h2 class="panel__title">Input tax</h2>
      ${rowsTable(report.inputRows, currency) || `<p class="muted">No input tax in this period.</p>`}
    </div>
  `;

  bindRangeFilter(outlet, '/reports/tax-payable');
  wireReportDownloads(outlet, { fileBase: 'tax-payable' });
}

/**
 * @param {any[]} rows
 * @param {string} currency
 */
function rowsTable(rows, currency) {
  if (!rows.length) return '';
  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Tax code</th>
            <th>Type</th>
            <th class="num">Rate</th>
            <th class="num">Net</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r) => `
            <tr>
              <td>${escapeHtml(r.taxCode.name)}</td>
              <td>${escapeHtml(r.taxCode.taxType)}</td>
              <td class="num mono">${r.taxCode.rate}%</td>
              <td class="num mono">${amountCell(r.net, currency)}</td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}
