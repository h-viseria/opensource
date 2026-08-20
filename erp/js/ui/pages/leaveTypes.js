/**
 * Settings → Leave types.
 */

import { LEAVE_ACCRUAL_METHODS } from '../../core/constants.js';
import * as bookService from '../../services/bookService.js';
import * as peopleService from '../../services/peopleService.js';
import { showToast } from '../toast.js';
import { formModal, escapeHtml } from '../modal.js';

/**
 * @param {import('../../core/router.js').RouteContext} _ctx
 * @param {HTMLElement} outlet
 */
export async function renderLeaveTypes(_ctx, outlet) {
  const { book } = await bookService.getSessionContext();
  if (!book) {
    outlet.innerHTML = `<p class="muted">Select a book first.</p>`;
    return;
  }

  await peopleService.ensurePeopleMasters(book.id);
  const types = await peopleService.listLeaveTypes(book.id);

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/settings">Settings</a> / Leave types</p>
        <h1 class="page-header__title">Leave types</h1>
        <p class="page-header__desc">
          Configure entitlements without country-specific statutory rules.
          Accrual is a simple annual or monthly estimate for balances.
        </p>
      </div>
      <div class="page-header__actions">
        <button type="button" class="btn btn--primary" id="btn-new">Add leave type</button>
      </div>
    </div>

    <div class="list">
      ${types
        .map(
          (t) => `
        <div class="list-item">
          <div class="list-item__body">
            <div class="list-item__title">
              ${escapeHtml(t.name)}
              ${t.paid ? '<span class="badge badge--success">Paid</span>' : '<span class="badge badge--warning">Unpaid</span>'}
              ${t.isSystem ? '<span class="badge badge--info">Default</span>' : ''}
              ${t.isActive === false ? '<span class="badge badge--muted">Inactive</span>' : ''}
            </div>
            <div class="list-item__meta">
              Entitlement <span class="mono">${t.annualEntitlement}</span>/year
              · Accrual ${escapeHtml(t.accrualMethod || 'None')}
              · Carry forward ${t.carryForward ? 'Yes' : 'No'}
              · Encashable ${t.encashable ? 'Yes' : 'No'}
            </div>
          </div>
          <div class="list-item__actions">
            <button type="button" class="btn btn--ghost btn--sm" data-edit="${t.id}">Edit</button>
          </div>
        </div>`
        )
        .join('')}
    </div>
  `;

  outlet.querySelector('#btn-new')?.addEventListener('click', async () => {
    const fd = await formModal({
      title: 'Add leave type',
      confirmLabel: 'Create',
      fieldsHtml: leaveTypeFormHtml(),
    });
    if (!fd) return;
    try {
      await peopleService.createLeaveType(book.id, readLeaveTypeForm(fd));
      showToast('Leave type created', 'success');
      await renderLeaveTypes(_ctx, outlet);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  });

  outlet.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-edit');
      const t = types.find((x) => x.id === id);
      if (!t) return;
      const fd = await formModal({
        title: 'Edit leave type',
        confirmLabel: 'Save',
        fieldsHtml: leaveTypeFormHtml(t),
      });
      if (!fd) return;
      try {
        await peopleService.updateLeaveType(id, readLeaveTypeForm(fd));
        showToast('Updated', 'success');
        await renderLeaveTypes(_ctx, outlet);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed', 'error');
      }
    });
  });
}

/** @param {object} [t] */
function leaveTypeFormHtml(t = {}) {
  const methods = Object.values(LEAVE_ACCRUAL_METHODS);
  return `
    <label class="field"><span class="field__label">Name</span>
      <input class="input" name="name" value="${escapeHtml(t.name || '')}" required /></label>
    <label class="field field--check"><input type="checkbox" name="paid" ${t.paid !== false ? 'checked' : ''} /> Paid</label>
    <label class="field"><span class="field__label">Annual entitlement (days)</span>
      <input class="input" type="number" step="0.5" min="0" name="annualEntitlement" value="${escapeHtml(String(t.annualEntitlement ?? 0))}" /></label>
    <label class="field"><span class="field__label">Accrual method</span>
      <select class="input" name="accrualMethod">
        ${methods.map((m) => `<option value="${m}" ${t.accrualMethod === m ? 'selected' : ''}>${m}</option>`).join('')}
      </select></label>
    <label class="field field--check"><input type="checkbox" name="carryForward" ${t.carryForward ? 'checked' : ''} /> Carry forward</label>
    <label class="field field--check"><input type="checkbox" name="encashable" ${t.encashable ? 'checked' : ''} /> Encashable</label>
    <label class="field field--check"><input type="checkbox" name="isActive" ${t.isActive !== false ? 'checked' : ''} /> Active</label>
  `;
}

/** @param {FormData} fd */
function readLeaveTypeForm(fd) {
  return {
    name: String(fd.get('name') || ''),
    paid: fd.get('paid') === 'on',
    annualEntitlement: Number(fd.get('annualEntitlement')) || 0,
    accrualMethod: String(fd.get('accrualMethod') || 'None'),
    carryForward: fd.get('carryForward') === 'on',
    encashable: fd.get('encashable') === 'on',
    isActive: fd.get('isActive') === 'on',
  };
}
