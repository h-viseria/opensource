/**
 * Transactions hub — voucher types and recent entries.
 */

import * as bookService from '../../services/bookService.js';
import * as voucherService from '../../services/voucherService.js';
import { VOUCHER_TYPE_LIST } from '../../engine/accountingEngine.js';
import { escapeHtml } from '../modal.js';
import { formatDisplayDate } from '../../utils/date.js';
import { formatMoney } from '../../utils/money.js';

/**
 * @param {import('../../core/router.js').RouteContext} _ctx
 * @param {HTMLElement} outlet
 */
export async function renderTransactions(_ctx, outlet) {
  const { book } = await bookService.getSessionContext();
  if (!book) {
    outlet.innerHTML = `<p class="muted">No active book.</p>`;
    return;
  }

  const [stats, recent] = await Promise.all([
    voucherService.getVoucherStats(book.id),
    voucherService.listVouchers(book.id, { limit: 10 }),
  ]);

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-header__title">Transactions</h1>
        <p class="page-header__desc">
          Double-entry vouchers for <strong>${escapeHtml(book.name)}</strong>.
          Debits must equal credits on every save.
        </p>
      </div>
      <div class="page-header__actions">
        <a class="btn btn--secondary" href="#/transactions/list">All vouchers</a>
        <a class="btn btn--primary" href="#/transactions/new/Journal">New journal</a>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat-tile">
        <div class="stat-tile__label">Vouchers</div>
        <div class="stat-tile__value">${stats.total}</div>
        <div class="stat-tile__hint">posted in this book</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__label">Total debits</div>
        <div class="stat-tile__value" style="font-size:var(--text-lg)">${formatMoney(stats.debitTotal, book.currency)}</div>
        <div class="stat-tile__hint">sum of voucher totals</div>
      </div>
    </div>

    <h2 class="section-title">New voucher</h2>
    <div class="voucher-type-grid">
      ${VOUCHER_TYPE_LIST.map(
        (t) => `
        <a class="voucher-type-card" href="#/transactions/new/${encodeURIComponent(t)}">
          <div class="voucher-type-card__title">${escapeHtml(t)}</div>
          <div class="voucher-type-card__meta">${stats.byType[t] || 0} posted</div>
        </a>`
      ).join('')}
    </div>

    <div class="panel" style="margin-top:var(--space-6)">
      <div class="panel__head-row">
        <div>
          <h2 class="panel__title" style="margin:0">Recent vouchers</h2>
          <p class="panel__desc" style="margin:0.35rem 0 0">Latest ${recent.length} entries</p>
        </div>
        <a class="btn btn--ghost btn--sm" href="#/transactions/list">View all</a>
      </div>
      ${recent.length === 0
        ? `<p class="muted" style="margin-top:var(--space-4)">No vouchers yet. Create a journal to start.</p>`
        : `<div class="table-wrap"><table class="data-table">
             <thead>
               <tr>
                 <th>Date</th>
                 <th>Type</th>
                 <th>Number</th>
                 <th>Narration</th>
                 <th class="num">Amount</th>
               </tr>
             </thead>
             <tbody>
               ${recent
                 .map(
                   (v) => `
                 <tr class="click-row" data-href="#/transactions/${v.id}">
                   <td>${formatDisplayDate(v.date)}</td>
                   <td><span class="badge badge--muted">${escapeHtml(v.voucherType)}</span></td>
                   <td class="mono"><a href="#/transactions/${v.id}">${escapeHtml(v.voucherNumber)}</a></td>
                   <td class="truncate">${escapeHtml(v.narration || '—')}</td>
                   <td class="num mono">${formatMoney(v.debitTotal, book.currency)}</td>
                 </tr>`
                 )
                 .join('')}
             </tbody>
           </table></div>`}
    </div>
  `;

  outlet.querySelectorAll('[data-href]').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target instanceof HTMLAnchorElement) return;
      const href = row.getAttribute('data-href');
      if (href) location.hash = href.replace(/^#/, '#');
    });
  });
}
