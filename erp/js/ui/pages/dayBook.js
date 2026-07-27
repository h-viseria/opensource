/**
 * Day Book report.
 */

import * as reportService from '../../services/reportService.js';
import {
  rangeFilterHtml,
  bindRangeFilter,
  parseRangeQuery,
  amountCell,
} from '../reportHelpers.js';
import { escapeHtml } from '../modal.js';
import { formatDisplayDate } from '../../utils/date.js';
import { formatMoney } from '../../utils/money.js';
import { wireReportDownloads } from '../reportExport.js';

/**
 * @param {import('../../core/router.js').RouteContext} ctx
 * @param {HTMLElement} outlet
 */
export async function renderDayBook(ctx, outlet) {
  const defaults = await reportService.getDefaultRange();
  const fyOptions = await reportService.listFyFilterOptions(defaults.book.id);
  const range = parseRangeQuery(ctx.query, defaults);
  const selectedFyValue = reportService.matchFyFilterValue(
    range.fromDate,
    range.toDate,
    fyOptions
  );
  const report = await reportService.dayBook(defaults.book.id, range);
  const currency = defaults.book.currency;

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/reports">Reports</a> / Day Book</p>
        <h1 class="page-header__title">Day Book</h1>
        <p class="page-header__desc">
          ${escapeHtml(defaults.book.name)} · ${escapeHtml(range.fromDate)} to ${escapeHtml(range.toDate)}
          · ${report.entries.length} voucher${report.entries.length === 1 ? '' : 's'}
        </p>
      </div>
    </div>

    ${rangeFilterHtml({ ...range, fyOptions, selectedFyValue })}

    ${
      report.entries.length === 0
        ? `<div class="panel empty-state"><p class="muted">No vouchers in this period.</p></div>`
        : report.entries
            .map(({ voucher, lines }) => {
              return `
          <div class="panel daybook-voucher">
            <div class="daybook-voucher__head">
              <div>
                <a class="mono" href="#/transactions/${voucher.id}">${escapeHtml(voucher.voucherNumber)}</a>
                <span class="badge badge--muted" style="margin-left:0.5rem">${escapeHtml(voucher.voucherType)}</span>
                <span class="muted" style="margin-left:0.5rem;font-size:var(--text-sm)">${formatDisplayDate(voucher.date)}</span>
              </div>
              <div class="mono">${formatMoney(voucher.debitTotal, currency)}</div>
            </div>
            ${voucher.narration ? `<p class="daybook-voucher__narration">${escapeHtml(voucher.narration)}</p>` : ''}
            <table class="data-table">
              <thead>
                <tr>
                  <th>Ledger</th>
                  <th class="num">Debit</th>
                  <th class="num">Credit</th>
                </tr>
              </thead>
              <tbody>
                ${lines
                  .map((l) => {
                    const led = report.ledgersById.get(l.ledgerId);
                    return `
                  <tr>
                    <td>${escapeHtml(led?.name || l.ledgerId)}</td>
                    <td class="num mono">${amountCell(l.debit, currency, { blankZero: true })}</td>
                    <td class="num mono">${amountCell(l.credit, currency, { blankZero: true })}</td>
                  </tr>`;
                  })
                  .join('')}
              </tbody>
            </table>
          </div>`;
            })
            .join('')
    }
  `;

  bindRangeFilter(outlet, '/reports/day-book');
  wireReportDownloads(outlet, { fileBase: 'day-book' });
}
