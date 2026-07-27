/**
 * Ledger statement report — opening/closing for selected dates + running balance.
 */

import * as reportService from '../../services/reportService.js';
import { parseRangeQuery, amountCell } from '../reportHelpers.js';
import { escapeHtml } from '../modal.js';
import { formatDisplayDate } from '../../utils/date.js';
import { formatMoney } from '../../utils/money.js';
import { wireReportDownloads } from '../reportExport.js';

/**
 * @param {import('../../core/router.js').RouteContext} ctx
 * @param {HTMLElement} outlet
 */
export async function renderLedgerReport(ctx, outlet) {
  const defaults = await reportService.getDefaultRange();
  const fyOptions = await reportService.listFyFilterOptions(defaults.book.id);
  const range = parseRangeQuery(ctx.query, defaults);
  const selectedFyValue = reportService.matchFyFilterValue(
    range.fromDate,
    range.toDate,
    fyOptions
  );
  const ledgers = await reportService.listLedgersForReport(defaults.book.id);
  const ledgerId = ctx.query.ledgerId || ledgers[0]?.id || '';

  if (!ledgerId) {
    outlet.innerHTML = `<p class="muted">No ledgers available.</p>`;
    return;
  }

  const report = await reportService.ledgerReport(defaults.book.id, ledgerId, range);
  const currency = defaults.book.currency;
  const closingLabel = report.closing.debit
    ? `Dr ${formatMoney(report.closing.debit, currency)}`
    : report.closing.credit
      ? `Cr ${formatMoney(report.closing.credit, currency)}`
      : formatMoney(0, currency);
  const openingLabel = report.opening.debit
    ? `Dr ${formatMoney(report.opening.debit, currency)}`
    : report.opening.credit
      ? `Cr ${formatMoney(report.opening.credit, currency)}`
      : formatMoney(0, currency);

  const fyOptionsHtml = fyOptions
    .map((o) => {
      const value = `${o.fromDate}|${o.toDate}`;
      return `<option value="${escapeHtml(value)}" ${
        value === selectedFyValue ? 'selected' : ''
      }>${escapeHtml(o.label)}</option>`;
    })
    .join('');

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/reports">Reports</a> / Ledger</p>
        <h1 class="page-header__title">${escapeHtml(report.ledger.name)}</h1>
        <p class="page-header__desc">
          ${escapeHtml(report.ledger.nature)} · ${escapeHtml(range.fromDate)} to ${escapeHtml(range.toDate)}
          · Opening ${openingLabel} · Closing ${closingLabel}
        </p>
      </div>
    </div>

    <form class="toolbar filter-bar" id="ledger-filter">
      <div class="field">
        <label class="field__label" for="r-fy">Financial year</label>
        <select class="select" id="r-fy" name="fy">
          <option value="" ${!selectedFyValue ? 'selected' : ''}>Custom dates</option>
          ${fyOptionsHtml}
        </select>
      </div>
      <div class="field" style="grid-column: span 2">
        <label class="field__label" for="r-ledger">Ledger</label>
        <select class="select" id="r-ledger" name="ledgerId">
          ${ledgers
            .map(
              (l) =>
                `<option value="${l.id}" ${l.id === ledgerId ? 'selected' : ''}>${escapeHtml(l.name)} (${escapeHtml(l.nature)})</option>`
            )
            .join('')}
        </select>
      </div>
      <div class="field">
        <label class="field__label" for="r-from">From</label>
        <input class="input" type="date" id="r-from" name="from" value="${escapeHtml(range.fromDate)}" />
      </div>
      <div class="field">
        <label class="field__label" for="r-to">To</label>
        <input class="input" type="date" id="r-to" name="to" value="${escapeHtml(range.toDate)}" />
      </div>
      <div class="field field--action">
        <label class="field__label">&nbsp;</label>
        <button type="submit" class="btn btn--secondary">Apply</button>
      </div>
    </form>

    <div class="panel" style="padding:0;overflow:hidden">
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Voucher</th>
              <th>Narration</th>
              <th class="num">Debit</th>
              <th class="num">Credit</th>
              <th class="num">Balance</th>
            </tr>
          </thead>
          <tbody>
            ${
              report.entries.length === 0
                ? `<tr><td colspan="6" class="muted">No entries.</td></tr>`
                : report.entries
                    .map((e) => {
                      const isSpecial = e.isOpening || e.isClosing || e.voucherType === 'Opening' || e.voucherType === 'Closing';
                      const rowClass = e.isOpening
                        ? 'tree-row--opening'
                        : e.isClosing
                          ? 'tree-row--closing'
                          : '';
                      const vLink = e.voucherId
                        ? `<a href="#/transactions/${e.voucherId}">${escapeHtml(e.voucherNumber || e.voucherType)}</a>`
                        : `<strong>${escapeHtml(e.voucherType)}</strong>`;
                      const bal =
                        e.balanceSide != null
                          ? `${formatMoney(Math.abs(e.signedBalance ?? e.balance), currency)} ${e.balanceSide}`
                          : '';
                      return `
                <tr class="${rowClass}">
                  <td>${e.date ? formatDisplayDate(e.date) : '—'}</td>
                  <td class="mono">${vLink}</td>
                  <td class="truncate">${escapeHtml(e.narration || '—')}</td>
                  <td class="num mono">${amountCell(e.debit, currency, { blankZero: !isSpecial })}</td>
                  <td class="num mono">${amountCell(e.credit, currency, { blankZero: !isSpecial })}</td>
                  <td class="num mono"><strong>${bal}</strong></td>
                </tr>`;
                    })
                    .join('')
            }
          </tbody>
          <tfoot>
            <tr class="report-total">
              <td colspan="3"><strong>Period movements</strong></td>
              <td class="num mono"><strong>${formatMoney(report.periodDebit, currency)}</strong></td>
              <td class="num mono"><strong>${formatMoney(report.periodCredit, currency)}</strong></td>
              <td class="num mono"><strong>${closingLabel}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  `;

  const form = /** @type {HTMLFormElement|null} */ (outlet.querySelector('#ledger-filter'));
  const fromInput = /** @type {HTMLInputElement|null} */ (outlet.querySelector('#r-from'));
  const toInput = /** @type {HTMLInputElement|null} */ (outlet.querySelector('#r-to'));
  const fySelect = /** @type {HTMLSelectElement|null} */ (outlet.querySelector('#r-fy'));

  const applyLedgerFilter = () => {
    if (!form) return;
    const fd = new FormData(form);
    const params = new URLSearchParams();
    params.set('ledgerId', String(fd.get('ledgerId') || ''));
    const from = String(fd.get('from') || '');
    const to = String(fd.get('to') || '');
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    location.hash = `#/reports/ledger?${params.toString()}`;
  };

  fySelect?.addEventListener('change', () => {
    const v = fySelect.value;
    if (!v) return;
    const [from, to] = v.split('|');
    if (fromInput) fromInput.value = from || '';
    if (toInput) toInput.value = to || '';
    applyLedgerFilter();
  });

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    applyLedgerFilter();
  });

  wireReportDownloads(outlet, { fileBase: `ledger-${slugPart(report.ledger.name)}` });
}

/** @param {string} name */
function slugPart(name) {
  return String(name || 'account')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}
