/**
 * Units of measure CRUD.
 */

import * as bookService from '../../services/bookService.js';
import * as inventoryService from '../../services/inventoryService.js';
import { CSV_LABELS, CSV_SAMPLES, importUnits } from '../../services/csvBulkImport.js';
import { showToast } from '../toast.js';
import { confirmModal, formModal, escapeHtml } from '../modal.js';
import { csvImportPanelHtml, wireCsvImport } from '../csvImport.js';

/**
 * @param {import('../../core/router.js').RouteContext} _ctx
 * @param {HTMLElement} outlet
 */
export async function renderUnits(_ctx, outlet) {
  const { book } = await bookService.getSessionContext();
  if (!book) {
    outlet.innerHTML = `<p class="muted">No active book.</p>`;
    return;
  }

  await inventoryService.ensureInventoryMasters(book.id);
  const units = await inventoryService.listUnits(book.id);

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/inventory">Inventory</a> / Units</p>
        <h1 class="page-header__title">Units</h1>
        <p class="page-header__desc">Units of measure for stock items.</p>
      </div>
      <div class="page-header__actions">
        <button type="button" class="btn btn--primary" id="btn-new">New unit</button>
      </div>
    </div>

    ${csvImportPanelHtml()}

    <div class="list">
      ${
        units.length === 0
          ? `<div class="panel empty-state"><p class="muted">No units yet.</p></div>`
          : units
              .map(
                (u) => `
        <div class="list-item" data-id="${u.id}">
          <div class="list-item__body">
            <div class="list-item__title">
              ${escapeHtml(u.name)}
              ${u.isSystem ? '<span class="badge badge--info">System</span>' : ''}
            </div>
            <div class="list-item__meta mono">
              ${u.code ? escapeHtml(u.code) : '—'}
              ${u.symbol ? ` · ${escapeHtml(u.symbol)}` : ''}
            </div>
          </div>
          <div class="list-item__actions">
            <button type="button" class="btn btn--ghost btn--sm" data-action="edit">Edit</button>
            ${
              u.isSystem
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
      title: 'New unit',
      confirmLabel: 'Create',
      fieldsHtml: unitFields(),
    });
    if (!fd) return;
    try {
      await inventoryService.createUnit(book.id, {
        name: String(fd.get('name') || ''),
        code: String(fd.get('code') || ''),
        symbol: String(fd.get('symbol') || ''),
      });
      showToast('Unit created', 'success');
      await renderUnits(_ctx, outlet);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  });

  outlet.querySelectorAll('.list-item').forEach((el) => {
    const id = el.getAttribute('data-id');
    const unit = units.find((u) => u.id === id);
    if (!unit) return;

    el.querySelector('[data-action="edit"]')?.addEventListener('click', async () => {
      const fd = await formModal({
        title: 'Edit unit',
        confirmLabel: 'Save',
        fieldsHtml: unitFields(unit),
      });
      if (!fd) return;
      try {
        await inventoryService.updateUnit(id, {
          name: String(fd.get('name') || ''),
          code: String(fd.get('code') || ''),
          symbol: String(fd.get('symbol') || ''),
        });
        showToast('Unit updated', 'success');
        await renderUnits(_ctx, outlet);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed', 'error');
      }
    });

    el.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
      const ok = await confirmModal({
        title: 'Delete unit?',
        bodyHtml: `<p>Delete <strong>${escapeHtml(unit.name)}</strong>?</p>`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;
      try {
        await inventoryService.deleteUnit(id);
        showToast('Unit deleted', 'success');
        await renderUnits(_ctx, outlet);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed', 'error');
      }
    });
  });

  wireCsvImport(outlet, {
    labels: CSV_LABELS.units,
    sampleRows: CSV_SAMPLES.units,
    fileName: 'units_template.csv',
    onRows: (rows) => importUnits(book.id, rows),
    onDone: async (result) => {
      if (result.created > 0) await renderUnits(_ctx, outlet);
    },
  });
}

/** @param {import('../../models/types.js').Unit} [u] */
function unitFields(u) {
  return `
    <label class="field"><span class="field__label">Name *</span>
      <input class="input" name="name" required value="${escapeHtml(u?.name || '')}" /></label>
    <label class="field"><span class="field__label">Code</span>
      <input class="input" name="code" value="${escapeHtml(u?.code || '')}" /></label>
    <label class="field"><span class="field__label">Symbol</span>
      <input class="input" name="symbol" value="${escapeHtml(u?.symbol || '')}" /></label>
  `;
}
