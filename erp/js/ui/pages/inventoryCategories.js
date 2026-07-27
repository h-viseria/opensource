/**
 * Item categories CRUD.
 */

import * as bookService from '../../services/bookService.js';
import * as inventoryService from '../../services/inventoryService.js';
import { CSV_LABELS, CSV_SAMPLES, importCategories } from '../../services/csvBulkImport.js';
import { showToast } from '../toast.js';
import { confirmModal, formModal, escapeHtml } from '../modal.js';
import { csvImportPanelHtml, wireCsvImport } from '../csvImport.js';

/**
 * @param {import('../../core/router.js').RouteContext} _ctx
 * @param {HTMLElement} outlet
 */
export async function renderItemCategories(_ctx, outlet) {
  const { book } = await bookService.getSessionContext();
  if (!book) {
    outlet.innerHTML = `<p class="muted">No active book.</p>`;
    return;
  }

  await inventoryService.ensureInventoryMasters(book.id);
  const categories = await inventoryService.listCategories(book.id);

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/inventory">Inventory</a> / Categories</p>
        <h1 class="page-header__title">Item categories</h1>
        <p class="page-header__desc">Group stock items for reporting and filters.</p>
      </div>
      <div class="page-header__actions">
        <button type="button" class="btn btn--primary" id="btn-new">New category</button>
      </div>
    </div>

    ${csvImportPanelHtml()}

    <div class="list">
      ${
        categories.length === 0
          ? `<div class="panel empty-state"><p class="muted">No categories yet.</p></div>`
          : categories
              .map(
                (c) => `
        <div class="list-item" data-id="${c.id}">
          <div class="list-item__body">
            <div class="list-item__title">
              ${escapeHtml(c.name)}
              ${c.isSystem ? '<span class="badge badge--info">System</span>' : ''}
            </div>
            <div class="list-item__meta mono">${c.code ? escapeHtml(c.code) : '—'}</div>
          </div>
          <div class="list-item__actions">
            <button type="button" class="btn btn--ghost btn--sm" data-action="edit">Edit</button>
            ${
              c.isSystem
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
      title: 'New category',
      confirmLabel: 'Create',
      fieldsHtml: categoryFields(),
    });
    if (!fd) return;
    try {
      await inventoryService.createCategory(book.id, {
        name: String(fd.get('name') || ''),
        code: String(fd.get('code') || ''),
      });
      showToast('Category created', 'success');
      await renderItemCategories(_ctx, outlet);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  });

  outlet.querySelectorAll('.list-item').forEach((el) => {
    const id = el.getAttribute('data-id');
    const cat = categories.find((c) => c.id === id);
    if (!cat) return;

    el.querySelector('[data-action="edit"]')?.addEventListener('click', async () => {
      const fd = await formModal({
        title: 'Edit category',
        confirmLabel: 'Save',
        fieldsHtml: categoryFields(cat),
      });
      if (!fd) return;
      try {
        await inventoryService.updateCategory(id, {
          name: String(fd.get('name') || ''),
          code: String(fd.get('code') || ''),
        });
        showToast('Category updated', 'success');
        await renderItemCategories(_ctx, outlet);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed', 'error');
      }
    });

    el.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
      const ok = await confirmModal({
        title: 'Delete category?',
        bodyHtml: `<p>Delete <strong>${escapeHtml(cat.name)}</strong>?</p>`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;
      try {
        await inventoryService.deleteCategory(id);
        showToast('Category deleted', 'success');
        await renderItemCategories(_ctx, outlet);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed', 'error');
      }
    });
  });

  wireCsvImport(outlet, {
    labels: CSV_LABELS.categories,
    sampleRows: CSV_SAMPLES.categories,
    fileName: 'categories_template.csv',
    onRows: (rows) => importCategories(book.id, rows),
    onDone: async (result) => {
      if (result.created > 0) await renderItemCategories(_ctx, outlet);
    },
  });
}

/** @param {import('../../models/types.js').ItemCategory} [c] */
function categoryFields(c) {
  return `
    <label class="field"><span class="field__label">Name *</span>
      <input class="input" name="name" required value="${escapeHtml(c?.name || '')}" /></label>
    <label class="field"><span class="field__label">Code</span>
      <input class="input" name="code" value="${escapeHtml(c?.code || '')}" /></label>
  `;
}
