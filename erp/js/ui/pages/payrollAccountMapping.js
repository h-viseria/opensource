/**
 * Settings / Payroll → Account mapping (Phase 3).
 * Maps Salary / Deductions / Tax master parents to COA ledger groups.
 */

import { ACCOUNT_NATURES } from '../../core/accountTypes.js';
import * as bookService from '../../services/bookService.js';
import * as coaService from '../../services/coaService.js';
import * as payrollAccounting from '../../services/payrollAccountingService.js';
import { showToast } from '../toast.js';
import { formModal, escapeHtml } from '../modal.js';

/**
 * @param {import('../../core/router.js').RouteContext} _ctx
 * @param {HTMLElement} outlet
 */
export async function renderPayrollAccountMapping(_ctx, outlet) {
  const { book } = await bookService.getSessionContext();
  if (!book) {
    outlet.innerHTML = `<p class="muted">Select a book first.</p>`;
    return;
  }

  await coaService.ensureChartOfAccounts(book.id);
  const mapping = await payrollAccounting.getPayrollAccountMapping(book.id);
  const groupOpts = await coaService.listGroupOptions(book.id);

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/settings">Settings</a> / Payroll account mapping</p>
        <h1 class="page-header__title">Payroll account mapping</h1>
        <p class="page-header__desc">
          Choose three master parents in the Chart of Accounts. Employee and deduction/tax ledgers are created automatically when you post payroll.
          Changing a mapping affects <strong>future</strong> postings only.
        </p>
      </div>
      <div class="page-header__actions">
        <a class="btn btn--ghost" href="#/payroll">Payroll</a>
      </div>
    </div>

    ${
      mapping.configured
        ? `<p class="badge badge--success">Configured — payroll can be posted to accounting</p>`
        : `<div class="panel" style="border-color:var(--color-warning,#c9a227)">
            <p><strong>Payroll accounting is not fully configured.</strong></p>
            <p class="muted">Map Salary, Deductions, and Tax master accounts below. Calculation and payslips still work.</p>
          </div>`
    }

    ${sectionHtml('Salary', 'salary', mapping.salary, 'Usually under Expenses (e.g. Salary / Staff costs).', ACCOUNT_NATURES.EXPENSE)}
    ${sectionHtml('Deductions', 'deduction', mapping.deductions, 'Usually under Current Liabilities (payroll deductions payable).', ACCOUNT_NATURES.LIABILITY)}
    ${sectionHtml('Tax', 'tax', mapping.tax, 'Usually under Current Liabilities (tax payable).', ACCOUNT_NATURES.LIABILITY)}

    ${
      mapping.payable
        ? `<div class="panel">
            <h2 class="panel__title">Salaries payable</h2>
            <p class="muted">Auto-managed under Deductions for net pay clearing.</p>
            <p><strong>${escapeHtml(mapping.payable.path)}</strong></p>
          </div>`
        : ''
    }

    <div class="panel">
      <h2 class="panel__title">How posting works</h2>
      <ul class="muted" style="margin:0;padding-left:1.2rem">
        <li>One Journal per payroll run (no duplicate books).</li>
        <li>Dr employee Salary ledgers (gross) under the Salary master.</li>
        <li>Cr deduction / tax ledgers by salary-head classification under Deductions / Tax masters.</li>
        <li>Cr employee Payable ledgers (net) — cleared later with a Payment voucher.</li>
      </ul>
    </div>
  `;

  wireSection(outlet, book.id, 'salary', 'salaryMasterGroupId', groupOpts, ACCOUNT_NATURES.EXPENSE, _ctx);
  wireSection(outlet, book.id, 'deduction', 'deductionMasterGroupId', groupOpts, ACCOUNT_NATURES.LIABILITY, _ctx);
  wireSection(outlet, book.id, 'tax', 'taxMasterGroupId', groupOpts, ACCOUNT_NATURES.LIABILITY, _ctx);
}

/**
 * @param {string} title
 * @param {string} key
 * @param {object|null} current
 * @param {string} hint
 * @param {string} nature
 */
function sectionHtml(title, key, current, hint, nature) {
  return `
    <div class="panel">
      <h2 class="panel__title">${escapeHtml(title)}</h2>
      <p class="muted">${escapeHtml(hint)}</p>
      ${
        current
          ? `<p><strong>${escapeHtml(current.path)}</strong>
              <span class="badge badge--muted">${escapeHtml(current.nature || '')}</span></p>
             <p class="muted mono" style="font-size:var(--text-sm)">Group ID: ${escapeHtml(current.id)}</p>`
          : `<p class="muted">Not mapped</p>`
      }
      <div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-top:0.75rem">
        <button type="button" class="btn btn--secondary" data-select="${key}">Select existing group</button>
        <button type="button" class="btn btn--secondary" data-create="${key}" data-nature="${escapeHtml(nature)}">Create new group</button>
      </div>
    </div>`;
}

/**
 * @param {HTMLElement} outlet
 * @param {string} bookId
 * @param {string} key
 * @param {string} settingsField
 * @param {object[]} groupOpts
 * @param {string} defaultNature
 * @param {import('../../core/router.js').RouteContext} ctx
 */
function wireSection(outlet, bookId, key, settingsField, groupOpts, defaultNature, ctx) {
  outlet.querySelector(`[data-select="${key}"]`)?.addEventListener('click', async () => {
    const fd = await formModal({
      title: 'Select master group',
      confirmLabel: 'Use group',
      fieldsHtml: `
        <p class="muted" style="font-size:var(--text-sm)">Changing this mapping affects future payroll postings only. Existing journals are unchanged.</p>
        <label class="field"><span class="field__label">Ledger group</span>
          <select class="input" name="groupId" required>
            <option value="">— Select —</option>
            ${groupOpts
              .map(
                (o) =>
                  `<option value="${o.id}">${escapeHtml(o.label)}</option>`,
              )
              .join('')}
          </select></label>
      `,
    });
    if (!fd) return;
    try {
      await payrollAccounting.updatePayrollAccountMapping(bookId, {
        [settingsField]: String(fd.get('groupId')),
      });
      showToast('Mapping saved', 'success');
      await renderPayrollAccountMapping(ctx, outlet);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  });

  outlet.querySelector(`[data-create="${key}"]`)?.addEventListener('click', async () => {
    const nature = outlet.querySelector(`[data-create="${key}"]`)?.getAttribute('data-nature') || defaultNature;
    const fd = await formModal({
      title: 'Create payroll master group',
      confirmLabel: 'Create & map',
      fieldsHtml: `
        <p class="muted" style="font-size:var(--text-sm)">Uses the existing Chart of Accounts group creator.</p>
        <label class="field"><span class="field__label">Account name</span>
          <input class="input" name="name" required placeholder="e.g. Salary" /></label>
        <label class="field"><span class="field__label">Parent group</span>
          <select class="input" name="parentId">
            <option value="">— Top level (${escapeHtml(nature)}) —</option>
            ${groupOpts
              .map((o) => `<option value="${o.id}">${escapeHtml(o.label)}</option>`)
              .join('')}
          </select></label>
        <input type="hidden" name="nature" value="${escapeHtml(nature)}" />
      `,
    });
    if (!fd) return;
    try {
      const group = await payrollAccounting.createPayrollMasterGroup(bookId, {
        name: String(fd.get('name') || ''),
        parentId: String(fd.get('parentId') || '') || null,
        nature: String(fd.get('nature') || nature),
      });
      await payrollAccounting.updatePayrollAccountMapping(bookId, {
        [settingsField]: group.id,
      });
      showToast('Group created and mapped', 'success');
      await renderPayrollAccountMapping(ctx, outlet);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  });
}
