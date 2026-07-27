/**
 * Tax Ledger report — tagged voucher lines.
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
import { formatDisplayDate } from '../../utils/date.js';
import { formatMoney } from '../../utils/money.js';
import * as router from '../../core/router.js';
import { wireReportDownloads } from '../reportExport.js';

/**
 * @param {import('../../core/router.js').RouteContext} ctx
 * @param {HTMLElement} outlet
 */
export async function renderTaxLedger(ctx, outlet) {
  const defaults = await reportService.getDefaultRange();
  const fyOptions = await reportService.listFyFilterOptions(defaults.book.id);
  const range = parseRangeQuery(ctx.query, defaults);
  const selectedFyValue = reportService.matchFyFilterValue(range.fromDate, range.toDate, fyOptions);
  const taxCodeId = ctx.query.taxCodeId || '';
  const report = await taxService.taxLedgerReport(defaults.book.id, {
    ...range,
    taxCodeId: taxCodeId || undefined,
  });
  const currency = defaults.book.currency;

  let totalDebit = 0;
  let totalCredit = 0;
  for (const e of report.entries) {
    totalDebit += Number(e.line.debit) || 0;
    totalCredit += Number(e.line.credit) || 0;
  }

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/reports">Reports</a> / Tax Ledger</p>
        <h1 class="page-header__title">Tax ledger</h1>
        <p class="page-header__desc">
          ${escapeHtml(defaults.book.name)} · ${escapeHtml(range.fromDate)} to ${escapeHtml(range.toDate)} ·
          ${report.entries.length} line${report.entries.length === 1 ? '' : 's'}
        </p>
      </div>
      <div class="page-header__actions">
        <a class="btn btn--secondary" href="#/reports/tax-summary">Summary</a>
      </div>
    </div>

    ${rangeFilterHtml({ ...range, fyOptions, selectedFyValue })}

    <form class="toolbar" id="tax-code-filter" style="margin-top:0.75rem">
      <label class="field" style="margin:0;min-width:14rem">
        <span class="field__label">Tax code</span>
        <select class="input" name="taxCodeId">
          <option value="">All tax codes</option>
          ${report.taxCodes
            .map(
              (c) =>
                `<option value="${c.id}" ${taxCodeId === c.id ? 'selected' : ''}>${escapeHtml(c.name)} (${c.rate}%)</option>`
            )
            .join('')}
        </select>
      </label>
      <button type="submit" class="btn btn--secondary btn--sm" style="align-self:end">Filter</button>
    </form>

    ${
      report.entries.length === 0
        ? `<div class="panel empty-state"><p class="muted">No tagged tax lines in this period.</p></div>`
        : `
    <div class="panel table-wrap" style="margin-top:1rem">
      <table class="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Voucher</th>
            <th>Tax code</th>
            <th>Ledger</th>
            <th class="num">Debit</th>
            <th class="num">Credit</th>
          </tr>
        </thead>
        <tbody>
          ${report.entries
            .map(
              (e) => `
            <tr>
              <td>${formatDisplayDate(e.line.date)}</td>
              <td>
                ${
                  e.voucher
                    ? `<a class="mono" href="#/transactions/${e.voucher.id}">${escapeHtml(e.voucher.voucherNumber)}</a>
                       <span class="badge badge--muted" style="margin-left:0.35rem">${escapeHtml(e.voucher.voucherType)}</span>`
                    : '—'
                }
              </td>
              <td>
                ${escapeHtml(e.taxCode.name)}
                <span class="badge ${e.taxCode.component === 'Input' ? 'badge--info' : 'badge--success'}" style="margin-left:0.35rem">${escapeHtml(e.taxCode.component)}</span>
              </td>
              <td>${escapeHtml(e.ledger?.name || '—')}</td>
              <td class="num mono">${amountCell(e.line.debit, currency, { blankZero: true })}</td>
              <td class="num mono">${amountCell(e.line.credit, currency, { blankZero: true })}</td>
            </tr>`
            )
            .join('')}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="4"><strong>Totals</strong></td>
            <td class="num mono"><strong>${formatMoney(totalDebit, currency)}</strong></td>
            <td class="num mono"><strong>${formatMoney(totalCredit, currency)}</strong></td>
          </tr>
        </tfoot>
      </table>
    </div>`
    }
  `;

  bindRangeFilter(outlet, '/reports/tax-ledger');

  outlet.querySelector('#tax-code-filter')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(/** @type {HTMLFormElement} */ (e.target));
    const params = new URLSearchParams();
    if (range.fromDate) params.set('from', range.fromDate);
    if (range.toDate) params.set('to', range.toDate);
    const id = String(fd.get('taxCodeId') || '');
    if (id) params.set('taxCodeId', id);
    const qs = params.toString();
    router.navigate(qs ? `/reports/tax-ledger?${qs}` : '/reports/tax-ledger');
  });

  wireReportDownloads(outlet, { fileBase: 'tax-ledger' });
}
