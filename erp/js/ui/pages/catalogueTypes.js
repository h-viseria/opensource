/**
 * Catalogue types — item master defining Brand/Name/Type/Size (+ optional attrs).
 */

import * as bookService from '../../services/bookService.js';
import * as catalogueService from '../../services/catalogueService.js';
import { showToast } from '../toast.js';
import { confirmModal, formModal, escapeHtml } from '../modal.js';

/**
 * @param {import('../../core/router.js').RouteContext} ctx
 * @param {HTMLElement} outlet
 */
export async function renderCatalogueTypes(ctx, outlet) {
  const { book } = await bookService.getSessionContext();
  if (!book) {
    outlet.innerHTML = `<p class="muted">No active book.</p>`;
    return;
  }

  await catalogueService.ensureCatalogueTypes(book.id);
  const types = await catalogueService.listCatalogueTypes(book.id);

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/inventory">Inventory</a> / Catalogue</p>
        <h1 class="page-header__title">Catalogue</h1>
        <p class="page-header__desc">
          Item types for your shop. Each type defines Brand, Name, Type, Size
          (and optional attributes like Colour). Stock items pick a type and fill those fields.
        </p>
      </div>
      <div class="page-header__actions">
        <button type="button" class="btn btn--primary" id="btn-new">New catalogue type</button>
      </div>
    </div>

    <div class="list">
      ${
        types.length === 0
          ? `<div class="panel empty-state"><p class="muted">No catalogue types yet.</p></div>`
          : types
              .map((t) => {
                const attrs = (t.attributes || [])
                  .map(
                    (a) =>
                      `${escapeHtml(a.label)}${a.required ? '*' : ''}${
                        a.options?.length ? ` (${a.options.length} options)` : ''
                      }`
                  )
                  .join(' · ');
                return `
          <div class="list-item" data-id="${t.id}">
            <div class="list-item__body">
              <div class="list-item__title">
                ${escapeHtml(t.name)}
                ${!t.isActive ? '<span class="badge badge--warning">Inactive</span>' : ''}
              </div>
              <div class="list-item__meta">
                ${t.code ? `<span class="mono">${escapeHtml(t.code)}</span> · ` : ''}
                ${attrs || 'Core attributes only'}
              </div>
            </div>
            <div class="list-item__actions">
              <button type="button" class="btn btn--ghost btn--sm" data-action="edit">Edit</button>
              <button type="button" class="btn btn--ghost btn--sm" data-action="delete">Delete</button>
            </div>
          </div>`;
              })
              .join('')
      }
    </div>
  `;

  outlet.querySelector('#btn-new')?.addEventListener('click', async () => {
    const fd = await formModal({
      title: 'New catalogue type',
      confirmLabel: 'Create',
      fieldsHtml: catalogueFields(),
    });
    if (!fd) return;
    try {
      await catalogueService.createCatalogueType(book.id, readCatalogueForm(fd));
      showToast('Catalogue type created', 'success');
      await renderCatalogueTypes(ctx, outlet);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  });

  outlet.querySelectorAll('.list-item').forEach((el) => {
    const id = el.getAttribute('data-id');
    const row = types.find((t) => t.id === id);
    if (!row) return;

    el.querySelector('[data-action="edit"]')?.addEventListener('click', async () => {
      const fd = await formModal({
        title: 'Edit catalogue type',
        confirmLabel: 'Save',
        fieldsHtml: catalogueFields(row),
      });
      if (!fd) return;
      try {
        await catalogueService.updateCatalogueType(id, readCatalogueForm(fd));
        showToast('Catalogue type updated', 'success');
        await renderCatalogueTypes(ctx, outlet);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed', 'error');
      }
    });

    el.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
      const ok = await confirmModal({
        title: 'Delete catalogue type?',
        danger: true,
        confirmLabel: 'Delete',
        bodyHtml: `<p>Delete <strong>${escapeHtml(row.name)}</strong>? Existing items keep their attributes but lose the type link if you recreate later.</p>`,
      });
      if (!ok) return;
      try {
        await catalogueService.deleteCatalogueType(id);
        showToast('Catalogue type deleted', 'success');
        await renderCatalogueTypes(ctx, outlet);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed', 'error');
      }
    });
  });
}

/**
 * @param {any} [row]
 */
function catalogueFields(row) {
  const extras = (row?.attributes || []).filter(
    (a) => !catalogueService.CORE_ATTRIBUTE_KEYS.includes(a.key)
  );
  const extraLines = extras
    .map((a) => `${a.label}${a.required ? '*' : ''}|${(a.options || []).join(',')}`)
    .join('\n');

  const brandOpts = (row?.attributes || []).find((a) => a.key === 'brand')?.options?.join(', ') || '';
  const typeOpts = (row?.attributes || []).find((a) => a.key === 'type')?.options?.join(', ') || '';
  const sizeOpts = (row?.attributes || []).find((a) => a.key === 'size')?.options?.join(', ') || '';

  return `
    <label class="field"><span class="field__label">Name *</span>
      <input class="input" name="name" required value="${escapeHtml(row?.name || '')}" /></label>
    <label class="field"><span class="field__label">Code</span>
      <input class="input" name="code" value="${escapeHtml(row?.code || '')}" /></label>
    <p class="muted" style="font-size:var(--text-sm);margin:0.25rem 0 0.75rem">
      Core attributes are always Brand, Name, Type, Size. Leave option lists blank for free text.
    </p>
    <label class="field"><span class="field__label">Brand options (comma-separated)</span>
      <input class="input" name="brandOptions" value="${escapeHtml(brandOpts)}" placeholder="Pilot, Reynolds" /></label>
    <label class="field"><span class="field__label">Type options (comma-separated)</span>
      <input class="input" name="typeOptions" value="${escapeHtml(typeOpts)}" placeholder="Ball, Gel" /></label>
    <label class="field"><span class="field__label">Size options (comma-separated)</span>
      <input class="input" name="sizeOptions" value="${escapeHtml(sizeOpts)}" placeholder="Fine, Medium, Bold" /></label>
    <label class="field" style="grid-column:1/-1">
      <span class="field__label">Extra attributes (one per line: Label or Label*|opt1,opt2)</span>
      <textarea class="input" name="extras" rows="4" placeholder="Colour*|Blue,Black,Red&#10;Fit|Regular,Slim">${escapeHtml(extraLines)}</textarea>
      <span class="field__hint">Add * after the label to make it required. Options after | are optional.</span>
    </label>
    <label class="field" style="grid-column:1/-1"><span class="field__label">Notes</span>
      <input class="input" name="notes" value="${escapeHtml(row?.notes || '')}" /></label>
    <label class="field" style="display:flex;align-items:center;gap:0.5rem">
      <input type="checkbox" name="isActive" value="1" ${row?.isActive !== false ? 'checked' : ''} />
      <span>Active</span>
    </label>
  `;
}

/**
 * @param {FormData} fd
 */
function readCatalogueForm(fd) {
  const parseOpts = (text) =>
    String(text || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

  /** @type {{ key: string, label: string, required?: boolean, options?: string[] }[]} */
  const extras = [];
  for (const line of String(fd.get('extras') || '').split('\n')) {
    const raw = line.trim();
    if (!raw) continue;
    const [left, right = ''] = raw.split('|');
    let label = left.trim();
    let required = false;
    if (label.endsWith('*')) {
      required = true;
      label = label.slice(0, -1).trim();
    }
    if (!label) continue;
    extras.push({
      key: label,
      label,
      required,
      options: parseOpts(right),
    });
  }

  return {
    name: String(fd.get('name') || ''),
    code: String(fd.get('code') || ''),
    notes: String(fd.get('notes') || ''),
    isActive: fd.get('isActive') === '1',
    coreOptions: {
      brand: parseOpts(fd.get('brandOptions')),
      type: parseOpts(fd.get('typeOptions')),
      size: parseOpts(fd.get('sizeOptions')),
      name: [],
    },
    extras,
  };
}
