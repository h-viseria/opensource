/**
 * Payroll hub — salary setup, runs, history, payslips.
 */

import * as bookService from '../../services/bookService.js';
import * as payrollService from '../../services/payrollService.js';
import { escapeHtml } from '../modal.js';
import { formatMoney } from '../../utils/money.js';

/**
 * @param {import('../../core/router.js').RouteContext} _ctx
 * @param {HTMLElement} outlet
 */
export async function renderPayroll(_ctx, outlet) {
  const { book } = await bookService.getSessionContext();
  if (!book) {
    outlet.innerHTML = `<p class="muted">No active book.</p>`;
    return;
  }

  await payrollService.ensurePayrollMasters(book.id, book.currency);
  const stats = await payrollService.getPayrollHubStats(book.id);
  const currency = book.currency || 'INR';
  const last = stats.lastRun;

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-header__title">Payroll</h1>
        <p class="page-header__desc">
          Salary heads, structures, and payroll runs for <strong>${escapeHtml(book.name)}</strong>.
          Calculations stay on this device. After finalize, post to the Chart of Accounts from the run screen.
        </p>
      </div>
      <div class="page-header__actions">
        <a class="btn btn--primary" href="#/payroll/runs">Payroll runs</a>
      </div>
    </div>

    <div class="stat-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(9rem,1fr));gap:0.75rem;margin-bottom:1.25rem">
      <div class="panel" style="margin:0"><div class="muted" style="font-size:var(--text-sm)">Salary heads</div><div class="mono" style="font-size:1.4rem">${stats.salaryHeads}</div></div>
      <div class="panel" style="margin:0"><div class="muted" style="font-size:var(--text-sm)">Employees</div><div class="mono" style="font-size:1.4rem">${stats.employees}</div></div>
      <div class="panel" style="margin:0"><div class="muted" style="font-size:var(--text-sm)">Runs</div><div class="mono" style="font-size:1.4rem">${stats.runs}</div></div>
      <div class="panel" style="margin:0">
        <div class="muted" style="font-size:var(--text-sm)">Last run net</div>
        <div class="mono" style="font-size:1.1rem">${last ? formatMoney(last.totals?.net ?? 0, currency) : '—'}</div>
      </div>
    </div>

    <div class="card-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(16rem,1fr));gap:1rem">
      <a class="panel" href="#/payroll/setup" style="text-decoration:none;color:inherit">
        <h2 class="panel__title">Salary setup</h2>
        <p class="panel__desc">Earnings, deductions, rate methods, and payslip options.</p>
      </a>
      <a class="panel" href="#/payroll/structures" style="text-decoration:none;color:inherit">
        <h2 class="panel__title">Salary structures</h2>
        <p class="panel__desc">Assign heads to employees with effective-from history.</p>
      </a>
      <a class="panel" href="#/payroll/runs" style="text-decoration:none;color:inherit">
        <h2 class="panel__title">Payroll runs</h2>
        <p class="panel__desc">Create, calculate, review, and finalize monthly payroll.</p>
      </a>
      <a class="panel" href="#/payroll/reports" style="text-decoration:none;color:inherit">
        <h2 class="panel__title">Payroll reports</h2>
        <p class="panel__desc">Summary, salary register, and head totals with CSV export.</p>
      </a>
      <a class="panel" href="#/settings/payroll-accounts" style="text-decoration:none;color:inherit">
        <h2 class="panel__title">Account mapping</h2>
        <p class="panel__desc">Link Salary, Deductions, and Tax masters to the Chart of Accounts.</p>
      </a>
      <a class="panel" href="#/people/employees" style="text-decoration:none;color:inherit">
        <h2 class="panel__title">Employees</h2>
        <p class="panel__desc">People master used by payroll attendance and leave.</p>
      </a>
    </div>
  `;
}
