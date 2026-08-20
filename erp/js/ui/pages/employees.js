/**
 * Employee list — search, filter, add/edit/deactivate.
 */

import {
  EMPLOYMENT_STATUS,
  EMPLOYMENT_TYPES,
  EMPLOYEE_FIELD_TYPES,
} from '../../core/constants.js';
import * as bookService from '../../services/bookService.js';
import * as peopleService from '../../services/peopleService.js';
import { showToast } from '../toast.js';
import { confirmModal, formModal, escapeHtml } from '../modal.js';
import { toDateInput, formatDisplayDate } from '../../utils/date.js';

/**
 * @param {import('../../core/router.js').RouteContext} ctx
 * @param {HTMLElement} outlet
 */
export async function renderEmployees(ctx, outlet) {
  const { book } = await bookService.getSessionContext();
  if (!book) {
    outlet.innerHTML = `<p class="muted">No active book.</p>`;
    return;
  }

  await peopleService.ensurePeopleMasters(book.id);
  const [all, fields] = await Promise.all([
    peopleService.listEmployees(book.id, { includeInactive: true }),
    peopleService.listCustomFields(book.id, { activeOnly: true }),
  ]);

  const q = String(ctx.query?.q || '').trim().toLowerCase();
  const statusFilter = String(ctx.query?.status || 'all');
  const sortKey = String(ctx.query?.sort || 'code');

  let rows = all.slice();
  if (statusFilter === 'active') rows = rows.filter((e) => e.status === EMPLOYMENT_STATUS.ACTIVE);
  if (statusFilter === 'inactive') rows = rows.filter((e) => e.status === EMPLOYMENT_STATUS.INACTIVE);
  if (q) {
    rows = rows.filter((e) => {
      const hay = [e.employeeCode, e.name, e.designation, e.department, e.mobile, e.email]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }
  rows.sort((a, b) => {
    if (sortKey === 'name') return String(a.name).localeCompare(String(b.name));
    if (sortKey === 'joining') return String(a.joiningDate).localeCompare(String(b.joiningDate));
    return String(a.employeeCode).localeCompare(String(b.employeeCode));
  });

  const nextCode = peopleService.suggestEmployeeCode(all);

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/people">People</a> / Employees</p>
        <h1 class="page-header__title">Employees</h1>
        <p class="page-header__desc">Master list for this book. Deactivate instead of deleting when history exists.</p>
      </div>
      <div class="page-header__actions">
        <a class="btn btn--secondary" href="#/settings/employee-fields">Custom fields</a>
        <button type="button" class="btn btn--primary" id="btn-new">Add employee</button>
      </div>
    </div>

    <div class="panel" style="margin-bottom:1rem">
      <form id="emp-filters" class="form-row" style="display:flex;flex-wrap:wrap;gap:0.75rem;align-items:end">
        <label class="field" style="flex:1;min-width:10rem">
          <span class="field__label">Search</span>
          <input class="input" name="q" value="${escapeHtml(q)}" placeholder="Name, ID, phone…" />
        </label>
        <label class="field" style="min-width:8rem">
          <span class="field__label">Status</span>
          <select class="input" name="status">
            <option value="all" ${statusFilter === 'all' ? 'selected' : ''}>All</option>
            <option value="active" ${statusFilter === 'active' ? 'selected' : ''}>Active</option>
            <option value="inactive" ${statusFilter === 'inactive' ? 'selected' : ''}>Inactive</option>
          </select>
        </label>
        <label class="field" style="min-width:8rem">
          <span class="field__label">Sort</span>
          <select class="input" name="sort">
            <option value="code" ${sortKey === 'code' ? 'selected' : ''}>Employee ID</option>
            <option value="name" ${sortKey === 'name' ? 'selected' : ''}>Name</option>
            <option value="joining" ${sortKey === 'joining' ? 'selected' : ''}>Joining date</option>
          </select>
        </label>
        <button type="submit" class="btn btn--secondary">Apply</button>
      </form>
    </div>

    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Employee ID</th>
            <th>Name</th>
            <th>Joining</th>
            <th>Designation</th>
            <th>Department</th>
            <th>Type</th>
            <th>Status</th>
            <th>Phone</th>
            <th>Email</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${
            rows.length
              ? rows
                  .map(
                    (e) => `
            <tr>
              <td class="mono"><a href="#/people/employees/${encodeURIComponent(e.id)}">${escapeHtml(e.employeeCode)}</a></td>
              <td><a href="#/people/employees/${encodeURIComponent(e.id)}">${escapeHtml(e.name)}</a></td>
              <td>${escapeHtml(formatDisplayDate(e.joiningDate))}</td>
              <td>${escapeHtml(e.designation || '—')}</td>
              <td>${escapeHtml(e.department || '—')}</td>
              <td>${escapeHtml(e.employmentType || '—')}</td>
              <td><span class="badge ${e.status === EMPLOYMENT_STATUS.ACTIVE ? 'badge--success' : 'badge--muted'}">${escapeHtml(e.status)}</span></td>
              <td>${escapeHtml(e.mobile || '—')}</td>
              <td>${escapeHtml(e.email || '—')}</td>
              <td class="list-item__actions">
                <button type="button" class="btn btn--ghost btn--sm" data-edit="${e.id}">Edit</button>
                ${
                  e.status === EMPLOYMENT_STATUS.ACTIVE
                    ? `<button type="button" class="btn btn--ghost btn--sm" data-deactivate="${e.id}">Deactivate</button>`
                    : `<button type="button" class="btn btn--ghost btn--sm" data-activate="${e.id}">Activate</button>`
                }
              </td>
            </tr>`
                  )
                  .join('')
              : `<tr><td colspan="10" class="muted">No employees match. Add one to get started.</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;

  outlet.querySelector('#emp-filters')?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const fd = new FormData(/** @type {HTMLFormElement} */ (ev.target));
    const params = new URLSearchParams();
    const qq = String(fd.get('q') || '').trim();
    const st = String(fd.get('status') || 'all');
    const so = String(fd.get('sort') || 'code');
    if (qq) params.set('q', qq);
    if (st !== 'all') params.set('status', st);
    if (so !== 'code') params.set('sort', so);
    const qs = params.toString();
    location.hash = `#/people/employees${qs ? `?${qs}` : ''}`;
  });

  outlet.querySelector('#btn-new')?.addEventListener('click', async () => {
    const fd = await formModal({
      title: 'Add employee',
      confirmLabel: 'Create',
      fieldsHtml: employeeFieldsHtml({ nextCode, fields }),
    });
    if (!fd) return;
    try {
      const created = await peopleService.createEmployee(book.id, readEmployeeForm(fd, fields));
      showToast(`Created ${created.employeeCode}`, 'success');
      location.hash = `#/people/employees/${encodeURIComponent(created.id)}`;
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  });

  outlet.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-edit');
      const emp = all.find((e) => e.id === id);
      if (!emp) return;
      const fd = await formModal({
        title: `Edit ${emp.employeeCode}`,
        confirmLabel: 'Save',
        fieldsHtml: employeeFieldsHtml({ emp, fields }),
      });
      if (!fd) return;
      try {
        await peopleService.updateEmployee(id, readEmployeeForm(fd, fields));
        showToast('Employee updated', 'success');
        await renderEmployees(ctx, outlet);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed', 'error');
      }
    });
  });

  outlet.querySelectorAll('[data-deactivate]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-deactivate');
      const ok = await confirmModal({
        title: 'Deactivate employee?',
        bodyHtml: '<p>They will be hidden from daily attendance. History is kept.</p>',
        confirmLabel: 'Deactivate',
        danger: true,
      });
      if (!ok) return;
      try {
        await peopleService.deactivateEmployee(id);
        showToast('Employee deactivated', 'success');
        await renderEmployees(ctx, outlet);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed', 'error');
      }
    });
  });

  outlet.querySelectorAll('[data-activate]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await peopleService.activateEmployee(btn.getAttribute('data-activate'));
        showToast('Employee activated', 'success');
        await renderEmployees(ctx, outlet);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed', 'error');
      }
    });
  });
}

/**
 * @param {{ emp?: object, nextCode?: string, fields: object[] }} opts
 */
function employeeFieldsHtml(opts) {
  const emp = opts.emp || {};
  const code = emp.employeeCode || opts.nextCode || 'EMP-0001';
  const custom = emp.customValues || {};
  const typeOpts = EMPLOYMENT_TYPES.map(
    (t) => `<option value="${escapeHtml(t)}" ${emp.employmentType === t ? 'selected' : ''}>${escapeHtml(t)}</option>`,
  ).join('');

  const customHtml = (opts.fields || [])
    .map((f) => {
      const val = custom[f.id];
      if (f.fieldType === 'Checkbox') {
        return `<label class="field field--check"><input type="checkbox" name="cf_${f.id}" ${val === true || val === 'true' ? 'checked' : ''} /> ${escapeHtml(f.name)}${f.required ? ' *' : ''}</label>`;
      }
      const inputType =
        f.fieldType === 'Date' ? 'date' : f.fieldType === 'Number' || f.fieldType === 'Currency' ? 'number' : 'text';
      return `<label class="field"><span class="field__label">${escapeHtml(f.name)}${f.required ? ' *' : ''}</span>
        <input class="input" type="${inputType}" name="cf_${f.id}" value="${escapeHtml(val != null ? String(val) : f.defaultValue != null ? String(f.defaultValue) : '')}" step="any" /></label>`;
    })
    .join('');

  return `
    <label class="field"><span class="field__label">Employee ID *</span>
      <input class="input" name="employeeCode" value="${escapeHtml(code)}" required /></label>
    <label class="field"><span class="field__label">Employee name *</span>
      <input class="input" name="name" value="${escapeHtml(emp.name || '')}" required /></label>
    <label class="field"><span class="field__label">Joining date *</span>
      <input class="input" type="date" name="joiningDate" value="${escapeHtml(emp.joiningDate || toDateInput(new Date()))}" required /></label>
    <label class="field"><span class="field__label">Status</span>
      <select class="input" name="status">
        <option value="${EMPLOYMENT_STATUS.ACTIVE}" ${emp.status !== EMPLOYMENT_STATUS.INACTIVE ? 'selected' : ''}>Active</option>
        <option value="${EMPLOYMENT_STATUS.INACTIVE}" ${emp.status === EMPLOYMENT_STATUS.INACTIVE ? 'selected' : ''}>Inactive</option>
      </select></label>
    <label class="field"><span class="field__label">Mobile</span>
      <input class="input" name="mobile" value="${escapeHtml(emp.mobile || '')}" /></label>
    <label class="field"><span class="field__label">Email</span>
      <input class="input" type="email" name="email" value="${escapeHtml(emp.email || '')}" /></label>
    <label class="field"><span class="field__label">Address</span>
      <textarea class="input" name="address" rows="2">${escapeHtml(emp.address || '')}</textarea></label>
    <label class="field"><span class="field__label">Date of birth</span>
      <input class="input" type="date" name="dateOfBirth" value="${escapeHtml(emp.dateOfBirth || '')}" /></label>
    <label class="field"><span class="field__label">Gender</span>
      <input class="input" name="gender" value="${escapeHtml(emp.gender || '')}" /></label>
    <label class="field"><span class="field__label">Designation</span>
      <input class="input" name="designation" value="${escapeHtml(emp.designation || '')}" /></label>
    <label class="field"><span class="field__label">Department</span>
      <input class="input" name="department" value="${escapeHtml(emp.department || '')}" /></label>
    <label class="field"><span class="field__label">Employment type</span>
      <select class="input" name="employmentType">
        <option value="">—</option>
        ${typeOpts}
      </select></label>
    <label class="field"><span class="field__label">Notes</span>
      <textarea class="input" name="notes" rows="2">${escapeHtml(emp.notes || '')}</textarea></label>
    ${customHtml ? `<div class="panel" style="margin-top:0.5rem"><h3 class="panel__title" style="font-size:1rem">Custom fields</h3>${customHtml}</div>` : ''}
  `;
}

/**
 * @param {FormData} fd
 * @param {object[]} fields
 */
function readEmployeeForm(fd, fields) {
  /** @type {Record<string, unknown>} */
  const customValues = {};
  for (const f of fields || []) {
    if (f.fieldType === 'Checkbox') {
      customValues[f.id] = fd.get(`cf_${f.id}`) === 'on';
    } else {
      const v = fd.get(`cf_${f.id}`);
      customValues[f.id] = v == null || v === '' ? null : String(v);
    }
  }
  return {
    employeeCode: String(fd.get('employeeCode') || ''),
    name: String(fd.get('name') || ''),
    joiningDate: String(fd.get('joiningDate') || ''),
    status: String(fd.get('status') || EMPLOYMENT_STATUS.ACTIVE),
    mobile: String(fd.get('mobile') || ''),
    email: String(fd.get('email') || ''),
    address: String(fd.get('address') || ''),
    dateOfBirth: String(fd.get('dateOfBirth') || '') || null,
    gender: String(fd.get('gender') || ''),
    designation: String(fd.get('designation') || ''),
    department: String(fd.get('department') || ''),
    employmentType: String(fd.get('employmentType') || ''),
    notes: String(fd.get('notes') || ''),
    customValues,
  };
}

// silence unused import if tree-shaken tools complain
void EMPLOYEE_FIELD_TYPES;
