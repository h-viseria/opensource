/**
 * Stock movements list.
 */

import * as bookService from '../../services/bookService.js';
import * as inventoryService from '../../services/inventoryService.js';
import { CSV_LABELS, CSV_SAMPLES, importMovements } from '../../services/csvBulkImport.js';
import { INVENTORY_TYPE_LIST } from '../../engine/inventoryEngine.js';
import { showToast } from '../toast.js';
import { confirmModal, escapeHtml } from '../modal.js';
import { csvImportPanelHtml, wireCsvImport } from '../csvImport.js';
import { formatMoney } from '../../utils/money.js';
import { formatDisplayDate } from '../../utils/date.js';
import * as router from '../../core/router.js';

/**
 * @param {import('../../core/router.js').RouteContext} ctx
 * @param {HTMLElement} outlet
 */
export async function renderInventoryMovements(ctx, outlet) {
  const { book } = await bookService.getSessionContext();
  if (!book) {
    outlet.innerHTML = `<p class="muted">No active book.</p>`;
    return;
  }

  await inventoryService.ensureInventoryMasters(book.id);
  const typeFilter = ctx.query.type || '';
  const [movements, items, warehouses] = await Promise.all([
    inventoryService.listMovements(book.id, {
      type: typeFilter || undefined,
      limit: 200,
    }),
    inventoryService.listItems(book.id),
    inventoryService.listWarehouses(book.id),
  ]);

  const itemById = new Map(items.map((i) => [i.id, i]));
  const whById = new Map(warehouses.map((w) => [w.id, w]));
  const currency = book.currency || 'INR';

  /** Latest movement id per item (list is newest-first). */
  /** @type {Set<string>} */
  const latestByItem = new Set();
  /** @type {Set<string>} */
  const seenItems = new Set();
  for (const m of movements) {
    if (seenItems.has(m.itemId)) continue;
    seenItems.add(m.itemId);
    latestByItem.add(m.id);
  }

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/inventory">Inventory</a> / Movements</p>
        <h1 class="page-header__title">Stock movements</h1>
        <p class="page-header__desc">
          Opening, purchase, sale, sales/purchase return, adjustment, and transfer. Cost uses weighted average.
        </p>
      </div>
      <div class="page-header__actions">
        <a class="btn btn--primary" href="#/inventory/movements/new">New movement</a>
      </div>
    </div>

    ${csvImportPanelHtml()}

    <div class="toolbar">
      <form class="toolbar__search" id="form-filter" action="#">
        <select class="input" name="type">
          <option value="">All types</option>
          ${INVENTORY_TYPE_LIST.map(
            (t) =>
              `<option value="${escapeHtml(t)}" ${typeFilter === t ? 'selected' : ''}>${escapeHtml(t)}</option>`
          ).join('')}
        </select>
        <button type="submit" class="btn btn--secondary btn--sm">Filter</button>
      </form>
    </div>

    <div class="list">
      ${
        movements.length === 0
          ? `<div class="panel empty-state"><p class="muted">No movements yet.</p></div>`
          : movements
              .map((m) => {
                const item = itemById.get(m.itemId);
                const wh = whById.get(m.warehouseId);
                const toWh = m.toWarehouseId ? whById.get(m.toWarehouseId) : null;
                const sign =
                  m.type === 'Sale' ||
                  (m.type === 'Adjustment' && m.adjustmentSign === -1) ||
                  m.type === 'Transfer'
                    ? '−'
                    : '+';
                const canDelete = latestByItem.has(m.id);
                return `
          <div class="list-item" data-id="${m.id}">
            <div class="list-item__body">
              <div class="list-item__title">
                <span class="badge badge--muted">${escapeHtml(m.type)}</span>
                ${escapeHtml(item?.name || m.itemId)}
              </div>
              <div class="list-item__meta">
                ${formatDisplayDate(m.date)}
                · ${escapeHtml(wh?.name || '—')}
                ${toWh ? ` → ${escapeHtml(toWh.name)}` : ''}
                · Qty <span class="mono">${sign}${m.quantity}</span>
                · Rate <span class="mono">${formatMoney(m.rate, currency)}</span>
                · Value <span class="mono">${formatMoney(m.value, currency)}</span>
                ${
                  m.voucherId
                    ? ` · <a href="#/transactions/${m.voucherId}">Voucher</a>`
                    : ''
                }
                ${m.narration ? ` · ${escapeHtml(m.narration)}` : ''}
              </div>
            </div>
            <div class="list-item__actions">
              ${
                canDelete
                  ? '<button type="button" class="btn btn--ghost btn--sm" data-action="delete">Delete</button>'
                  : ''
              }
            </div>
          </div>`;
              })
              .join('')
      }
    </div>
  `;

  outlet.querySelector('#form-filter')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(/** @type {HTMLFormElement} */ (e.target));
    const t = String(fd.get('type') || '');
    router.navigate(t ? `/inventory/movements?type=${encodeURIComponent(t)}` : '/inventory/movements');
  });

  outlet.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('.list-item');
      const id = row?.getAttribute('data-id');
      if (!id) return;
      const ok = await confirmModal({
        title: 'Delete movement?',
        bodyHtml:
          '<p>Only the latest movement for an item can be deleted. Linked accounting voucher will be removed too.</p>',
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;
      try {
        await inventoryService.deleteMovement(id);
        showToast('Movement deleted', 'success');
        await renderInventoryMovements(ctx, outlet);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed', 'error');
      }
    });
  });

  wireCsvImport(outlet, {
    labels: CSV_LABELS.movements,
    sampleRows: CSV_SAMPLES.movements,
    fileName: 'movements_template.csv',
    onRows: (rows) => importMovements(book.id, rows),
    onDone: async (result) => {
      if (result.created > 0) await renderInventoryMovements(ctx, outlet);
    },
  });
}
