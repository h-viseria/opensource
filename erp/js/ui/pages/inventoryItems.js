/**
 * Inventory items CRUD — SKUs fed by catalogue types + attributes.
 */

import * as bookService from '../../services/bookService.js';
import * as inventoryService from '../../services/inventoryService.js';
import * as catalogueService from '../../services/catalogueService.js';
import { CSV_LABELS, CSV_SAMPLES, importItems } from '../../services/csvBulkImport.js';
import { showToast } from '../toast.js';
import { confirmModal, formModal, escapeHtml } from '../modal.js';
import { csvImportPanelHtml, wireCsvImport } from '../csvImport.js';
import { formatMoney } from '../../utils/money.js';
import * as router from '../../core/router.js';

/**
 * @param {import('../../core/router.js').RouteContext} ctx
 * @param {HTMLElement} outlet
 */
export async function renderInventoryItems(ctx, outlet) {
  const { book } = await bookService.getSessionContext();
  if (!book) {
    outlet.innerHTML = `<p class="muted">No active book.</p>`;
    return;
  }

  await inventoryService.ensureInventoryMasters(book.id);
  const [items, units, categories, catalogueTypes, summary] = await Promise.all([
    inventoryService.listItems(book.id),
    inventoryService.listUnits(book.id),
    inventoryService.listCategories(book.id),
    catalogueService.listCatalogueTypes(book.id),
    inventoryService.getStockSummary(book.id),
  ]);

  const unitById = new Map(units.map((u) => [u.id, u]));
  const catById = new Map(categories.map((c) => [c.id, c]));
  const typeById = new Map(catalogueTypes.map((t) => [t.id, t]));
  const stockByItem = new Map(summary.rows.map((r) => [r.item.id, r]));
  const q = (ctx.query.q || '').trim().toLowerCase();
  const typeFilter = ctx.query.catalogueTypeId || '';
  const currency = book.currency || 'INR';

  let filtered = items;
  if (typeFilter) {
    filtered = filtered.filter((i) => i.catalogueTypeId === typeFilter);
  }
  if (q) {
    filtered = filtered.filter(
      (i) =>
        catalogueService.itemMatchesQuery(i, q) ||
        (catById.get(i.categoryId)?.name || '').toLowerCase().includes(q)
    );
  }

  const typeFilterOpts =
    `<option value="">All catalogue types</option>` +
    catalogueTypes
      .map(
        (t) =>
          `<option value="${t.id}" ${t.id === typeFilter ? 'selected' : ''}>${escapeHtml(t.name)}</option>`
      )
      .join('');

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/inventory">Inventory</a> / Items</p>
        <h1 class="page-header__title">Items</h1>
        <p class="page-header__desc">
          Stock SKUs for ${escapeHtml(book.name)}. Prefer a <a href="#/inventory/catalogue">catalogue type</a>
          so Brand · Name · Type · Size (and extras) build the item name.
        </p>
      </div>
      <div class="page-header__actions">
        <a class="btn btn--secondary" href="#/inventory/catalogue">Catalogue</a>
        <button type="button" class="btn btn--primary" id="btn-new">New item</button>
      </div>
    </div>

    ${csvImportPanelHtml()}

    <div class="toolbar">
      <form class="toolbar__search" id="form-search" action="#" style="display:flex;flex-wrap:wrap;gap:0.5rem;align-items:end;width:100%">
        <label class="field" style="margin:0;min-width:12rem">
          <span class="field__label">Catalogue</span>
          <select class="select" name="catalogueTypeId">${typeFilterOpts}</select>
        </label>
        <label class="field" style="margin:0;flex:1;min-width:12rem">
          <span class="field__label">Search</span>
          <input class="input" name="q" type="search" placeholder="Brand, name, type, size…" value="${escapeHtml(ctx.query.q || '')}" />
        </label>
        <button type="submit" class="btn btn--secondary">Apply</button>
      </form>
      <a class="btn btn--secondary btn--sm" href="#/inventory/movements/new">Stock in / out</a>
    </div>

    <div class="list">
      ${
        filtered.length === 0
          ? `<div class="panel empty-state"><p class="muted">No items yet. Create a catalogue type, then add SKUs.</p></div>`
          : filtered
              .map((item) => {
                const stock = stockByItem.get(item.id);
                const unit = unitById.get(item.unitId);
                const cat = item.categoryId ? catById.get(item.categoryId) : null;
                const ctype = item.catalogueTypeId ? typeById.get(item.catalogueTypeId) : null;
                const qty = stock?.quantity ?? 0;
                const low = stock?.lowStock;
                const attrBits = Object.entries(item.attributes || {})
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(' · ');
                return `
          <div class="list-item" data-id="${item.id}">
            <div class="list-item__body">
              <div class="list-item__title">
                ${escapeHtml(item.name)}
                ${!item.isActive ? '<span class="badge badge--warning">Inactive</span>' : ''}
                ${low ? '<span class="badge badge--danger">Low stock</span>' : ''}
              </div>
              <div class="list-item__meta">
                ${item.code ? `<span class="mono">${escapeHtml(item.code)}</span> · ` : ''}
                ${ctype ? escapeHtml(ctype.name) : 'No catalogue'}
                ${cat ? ` · ${escapeHtml(cat.name)}` : ''}
                · ${unit ? escapeHtml(unit.symbol || unit.name) : '—'}
                · Qty <span class="mono">${qty}</span>
                · ${formatMoney(stock?.value || 0, currency)}
                ${attrBits ? `<div class="muted" style="margin-top:0.2rem">${escapeHtml(attrBits)}</div>` : ''}
              </div>
            </div>
            <div class="list-item__actions">
              <a class="btn btn--ghost btn--sm" href="#/inventory/movements/new?itemId=${item.id}">Move</a>
              <button type="button" class="btn btn--ghost btn--sm" data-action="edit">Edit</button>
              <button type="button" class="btn btn--ghost btn--sm" data-action="delete">Delete</button>
            </div>
          </div>`;
              })
              .join('')
      }
    </div>
  `;

  outlet.querySelector('#form-search')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(/** @type {HTMLFormElement} */ (e.target));
    const params = new URLSearchParams();
    const query = String(fd.get('q') || '').trim();
    const ct = String(fd.get('catalogueTypeId') || '').trim();
    if (query) params.set('q', query);
    if (ct) params.set('catalogueTypeId', ct);
    const qs = params.toString();
    router.navigate(qs ? `/inventory/items?${qs}` : '/inventory/items');
  });

  const openItemModal = async (item) => {
    if (units.length === 0) {
      showToast('Create a unit first', 'info');
      return;
    }
    if (catalogueTypes.length === 0) {
      showToast('Create a catalogue type first', 'info');
      router.navigate('/inventory/catalogue');
      return;
    }
    const fd = await formModal({
      title: item ? 'Edit item' : 'New item',
      confirmLabel: item ? 'Save' : 'Create',
      fieldsHtml: itemFields({ units, categories, catalogueTypes, item }),
      onReady: (root) => wireCatalogueFields(root, catalogueTypes, item),
    });
    if (!fd) return;
    try {
      const payload = readItemForm(fd);
      if (item) await inventoryService.updateItem(item.id, payload);
      else await inventoryService.createItem(book.id, payload);
      showToast(item ? 'Item updated' : 'Item created', 'success');
      await renderInventoryItems(ctx, outlet);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  };

  outlet.querySelector('#btn-new')?.addEventListener('click', () => openItemModal(null));

  outlet.querySelectorAll('.list-item').forEach((el) => {
    const id = el.getAttribute('data-id');
    const item = items.find((i) => i.id === id);
    if (!item) return;

    el.querySelector('[data-action="edit"]')?.addEventListener('click', () => openItemModal(item));

    el.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
      const ok = await confirmModal({
        title: 'Delete item?',
        bodyHtml: `<p>Delete <strong>${escapeHtml(item.name)}</strong>?</p>`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;
      try {
        await inventoryService.deleteItem(id);
        showToast('Item deleted', 'success');
        await renderInventoryItems(ctx, outlet);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed', 'error');
      }
    });
  });

  wireCsvImport(outlet, {
    labels: CSV_LABELS.items,
    sampleRows: CSV_SAMPLES.items,
    fileName: 'items_template.csv',
    onRows: (rows) => importItems(book.id, rows),
    onDone: async (result) => {
      if (result.created > 0) await renderInventoryItems(ctx, outlet);
    },
  });
}

/**
 * @param {{ units: any[], categories: any[], catalogueTypes: any[], item?: any }} opts
 */
function itemFields(opts) {
  const item = opts.item;
  const unitOpts = opts.units
    .map(
      (u) =>
        `<option value="${u.id}" ${item?.unitId === u.id ? 'selected' : ''}>${escapeHtml(u.name)}</option>`
    )
    .join('');
  const catOpts =
    `<option value="">— None —</option>` +
    opts.categories
      .map(
        (c) =>
          `<option value="${c.id}" ${item?.categoryId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`
      )
      .join('');
  const typeOpts =
    `<option value="">— Select type —</option>` +
    opts.catalogueTypes
      .filter((t) => t.isActive !== false || t.id === item?.catalogueTypeId)
      .map(
        (t) =>
          `<option value="${t.id}" ${item?.catalogueTypeId === t.id ? 'selected' : ''}>${escapeHtml(t.name)}</option>`
      )
      .join('');

  return `
    <label class="field" style="grid-column:1/-1"><span class="field__label">Catalogue type *</span>
      <select class="input" name="catalogueTypeId" id="fld-catalogue-type" required>${typeOpts}</select></label>
    <div id="catalogue-attr-fields" style="grid-column:1/-1;display:grid;gap:0.75rem"></div>
    <label class="field"><span class="field__label">SKU display name</span>
      <input class="input" name="name" id="fld-sku-name" value="${escapeHtml(item?.name || '')}" placeholder="Auto from attributes" /></label>
    <label class="field"><span class="field__label">Code</span>
      <input class="input" name="code" value="${escapeHtml(item?.code || '')}" /></label>
    <label class="field"><span class="field__label">Unit *</span>
      <select class="input" name="unitId" required>${unitOpts}</select></label>
    <label class="field"><span class="field__label">Category</span>
      <select class="input" name="categoryId">${catOpts}</select></label>
    <label class="field"><span class="field__label">Reorder level</span>
      <input class="input" name="reorderLevel" type="number" min="0" step="0.0001" value="${item?.reorderLevel ?? 0}" /></label>
    <label class="field"><span class="field__label">Purchase rate</span>
      <input class="input" name="purchaseRate" type="number" min="0" step="0.01" value="${item?.purchaseRate ?? 0}" /></label>
    <label class="field"><span class="field__label">Sale rate</span>
      <input class="input" name="saleRate" type="number" min="0" step="0.01" value="${item?.saleRate ?? 0}" /></label>
    <label class="field"><span class="field__label">Notes</span>
      <textarea class="input" name="notes" rows="2">${escapeHtml(item?.notes || '')}</textarea></label>
    ${
      item
        ? `<label class="field field--checkbox">
            <input type="checkbox" name="isActive" value="1" ${item.isActive !== false ? 'checked' : ''} />
            <span>Active</span>
          </label>`
        : ''
    }
  `;
}

/**
 * @param {HTMLElement} root
 * @param {any[]} catalogueTypes
 * @param {any} [item]
 */
function wireCatalogueFields(root, catalogueTypes, item) {
  const typeSel = /** @type {HTMLSelectElement|null} */ (root.querySelector('#fld-catalogue-type'));
  const host = /** @type {HTMLElement|null} */ (root.querySelector('#catalogue-attr-fields'));
  const nameInput = /** @type {HTMLInputElement|null} */ (root.querySelector('#fld-sku-name'));
  if (!typeSel || !host) return;

  const renderAttrs = () => {
    const type = catalogueTypes.find((t) => t.id === typeSel.value);
    if (!type) {
      host.innerHTML = `<p class="muted" style="margin:0">Select a catalogue type to enter Brand, Name, Type, Size…</p>`;
      return;
    }
    const values = item?.catalogueTypeId === type.id ? item.attributes || {} : {};
    host.innerHTML = (type.attributes || [])
      .map((def) => {
        const val = values[def.key] || '';
        const req = def.required ? 'required' : '';
        const label = `${escapeHtml(def.label)}${def.required ? ' *' : ''}`;
        if (Array.isArray(def.options) && def.options.length > 0) {
          const opts =
            `<option value="">—</option>` +
            def.options
              .map(
                (o) =>
                  `<option value="${escapeHtml(o)}" ${
                    String(val).toLowerCase() === String(o).toLowerCase() ? 'selected' : ''
                  }>${escapeHtml(o)}</option>`
              )
              .join('');
          return `<label class="field"><span class="field__label">${label}</span>
            <select class="input" name="attr_${def.key}" data-attr="${escapeHtml(def.key)}" ${req}>${opts}</select></label>`;
        }
        return `<label class="field"><span class="field__label">${label}</span>
          <input class="input" name="attr_${def.key}" data-attr="${escapeHtml(def.key)}" value="${escapeHtml(val)}" ${req} /></label>`;
      })
      .join('');

    host.querySelectorAll('[data-attr]').forEach((el) => {
      el.addEventListener('input', syncName);
      el.addEventListener('change', syncName);
    });
    syncName();
  };

  const syncName = () => {
    if (!nameInput) return;
    /** @type {Record<string, string>} */
    const attrs = {};
    host.querySelectorAll('[data-attr]').forEach((el) => {
      const key = el.getAttribute('data-attr');
      if (!key) return;
      attrs[key] = /** @type {HTMLInputElement|HTMLSelectElement} */ (el).value;
    });
    const built = catalogueService.buildSkuDisplayName(attrs);
    if (built) nameInput.value = built;
  };

  typeSel.addEventListener('change', renderAttrs);
  renderAttrs();
}

/** @param {FormData} fd */
function readItemForm(fd) {
  /** @type {Record<string, string>} */
  const attributes = {};
  for (const [key, value] of fd.entries()) {
    if (String(key).startsWith('attr_')) {
      attributes[String(key).slice(5)] = String(value || '').trim();
    }
  }
  return {
    name: String(fd.get('name') || ''),
    code: String(fd.get('code') || ''),
    unitId: String(fd.get('unitId') || ''),
    categoryId: String(fd.get('categoryId') || '') || null,
    catalogueTypeId: String(fd.get('catalogueTypeId') || '') || null,
    attributes,
    reorderLevel: Number(fd.get('reorderLevel') || 0),
    purchaseRate: Number(fd.get('purchaseRate') || 0),
    saleRate: Number(fd.get('saleRate') || 0),
    notes: String(fd.get('notes') || ''),
    isActive: fd.has('isActive') ? fd.get('isActive') === '1' : true,
  };
}
