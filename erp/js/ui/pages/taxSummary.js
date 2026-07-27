/**
 * Tax Summary report.
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
export async function renderTaxSummary(ctx, outlet) {
  const defaults = await reportService.getDefaultRange();
  const fyOptions = await reportService.listFyFilterOptions(defaults.book.id);
  const range = parseRangeQuery(ctx.query, defaults);
  const selectedFyValue = reportService.matchFyFilterValue(range.fromDate, range.toDate, fyOptions);
  const report = await taxService.taxSummaryReport(defaults.book.id, range);
  const currency = defaults.book.currency;

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/reports">Reports</a> / Tax Summary</p>
        <h1 class="page-header__title">Tax summary</h1>
        <p class="page-header__desc">
          ${escapeHtml(defaults.book.name)} · ${escapeHtml(range.fromDate)} to ${escapeHtml(range.toDate)} ·
          ${report.totals.codesUsed} code${report.totals.codesUsed === 1 ? '' : 's'} ·
          Net payable ${formatMoney(report.totals.netPayable, currency)}
        </p>
      </div>
      <div class="page-header__actions">
        <a class="btn btn--secondary" href="#/tax">Tax hub</a>
      </div>
    </div>

    ${rangeFilterHtml({ ...range, fyOptions, selectedFyValue })}

    <div class="stat-grid" style="margin-top:1rem">
      <div class="stat-tile">
        <div class="stat-tile__label">Output tax</div>
        <div class="stat-tile__value mono">${formatMoney(report.totals.totalOutput, currency)}</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__label">Input tax</div>
        <div class="stat-tile__value mono">${formatMoney(report.totals.totalInput, currency)}</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__label">Net payable</div>
        <div class="stat-tile__value mono">${formatMoney(report.totals.netPayable, currency)}</div>
      </div>
    </div>

    ${
      report.rows.length === 0
        ? `<div class="panel empty-state"><p class="muted">No tax-tagged voucher lines in this period.</p>
           <p class="muted">On a Sales or Purchase voucher, set the Tax column on the tax ledger line.</p></div>`
        : `
    <div class="panel table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Tax code</th>
            <th>Type</th>
            <th>Component</th>
            <th class="num">Rate</th>
            <th class="num">Debit</th>
            <th class="num">Credit</th>
            <th class="num">Net</th>
            <th class="num">Lines</th>
          </tr>
        </thead>
        <tbody>
          ${report.rows
            .map(
              (r) => `
            <tr>
              <td>
                <a href="#/reports/tax-ledger?taxCodeId=${r.taxCode.id}&from=${encodeURIComponent(range.fromDate)}&to=${encodeURIComponent(range.toDate)}">${escapeHtml(r.taxCode.name)}</a>
                ${r.taxCode.code ? `<div class="muted mono" style="font-size:var(--text-xs)">${escapeHtml(r.taxCode.code)}</div>` : ''}
              </td>
              <td>${escapeHtml(r.taxCode.taxType)}</td>
              <td><span class="badge ${r.direction === 'Input' ? 'badge--info' : 'badge--success'}">${escapeHtml(r.direction)}</span></td>
              <td class="num mono">${r.taxCode.rate}%</td>
              <td class="num mono">${amountCell(r.debit, currency, { blankZero: true })}</td>
              <td class="num mono">${amountCell(r.credit, currency, { blankZero: true })}</td>
              <td class="num mono">${formatMoney(r.net, currency)}</td>
              <td class="num mono">${r.lineCount}</td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`
    }
  `;

  bindRangeFilter(outlet, '/reports/tax-summary');
  wireReportDownloads(outlet, { fileBase: 'tax-summary' });
}
