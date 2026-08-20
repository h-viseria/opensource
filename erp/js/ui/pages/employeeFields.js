/**
 * Settings → Employee custom fields.
 */

import { EMPLOYEE_FIELD_TYPES } from '../../core/constants.js';
import * as bookService from '../../services/bookService.js';
import * as peopleService from '../../services/peopleService.js';
import { showToast } from '../toast.js';
import { confirmModal, formModal, escapeHtml } from '../modal.js';

/**
 * @param {import('../../core/router.js').RouteContext} _ctx
 * @param {HTMLElement} outlet
 */
export async function renderEmployeeFields(_ctx, outlet) {
  const { book } = await bookService.getSessionContext();
  if (!book) {
    outlet.innerHTML = `<p class="muted">Select a book first. Custom fields are stored per book.</p>`;
    return;
  }

  await peopleService.ensurePeopleMasters(book.id);
  const fields = await peopleService.listCustomFields(book.id);

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/settings">Settings</a> / Employee fields</p>
        <h1 class="page-header__title">Employee fields</h1>
        <p class="page-header__desc">
          Add your own fields (PAN, Emirates ID, IBAN, …). No country-specific fields are hard-coded.
          Active fields appear on the employee form automatically.
        </p>
      </div>
      <div class="page-header__actions">
        <button type="button" class="btn btn--primary" id="btn-new">Add field</button>
      </div>
    </div>

    <div class="list">
      ${
        fields.length
          ? fields
              .map(
                (f) => `
          <div class="list-item">
            <div class="list-item__body">
              <div class="list-item__title">
                ${escapeHtml(f.name)}
                <span class="badge badge--muted">${escapeHtml(f.fieldType)}</span>
                ${f.required ? '<span class="badge badge--info">Required</span>' : ''}
                ${f.isActive === false ? '<span class="badge badge--warning">Inactive</span>' : '<span class="badge badge--success">Active</span>'}
              </div>
              <div class="list-item__meta">
                Default: ${f.defaultValue != null && f.defaultValue !== '' ? escapeHtml(String(f.defaultValue)) : '—'}
              </div>
            </div>
            <div class="list-item__actions">
              <button type="button" class="btn btn--ghost btn--sm" data-edit="${f.id}">Edit</button>
              <button type="button" class="btn btn--ghost btn--sm" data-del="${f.id}">Delete</button>
            </div>
          </div>`
              )
              .join('')
          : `<div class="panel empty-state"><p class="muted">No custom fields yet.</p></div>`
      }
    </div>
  `;

  outlet.querySelector('#btn-new')?.addEventListener('click', async () => {
    const fd = await formModal({
      title: 'Add employee field',
      confirmLabel: 'Create',
      fieldsHtml: fieldFormHtml(),
    });
    if (!fd) return;
    try {
      await peopleService.createCustomField(book.id, readFieldForm(fd));
      showToast('Field created', 'success');
      await renderEmployeeFields(_ctx, outlet);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  });

  outlet.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-edit');
      const f = fields.find((x) => x.id === id);
      if (!f) return;
      const fd = await formModal({
        title: 'Edit field',
        confirmLabel: 'Save',
        fieldsHtml: fieldFormHtml(f),
      });
      if (!fd) return;
      try {
        await peopleService.updateCustomField(id, readFieldForm(fd));
        showToast('Field updated', 'success');
        await renderEmployeeFields(_ctx, outlet);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed', 'error');
      }
    });
  });

  outlet.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = await confirmModal({
        title: 'Delete field definition?',
        bodyHtml: '<p>Values already saved on employees are left in place but will no longer show on the form.</p>',
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;
      try {
        await peopleService.deleteCustomField(btn.getAttribute('data-del'));
        showToast('Deleted', 'success');
        await renderEmployeeFields(_ctx, outlet);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed', 'error');
      }
    });
  });
}

/** @param {object} [f] */
function fieldFormHtml(f = {}) {
  return `
    <label class="field"><span class="field__label">Field name</span>
      <input class="input" name="name" value="${escapeHtml(f.name || '')}" required /></label>
    <label class="field"><span class="field__label">Field type</span>
      <select class="input" name="fieldType">
        ${EMPLOYEE_FIELD_TYPES.map(
          (t) => `<option value="${t}" ${f.fieldType === t ? 'selected' : ''}>${t}</option>`,
        ).join('')}
      </select></label>
    <label class="field field--check">
      <input type="checkbox" name="required" ${f.required ? 'checked' : ''} /> Required
    </label>
    <label class="field"><span class="field__label">Default value</span>
      <input class="input" name="defaultValue" value="${escapeHtml(f.defaultValue != null ? String(f.defaultValue) : '')}" /></label>
    <label class="field field--check">
      <input type="checkbox" name="isActive" ${f.isActive !== false ? 'checked' : ''} /> Active
    </label>
  `;
}

/** @param {FormData} fd */
function readFieldForm(fd) {
  return {
    name: String(fd.get('name') || ''),
    fieldType: String(fd.get('fieldType') || 'Text'),
    required: fd.get('required') === 'on',
    defaultValue: String(fd.get('defaultValue') || '') || null,
    isActive: fd.get('isActive') === 'on',
  };
}
