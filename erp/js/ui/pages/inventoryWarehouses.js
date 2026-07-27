/**
 * Warehouses CRUD.
 */

import * as bookService from '../../services/bookService.js';
import * as inventoryService from '../../services/inventoryService.js';
import { CSV_LABELS, CSV_SAMPLES, importWarehouses } from '../../services/csvBulkImport.js';
import { showToast } from '../toast.js';
import { confirmModal, formModal, escapeHtml } from '../modal.js';
import { csvImportPanelHtml, wireCsvImport } from '../csvImport.js';

/**
 * @param {import('../../core/router.js').RouteContext} _ctx
 * @param {HTMLElement} outlet
 */
export async function renderWarehouses(_ctx, outlet) {
  const { book } = await bookService.getSessionContext();
  if (!book) {
    outlet.innerHTML = `<p class="muted">No active book.</p>`;
    return;
  }

  await inventoryService.ensureInventoryMasters(book.id);
  const warehouses = await inventoryService.listWarehouses(book.id);

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/inventory">Inventory</a> / Warehouses</p>
        <h1 class="page-header__title">Warehouses</h1>
        <p class="page-header__desc">Stock locations. Transfers move quantity between warehouses at weighted-average cost.</p>
      </div>
      <div class="page-header__actions">
        <button type="button" class="btn btn--primary" id="btn-new">New warehouse</button>
      </div>
    </div>

    ${csvImportPanelHtml()}

    <div class="list">
      ${
        warehouses.length === 0
          ? `<div class="panel empty-state"><p class="muted">No warehouses yet.</p></div>`
          : warehouses
              .map(
                (w) => `
        <div class="list-item" data-id="${w.id}">
          <div class="list-item__body">
            <div class="list-item__title">
              ${escapeHtml(w.name)}
              ${w.isDefault ? '<span class="badge badge--success">Default</span>' : ''}
              ${w.isSystem ? '<span class="badge badge--info">System</span>' : ''}
            </div>
            <div class="list-item__meta">
              ${w.code ? `<span class="mono">${escapeHtml(w.code)}</span>` : '—'}
              ${w.address ? ` · ${escapeHtml(w.address)}` : ''}
            </div>
          </div>
          <div class="list-item__actions">
            <button type="button" class="btn btn--ghost btn--sm" data-action="edit">Edit</button>
            ${
              w.isSystem
                ? ''
                : '<button type="button" class="btn btn--ghost btn--sm" data-action="delete">Delete</button>'
            }
          </div>
        </div>`
              )
              .join('')
      }
    </div>
  `;

  outlet.querySelector('#btn-new')?.addEventListener('click', async () => {
    const fd = await formModal({
      title: 'New warehouse',
      confirmLabel: 'Create',
      fieldsHtml: warehouseFields(),
    });
    if (!fd) return;
    try {
      await inventoryService.createWarehouse(book.id, {
        name: String(fd.get('name') || ''),
        code: String(fd.get('code') || ''),
        address: String(fd.get('address') || ''),
        isDefault: fd.get('isDefault') === '1',
      });
      showToast('Warehouse created', 'success');
      await renderWarehouses(_ctx, outlet);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  });

  outlet.querySelectorAll('.list-item').forEach((el) => {
    const id = el.getAttribute('data-id');
    const wh = warehouses.find((w) => w.id === id);
    if (!wh) return;

    el.querySelector('[data-action="edit"]')?.addEventListener('click', async () => {
      const fd = await formModal({
        title: 'Edit warehouse',
        confirmLabel: 'Save',
        fieldsHtml: warehouseFields(wh),
      });
      if (!fd) return;
      try {
        await inventoryService.updateWarehouse(id, {
          name: String(fd.get('name') || ''),
          code: String(fd.get('code') || ''),
          address: String(fd.get('address') || ''),
          isDefault: fd.get('isDefault') === '1' ? true : undefined,
        });
        showToast('Warehouse updated', 'success');
        await renderWarehouses(_ctx, outlet);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed', 'error');
      }
    });

    el.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
      const ok = await confirmModal({
        title: 'Delete warehouse?',
        bodyHtml: `<p>Delete <strong>${escapeHtml(wh.name)}</strong>?</p>`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;
      try {
        await inventoryService.deleteWarehouse(id);
        showToast('Warehouse deleted', 'success');
        await renderWarehouses(_ctx, outlet);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed', 'error');
      }
    });
  });

  wireCsvImport(outlet, {
    labels: CSV_LABELS.warehouses,
    sampleRows: CSV_SAMPLES.warehouses,
    fileName: 'warehouses_template.csv',
    onRows: (rows) => importWarehouses(book.id, rows),
    onDone: async (result) => {
      if (result.created > 0) await renderWarehouses(_ctx, outlet);
    },
  });
}

/** @param {import('../../models/types.js').Warehouse} [w] */
function warehouseFields(w) {
  return `
    <label class="field"><span class="field__label">Name *</span>
      <input class="input" name="name" required value="${escapeHtml(w?.name || '')}" /></label>
    <label class="field"><span class="field__label">Code</span>
      <input class="input" name="code" value="${escapeHtml(w?.code || '')}" /></label>
    <label class="field"><span class="field__label">Address</span>
      <input class="input" name="address" value="${escapeHtml(w?.address || '')}" /></label>
    <label class="field field--checkbox">
      <input type="checkbox" name="isDefault" value="1" ${w?.isDefault ? 'checked' : ''} />
      <span>Default warehouse</span>
    </label>
  `;
}
