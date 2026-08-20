/**
 * Settings → Attendance (working days, statuses, check-in/out, overtime).
 */

import * as bookService from '../../services/bookService.js';
import * as peopleService from '../../services/peopleService.js';
import { showToast } from '../toast.js';
import { formModal, escapeHtml } from '../modal.js';

const DAY_LABELS = [
  { n: 0, label: 'Sunday' },
  { n: 1, label: 'Monday' },
  { n: 2, label: 'Tuesday' },
  { n: 3, label: 'Wednesday' },
  { n: 4, label: 'Thursday' },
  { n: 5, label: 'Friday' },
  { n: 6, label: 'Saturday' },
];

/**
 * @param {import('../../core/router.js').RouteContext} _ctx
 * @param {HTMLElement} outlet
 */
export async function renderAttendanceSettings(_ctx, outlet) {
  const { book } = await bookService.getSessionContext();
  if (!book) {
    outlet.innerHTML = `<p class="muted">Select a book first.</p>`;
    return;
  }

  const [settings, statuses] = await Promise.all([
    peopleService.getAttendanceSettings(book.id),
    peopleService.listAttendanceStatuses(book.id),
  ]);

  const work = new Set(settings?.workingDays || []);
  const off = new Set(settings?.weeklyOffDays || []);

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/settings">Settings</a> / Attendance</p>
        <h1 class="page-header__title">Attendance settings</h1>
        <p class="page-header__desc">Working days, hours, check-in/out, overtime, and configurable statuses for ${escapeHtml(book.name)}.</p>
      </div>
    </div>

    <form id="att-settings-form" class="panel">
      <h2 class="panel__title">Calendar & hours</h2>
      <fieldset class="field-group">
        <legend>Working days</legend>
        <div style="display:flex;flex-wrap:wrap;gap:0.75rem">
          ${DAY_LABELS.map(
            (d) => `
            <label class="field field--check">
              <input type="checkbox" name="workingDays" value="${d.n}" ${work.has(d.n) ? 'checked' : ''} />
              ${escapeHtml(d.label)}
            </label>`
          ).join('')}
        </div>
      </fieldset>
      <fieldset class="field-group" style="margin-top:1rem">
        <legend>Weekly off days</legend>
        <div style="display:flex;flex-wrap:wrap;gap:0.75rem">
          ${DAY_LABELS.map(
            (d) => `
            <label class="field field--check">
              <input type="checkbox" name="weeklyOffDays" value="${d.n}" ${off.has(d.n) ? 'checked' : ''} />
              ${escapeHtml(d.label)}
            </label>`
          ).join('')}
        </div>
      </fieldset>
      <div class="form-row" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(10rem,1fr));gap:0.75rem;margin-top:1rem">
        <label class="field"><span class="field__label">Standard working hours</span>
          <input class="input" type="number" step="0.25" min="0" name="standardHours" value="${escapeHtml(String(settings?.standardHours ?? 8))}" /></label>
        <label class="field"><span class="field__label">Half-day hours</span>
          <input class="input" type="number" step="0.25" min="0" name="halfDayHours" value="${escapeHtml(String(settings?.halfDayHours ?? 4))}" /></label>
        <label class="field"><span class="field__label">Document expiry warn (days)</span>
          <input class="input" type="number" min="0" name="expiryWarnDays" value="${escapeHtml(String(settings?.expiryWarnDays ?? 30))}" /></label>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:1rem;margin-top:1rem">
        <label class="field field--check">
          <input type="checkbox" name="overtimeEnabled" ${settings?.overtimeEnabled !== false ? 'checked' : ''} /> Enable overtime
        </label>
        <label class="field field--check">
          <input type="checkbox" name="checkInOutEnabled" ${settings?.checkInOutEnabled ? 'checked' : ''} /> Enable check-in / check-out
        </label>
      </div>
      <label class="field" style="margin-top:1rem"><span class="field__label">Document types (comma-separated)</span>
        <input class="input" name="documentTypes" value="${escapeHtml((settings?.documentTypes || []).join(', '))}" /></label>
      <div class="form-actions" style="justify-content:flex-start;border:0;padding-top:1rem">
        <button type="submit" class="btn btn--primary">Save settings</button>
      </div>
    </form>

    <div class="panel">
      <div class="page-header" style="padding:0;margin-bottom:0.75rem">
        <h2 class="panel__title" style="margin:0">Attendance statuses</h2>
        <button type="button" class="btn btn--secondary btn--sm" id="btn-status">Add status</button>
      </div>
      <div class="list">
        ${statuses
          .map(
            (s) => `
          <div class="list-item">
            <div class="list-item__body">
              <div class="list-item__title">
                ${escapeHtml(s.name)}
                <span class="badge badge--muted mono">${escapeHtml(s.shortCode)}</span>
                ${s.isSystem ? '<span class="badge badge--info">Default</span>' : ''}
                ${s.isActive === false ? '<span class="badge badge--warning">Inactive</span>' : ''}
              </div>
              <div class="list-item__meta">
                Working day: ${s.countsAsWorkingDay ? 'Yes' : 'No'} · Paid: ${s.paid ? 'Yes' : 'No'} · OT: ${s.countsAsOvertime ? 'Yes' : 'No'}
              </div>
            </div>
            <div class="list-item__actions">
              <button type="button" class="btn btn--ghost btn--sm" data-edit-status="${s.id}">Edit</button>
            </div>
          </div>`
          )
          .join('')}
      </div>
    </div>
  `;

  outlet.querySelector('#att-settings-form')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const form = /** @type {HTMLFormElement} */ (ev.target);
    const fd = new FormData(form);
    const workingDays = fd.getAll('workingDays').map((v) => Number(v));
    const weeklyOffDays = fd.getAll('weeklyOffDays').map((v) => Number(v));
    const docRaw = String(fd.get('documentTypes') || '');
    try {
      await peopleService.updateAttendanceSettings(book.id, {
        workingDays,
        weeklyOffDays,
        standardHours: Number(fd.get('standardHours')) || 8,
        halfDayHours: Number(fd.get('halfDayHours')) || 4,
        expiryWarnDays: Number(fd.get('expiryWarnDays')) || 30,
        overtimeEnabled: fd.get('overtimeEnabled') === 'on',
        checkInOutEnabled: fd.get('checkInOutEnabled') === 'on',
        documentTypes: docRaw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      });
      showToast('Attendance settings saved', 'success');
      await renderAttendanceSettings(_ctx, outlet);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  });

  outlet.querySelector('#btn-status')?.addEventListener('click', async () => {
    const fd = await formModal({
      title: 'Add attendance status',
      confirmLabel: 'Create',
      fieldsHtml: statusFormHtml(),
    });
    if (!fd) return;
    try {
      await peopleService.createAttendanceStatus(book.id, readStatusForm(fd));
      showToast('Status created', 'success');
      await renderAttendanceSettings(_ctx, outlet);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  });

  outlet.querySelectorAll('[data-edit-status]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-edit-status');
      const s = statuses.find((x) => x.id === id);
      if (!s) return;
      const fd = await formModal({
        title: 'Edit status',
        confirmLabel: 'Save',
        fieldsHtml: statusFormHtml(s),
      });
      if (!fd) return;
      try {
        await peopleService.updateAttendanceStatus(id, readStatusForm(fd));
        showToast('Status updated', 'success');
        await renderAttendanceSettings(_ctx, outlet);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed', 'error');
      }
    });
  });
}

/** @param {object} [s] */
function statusFormHtml(s = {}) {
  return `
    <label class="field"><span class="field__label">Name</span>
      <input class="input" name="name" value="${escapeHtml(s.name || '')}" required /></label>
    <label class="field"><span class="field__label">Short code</span>
      <input class="input" name="shortCode" maxlength="3" value="${escapeHtml(s.shortCode || '')}" /></label>
    <label class="field field--check"><input type="checkbox" name="countsAsWorkingDay" ${s.countsAsWorkingDay ? 'checked' : ''} /> Counts as working day</label>
    <label class="field field--check"><input type="checkbox" name="paid" ${s.paid !== false ? 'checked' : ''} /> Paid</label>
    <label class="field field--check"><input type="checkbox" name="countsAsOvertime" ${s.countsAsOvertime ? 'checked' : ''} /> Counts as overtime</label>
    <label class="field field--check"><input type="checkbox" name="isActive" ${s.isActive !== false ? 'checked' : ''} /> Active</label>
  `;
}

/** @param {FormData} fd */
function readStatusForm(fd) {
  return {
    name: String(fd.get('name') || ''),
    shortCode: String(fd.get('shortCode') || ''),
    countsAsWorkingDay: fd.get('countsAsWorkingDay') === 'on',
    paid: fd.get('paid') === 'on',
    countsAsOvertime: fd.get('countsAsOvertime') === 'on',
    isActive: fd.get('isActive') === 'on',
  };
}
