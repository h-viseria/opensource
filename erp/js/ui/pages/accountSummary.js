/**
 * Accounts Summary — debits & credits grouped by target account path level.
 */

import * as reportService from '../../services/reportService.js';
import { parseRangeQuery } from '../reportHelpers.js';
import { escapeHtml } from '../modal.js';
import { formatMoney } from '../../utils/money.js';
import { wireReportDownloads } from '../reportExport.js';

/**
 * @param {import('../../core/router.js').RouteContext} ctx
 * @param {HTMLElement} outlet
 */
export async function renderAccountSummary(ctx, outlet) {
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
  let groupLevel = Number(ctx.query.level || 1);
  if (!Number.isFinite(groupLevel) || groupLevel < 1) groupLevel = 1;
  if (groupLevel > 6) groupLevel = 6;

  if (!ledgerId) {
    outlet.innerHTML = `<p class="muted">No ledgers available.</p>`;
    return;
  }

  const report = await reportService.accountSummaryReport(defaults.book.id, ledgerId, {
    ...range,
    groupLevel,
  });
  const currency = defaults.book.currency;

  const fyOptionsHtml = fyOptions
    .map((o) => {
      const value = `${o.fromDate}|${o.toDate}`;
      return `<option value="${escapeHtml(value)}" ${
        value === selectedFyValue ? 'selected' : ''
      }>${escapeHtml(o.label)}</option>`;
    })
    .join('');

  const levelOptions = [1, 2, 3, 4, 5, 6]
    .map(
      (n) =>
        `<option value="${n}" ${n === groupLevel ? 'selected' : ''}>Level ${n}${
          n === 1 ? ' (top)' : n === 6 ? ' (deepest)' : ''
        }</option>`
    )
    .join('');

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/reports">Reports</a> / Accounts Summary</p>
        <h1 class="page-header__title">Accounts Summary</h1>
        <p class="page-header__desc">
          <span class="mono">${escapeHtml(report.ledgerPath)}</span>
          · ${escapeHtml(range.fromDate)} to ${escapeHtml(range.toDate)}
          · grouped at level ${groupLevel}
        </p>
      </div>
    </div>

    <form class="toolbar filter-bar" id="account-summary-filter">
      <div class="field">
        <label class="field__label" for="r-fy">Financial year</label>
        <select class="select" id="r-fy" name="fy">
          <option value="" ${!selectedFyValue ? 'selected' : ''}>Custom dates</option>
          ${fyOptionsHtml}
        </select>
      </div>
      <div class="field" style="grid-column: span 2">
        <label class="field__label" for="r-ledger">Account</label>
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
        <label class="field__label" for="r-level">Grouping level</label>
        <select class="select" id="r-level" name="level">
          ${levelOptions}
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

    <p class="muted" style="margin:0 0 1rem;font-size:var(--text-sm)">
      Level 1 groups by the top segment of the target path (e.g. <span class="mono">Assets</span>).
      Higher levels keep more of the path (e.g. level 3 → <span class="mono">Assets:Current Assets:Cash</span>).
    </p>

    <div class="stat-grid" style="margin-bottom:1rem">
      <div class="stat-tile">
        <div class="stat-tile__label">Total debits</div>
        <div class="stat-tile__value" style="font-size:var(--text-lg)">${formatMoney(report.totalDebit, currency)}</div>
        <div class="stat-tile__hint">${report.debits.length} target group${report.debits.length === 1 ? '' : 's'}</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__label">Total credits</div>
        <div class="stat-tile__value" style="font-size:var(--text-lg)">${formatMoney(report.totalCredit, currency)}</div>
        <div class="stat-tile__hint">${report.credits.length} target group${report.credits.length === 1 ? '' : 's'}</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__label">Net (Dr − Cr)</div>
        <div class="stat-tile__value" style="font-size:var(--text-lg)">${formatMoney(report.totalDebit - report.totalCredit, currency)}</div>
        <div class="stat-tile__hint">period movements</div>
      </div>
    </div>

    <div class="pnl-grid">
      <div class="panel" style="padding:0;overflow:hidden">
        <div style="padding:0.85rem 1rem 0.35rem">
          <h2 class="panel__title" style="margin:0">Debits</h2>
          <p class="panel__desc" style="margin:0.25rem 0 0">Money into this account, by target</p>
        </div>
        ${sideTable(report.debits, report.totalDebit, currency, 'No debit movements in this period.')}
      </div>
      <div class="panel" style="padding:0;overflow:hidden">
        <div style="padding:0.85rem 1rem 0.35rem">
          <h2 class="panel__title" style="margin:0">Credits</h2>
          <p class="panel__desc" style="margin:0.25rem 0 0">Money out of this account, by target</p>
        </div>
        ${sideTable(report.credits, report.totalCredit, currency, 'No credit movements in this period.')}
      </div>
    </div>
  `;

  const form = /** @type {HTMLFormElement|null} */ (outlet.querySelector('#account-summary-filter'));
  const fromInput = /** @type {HTMLInputElement|null} */ (outlet.querySelector('#r-from'));
  const toInput = /** @type {HTMLInputElement|null} */ (outlet.querySelector('#r-to'));
  const fySelect = /** @type {HTMLSelectElement|null} */ (outlet.querySelector('#r-fy'));

  const applyFilter = () => {
    if (!form) return;
    const fd = new FormData(form);
    const params = new URLSearchParams();
    params.set('ledgerId', String(fd.get('ledgerId') || ''));
    params.set('level', String(fd.get('level') || '1'));
    const from = String(fd.get('from') || '');
    const to = String(fd.get('to') || '');
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    location.hash = `#/reports/accounts-summary?${params.toString()}`;
  };

  fySelect?.addEventListener('change', () => {
    const v = fySelect.value;
    if (!v) return;
    const [from, to] = v.split('|');
    if (fromInput) fromInput.value = from || '';
    if (toInput) toInput.value = to || '';
    applyFilter();
  });

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    applyFilter();
  });

  wireReportDownloads(outlet, { fileBase: 'accounts-summary' });
}

/**
 * @param {{ targetGroup: string, amount: number, entryCount: number }[]} rows
 * @param {number} total
 * @param {string} currency
 * @param {string} emptyText
 */
function sideTable(rows, total, currency, emptyText) {
  if (!rows.length) {
    return `<p class="muted" style="padding:0.75rem 1rem 1rem">${escapeHtml(emptyText)}</p>`;
  }
  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Target account</th>
            <th class="num">Entries</th>
            <th class="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r) => `
            <tr>
              <td class="mono">${escapeHtml(r.targetGroup)}</td>
              <td class="num mono">${r.entryCount}</td>
              <td class="num mono">${formatMoney(r.amount, currency)}</td>
            </tr>`
            )
            .join('')}
        </tbody>
        <tfoot>
          <tr class="report-total">
            <td colspan="2"><strong>Total</strong></td>
            <td class="num mono"><strong>${formatMoney(total, currency)}</strong></td>
          </tr>
        </tfoot>
      </table>
    </div>`;
}
