/**
 * Payroll → Salary setup (heads + settings).
 */

import {
  DAILY_RATE_METHODS,
  HOURLY_RATE_METHODS,
  PAYROLL_ACCOUNTING_CLASS,
  PAYROLL_FREQUENCIES,
  SALARY_CALC_BASIS,
  SALARY_CALC_TYPES,
  SALARY_HEAD_TYPES,
} from '../../core/constants.js';
import * as bookService from '../../services/bookService.js';
import * as payrollService from '../../services/payrollService.js';
import { showToast } from '../toast.js';
import { formModal, escapeHtml } from '../modal.js';

/**
 * @param {import('../../core/router.js').RouteContext} _ctx
 * @param {HTMLElement} outlet
 */
export async function renderSalarySetup(_ctx, outlet) {
  const { book } = await bookService.getSessionContext();
  if (!book) {
    outlet.innerHTML = `<p class="muted">No active book.</p>`;
    return;
  }

  await payrollService.ensurePayrollMasters(book.id, book.currency);
  const [heads, settings] = await Promise.all([
    payrollService.listSalaryHeads(book.id),
    payrollService.getPayrollSettings(book.id),
  ]);

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/payroll">Payroll</a> / Setup</p>
        <h1 class="page-header__title">Salary setup</h1>
        <p class="page-header__desc">
          Configure earnings and deductions. Ledger mapping is reserved for accounting posting later.
        </p>
      </div>
      <div class="page-header__actions">
        <button type="button" class="btn btn--primary" id="btn-new-head">Add salary head</button>
      </div>
    </div>

    <div class="panel">
      <h2 class="panel__title">Payroll settings</h2>
      <form id="form-settings" class="form-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(14rem,1fr));gap:0.75rem">
        <label class="field"><span class="field__label">Frequency</span>
          <select class="input" name="frequency">
            ${Object.values(PAYROLL_FREQUENCIES)
              .map((f) => `<option value="${f}" ${settings.frequency === f ? 'selected' : ''}>${f}</option>`)
              .join('')}
          </select></label>
        <label class="field"><span class="field__label">Default pay day (1–28)</span>
          <input class="input" type="number" min="1" max="28" name="payDay" value="${settings.payDay ?? 1}" /></label>
        <label class="field"><span class="field__label">Daily rate method</span>
          <select class="input" name="dailyRateMethod">
            ${Object.values(DAILY_RATE_METHODS)
              .map((m) => `<option value="${escapeHtml(m)}" ${settings.dailyRateMethod === m ? 'selected' : ''}>${escapeHtml(m)}</option>`)
              .join('')}
          </select></label>
        <label class="field"><span class="field__label">Custom daily divisor</span>
          <input class="input" type="number" min="1" step="1" name="customDailyDivisor" value="${escapeHtml(String(settings.customDailyDivisor ?? ''))}" placeholder="e.g. 30" /></label>
        <label class="field"><span class="field__label">Hourly rate method</span>
          <select class="input" name="hourlyRateMethod">
            ${Object.values(HOURLY_RATE_METHODS)
              .map((m) => `<option value="${escapeHtml(m)}" ${settings.hourlyRateMethod === m ? 'selected' : ''}>${escapeHtml(m)}</option>`)
              .join('')}
          </select></label>
        <label class="field"><span class="field__label">Standard month hours</span>
          <input class="input" type="number" min="1" name="standardMonthHours" value="${settings.standardMonthHours ?? 176}" /></label>
        <label class="field"><span class="field__label">Default OT multiplier</span>
          <input class="input" type="number" min="0" step="0.1" name="overtimeMultiplierDefault" value="${settings.overtimeMultiplierDefault ?? 1.5}" /></label>
        <div style="align-self:end">
          <button type="submit" class="btn btn--secondary">Save settings</button>
        </div>
      </form>
    </div>

    <div class="panel">
      <h2 class="panel__title">Salary heads</h2>
      <div class="list">
        ${heads
          .map(
            (h) => `
          <div class="list-item">
            <div class="list-item__body">
              <div class="list-item__title">
                ${escapeHtml(h.name)}
                <span class="badge ${h.headType === SALARY_HEAD_TYPES.EARNING ? 'badge--success' : 'badge--warning'}">${escapeHtml(h.headType)}</span>
                ${h.isBasic ? '<span class="badge badge--info">Basic</span>' : ''}
                ${h.isSystem ? '<span class="badge badge--muted">Default</span>' : ''}
                ${h.isActive === false ? '<span class="badge badge--muted">Inactive</span>' : ''}
              </div>
              <div class="list-item__meta">
                ${escapeHtml(h.calcType)} · ${escapeHtml(h.calcBasis || '—')}
                · Acct <span class="badge badge--muted">${escapeHtml(h.accountingClass || (h.headType === SALARY_HEAD_TYPES.DEDUCTION ? PAYROLL_ACCOUNTING_CLASS.DEDUCTION : PAYROLL_ACCOUNTING_CLASS.SALARY))}</span>
                ${h.amount != null ? ` · Amt <span class="mono">${h.amount}</span>` : ''}
                ${h.percentage != null ? ` · <span class="mono">${h.percentage}%</span>` : ''}
                ${h.multiplier != null && h.multiplier !== 1 ? ` · ×<span class="mono">${h.multiplier}</span>` : ''}
              </div>
            </div>
            <div class="list-item__actions">
              <button type="button" class="btn btn--ghost btn--sm" data-edit="${h.id}">Edit</button>
            </div>
          </div>`
          )
          .join('')}
      </div>
    </div>
  `;

  outlet.querySelector('#form-settings')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await payrollService.updatePayrollSettings(book.id, {
        frequency: String(fd.get('frequency') || PAYROLL_FREQUENCIES.MONTHLY),
        payDay: Number(fd.get('payDay')) || 1,
        dailyRateMethod: String(fd.get('dailyRateMethod') || DAILY_RATE_METHODS.WORKING),
        customDailyDivisor: fd.get('customDailyDivisor') ? Number(fd.get('customDailyDivisor')) : null,
        hourlyRateMethod: String(fd.get('hourlyRateMethod') || HOURLY_RATE_METHODS.DAILY_HOURS),
        standardMonthHours: Number(fd.get('standardMonthHours')) || 176,
        overtimeMultiplierDefault: Number(fd.get('overtimeMultiplierDefault')) || 1.5,
      });
      showToast('Payroll settings saved', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  });

  outlet.querySelector('#btn-new-head')?.addEventListener('click', async () => {
    const fd = await formModal({
      title: 'Add salary head',
      confirmLabel: 'Create',
      fieldsHtml: headFormHtml(),
    });
    if (!fd) return;
    try {
      await payrollService.createSalaryHead(book.id, readHeadForm(fd));
      showToast('Salary head created', 'success');
      await renderSalarySetup(_ctx, outlet);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  });

  outlet.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-edit');
      const h = heads.find((x) => x.id === id);
      if (!h) return;
      const fd = await formModal({
        title: 'Edit salary head',
        confirmLabel: 'Save',
        fieldsHtml: headFormHtml(h),
      });
      if (!fd) return;
      try {
        await payrollService.updateSalaryHead(id, readHeadForm(fd));
        showToast('Updated', 'success');
        await renderSalarySetup(_ctx, outlet);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed', 'error');
      }
    });
  });
}

/** @param {object} [h] */
function headFormHtml(h = {}) {
  return `
    <label class="field"><span class="field__label">Name</span>
      <input class="input" name="name" value="${escapeHtml(h.name || '')}" required /></label>
    <label class="field"><span class="field__label">Type</span>
      <select class="input" name="headType">
        ${Object.values(SALARY_HEAD_TYPES)
          .map((t) => `<option value="${t}" ${h.headType === t ? 'selected' : ''}>${t}</option>`)
          .join('')}
      </select></label>
    <label class="field"><span class="field__label">Accounting class</span>
      <select class="input" name="accountingClass">
        ${Object.values(PAYROLL_ACCOUNTING_CLASS)
          .map((t) => {
            const current =
              h.accountingClass ||
              (h.headType === SALARY_HEAD_TYPES.DEDUCTION
                ? PAYROLL_ACCOUNTING_CLASS.DEDUCTION
                : PAYROLL_ACCOUNTING_CLASS.SALARY);
            return `<option value="${t}" ${current === t ? 'selected' : ''}>${t}</option>`;
          })
          .join('')}
      </select></label>
    <label class="field"><span class="field__label">Calc type</span>
      <select class="input" name="calcType">
        ${Object.values(SALARY_CALC_TYPES)
          .map((t) => `<option value="${t}" ${h.calcType === t ? 'selected' : ''}>${t}</option>`)
          .join('')}
      </select></label>
    <label class="field"><span class="field__label">Calc basis</span>
      <select class="input" name="calcBasis">
        ${Object.values(SALARY_CALC_BASIS)
          .map((t) => `<option value="${t}" ${h.calcBasis === t ? 'selected' : ''}>${t}</option>`)
          .join('')}
      </select></label>
    <label class="field"><span class="field__label">Amount</span>
      <input class="input" type="number" step="0.01" name="amount" value="${escapeHtml(String(h.amount ?? ''))}" /></label>
    <label class="field"><span class="field__label">Percentage</span>
      <input class="input" type="number" step="0.01" name="percentage" value="${escapeHtml(String(h.percentage ?? ''))}" /></label>
    <label class="field"><span class="field__label">Multiplier</span>
      <input class="input" type="number" step="0.1" name="multiplier" value="${escapeHtml(String(h.multiplier ?? 1))}" /></label>
    <label class="field field--check"><input type="checkbox" name="isBasic" ${h.isBasic ? 'checked' : ''} /> Basic salary head</label>
    <label class="field field--check"><input type="checkbox" name="recurring" ${h.recurring !== false ? 'checked' : ''} /> Recurring</label>
    <label class="field field--check"><input type="checkbox" name="showOnPayslip" ${h.showOnPayslip !== false ? 'checked' : ''} /> Show on payslip</label>
    <label class="field field--check"><input type="checkbox" name="includeWithoutStructure" ${h.includeWithoutStructure ? 'checked' : ''} /> Include without structure</label>
    <label class="field field--check"><input type="checkbox" name="isActive" ${h.isActive !== false ? 'checked' : ''} /> Active</label>
  `;
}

/** @param {FormData} fd */
function readHeadForm(fd) {
  const amountRaw = fd.get('amount');
  const pctRaw = fd.get('percentage');
  return {
    name: String(fd.get('name') || ''),
    headType: String(fd.get('headType') || SALARY_HEAD_TYPES.EARNING),
    accountingClass: String(fd.get('accountingClass') || PAYROLL_ACCOUNTING_CLASS.SALARY),
    calcType: String(fd.get('calcType') || SALARY_CALC_TYPES.FIXED),
    calcBasis: String(fd.get('calcBasis') || SALARY_CALC_BASIS.MANUAL),
    amount: amountRaw === '' || amountRaw == null ? null : Number(amountRaw),
    percentage: pctRaw === '' || pctRaw == null ? null : Number(pctRaw),
    multiplier: Number(fd.get('multiplier')) || 1,
    isBasic: fd.get('isBasic') === 'on',
    recurring: fd.get('recurring') === 'on',
    showOnPayslip: fd.get('showOnPayslip') === 'on',
    includeWithoutStructure: fd.get('includeWithoutStructure') === 'on',
    isActive: fd.get('isActive') === 'on',
  };
}
