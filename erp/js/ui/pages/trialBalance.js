/**
 * Trial Balance report — hierarchical groups with subtotals.
 */

import * as reportService from '../../services/reportService.js';
import {
  rangeFilterHtml,
  bindRangeFilter,
  parseRangeQuery,
  amountCell,
  balanceBadge,
  treePad,
} from '../reportHelpers.js';
import { escapeHtml } from '../modal.js';
import { formatMoney } from '../../utils/money.js';
import { wireReportDownloads } from '../reportExport.js';

/**
 * @param {import('../../core/router.js').RouteContext} ctx
 * @param {HTMLElement} outlet
 */
export async function renderTrialBalance(ctx, outlet) {
  const defaults = await reportService.getDefaultRange();
  const fyOptions = await reportService.listFyFilterOptions(defaults.book.id);
  const range = parseRangeQuery(ctx.query, defaults);
  const includeZero = ctx.query.zero === '1';
  const selectedFyValue = reportService.matchFyFilterValue(
    range.fromDate,
    range.toDate,
    fyOptions
  );
  const report = await reportService.trialBalance(defaults.book.id, {
    ...range,
    includeZero,
  });
  const currency = defaults.book.currency;

  let bodyRows = '<tr><td colspan="7" class="muted">No ledger activity in this period.</td></tr>';
  if (report.rows.length > 0) {
    bodyRows = report.rows
      .map((r) => {
        const pad = treePad(r.depth || 0);
        if (r.kind === 'group') {
          return `<tr class="tree-row tree-row--group">
            <td colspan="7">${pad}<strong>${escapeHtml(r.name)}</strong>
              <span class="badge badge--muted" style="margin-left:0.4rem">${escapeHtml(r.nature || '')}</span>
            </td>
          </tr>`;
        }
        if (r.kind === 'subtotal') {
          return `<tr class="tree-row tree-row--subtotal">
            <td>${pad}<span class="tree-subtotal-label">${escapeHtml(r.name)}</span></td>
            <td class="num mono">${amountCell(r.openingDebit, currency, { blankZero: true })}</td>
            <td class="num mono">${amountCell(r.openingCredit, currency, { blankZero: true })}</td>
            <td class="num mono">${amountCell(r.periodDebit, currency, { blankZero: true })}</td>
            <td class="num mono">${amountCell(r.periodCredit, currency, { blankZero: true })}</td>
            <td class="num mono">${amountCell(r.closingDebit, currency, { blankZero: true })}</td>
            <td class="num mono">${amountCell(r.closingCredit, currency, { blankZero: true })}</td>
          </tr>`;
        }
        const href =
          '#/reports/ledger?ledgerId=' +
          encodeURIComponent(r.ledgerId) +
          '&from=' +
          encodeURIComponent(range.fromDate) +
          '&to=' +
          encodeURIComponent(range.toDate);
        return `<tr class="tree-row tree-row--ledger">
          <td>${pad}<a href="${href}">${escapeHtml(r.name)}</a></td>
          <td class="num mono">${amountCell(r.openingDebit, currency, { blankZero: true })}</td>
          <td class="num mono">${amountCell(r.openingCredit, currency, { blankZero: true })}</td>
          <td class="num mono">${amountCell(r.periodDebit, currency, { blankZero: true })}</td>
          <td class="num mono">${amountCell(r.periodCredit, currency, { blankZero: true })}</td>
          <td class="num mono">${amountCell(r.closingDebit, currency, { blankZero: true })}</td>
          <td class="num mono">${amountCell(r.closingCredit, currency, { blankZero: true })}</td>
        </tr>`;
      })
      .join('');
  }

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/reports">Reports</a> / Trial Balance</p>
        <h1 class="page-header__title">Trial Balance</h1>
        <p class="page-header__desc">
          ${escapeHtml(defaults.book.name)} · ${escapeHtml(range.fromDate)} to ${escapeHtml(range.toDate)}
          · ${balanceBadge(report.balanced)}
        </p>
      </div>
    </div>

    ${rangeFilterHtml({
      ...range,
      showZero: true,
      includeZero,
      fyOptions,
      selectedFyValue,
    })}

    <div class="panel" style="padding:0;overflow:hidden">
      <div class="table-wrap">
        <table class="data-table report-table">
          <thead>
            <tr>
              <th rowspan="2">Account</th>
              <th colspan="2" class="num-group">Opening (B/F)</th>
              <th colspan="2" class="num-group">Period</th>
              <th colspan="2" class="num-group">Closing</th>
            </tr>
            <tr>
              <th class="num">Debit</th><th class="num">Credit</th>
              <th class="num">Debit</th><th class="num">Credit</th>
              <th class="num">Debit</th><th class="num">Credit</th>
            </tr>
          </thead>
          <tbody>${bodyRows}</tbody>
          <tfoot>
            <tr class="report-total">
              <td><strong>Total</strong></td>
              <td class="num mono"><strong>${formatMoney(report.totals.openingDebit, currency)}</strong></td>
              <td class="num mono"><strong>${formatMoney(report.totals.openingCredit, currency)}</strong></td>
              <td class="num mono"><strong>${formatMoney(report.totals.periodDebit, currency)}</strong></td>
              <td class="num mono"><strong>${formatMoney(report.totals.periodCredit, currency)}</strong></td>
              <td class="num mono"><strong>${formatMoney(report.totals.closingDebit, currency)}</strong></td>
              <td class="num mono"><strong>${formatMoney(report.totals.closingCredit, currency)}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  `;

  bindRangeFilter(outlet, '/reports/trial-balance');
  wireReportDownloads(outlet, { fileBase: 'trial-balance' });
}
