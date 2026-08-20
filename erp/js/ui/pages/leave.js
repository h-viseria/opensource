/**
 * Leave records and balances.
 */

import * as bookService from '../../services/bookService.js';
import * as peopleService from '../../services/peopleService.js';
import { countWorkingDaysInRange } from '../../engine/peopleEngine.js';
import { showToast } from '../toast.js';
import { confirmModal, formModal, escapeHtml } from '../modal.js';
import { formatDisplayDate, toDateInput } from '../../utils/date.js';

/**
 * @param {import('../../core/router.js').RouteContext} ctx
 * @param {HTMLElement} outlet
 */
export async function renderLeave(ctx, outlet) {
  const { book } = await bookService.getSessionContext();
  if (!book) {
    outlet.innerHTML = `<p class="muted">No active book.</p>`;
    return;
  }

  await peopleService.ensurePeopleMasters(book.id);
  const employeeIdFilter = String(ctx.query?.employeeId || '');
  const [employees, leaveTypes, records, settings] = await Promise.all([
    peopleService.listEmployees(book.id, { includeInactive: true }),
    peopleService.listLeaveTypes(book.id, { activeOnly: false }),
    peopleService.listLeaveRecords(book.id, {
      employeeId: employeeIdFilter || undefined,
    }),
    peopleService.getAttendanceSettings(book.id),
  ]);
  const empById = new Map(employees.map((e) => [e.id, e]));
  const typeById = new Map(leaveTypes.map((t) => [t.id, t]));
  const activeEmployees = employees.filter((e) => e.status === 'Active');

  let balancesHtml = '';
  if (employeeIdFilter && empById.has(employeeIdFilter)) {
    const balances = await peopleService.getEmployeeLeaveBalances(book.id, employeeIdFilter);
    balancesHtml = `
      <div class="panel">
        <h2 class="panel__title">Balances — ${escapeHtml(empById.get(employeeIdFilter).name)}</h2>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Type</th><th>Entitlement</th><th>Used</th><th>Remaining</th></tr></thead>
            <tbody>
              ${balances
                .map(
                  (b) => `
                <tr>
                  <td>${escapeHtml(b.leaveType.name)} ${b.leaveType.paid ? '' : '<span class="badge badge--muted">Unpaid</span>'}</td>
                  <td class="mono">${b.entitlement}</td>
                  <td class="mono">${b.used}</td>
                  <td class="mono">${b.remaining}</td>
                </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/people">People</a> / Leave</p>
        <h1 class="page-header__title">Leave</h1>
        <p class="page-header__desc">
          Record leave; days default to configured working days between start and end.
          <a href="#/settings/leave-types">Manage leave types</a>
        </p>
      </div>
      <div class="page-header__actions">
        <button type="button" class="btn btn--primary" id="btn-new">Record leave</button>
      </div>
    </div>

    <div class="panel" style="margin-bottom:1rem">
      <label class="field" style="max-width:18rem">
        <span class="field__label">Filter by employee</span>
        <select class="input" id="leave-emp-filter">
          <option value="">All employees</option>
          ${employees
            .map(
              (e) =>
                `<option value="${e.id}" ${e.id === employeeIdFilter ? 'selected' : ''}>${escapeHtml(e.employeeCode)} — ${escapeHtml(e.name)}</option>`,
            )
            .join('')}
        </select>
      </label>
    </div>

    ${balancesHtml}

    <div class="panel">
      <h2 class="panel__title">Leave records</h2>
      <div class="list">
        ${
          records.length
            ? records
                .map((r) => {
                  const emp = empById.get(r.employeeId);
                  const lt = typeById.get(r.leaveTypeId);
                  return `
              <div class="list-item">
                <div class="list-item__body">
                  <div class="list-item__title">
                    ${escapeHtml(emp?.name || 'Employee')}
                    <span class="badge badge--muted">${escapeHtml(lt?.name || 'Leave')}</span>
                    ${lt && !lt.paid ? '<span class="badge badge--warning">Unpaid</span>' : ''}
                  </div>
                  <div class="list-item__meta">
                    ${escapeHtml(formatDisplayDate(r.startDate))} → ${escapeHtml(formatDisplayDate(r.endDate))}
                    · <span class="mono">${r.days}</span> day(s)
                    ${r.notes ? ` · ${escapeHtml(r.notes)}` : ''}
                  </div>
                </div>
                <div class="list-item__actions">
                  <button type="button" class="btn btn--ghost btn--sm" data-del="${r.id}">Delete</button>
                </div>
              </div>`;
                })
                .join('')
            : `<p class="muted">No leave records yet.</p>`
        }
      </div>
    </div>
  `;

  outlet.querySelector('#leave-emp-filter')?.addEventListener('change', (e) => {
    const id = /** @type {HTMLSelectElement} */ (e.target).value;
    location.hash = id
      ? `#/people/leave?employeeId=${encodeURIComponent(id)}`
      : '#/people/leave';
  });

  outlet.querySelector('#btn-new')?.addEventListener('click', async () => {
    if (!activeEmployees.length) {
      showToast('Add an active employee first', 'info');
      return;
    }
    const activeTypes = leaveTypes.filter((t) => t.isActive !== false);
    if (!activeTypes.length) {
      showToast('Configure leave types first', 'info');
      return;
    }
    const today = toDateInput(new Date());
    const fd = await formModal({
      title: 'Record leave',
      confirmLabel: 'Save',
      fieldsHtml: `
        <label class="field"><span class="field__label">Employee</span>
          <select class="input" name="employeeId" required>
            ${activeEmployees
              .map(
                (e) =>
                  `<option value="${e.id}" ${e.id === employeeIdFilter ? 'selected' : ''}>${escapeHtml(e.employeeCode)} — ${escapeHtml(e.name)}</option>`,
              )
              .join('')}
          </select></label>
        <label class="field"><span class="field__label">Leave type</span>
          <select class="input" name="leaveTypeId" required>
            ${activeTypes.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')}
          </select></label>
        <label class="field"><span class="field__label">Start date</span>
          <input class="input" type="date" name="startDate" value="${today}" required data-leave-start /></label>
        <label class="field"><span class="field__label">End date</span>
          <input class="input" type="date" name="endDate" value="${today}" required data-leave-end /></label>
        <label class="field"><span class="field__label">Days (auto from working days; editable)</span>
          <input class="input" type="number" step="0.5" min="0" name="days" data-leave-days value="${countWorkingDaysInRange(today, today, settings)}" /></label>
        <label class="field"><span class="field__label">Notes</span>
          <textarea class="input" name="notes" rows="2"></textarea></label>
      `,
      onReady: (root) => {
        const sync = () => {
          const s = /** @type {HTMLInputElement} */ (root.querySelector('[data-leave-start]'))?.value;
          const e = /** @type {HTMLInputElement} */ (root.querySelector('[data-leave-end]'))?.value;
          const daysEl = /** @type {HTMLInputElement} */ (root.querySelector('[data-leave-days]'));
          if (s && e && daysEl) daysEl.value = String(countWorkingDaysInRange(s, e, settings));
        };
        root.querySelector('[data-leave-start]')?.addEventListener('change', sync);
        root.querySelector('[data-leave-end]')?.addEventListener('change', sync);
      },
    });
    if (!fd) return;
    try {
      await peopleService.createLeaveRecord(book.id, {
        employeeId: String(fd.get('employeeId')),
        leaveTypeId: String(fd.get('leaveTypeId')),
        startDate: String(fd.get('startDate')),
        endDate: String(fd.get('endDate')),
        days: Number(fd.get('days')),
        notes: String(fd.get('notes') || ''),
      });
      showToast('Leave recorded', 'success');
      await renderLeave(ctx, outlet);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  });

  outlet.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = await confirmModal({
        title: 'Delete leave record?',
        bodyHtml: '<p>Attendance cells linked only to this record are not auto-cleared.</p>',
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;
      try {
        await peopleService.deleteLeaveRecord(btn.getAttribute('data-del'));
        showToast('Deleted', 'success');
        await renderLeave(ctx, outlet);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed', 'error');
      }
    });
  });
}
