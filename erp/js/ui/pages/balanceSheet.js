/**
 * Balance Sheet report — hierarchical groups with subtotals.
 */

import * as reportService from '../../services/reportService.js';
import {
  rangeFilterHtml,
  bindRangeFilter,
  parseRangeQuery,
  balanceBadge,
  hierarchyAmountRowsHtml,
} from '../reportHelpers.js';
import { escapeHtml } from '../modal.js';
import { formatMoney } from '../../utils/money.js';
import { wireReportDownloads } from '../reportExport.js';

/**
 * @param {import('../../core/router.js').RouteContext} ctx
 * @param {HTMLElement} outlet
 */
export async function renderBalanceSheet(ctx, outlet) {
  const defaults = await reportService.getDefaultRange();
  const fyOptions = await reportService.listFyFilterOptions(defaults.book.id);
  const range = parseRangeQuery(ctx.query, {
    fromDate: defaults.fromDate,
    toDate: defaults.asOfDate || defaults.toDate,
  });
  const selectedFyValue = reportService.matchFyFilterValue(
    range.fromDate,
    range.toDate,
    fyOptions
  );
  const report = await reportService.balanceSheet(defaults.book.id, range);
  const currency = defaults.book.currency;

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/reports">Reports</a> / Balance Sheet</p>
        <h1 class="page-header__title">Balance Sheet</h1>
        <p class="page-header__desc">
          ${escapeHtml(defaults.book.name)} · As of ${escapeHtml(range.toDate)}
          · P&amp;L period ${escapeHtml(range.fromDate)} → ${escapeHtml(range.toDate)}
          · ${balanceBadge(report.balanced)}
        </p>
      </div>
    </div>

    ${rangeFilterHtml({ ...range, fyOptions, selectedFyValue })}

    <div class="pnl-grid">
      <div class="panel">
        <h2 class="panel__title">Assets</h2>
        ${sectionTable(report.assets.rows, report.assets.total, currency, 'Total assets', range)}
      </div>
      <div class="panel">
        <h2 class="panel__title">Liabilities</h2>
        ${sectionTable(report.liabilities.rows, report.liabilities.total, currency, 'Total liabilities', range)}
        <h2 class="panel__title" style="margin-top:var(--space-5)">Equity</h2>
        ${sectionTable(report.equity.rows, report.equity.total, currency, 'Total equity', range)}
        <div class="bs-financing">
          <span>Liabilities + Equity</span>
          <strong class="mono">${formatMoney(report.totals.liabilitiesAndEquity, currency)}</strong>
        </div>
      </div>
    </div>

    <div class="panel bs-check ${report.balanced ? 'bs-check--ok' : 'bs-check--bad'}">
      <div>
        <div class="bs-check__label">Accounting equation</div>
        <div class="bs-check__eq mono">
          Assets ${formatMoney(report.totals.assets, currency)}
          =
          Liabilities + Equity ${formatMoney(report.totals.liabilitiesAndEquity, currency)}
        </div>
      </div>
      ${
        report.balanced
          ? `<span class="badge badge--success">Holds</span>`
          : `<span class="badge badge--warning">Diff ${formatMoney(report.difference, currency)}</span>`
      }
    </div>
  `;

  bindRangeFilter(outlet, '/reports/balance-sheet');
  wireReportDownloads(outlet, { fileBase: 'balance-sheet' });
}

/**
 * @param {any[]} rows
 * @param {number} total
 * @param {string} currency
 * @param {string} totalLabel
 * @param {{ fromDate: string, toDate: string }} range
 */
function sectionTable(rows, total, currency, totalLabel, range) {
  return `
    <div class="table-wrap">
      <table class="data-table">
        <tbody>
          ${hierarchyAmountRowsHtml(rows, currency, {
            fromDate: range.fromDate,
            toDate: range.toDate,
            emptyText: 'None',
          })}
        </tbody>
        <tfoot>
          <tr class="report-total">
            <td><strong>${escapeHtml(totalLabel)}</strong></td>
            <td class="num mono"><strong>${formatMoney(total, currency)}</strong></td>
          </tr>
        </tfoot>
      </table>
    </div>`;
}
