/**
 * New stock movement form.
 */

import * as bookService from '../../services/bookService.js';
import * as inventoryService from '../../services/inventoryService.js';
import { INVENTORY_TXN_TYPES, INVENTORY_TYPE_LIST } from '../../engine/inventoryEngine.js';
import { showToast } from '../toast.js';
import { escapeHtml } from '../modal.js';
import { toDateInput } from '../../utils/date.js';
import * as router from '../../core/router.js';

/**
 * @param {import('../../core/router.js').RouteContext} ctx
 * @param {HTMLElement} outlet
 */
export async function renderInventoryMovementNew(ctx, outlet) {
  const session = await bookService.getSessionContext();
  const { book, financialYear } = session;
  if (!book) {
    outlet.innerHTML = `<p class="muted">No active book.</p>`;
    return;
  }
  if (!financialYear) {
    outlet.innerHTML = `<p class="muted">No active financial year.</p>`;
    return;
  }

  await inventoryService.ensureInventoryMasters(book.id);
  const [items, warehouses, counters] = await Promise.all([
    inventoryService.listItems(book.id),
    inventoryService.listWarehouses(book.id),
    inventoryService.listCounterLedgers(book.id),
  ]);

  const activeItems = items.filter((i) => i.isActive);
  const preItem = ctx.query.itemId || '';
  const defaultWh = warehouses.find((w) => w.isDefault) || warehouses[0];
  const today = toDateInput(new Date());

  if (activeItems.length === 0) {
    outlet.innerHTML = `
      <div class="page-header">
        <div>
          <p class="page-eyebrow"><a href="#/inventory">Inventory</a> / New movement</p>
          <h1 class="page-header__title">New stock movement</h1>
          <p class="page-header__desc">Create an item before posting stock.</p>
        </div>
      </div>
      <p><a class="btn btn--primary" href="#/inventory/items">Create item</a></p>
    `;
    return;
  }

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/inventory">Inventory</a> /
          <a href="#/inventory/movements">Movements</a> / New</p>
        <h1 class="page-header__title">New stock movement</h1>
        <p class="page-header__desc">
          Posting updates stock quantity and value (weighted average).
          Purchase / sale / adjustment can also create a linked accounting voucher.
        </p>
      </div>
    </div>

    <form class="panel form-panel" id="form-movement">
      <div class="form-grid">
        <label class="field">
          <span class="field__label">Type *</span>
          <select class="input" name="type" id="fld-type" required>
            ${INVENTORY_TYPE_LIST.map(
              (t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`
            ).join('')}
          </select>
        </label>
        <label class="field">
          <span class="field__label">Date *</span>
          <input class="input" type="date" name="date" required value="${today}" />
        </label>
        <label class="field">
          <span class="field__label">Item *</span>
          <select class="input" name="itemId" id="fld-item" required>
            ${activeItems
              .map(
                (i) =>
                  `<option value="${i.id}" ${preItem === i.id ? 'selected' : ''}>${escapeHtml(i.name)}${
                    i.code ? ` (${escapeHtml(i.code)})` : ''
                  }</option>`
              )
              .join('')}
          </select>
        </label>
        <label class="field" id="wrap-warehouse">
          <span class="field__label" id="lbl-warehouse">Warehouse *</span>
          <select class="input" name="warehouseId" required>
            ${warehouses
              .map(
                (w) =>
                  `<option value="${w.id}" ${defaultWh?.id === w.id ? 'selected' : ''}>${escapeHtml(w.name)}</option>`
              )
              .join('')}
          </select>
        </label>
        <label class="field" id="wrap-to-warehouse" hidden>
          <span class="field__label">To warehouse *</span>
          <select class="input" name="toWarehouseId">
            ${warehouses.map((w) => `<option value="${w.id}">${escapeHtml(w.name)}</option>`).join('')}
          </select>
        </label>
        <label class="field" id="wrap-adj-sign" hidden>
          <span class="field__label">Adjustment direction *</span>
          <select class="input" name="adjustmentSign">
            <option value="1">Increase (+)</option>
            <option value="-1">Decrease (−)</option>
          </select>
        </label>
        <label class="field">
          <span class="field__label">Quantity *</span>
          <input class="input" type="number" name="quantity" min="0.0001" step="any" required value="1" />
        </label>
        <label class="field" id="wrap-rate">
          <span class="field__label">Rate (cost) *</span>
          <input class="input" type="number" name="rate" id="fld-rate" min="0" step="0.01" value="0" />
        </label>
        <label class="field" id="wrap-counter">
          <span class="field__label">Counter ledger</span>
          <select class="input" name="counterLedgerId" id="fld-counter">
            <option value="">— Optional for opening; required for purchase —</option>
            ${counters
              .map((l) => `<option value="${l.id}">${escapeHtml(l.name)} (${escapeHtml(l.nature)})</option>`)
              .join('')}
          </select>
          <span class="field__hint" id="hint-counter">Purchase: Cash / Bank / Payable. Opening: Capital / Equity.</span>
        </label>
        <label class="field field--full">
          <span class="field__label">Narration</span>
          <input class="input" name="narration" placeholder="Optional note" />
        </label>
        <label class="field field--checkbox field--full" id="wrap-post-acct">
          <input type="checkbox" name="postAccounting" value="1" id="fld-post-acct" checked />
          <span>Post linked accounting voucher (Stock / COGS)</span>
        </label>
      </div>
      <div class="form-actions">
        <a class="btn btn--secondary" href="#/inventory/movements">Cancel</a>
        <button type="submit" class="btn btn--primary">Post movement</button>
      </div>
    </form>
  `;

  const form = /** @type {HTMLFormElement} */ (outlet.querySelector('#form-movement'));
  const typeEl = /** @type {HTMLSelectElement} */ (outlet.querySelector('#fld-type'));
  const itemEl = /** @type {HTMLSelectElement} */ (outlet.querySelector('#fld-item'));
  const rateEl = /** @type {HTMLInputElement} */ (outlet.querySelector('#fld-rate'));

  const syncFields = () => {
    const type = typeEl.value;
    const wrapTo = outlet.querySelector('#wrap-to-warehouse');
    const wrapAdj = outlet.querySelector('#wrap-adj-sign');
    const wrapRate = outlet.querySelector('#wrap-rate');
    const wrapCounter = outlet.querySelector('#wrap-counter');
    const wrapPost = outlet.querySelector('#wrap-post-acct');
    const lblWh = outlet.querySelector('#lbl-warehouse');

    wrapTo?.toggleAttribute('hidden', type !== INVENTORY_TXN_TYPES.TRANSFER);
    wrapAdj?.toggleAttribute('hidden', type !== INVENTORY_TXN_TYPES.ADJUSTMENT);
    const needsRate =
      type === INVENTORY_TXN_TYPES.OPENING ||
      type === INVENTORY_TXN_TYPES.PURCHASE ||
      type === INVENTORY_TXN_TYPES.ADJUSTMENT;
    wrapRate?.toggleAttribute('hidden', type === INVENTORY_TXN_TYPES.SALE || type === INVENTORY_TXN_TYPES.TRANSFER);
    if (lblWh) {
      lblWh.textContent =
        type === INVENTORY_TXN_TYPES.TRANSFER ? 'From warehouse *' : 'Warehouse *';
    }

    const showCounter =
      type === INVENTORY_TXN_TYPES.OPENING || type === INVENTORY_TXN_TYPES.PURCHASE;
    wrapCounter?.toggleAttribute('hidden', !showCounter);
    wrapPost?.toggleAttribute('hidden', type === INVENTORY_TXN_TYPES.TRANSFER);

    // Prefill rate from item purchase rate for stock-in
    if (needsRate) {
      const item = activeItems.find((i) => i.id === itemEl.value);
      if (item && (!rateEl.value || rateEl.value === '0')) {
        rateEl.value = String(item.purchaseRate || 0);
      }
    }
  };

  typeEl.addEventListener('change', syncFields);
  itemEl.addEventListener('change', () => {
    const item = activeItems.find((i) => i.id === itemEl.value);
    if (item) rateEl.value = String(item.purchaseRate || 0);
  });
  syncFields();

  // Prefill rate for preselected item
  const pre = activeItems.find((i) => i.id === preItem) || activeItems[0];
  if (pre) rateEl.value = String(pre.purchaseRate || 0);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const type = String(fd.get('type') || '');
    const postAccounting =
      type !== INVENTORY_TXN_TYPES.TRANSFER && fd.get('postAccounting') === '1';

    try {
      const result = await inventoryService.postMovement({
        bookId: book.id,
        financialYearId: financialYear.id,
        type,
        date: String(fd.get('date') || ''),
        itemId: String(fd.get('itemId') || ''),
        warehouseId: String(fd.get('warehouseId') || ''),
        toWarehouseId: String(fd.get('toWarehouseId') || '') || null,
        quantity: Number(fd.get('quantity') || 0),
        rate: Number(fd.get('rate') || 0),
        adjustmentSign: /** @type {1|-1} */ (Number(fd.get('adjustmentSign') || 1) < 0 ? -1 : 1),
        narration: String(fd.get('narration') || ''),
        postAccounting,
        counterLedgerId: String(fd.get('counterLedgerId') || '') || undefined,
      });

      const voucherNote = result.voucher
        ? ` · Voucher ${result.voucher.voucherNumber}`
        : '';
      showToast(`Posted ${type}${voucherNote}`, 'success');
      router.navigate('/inventory/movements');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to post', 'error');
    }
  });
}
