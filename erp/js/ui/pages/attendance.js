/**
 * Attendance — daily grid, monthly view, summary export.
 */

import * as bookService from '../../services/bookService.js';
import * as peopleService from '../../services/peopleService.js';
import { addDaysYmd } from '../../engine/peopleEngine.js';
import { showToast } from '../toast.js';
import { formModal, escapeHtml } from '../modal.js';
import { toDateInput, formatDisplayDate } from '../../utils/date.js';
import { wireReportDownloads } from '../reportExport.js';

/**
 * @param {import('../../core/router.js').RouteContext} ctx
 * @param {HTMLElement} outlet
 */
export async function renderAttendance(ctx, outlet) {
  const { book } = await bookService.getSessionContext();
  if (!book) {
    outlet.innerHTML = `<p class="muted">No active book.</p>`;
    return;
  }

  const view = String(ctx.query?.view || 'daily');
  const date = String(ctx.query?.date || toDateInput(new Date())).slice(0, 10);
  const month = String(ctx.query?.month || date.slice(0, 7)).slice(0, 7);

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/people">People</a> / Attendance</p>
        <h1 class="page-header__title">Attendance</h1>
        <p class="page-header__desc">Mark daily status, review the month, and export summaries. Configure working days under Settings.</p>
      </div>
      <div class="page-header__actions">
        <a class="btn btn--secondary" href="#/settings/attendance">Settings</a>
      </div>
    </div>

    <div class="tabs" style="display:flex;gap:0.5rem;margin-bottom:1rem;flex-wrap:wrap">
      <a class="btn ${view === 'daily' ? 'btn--primary' : 'btn--ghost'} btn--sm" href="#/people/attendance?view=daily&date=${encodeURIComponent(date)}">Daily</a>
      <a class="btn ${view === 'monthly' ? 'btn--primary' : 'btn--ghost'} btn--sm" href="#/people/attendance?view=monthly&month=${encodeURIComponent(month)}">Monthly</a>
      <a class="btn ${view === 'summary' ? 'btn--primary' : 'btn--ghost'} btn--sm" href="#/people/attendance?view=summary&month=${encodeURIComponent(month)}">Summary</a>
    </div>
    <div id="attendance-body"></div>
  `;

  const body = /** @type {HTMLElement} */ (outlet.querySelector('#attendance-body'));
  if (view === 'monthly') await paintMonthly(body, book, month);
  else if (view === 'summary') await paintSummary(body, book, month);
  else await paintDaily(body, book, date);
}

/**
 * @param {HTMLElement} body
 * @param {object} book
 * @param {string} date
 */
async function paintDaily(body, book, date) {
  const data = await peopleService.getDailyAttendance(book.id, date);
  const leaveTypes = await peopleService.listLeaveTypes(book.id, { activeOnly: true });
  const leaveStatusIds = new Set(
    data.statuses.filter((s) => /^leave$/i.test(s.name) || s.shortCode === 'L').map((s) => s.id),
  );

  body.innerHTML = `
    <div class="panel">
      <div style="display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center;margin-bottom:1rem">
        <button type="button" class="btn btn--ghost btn--sm" data-nav="-1">← Previous</button>
        <button type="button" class="btn btn--ghost btn--sm" data-nav="0">Today</button>
        <button type="button" class="btn btn--ghost btn--sm" data-nav="1">Next →</button>
        <label class="field" style="margin:0">
          <span class="field__label visually-hidden">Date</span>
          <input class="input" type="date" id="att-date" value="${escapeHtml(date)}" />
        </label>
        <span class="muted">${escapeHtml(formatDisplayDate(date))}</span>
      </div>
      ${
        !data.rows.length
          ? `<p class="muted">No active employees. <a href="#/people/employees">Add employees</a> first.</p>`
          : `<div class="table-wrap"><table class="data-table">
              <thead><tr><th>Employee</th><th>Status</th><th>Leave type</th>
              ${data.settings?.checkInOutEnabled ? '<th>In</th><th>Out</th><th>Hours</th>' : ''}
              ${data.settings?.overtimeEnabled ? '<th>OT hrs</th>' : ''}
              <th></th></tr></thead>
              <tbody>
                ${data.rows
                  .map((row) => {
                    const rec = row.record;
                    const statusId = rec?.statusId || row.suggestedStatusId || '';
                    const isLeave = leaveStatusIds.has(statusId);
                    return `
                    <tr data-emp="${row.employee.id}">
                      <td>
                        <a href="#/people/employees/${encodeURIComponent(row.employee.id)}">${escapeHtml(row.employee.name)}</a>
                        <div class="muted mono" style="font-size:var(--text-xs)">${escapeHtml(row.employee.employeeCode)}</div>
                      </td>
                      <td>
                        <select class="input" data-status>
                          ${data.statuses
                            .map(
                              (s) =>
                                `<option value="${s.id}" ${s.id === statusId ? 'selected' : ''}>${escapeHtml(s.name)}</option>`,
                            )
                            .join('')}
                        </select>
                      </td>
                      <td>
                        <select class="input" data-leave ${isLeave ? '' : 'disabled'}>
                          <option value="">—</option>
                          ${leaveTypes
                            .map(
                              (t) =>
                                `<option value="${t.id}" ${rec?.leaveTypeId === t.id ? 'selected' : ''}>${escapeHtml(t.name)}</option>`,
                            )
                            .join('')}
                        </select>
                      </td>
                      ${
                        data.settings?.checkInOutEnabled
                          ? `<td><input class="input" type="time" data-in value="${escapeHtml(rec?.checkIn || '')}" /></td>
                             <td><input class="input" type="time" data-out value="${escapeHtml(rec?.checkOut || '')}" /></td>
                             <td class="mono">${rec?.actualHours != null ? escapeHtml(String(rec.actualHours)) : '—'}</td>`
                          : ''
                      }
                      ${
                        data.settings?.overtimeEnabled
                          ? `<td><input class="input" type="number" step="0.25" min="0" style="width:5rem" data-ot value="${rec?.overtimeHours != null ? escapeHtml(String(rec.overtimeHours)) : ''}" /></td>`
                          : ''
                      }
                      <td><button type="button" class="btn btn--secondary btn--sm" data-save>Save</button></td>
                    </tr>`;
                  })
                  .join('')}
              </tbody>
            </table></div>
            <p class="muted" style="margin-top:0.75rem;font-size:var(--text-sm)">
              Empty rows show a suggested status (Present on working days, Weekly Off otherwise). Click Save to store.
            </p>`
      }
    </div>
  `;

  const go = (d) => {
    location.hash = `#/people/attendance?view=daily&date=${encodeURIComponent(d)}`;
  };

  body.querySelector('[data-nav="-1"]')?.addEventListener('click', () => go(addDaysYmd(date, -1)));
  body.querySelector('[data-nav="1"]')?.addEventListener('click', () => go(addDaysYmd(date, 1)));
  body.querySelector('[data-nav="0"]')?.addEventListener('click', () => go(toDateInput(new Date())));
  body.querySelector('#att-date')?.addEventListener('change', (e) => {
    go(/** @type {HTMLInputElement} */ (e.target).value);
  });

  body.querySelectorAll('tr[data-emp]').forEach((tr) => {
    const statusSel = /** @type {HTMLSelectElement} */ (tr.querySelector('[data-status]'));
    const leaveSel = /** @type {HTMLSelectElement} */ (tr.querySelector('[data-leave]'));
    statusSel?.addEventListener('change', () => {
      const leave = leaveStatusIds.has(statusSel.value);
      if (leaveSel) leaveSel.disabled = !leave;
    });
    tr.querySelector('[data-save]')?.addEventListener('click', async () => {
      try {
        await peopleService.setAttendance(book.id, {
          employeeId: tr.getAttribute('data-emp'),
          date,
          statusId: statusSel.value,
          leaveTypeId: leaveSel?.disabled ? null : leaveSel?.value || null,
          checkIn: /** @type {HTMLInputElement|null} */ (tr.querySelector('[data-in]'))?.value || null,
          checkOut: /** @type {HTMLInputElement|null} */ (tr.querySelector('[data-out]'))?.value || null,
          overtimeHours: (() => {
            const el = /** @type {HTMLInputElement|null} */ (tr.querySelector('[data-ot]'));
            if (!el || el.value === '') return null;
            return Number(el.value);
          })(),
        });
        showToast('Saved', 'success');
        await paintDaily(body, book, date);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed', 'error');
      }
    });
  });
}

/**
 * @param {HTMLElement} body
 * @param {object} book
 * @param {string} month
 */
async function paintMonthly(body, book, month) {
  const data = await peopleService.getMonthlyAttendance(book.id, month);
  body.innerHTML = `
    <div class="panel">
      <label class="field" style="max-width:12rem;margin-bottom:1rem">
        <span class="field__label">Month</span>
        <input class="input" type="month" id="att-month" value="${escapeHtml(month)}" />
      </label>
      <div class="table-wrap attendance-month-wrap">
        <table class="data-table attendance-month">
          <thead>
            <tr>
              <th class="attendance-month__sticky">Employee</th>
              ${data.dayCols.map((d) => `<th title="${escapeHtml(d)}">${Number(d.slice(-2))}</th>`).join('')}
              <th>P</th><th>A</th><th>L</th><th>OT</th>
            </tr>
          </thead>
          <tbody>
            ${
              data.rows.length
                ? data.rows
                    .map(
                      (r) => `
              <tr>
                <td class="attendance-month__sticky">
                  <a href="#/people/employees/${encodeURIComponent(r.employee.id)}">${escapeHtml(r.employee.name)}</a>
                </td>
                ${r.cells
                  .map(
                    (c) => `
                  <td class="attendance-month__cell" data-emp="${r.employee.id}" data-date="${c.date}" title="${escapeHtml(c.status?.name || 'Empty')}">
                    <button type="button" class="attendance-month__btn">${escapeHtml(c.code || '·')}</button>
                  </td>`
                  )
                  .join('')}
                <td class="mono">${r.totals.present}</td>
                <td class="mono">${r.totals.absent}</td>
                <td class="mono">${r.totals.leave}</td>
                <td class="mono">${r.totals.overtimeHours}</td>
              </tr>`
                    )
                    .join('')
                : `<tr><td colspan="${data.dayCols.length + 5}" class="muted">No employees.</td></tr>`
            }
          </tbody>
        </table>
      </div>
      <p class="muted" style="margin-top:0.75rem;font-size:var(--text-sm)">Click a cell to change status. Codes come from attendance status short codes.</p>
    </div>
  `;

  body.querySelector('#att-month')?.addEventListener('change', (e) => {
    const m = /** @type {HTMLInputElement} */ (e.target).value;
    location.hash = `#/people/attendance?view=monthly&month=${encodeURIComponent(m)}`;
  });

  body.querySelectorAll('.attendance-month__cell').forEach((td) => {
    td.querySelector('button')?.addEventListener('click', async () => {
      const employeeId = td.getAttribute('data-emp');
      const cellDate = td.getAttribute('data-date');
      const fd = await formModal({
        title: `Attendance ${cellDate}`,
        confirmLabel: 'Save',
        fieldsHtml: `
          <label class="field"><span class="field__label">Status</span>
            <select class="input" name="statusId">
              ${data.statuses
                .filter((s) => s.isActive !== false)
                .map((s) => `<option value="${s.id}">${escapeHtml(s.name)} (${escapeHtml(s.shortCode)})</option>`)
                .join('')}
            </select></label>
          <label class="field"><span class="field__label">Leave type (if Leave)</span>
            <select class="input" name="leaveTypeId">
              <option value="">—</option>
              ${data.leaveTypes
                .filter((t) => t.isActive !== false)
                .map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`)
                .join('')}
            </select></label>
          ${
            data.settings?.overtimeEnabled
              ? `<label class="field"><span class="field__label">Overtime hours</span>
                   <input class="input" type="number" step="0.25" min="0" name="overtimeHours" /></label>`
              : ''
          }
        `,
      });
      if (!fd) return;
      try {
        const ot = fd.get('overtimeHours');
        await peopleService.setAttendance(book.id, {
          employeeId,
          date: cellDate,
          statusId: String(fd.get('statusId')),
          leaveTypeId: String(fd.get('leaveTypeId') || '') || null,
          overtimeHours: ot === '' || ot == null ? null : Number(ot),
        });
        showToast('Saved', 'success');
        await paintMonthly(body, book, month);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed', 'error');
      }
    });
  });
}

/**
 * @param {HTMLElement} body
 * @param {object} book
 * @param {string} month
 */
async function paintSummary(body, book, month) {
  const data = await peopleService.getAttendanceSummary(book.id, month);
  body.innerHTML = `
    <div class="page-header" style="padding:0;margin-bottom:0.75rem">
      <div></div>
      <div class="page-header__actions"></div>
    </div>
    <div class="panel">
      <label class="field" style="max-width:12rem;margin-bottom:1rem">
        <span class="field__label">Month</span>
        <input class="input" type="month" id="sum-month" value="${escapeHtml(month)}" />
      </label>
      <h2 class="panel__title">Attendance summary — ${escapeHtml(month)}</h2>
      <div class="table-wrap">
        <table class="data-table" data-report-table>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Working days</th>
              <th>Present</th>
              <th>Half day</th>
              <th>Paid leave</th>
              <th>Unpaid leave</th>
              <th>Absent</th>
              <th>Holiday</th>
              <th>Weekly off</th>
              <th>Overtime hours</th>
            </tr>
          </thead>
          <tbody>
            ${
              data.rows.length
                ? data.rows
                    .map(
                      (r) => `
              <tr>
                <td>${escapeHtml(r.employee.name)}</td>
                <td class="mono">${r.workingDays}</td>
                <td class="mono">${r.present}</td>
                <td class="mono">${r.halfDay}</td>
                <td class="mono">${r.paidLeave}</td>
                <td class="mono">${r.unpaidLeave}</td>
                <td class="mono">${r.absent}</td>
                <td class="mono">${r.holiday}</td>
                <td class="mono">${r.weeklyOff}</td>
                <td class="mono">${r.overtimeHours}</td>
              </tr>`
                    )
                    .join('')
                : `<tr><td colspan="10" class="muted">No data.</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </div>
  `;

  body.querySelector('#sum-month')?.addEventListener('change', (e) => {
    const m = /** @type {HTMLInputElement} */ (e.target).value;
    location.hash = `#/people/attendance?view=summary&month=${encodeURIComponent(m)}`;
  });

  wireReportDownloads(body, {
    fileBase: `attendance-summary-${month}`,
    title: `Attendance summary ${month}`,
    subtitle: book.name,
  });
}
