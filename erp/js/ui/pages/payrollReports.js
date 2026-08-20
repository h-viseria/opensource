/**
 * Payroll reports — summary, register, head totals, history.
 */

import { PAYROLL_RUN_STATUS } from '../../core/constants.js';
import * as bookService from '../../services/bookService.js';
import * as payrollService from '../../services/payrollService.js';
import { formatMoney } from '../../utils/money.js';
import { escapeHtml } from '../modal.js';
import { wireReportDownloads } from '../reportExport.js';

/**
 * @param {import('../../core/router.js').RouteContext} ctx
 * @param {HTMLElement} outlet
 */
export async function renderPayrollReports(ctx, outlet) {
  const { book } = await bookService.getSessionContext();
  if (!book) {
    outlet.innerHTML = `<p class="muted">No active book.</p>`;
    return;
  }

  await payrollService.ensurePayrollMasters(book.id, book.currency);
  const runs = await payrollService.listPayrollRuns(book.id);
  const runId = ctx.query?.runId || runs.find((r) => r.status === PAYROLL_RUN_STATUS.FINALIZED)?.id || runs[0]?.id || '';
  const currency = book.currency || 'INR';

  let items = [];
  let run = null;
  /** @type {Map<string, { name: string, headType: string, total: number }>} */
  const headTotals = new Map();

  if (runId) {
    run = await payrollService.getPayrollRun(runId);
    items = await payrollService.listPayrollItems(runId);
    for (const it of items) {
      for (const c of it.components || []) {
        const prev = headTotals.get(c.salaryHeadId || c.name) || {
          name: c.name,
          headType: c.headType,
          total: 0,
        };
        prev.total += Number(c.amount) || 0;
        headTotals.set(c.salaryHeadId || c.name, prev);
      }
    }
  }

  const headRows = [...headTotals.values()].sort((a, b) => a.name.localeCompare(b.name));

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/payroll">Payroll</a> / Reports</p>
        <h1 class="page-header__title">Payroll reports</h1>
        <p class="page-header__desc">Summary, employee register, and salary-head totals for a selected run.</p>
      </div>
    </div>

    <div class="panel">
      <form id="form-run" style="display:flex;flex-wrap:wrap;gap:0.75rem;align-items:end">
        <label class="field" style="min-width:16rem;flex:1"><span class="field__label">Payroll run</span>
          <select class="input" name="runId">
            ${runs
              .map(
                (r) =>
                  `<option value="${r.id}" ${r.id === runId ? 'selected' : ''}>${escapeHtml(r.label || r.periodStart)} · ${escapeHtml(r.status)}</option>`,
              )
              .join('') || '<option value="">No runs</option>'}
          </select></label>
        <button type="submit" class="btn btn--secondary">Load</button>
      </form>
    </div>

    ${
      !run
        ? `<p class="muted">Create a payroll run first.</p>`
        : `
    <div class="panel" id="report-summary">
      <div class="page-header" style="margin:0 0 0.75rem;padding:0">
        <h2 class="panel__title" style="margin:0">Payroll summary</h2>
        <div data-report-export-slot></div>
      </div>
      <p class="muted">${escapeHtml(run.periodStart)} → ${escapeHtml(run.periodEnd)} · ${escapeHtml(run.status)}</p>
      <dl class="stat-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(9rem,1fr));gap:0.75rem" data-report-table>
        <div><dt class="muted">Employees</dt><dd class="mono">${run.totals?.employees ?? 0}</dd></div>
        <div><dt class="muted">Gross</dt><dd class="mono">${formatMoney(run.totals?.gross ?? 0, currency)}</dd></div>
        <div><dt class="muted">Deductions</dt><dd class="mono">${formatMoney(run.totals?.deductions ?? 0, currency)}</dd></div>
        <div><dt class="muted">Net</dt><dd class="mono">${formatMoney(run.totals?.net ?? 0, currency)}</dd></div>
      </dl>
    </div>

    <div class="panel" id="report-register">
      <div class="page-header" style="margin:0 0 0.75rem;padding:0">
        <h2 class="panel__title" style="margin:0">Employee salary register</h2>
        <div data-report-export-slot></div>
      </div>
      <div class="table-wrap">
        <table class="data-table" data-report-table>
          <thead>
            <tr><th>Code</th><th>Employee</th><th>Present</th><th>Unpaid leave</th><th>OT hrs</th><th>Gross</th><th>Deductions</th><th>Net</th></tr>
          </thead>
          <tbody>
            ${items
              .map(
                (it) => `
              <tr>
                <td class="mono">${escapeHtml(it.employeeCode || '')}</td>
                <td>${escapeHtml(it.employeeName || '')}</td>
                <td class="mono">${it.attendanceSnapshot?.present ?? '—'}</td>
                <td class="mono">${it.attendanceSnapshot?.unpaidLeave ?? '—'}</td>
                <td class="mono">${it.attendanceSnapshot?.overtimeHours ?? '—'}</td>
                <td class="mono">${formatMoney(it.gross ?? 0, currency)}</td>
                <td class="mono">${formatMoney(it.totalDeductions ?? 0, currency)}</td>
                <td class="mono">${formatMoney(it.net ?? 0, currency)}</td>
              </tr>`
              )
              .join('') || `<tr><td colspan="8" class="muted">No items</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>

    <div class="panel" id="report-heads">
      <div class="page-header" style="margin:0 0 0.75rem;padding:0">
        <h2 class="panel__title" style="margin:0">Salary head summary</h2>
        <div data-report-export-slot></div>
      </div>
      <div class="table-wrap">
        <table class="data-table" data-report-table>
          <thead><tr><th>Head</th><th>Type</th><th>Total</th></tr></thead>
          <tbody>
            ${headRows
              .map(
                (h) => `
              <tr>
                <td>${escapeHtml(h.name)}</td>
                <td>${escapeHtml(h.headType)}</td>
                <td class="mono">${formatMoney(h.total, currency)}</td>
              </tr>`
              )
              .join('') || `<tr><td colspan="3" class="muted">No components</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>

    <div class="panel" id="report-history">
      <div class="page-header" style="margin:0 0 0.75rem;padding:0">
        <h2 class="panel__title" style="margin:0">Payroll history</h2>
        <div data-report-export-slot></div>
      </div>
      <div class="table-wrap">
        <table class="data-table" data-report-table>
          <thead><tr><th>Period</th><th>Status</th><th>Employees</th><th>Gross</th><th>Net</th></tr></thead>
          <tbody>
            ${runs
              .map(
                (r) => `
              <tr>
                <td class="mono">${escapeHtml(r.label || r.periodStart)}</td>
                <td>${escapeHtml(r.status)}</td>
                <td class="mono">${r.totals?.employees ?? 0}</td>
                <td class="mono">${formatMoney(r.totals?.gross ?? 0, currency)}</td>
                <td class="mono">${formatMoney(r.totals?.net ?? 0, currency)}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </div>`
    }
  `;

  outlet.querySelector('#form-run')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    window.location.hash = `#/payroll/reports?runId=${encodeURIComponent(String(fd.get('runId') || ''))}`;
  });

  if (!run) return;

  wireReportDownloads(outlet.querySelector('#report-summary'), {
    fileBase: `payroll-summary-${run.label || run.periodStart}`,
    title: 'Payroll summary',
    subtitle: `${book.name} · ${run.periodStart} → ${run.periodEnd}`,
  });
  wireReportDownloads(outlet.querySelector('#report-register'), {
    fileBase: `salary-register-${run.label || run.periodStart}`,
    title: 'Employee salary register',
    subtitle: `${book.name} · ${run.periodStart} → ${run.periodEnd}`,
  });
  wireReportDownloads(outlet.querySelector('#report-heads'), {
    fileBase: `salary-heads-${run.label || run.periodStart}`,
    title: 'Salary head summary',
    subtitle: `${book.name} · ${run.periodStart} → ${run.periodEnd}`,
  });
  wireReportDownloads(outlet.querySelector('#report-history'), {
    fileBase: 'payroll-history',
    title: 'Payroll history',
    subtitle: book.name,
  });
}
