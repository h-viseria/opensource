/**
 * Inventory hub — masters + stock entry points.
 */

import * as bookService from '../../services/bookService.js';
import * as inventoryService from '../../services/inventoryService.js';
import { escapeHtml } from '../modal.js';
import { formatMoney } from '../../utils/money.js';

/**
 * @param {import('../../core/router.js').RouteContext} _ctx
 * @param {HTMLElement} outlet
 */
export async function renderInventory(_ctx, outlet) {
  const { book } = await bookService.getSessionContext();
  if (!book) {
    outlet.innerHTML = `<p class="muted">No active book.</p>`;
    return;
  }

  const stats = await inventoryService.getInventoryHubStats(book.id);
  const currency = book.currency || 'INR';

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-header__title">Inventory</h1>
        <p class="page-header__desc">
          Stock for <strong>${escapeHtml(book.name)}</strong>.
          Valuation uses weighted average. Movements can post to Stock / COGS ledgers.
        </p>
      </div>
      <div class="page-header__actions">
        <a class="btn btn--primary" href="#/inventory/movements/new">New movement</a>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat-tile">
        <div class="stat-tile__label">Items</div>
        <div class="stat-tile__value mono">${stats.items}</div>
        <div class="stat-tile__hint">${stats.withStock} with stock</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__label">Stock value</div>
        <div class="stat-tile__value mono">${formatMoney(stats.totalValue, currency)}</div>
        <div class="stat-tile__hint">Weighted average</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__label">Movements</div>
        <div class="stat-tile__value mono">${stats.movements}</div>
        <div class="stat-tile__hint">All time</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__label">Low stock</div>
        <div class="stat-tile__value mono">${stats.lowStockCount}</div>
        <div class="stat-tile__hint">At or below reorder</div>
      </div>
    </div>

    <div class="master-grid">
      <a class="master-card" href="#/inventory/catalogue">
        <div class="master-card__icon" aria-hidden="true">☰</div>
        <div class="master-card__title">Catalogue</div>
        <div class="master-card__desc">Item types with Brand, Name, Type, Size + extras</div>
        <div class="master-card__meta mono">${stats.catalogueTypes || 0} types</div>
      </a>
      <a class="master-card" href="#/inventory/items">
        <div class="master-card__icon" aria-hidden="true">▣</div>
        <div class="master-card__title">Items</div>
        <div class="master-card__desc">Stock SKUs built from catalogue attributes</div>
        <div class="master-card__meta mono">${stats.items} items</div>
      </a>
      <a class="master-card" href="#/inventory/movements">
        <div class="master-card__icon" aria-hidden="true">↔</div>
        <div class="master-card__title">Stock movements</div>
        <div class="master-card__desc">Opening, purchase, sale, adjustment, transfer</div>
        <div class="master-card__meta mono">${stats.movements} postings</div>
      </a>
      <a class="master-card" href="#/reports/stock-summary">
        <div class="master-card__icon" aria-hidden="true">▤</div>
        <div class="master-card__title">Stock summary</div>
        <div class="master-card__desc">Quantity, rate, and value by item</div>
        <div class="master-card__meta mono">${formatMoney(stats.totalValue, currency)}</div>
      </a>
      <a class="master-card" href="#/inventory/units">
        <div class="master-card__icon" aria-hidden="true">☰</div>
        <div class="master-card__title">Units</div>
        <div class="master-card__desc">Units of measure</div>
        <div class="master-card__meta mono">${stats.units} units</div>
      </a>
      <a class="master-card" href="#/inventory/categories">
        <div class="master-card__icon" aria-hidden="true">▦</div>
        <div class="master-card__title">Categories</div>
        <div class="master-card__desc">Item groupings</div>
        <div class="master-card__meta mono">${stats.categories} categories</div>
      </a>
      <a class="master-card" href="#/inventory/warehouses">
        <div class="master-card__icon" aria-hidden="true">⬡</div>
        <div class="master-card__title">Warehouses</div>
        <div class="master-card__desc">Stock locations</div>
        <div class="master-card__meta mono">${stats.warehouses} warehouses</div>
      </a>
    </div>
  `;
}
