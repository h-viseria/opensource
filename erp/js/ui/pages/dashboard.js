/**
 * Dashboard — session summary, COA and voucher stats, quick links.
 */

import * as bookService from '../../services/bookService.js';
import * as coaService from '../../services/coaService.js';
import * as voucherService from '../../services/voucherService.js';
import { escapeHtml } from '../modal.js';
import { formatDisplayDate } from '../../utils/date.js';
import { formatMoney } from '../../utils/money.js';

/**
 * @param {import('../../core/router.js').RouteContext} ctx
 * @param {HTMLElement} outlet
 */
export async function renderDashboard(ctx, outlet) {
  const { book, financialYear } = await bookService.getSessionContext();

  if (!book) {
    outlet.innerHTML = `<p class="muted">No active book.</p>`;
    return;
  }

  await coaService.ensureChartOfAccounts(book.id);
  const [tree, voucherStats] = await Promise.all([
    coaService.getChartTree(book.id),
    voucherService.getVoucherStats(book.id),
  ]);

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-header__title">Book dashboard</h1>
        <p class="page-header__desc">
          Working in <strong>${escapeHtml(book.name)}</strong> only.
          Switch books from <em>Active book</em> in the top bar, or open
          <a href="#/portfolio">Portfolio</a> for all books together.
        </p>
      </div>
      <div class="page-header__actions">
        <a class="btn btn--secondary" href="#/masters/chart">Chart of Accounts</a>
        <a class="btn btn--primary" href="#/transactions/new/Journal">New journal</a>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat-tile">
        <div class="stat-tile__label">Financial year</div>
        <div class="stat-tile__value" style="font-family:var(--font-sans);font-size:var(--text-lg)">${escapeHtml(financialYear?.name || '—')}</div>
        <div class="stat-tile__hint">
          ${financialYear ? `${formatDisplayDate(financialYear.startDate)} – ${formatDisplayDate(financialYear.endDate)}` : '—'}
        </div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__label">Ledgers</div>
        <div class="stat-tile__value">${tree.stats.ledgers}</div>
        <div class="stat-tile__hint">${tree.stats.groups} groups</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__label">Vouchers</div>
        <div class="stat-tile__value">${voucherStats.total}</div>
        <div class="stat-tile__hint">double-entry postings</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__label">Posted volume</div>
        <div class="stat-tile__value" style="font-size:var(--text-lg)">${formatMoney(voucherStats.debitTotal, book.currency)}</div>
        <div class="stat-tile__hint">sum of voucher debits</div>
      </div>
    </div>

    <div class="panel">
      <h2 class="panel__title">Quick links</h2>
      <p class="panel__desc">Jump into the main areas for this book.</p>
      <div class="master-grid">
        <a class="master-card" href="#/masters">
          <div class="master-card__icon" aria-hidden="true">☰</div>
          <div class="master-card__title">Masters</div>
          <div class="master-card__desc">Chart, groups, ledgers, import</div>
        </a>
        <a class="master-card" href="#/transactions">
          <div class="master-card__icon" aria-hidden="true">↔</div>
          <div class="master-card__title">Transactions</div>
          <div class="master-card__desc">Vouchers and journals</div>
        </a>
        <a class="master-card" href="#/invoices">
          <div class="master-card__icon" aria-hidden="true">▦</div>
          <div class="master-card__title">Invoices</div>
          <div class="master-card__desc">Sales &amp; purchase with stock and tax</div>
        </a>
        <a class="master-card" href="#/reports">
          <div class="master-card__icon" aria-hidden="true">▤</div>
          <div class="master-card__title">Reports</div>
          <div class="master-card__desc">TB, P&amp;L, Balance Sheet, ledger</div>
        </a>
        <a class="master-card" href="#/inventory">
          <div class="master-card__icon" aria-hidden="true">▣</div>
          <div class="master-card__title">Inventory</div>
          <div class="master-card__desc">Items, warehouses, stock</div>
        </a>
        <a class="master-card" href="#/tax">
          <div class="master-card__icon" aria-hidden="true">%</div>
          <div class="master-card__title">Tax</div>
          <div class="master-card__desc">Codes and tax reports</div>
        </a>
        <a class="master-card" href="#/finance">
          <div class="master-card__icon" aria-hidden="true">◈</div>
          <div class="master-card__title">Personal finance</div>
          <div class="master-card__desc">Budgets, goals, net worth</div>
        </a>
      </div>
    </div>
  `;
}
