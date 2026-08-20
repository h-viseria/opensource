/**
 * People hub — employees, attendance, leave.
 */

import * as bookService from '../../services/bookService.js';
import * as peopleService from '../../services/peopleService.js';
import { escapeHtml } from '../modal.js';

/**
 * @param {import('../../core/router.js').RouteContext} _ctx
 * @param {HTMLElement} outlet
 */
export async function renderPeople(_ctx, outlet) {
  const { book } = await bookService.getSessionContext();
  if (!book) {
    outlet.innerHTML = `<p class="muted">No active book.</p>`;
    return;
  }

  await peopleService.ensurePeopleMasters(book.id);
  const stats = await peopleService.getPeopleHubStats(book.id);

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-header__title">People</h1>
        <p class="page-header__desc">
          Employees, attendance, leave, and a link to Payroll for <strong>${escapeHtml(book.name)}</strong>.
          Data stays on this device.
        </p>
      </div>
      <div class="page-header__actions">
        <a class="btn btn--primary" href="#/people/employees">Employees</a>
      </div>
    </div>

    <div class="stat-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(9rem,1fr));gap:0.75rem;margin-bottom:1.25rem">
      <div class="panel" style="margin:0"><div class="muted" style="font-size:var(--text-sm)">Employees</div><div class="mono" style="font-size:1.4rem">${stats.employees}</div></div>
      <div class="panel" style="margin:0"><div class="muted" style="font-size:var(--text-sm)">Active</div><div class="mono" style="font-size:1.4rem">${stats.activeEmployees}</div></div>
      <div class="panel" style="margin:0"><div class="muted" style="font-size:var(--text-sm)">Leave types</div><div class="mono" style="font-size:1.4rem">${stats.leaveTypes}</div></div>
      <div class="panel" style="margin:0"><div class="muted" style="font-size:var(--text-sm)">Attendance statuses</div><div class="mono" style="font-size:1.4rem">${stats.attendanceStatuses}</div></div>
    </div>

    <div class="card-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(16rem,1fr));gap:1rem">
      <a class="panel" href="#/people/employees" style="text-decoration:none;color:inherit">
        <h2 class="panel__title">Employees</h2>
        <p class="panel__desc">Master list, custom fields, documents, and profiles.</p>
      </a>
      <a class="panel" href="#/people/attendance" style="text-decoration:none;color:inherit">
        <h2 class="panel__title">Attendance</h2>
        <p class="panel__desc">Daily grid, monthly view, overtime, and summaries.</p>
      </a>
      <a class="panel" href="#/people/leave" style="text-decoration:none;color:inherit">
        <h2 class="panel__title">Leave</h2>
        <p class="panel__desc">Leave records and balances by type.</p>
      </a>
      <a class="panel" href="#/settings/employee-fields" style="text-decoration:none;color:inherit">
        <h2 class="panel__title">Employee fields</h2>
        <p class="panel__desc">Configure custom fields (PAN, Emirates ID, etc.).</p>
      </a>
      <a class="panel" href="#/settings/attendance" style="text-decoration:none;color:inherit">
        <h2 class="panel__title">Attendance settings</h2>
        <p class="panel__desc">Working days, statuses, check-in/out, overtime.</p>
      </a>
      <a class="panel" href="#/settings/leave-types" style="text-decoration:none;color:inherit">
        <h2 class="panel__title">Leave types</h2>
        <p class="panel__desc">Annual, sick, unpaid, and your own leave types.</p>
      </a>
      <a class="panel" href="#/payroll" style="text-decoration:none;color:inherit">
        <h2 class="panel__title">Payroll</h2>
        <p class="panel__desc">Salary structures, runs, payslips, and reports.</p>
      </a>
    </div>
  `;
}
