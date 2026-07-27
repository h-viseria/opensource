/**
 * Net Worth statement report.
 */

import * as bookService from '../../services/bookService.js';
import * as financeService from '../../services/personalFinanceService.js';
import { escapeHtml } from '../modal.js';
import { formatMoney } from '../../utils/money.js';
import { toDateInput } from '../../utils/date.js';
import * as router from '../../core/router.js';
import { wireReportDownloads } from '../reportExport.js';

/**
 * @param {import('../../core/router.js').RouteContext} ctx
 * @param {HTMLElement} outlet
 */
export async function renderNetWorth(ctx, outlet) {
  const { book } = await bookService.getSessionContext();
  if (!book) {
    outlet.innerHTML = `<p class="muted">No active book.</p>`;
    return;
  }

  const asOfDate = ctx.query.asOf || toDateInput(new Date());
  const report = await financeService.netWorthReport(book.id, { asOfDate });
  const currency = book.currency || 'INR';

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/reports">Reports</a> / Net Worth</p>
        <h1 class="page-header__title">Net worth statement</h1>
        <p class="page-header__desc">
          ${escapeHtml(book.name)} · as of ${escapeHtml(asOfDate)} ·
          Net worth <strong class="mono">${formatMoney(report.netWorth, currency)}</strong>
        </p>
      </div>
      <div class="page-header__actions">
        <a class="btn btn--secondary" href="#/finance">Personal finance</a>
      </div>
    </div>

    <form class="toolbar panel" id="asof-filter" style="margin-bottom:1rem;padding:0.75rem 1rem;display:flex;gap:0.75rem;align-items:end;flex-wrap:wrap">
      <label class="field" style="margin:0">
        <span class="field__label">As of</span>
        <input class="input" type="date" name="asOf" value="${escapeHtml(asOfDate)}" />
      </label>
      <button type="submit" class="btn btn--secondary btn--sm">Apply</button>
    </form>

    <div class="stat-grid">
      <div class="stat-tile">
        <div class="stat-tile__label">Assets</div>
        <div class="stat-tile__value mono">${formatMoney(report.totalAssets, currency)}</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__label">Liabilities</div>
        <div class="stat-tile__value mono">${formatMoney(report.totalLiabilities, currency)}</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__label">Net worth</div>
        <div class="stat-tile__value mono">${formatMoney(report.netWorth, currency)}</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__label">Investments</div>
        <div class="stat-tile__value mono">${formatMoney(report.investmentTotal, currency)}</div>
        <div class="stat-tile__hint">Loans ${formatMoney(report.loanTotal, currency)}</div>
      </div>
    </div>

    <div class="panel">
      <h2 class="panel__title">Assets</h2>
      ${sideTable(report.assets, currency, report.totalAssets) || `<p class="muted">No assets.</p>`}
    </div>

    <div class="panel" style="margin-top:1rem">
      <h2 class="panel__title">Liabilities</h2>
      ${sideTable(report.liabilities, currency, report.totalLiabilities) || `<p class="muted">No liabilities.</p>`}
    </div>
  `;

  outlet.querySelector('#asof-filter')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(/** @type {HTMLFormElement} */ (e.target));
    const asOf = String(fd.get('asOf') || '');
    router.navigate(asOf ? `/reports/net-worth?asOf=${encodeURIComponent(asOf)}` : '/reports/net-worth');
  });

  wireReportDownloads(outlet, { fileBase: 'net-worth' });
}

/**
 * @param {any[]} rows
 * @param {string} currency
 * @param {number} total
 */
function sideTable(rows, currency, total) {
  if (!rows.length) return '';
  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Account</th>
            <th>Group</th>
            <th class="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r) => `
            <tr>
              <td>${escapeHtml(r.ledger.name)}</td>
              <td>${escapeHtml(r.groupName || '—')}</td>
              <td class="num mono">${formatMoney(r.amount, currency)}</td>
            </tr>`
            )
            .join('')}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="2"><strong>Total</strong></td>
            <td class="num mono"><strong>${formatMoney(total, currency)}</strong></td>
          </tr>
        </tfoot>
      </table>
    </div>`;
}
