/**
 * Stock summary report — quantity, WA rate, value.
 */

import * as bookService from '../../services/bookService.js';
import * as inventoryService from '../../services/inventoryService.js';
import { escapeHtml } from '../modal.js';
import { formatMoney } from '../../utils/money.js';
import { toDateInput } from '../../utils/date.js';
import * as router from '../../core/router.js';
import { wireReportDownloads } from '../reportExport.js';

/**
 * @param {import('../../core/router.js').RouteContext} ctx
 * @param {HTMLElement} outlet
 */
export async function renderStockSummary(ctx, outlet) {
  const { book } = await bookService.getSessionContext();
  if (!book) {
    outlet.innerHTML = `<p class="muted">No active book.</p>`;
    return;
  }

  const asOfDate = ctx.query.asOf || toDateInput(new Date());
  const warehouseId = ctx.query.warehouseId || '';

  const summary = await inventoryService.getStockSummary(book.id, {
    asOfDate,
    warehouseId: warehouseId || undefined,
  });
  const currency = book.currency || 'INR';

  const rows = summary.rows.filter((r) => r.quantity > 0 || (ctx.query.showZero === '1'));

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/reports">Reports</a> / Stock Summary</p>
        <h1 class="page-header__title">Stock summary</h1>
        <p class="page-header__desc">
          ${escapeHtml(book.name)} · as of ${escapeHtml(asOfDate)} ·
          weighted average valuation · ${summary.totals.withStock} items in stock ·
          ${formatMoney(summary.totals.totalValue, currency)}
        </p>
      </div>
      <div class="page-header__actions">
        <a class="btn btn--secondary" href="#/inventory">Inventory</a>
      </div>
    </div>

    <form class="toolbar panel" id="form-stock-filter" style="margin-bottom:1rem;padding:0.75rem 1rem;display:flex;flex-wrap:wrap;gap:0.75rem;align-items:end">
      <label class="field" style="margin:0">
        <span class="field__label">As of</span>
        <input class="input" type="date" name="asOf" value="${escapeHtml(asOfDate)}" />
      </label>
      <label class="field" style="margin:0">
        <span class="field__label">Warehouse</span>
        <select class="input" name="warehouseId">
          <option value="">All warehouses</option>
          ${summary.warehouses
            .map(
              (w) =>
                `<option value="${w.id}" ${warehouseId === w.id ? 'selected' : ''}>${escapeHtml(w.name)}</option>`
            )
            .join('')}
        </select>
      </label>
      <label class="field field--checkbox" style="margin:0">
        <input type="checkbox" name="showZero" value="1" ${ctx.query.showZero === '1' ? 'checked' : ''} />
        <span>Show zero qty</span>
      </label>
      <button type="submit" class="btn btn--secondary btn--sm">Apply</button>
    </form>

    ${
      rows.length === 0
        ? `<div class="panel empty-state"><p class="muted">No stock on hand.</p>
           <p><a href="#/inventory/movements/new">Post opening stock</a></p></div>`
        : `
    <div class="panel table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Category</th>
            <th>Unit</th>
            <th class="num">Qty</th>
            <th class="num">Avg rate</th>
            <th class="num">Value</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((r) => {
              const unit = r.unit?.symbol || r.unit?.name || '';
              return `
            <tr class="${r.lowStock ? 'is-warning' : ''}">
              <td>
                ${escapeHtml(r.item.name)}
                ${r.item.code ? `<div class="muted mono" style="font-size:var(--text-xs)">${escapeHtml(r.item.code)}</div>` : ''}
                ${r.lowStock ? '<span class="badge badge--danger">Low</span>' : ''}
              </td>
              <td>${escapeHtml(r.category?.name || '—')}</td>
              <td>${escapeHtml(unit)}</td>
              <td class="num mono">${r.quantity}</td>
              <td class="num mono">${formatMoney(r.avgRate, currency)}</td>
              <td class="num mono">${formatMoney(r.value, currency)}</td>
              <td><a class="btn btn--ghost btn--sm" href="#/inventory/movements/new?itemId=${r.item.id}">Move</a></td>
            </tr>`;
            })
            .join('')}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="5"><strong>Total stock value</strong></td>
            <td class="num mono"><strong>${formatMoney(summary.totals.totalValue, currency)}</strong></td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>`
    }
  `;

  outlet.querySelector('#form-stock-filter')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(/** @type {HTMLFormElement} */ (e.target));
    const params = new URLSearchParams();
    const asOf = String(fd.get('asOf') || '');
    const wh = String(fd.get('warehouseId') || '');
    if (asOf) params.set('asOf', asOf);
    if (wh) params.set('warehouseId', wh);
    if (fd.get('showZero') === '1') params.set('showZero', '1');
    const qs = params.toString();
    router.navigate(qs ? `/reports/stock-summary?${qs}` : '/reports/stock-summary');
  });

  wireReportDownloads(outlet, { fileBase: 'stock-summary' });
}
