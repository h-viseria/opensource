/**
 * Portfolio — all-books overview (cross-book dashboard).
 */

import * as portfolioService from '../../services/portfolioService.js';
import * as bookService from '../../services/bookService.js';
import { showToast } from '../toast.js';
import { escapeHtml } from '../modal.js';
import { formatMoney } from '../../utils/money.js';
import * as router from '../../core/router.js';

/**
 * @param {import('../../core/router.js').RouteContext} _ctx
 * @param {HTMLElement} outlet
 */
export async function renderPortfolio(_ctx, outlet) {
  const { items, totals, activeBookId } = await portfolioService.getPortfolioSummary();

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-header__title">Portfolio</h1>
        <p class="page-header__desc">
          All books in this browser. Masters, vouchers, and reports always run inside
          <strong>one active book</strong> — open a book below to work in it.
        </p>
      </div>
      <div class="page-header__actions">
        <a class="btn btn--secondary" href="#/books">Manage books</a>
        <a class="btn btn--primary" href="#/books">New book</a>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat-tile">
        <div class="stat-tile__label">Books</div>
        <div class="stat-tile__value">${totals.books}</div>
        <div class="stat-tile__hint">separate sets of accounts</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__label">Combined assets</div>
        <div class="stat-tile__value" style="font-size:var(--text-lg)">${formatMoney(totals.assets)}</div>
        <div class="stat-tile__hint">sum across books (mixed currencies)</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__label">Combined equity</div>
        <div class="stat-tile__value" style="font-size:var(--text-lg)">${formatMoney(totals.equity)}</div>
        <div class="stat-tile__hint">including period P&amp;L plugs</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__label">Vouchers</div>
        <div class="stat-tile__value">${totals.vouchers}</div>
        <div class="stat-tile__hint">posted across all books</div>
      </div>
    </div>

    ${
      items.length === 0
        ? `<div class="panel empty-state">
             <h2 class="empty-state__title">No books yet</h2>
             <p class="empty-state__desc">Create a book to start double-entry accounting.</p>
             <a class="btn btn--primary" href="#/books">Create book</a>
           </div>`
        : `<div class="portfolio-grid">
             ${items
               .map((row) => {
                 const b = row.book;
                 const fy = row.financialYear;
                 return `
               <article class="portfolio-card ${row.isActive ? 'is-active' : ''}" data-book-id="${b.id}">
                 <div class="portfolio-card__head">
                   <div>
                     <h2 class="portfolio-card__title">${escapeHtml(b.name)}</h2>
                     <p class="portfolio-card__meta">
                       ${escapeHtml(b.currency || 'INR')}
                       ${fy ? ` · ${escapeHtml(fy.name)}` : ''}
                       ${row.isActive ? ' · <span class="badge badge--success">Active</span>' : ''}
                     </p>
                   </div>
                   ${row.balanced ? '<span class="badge badge--success">BS OK</span>' : '<span class="badge badge--warning">Check BS</span>'}
                 </div>
                 <div class="portfolio-card__stats">
                   <div><span class="faint">Assets</span><div class="mono">${formatMoney(row.assets, b.currency)}</div></div>
                   <div><span class="faint">Equity</span><div class="mono">${formatMoney(row.equity, b.currency)}</div></div>
                   <div><span class="faint">Net P&amp;L</span><div class="mono">${formatMoney(row.netProfit, b.currency)}</div></div>
                   <div><span class="faint">Ledgers</span><div class="mono">${row.ledgerCount}</div></div>
                 </div>
                 <div class="portfolio-card__actions">
                   ${
                     row.isActive
                       ? `<a class="btn btn--primary btn--sm" href="#/dashboard">Open workspace</a>`
                       : `<button type="button" class="btn btn--primary btn--sm" data-action="open">Make active &amp; open</button>`
                   }
                   <a class="btn btn--secondary btn--sm" href="#/books">Manage</a>
                 </div>
               </article>`;
               })
               .join('')}
           </div>`
    }
  `;

  outlet.querySelectorAll('[data-action="open"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('[data-book-id]');
      const bookId = card?.getAttribute('data-book-id');
      if (!bookId) return;
      try {
        await bookService.setActiveBook(bookId);
        showToast('Book opened', 'success');
        router.navigate('/dashboard');
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Could not open book', 'error');
      }
    });
  });

  void activeBookId;
}
