/**
 * Tax codes CRUD.
 */

import * as bookService from '../../services/bookService.js';
import * as taxService from '../../services/taxService.js';
import { CSV_LABELS, CSV_SAMPLES, importTaxCodes } from '../../services/csvBulkImport.js';
import { TAX_TYPE_LIST, TAX_COMPONENT_LIST } from '../../engine/taxEngine.js';
import { showToast } from '../toast.js';
import { confirmModal, formModal, escapeHtml } from '../modal.js';
import { csvImportPanelHtml, wireCsvImport } from '../csvImport.js';

/**
 * @param {import('../../core/router.js').RouteContext} _ctx
 * @param {HTMLElement} outlet
 */
export async function renderTaxCodes(_ctx, outlet) {
  const { book } = await bookService.getSessionContext();
  if (!book) {
    outlet.innerHTML = `<p class="muted">No active book.</p>`;
    return;
  }

  await taxService.ensureTaxMasters(book.id);
  const [codes, taxLedgers] = await Promise.all([
    taxService.listTaxCodes(book.id),
    taxService.listTaxLedgers(book.id),
  ]);
  const ledgerById = new Map(taxLedgers.map((l) => [l.id, l]));

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/tax">Tax</a> / Codes</p>
        <h1 class="page-header__title">Tax codes</h1>
        <p class="page-header__desc">
          Define rates and Input / Output components. Link each code to Input Tax or Output Tax for posting.
        </p>
      </div>
      <div class="page-header__actions">
        <button type="button" class="btn btn--primary" id="btn-new">New tax code</button>
      </div>
    </div>

    ${csvImportPanelHtml()}

    <div class="list">
      ${
        codes.length === 0
          ? `<div class="panel empty-state"><p class="muted">No tax codes yet.</p></div>`
          : codes
              .map((c) => {
                const led = c.ledgerId ? ledgerById.get(c.ledgerId) : null;
                return `
          <div class="list-item" data-id="${c.id}">
            <div class="list-item__body">
              <div class="list-item__title">
                ${escapeHtml(c.name)}
                <span class="badge badge--muted">${escapeHtml(c.taxType)}</span>
                <span class="badge ${c.component === 'Input' ? 'badge--info' : 'badge--success'}">${escapeHtml(c.component)}</span>
                ${!c.isActive ? '<span class="badge badge--warning">Inactive</span>' : ''}
                ${c.isSystem ? '<span class="badge badge--info">System</span>' : ''}
              </div>
              <div class="list-item__meta">
                ${c.code ? `<span class="mono">${escapeHtml(c.code)}</span> · ` : ''}
                Rate <span class="mono">${c.rate}%</span>
                · Ledger ${led ? escapeHtml(led.name) : '— not linked —'}
              </div>
            </div>
            <div class="list-item__actions">
              <button type="button" class="btn btn--ghost btn--sm" data-action="edit">Edit</button>
              ${
                c.isSystem
                  ? `<button type="button" class="btn btn--ghost btn--sm" data-action="toggle">${c.isActive ? 'Deactivate' : 'Activate'}</button>`
                  : `<button type="button" class="btn btn--ghost btn--sm" data-action="delete">Delete</button>`
              }
            </div>
          </div>`;
              })
              .join('')
      }
    </div>
  `;

  outlet.querySelector('#btn-new')?.addEventListener('click', async () => {
    const fd = await formModal({
      title: 'New tax code',
      confirmLabel: 'Create',
      fieldsHtml: taxFields({ taxLedgers }),
    });
    if (!fd) return;
    try {
      await taxService.createTaxCode(book.id, readTaxForm(fd));
      showToast('Tax code created', 'success');
      await renderTaxCodes(_ctx, outlet);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  });

  outlet.querySelectorAll('.list-item').forEach((el) => {
    const id = el.getAttribute('data-id');
    const code = codes.find((c) => c.id === id);
    if (!code) return;

    el.querySelector('[data-action="edit"]')?.addEventListener('click', async () => {
      const fd = await formModal({
        title: 'Edit tax code',
        confirmLabel: 'Save',
        fieldsHtml: taxFields({ taxLedgers, code }),
      });
      if (!fd) return;
      try {
        await taxService.updateTaxCode(id, readTaxForm(fd));
        showToast('Tax code updated', 'success');
        await renderTaxCodes(_ctx, outlet);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed', 'error');
      }
    });

    el.querySelector('[data-action="toggle"]')?.addEventListener('click', async () => {
      try {
        await taxService.updateTaxCode(id, { isActive: !code.isActive });
        showToast(code.isActive ? 'Deactivated' : 'Activated', 'success');
        await renderTaxCodes(_ctx, outlet);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed', 'error');
      }
    });

    el.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
      const ok = await confirmModal({
        title: 'Delete tax code?',
        bodyHtml: `<p>Delete <strong>${escapeHtml(code.name)}</strong>?</p>`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;
      try {
        await taxService.deleteTaxCode(id);
        showToast('Tax code deleted', 'success');
        await renderTaxCodes(_ctx, outlet);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed', 'error');
      }
    });
  });

  wireCsvImport(outlet, {
    labels: CSV_LABELS.taxCodes,
    sampleRows: CSV_SAMPLES.taxCodes,
    fileName: 'tax_codes_template.csv',
    onRows: (rows) => importTaxCodes(book.id, rows),
    onDone: async (result) => {
      if (result.created > 0) await renderTaxCodes(_ctx, outlet);
    },
  });
}

/**
 * @param {{ taxLedgers: any[], code?: any }} opts
 */
function taxFields(opts) {
  const c = opts.code;
  const typeOpts = TAX_TYPE_LIST.map(
    (t) => `<option value="${escapeHtml(t)}" ${c?.taxType === t ? 'selected' : ''}>${escapeHtml(t)}</option>`
  ).join('');
  const compOpts = TAX_COMPONENT_LIST.map(
    (t) =>
      `<option value="${escapeHtml(t)}" ${c?.component === t ? 'selected' : ''}>${escapeHtml(t)}</option>`
  ).join('');
  const ledOpts =
    `<option value="">— None —</option>` +
    opts.taxLedgers
      .map(
        (l) =>
          `<option value="${l.id}" ${c?.ledgerId === l.id ? 'selected' : ''}>${escapeHtml(l.name)}</option>`
      )
      .join('');

  return `
    <label class="field"><span class="field__label">Name *</span>
      <input class="input" name="name" required value="${escapeHtml(c?.name || '')}" /></label>
    <label class="field"><span class="field__label">Code</span>
      <input class="input" name="code" value="${escapeHtml(c?.code || '')}" /></label>
    <label class="field"><span class="field__label">Type *</span>
      <select class="input" name="taxType" required>${typeOpts}</select></label>
    <label class="field"><span class="field__label">Component *</span>
      <select class="input" name="component" required>${compOpts}</select></label>
    <label class="field"><span class="field__label">Rate % *</span>
      <input class="input" name="rate" type="number" min="0" step="0.01" required value="${c?.rate ?? 18}" /></label>
    <label class="field"><span class="field__label">Posting ledger</span>
      <select class="input" name="ledgerId">${ledOpts}</select></label>
    <label class="field"><span class="field__label">Notes</span>
      <textarea class="input" name="notes" rows="2">${escapeHtml(c?.notes || '')}</textarea></label>
    ${
      c
        ? `<label class="field field--checkbox">
            <input type="checkbox" name="isActive" value="1" ${c.isActive !== false ? 'checked' : ''} />
            <span>Active</span>
          </label>`
        : ''
    }
  `;
}

/** @param {FormData} fd */
function readTaxForm(fd) {
  return {
    name: String(fd.get('name') || ''),
    code: String(fd.get('code') || ''),
    taxType: String(fd.get('taxType') || ''),
    component: String(fd.get('component') || ''),
    rate: Number(fd.get('rate') || 0),
    ledgerId: String(fd.get('ledgerId') || '') || null,
    notes: String(fd.get('notes') || ''),
    isActive: fd.has('isActive') ? fd.get('isActive') === '1' : true,
  };
}
