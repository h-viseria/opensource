/**
 * Goals CRUD with progress.
 */

import * as bookService from '../../services/bookService.js';
import * as financeService from '../../services/personalFinanceService.js';
import { CSV_LABELS, CSV_SAMPLES, importGoals } from '../../services/csvBulkImport.js';
import { showToast } from '../toast.js';
import { confirmModal, formModal, escapeHtml } from '../modal.js';
import { csvImportPanelHtml, wireCsvImport } from '../csvImport.js';
import { formatMoney } from '../../utils/money.js';
import { formatDisplayDate } from '../../utils/date.js';

/**
 * @param {import('../../core/router.js').RouteContext} _ctx
 * @param {HTMLElement} outlet
 */
export async function renderGoals(_ctx, outlet) {
  const { book } = await bookService.getSessionContext();
  if (!book) {
    outlet.innerHTML = `<p class="muted">No active book.</p>`;
    return;
  }

  const [goals, assetLedgers, dash] = await Promise.all([
    financeService.listGoals(book.id),
    financeService.listGoalLedgers(book.id),
    financeService.getFinanceDashboard(book.id),
  ]);
  const currency = book.currency || 'INR';
  const progressById = new Map(dash.goals.map((g) => [g.goal.id, g.progress]));

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/finance">Personal finance</a> / Goals</p>
        <h1 class="page-header__title">Goals</h1>
        <p class="page-header__desc">
          Track savings targets. Link an asset ledger for live progress, or enter current amount manually.
        </p>
      </div>
      <div class="page-header__actions">
        <button type="button" class="btn btn--secondary" id="btn-template">From template</button>
        <button type="button" class="btn btn--primary" id="btn-new">New goal</button>
      </div>
    </div>

    ${csvImportPanelHtml()}

    <div class="list">
      ${
        goals.length === 0
          ? `<div class="panel empty-state">
               <p class="muted">No goals yet. Start from a template (Emergency Fund, Retirement, Education…).</p>
             </div>`
          : goals
              .map((g) => {
                const p = progressById.get(g.id) || {
                  current: g.currentAmount,
                  target: g.targetAmount,
                  pct: 0,
                  remaining: g.targetAmount,
                  complete: false,
                };
                return `
          <div class="list-item" data-id="${g.id}">
            <div class="list-item__body" style="flex:1">
              <div class="list-item__title">
                ${escapeHtml(g.name)}
                <span class="badge badge--muted">${escapeHtml(g.category)}</span>
                ${!g.isActive ? '<span class="badge badge--warning">Inactive</span>' : ''}
                ${p.complete ? '<span class="badge badge--success">Complete</span>' : ''}
              </div>
              <div class="progress-bar" style="margin:0.5rem 0">
                <div class="progress-bar__fill ${p.complete ? 'is-complete' : ''}" style="width:${Math.min(p.pct, 100)}%"></div>
              </div>
              <div class="list-item__meta">
                <span class="mono">${formatMoney(p.current, currency)} / ${formatMoney(p.target, currency)}</span>
                · ${p.pct}%
                ${g.targetDate ? ` · Target ${formatDisplayDate(g.targetDate)}` : ''}
                ${g.linkedLedgerId ? ' · Linked ledger' : ''}
              </div>
            </div>
            <div class="list-item__actions">
              <button type="button" class="btn btn--ghost btn--sm" data-action="edit">Edit</button>
              <button type="button" class="btn btn--ghost btn--sm" data-action="delete">Delete</button>
            </div>
          </div>`;
              })
              .join('')
      }
    </div>
  `;

  const openForm = async (goal, template) => {
    const fd = await formModal({
      title: goal ? 'Edit goal' : 'New goal',
      confirmLabel: goal ? 'Save' : 'Create',
      fieldsHtml: goalFields({ assetLedgers, goal, template }),
    });
    if (!fd) return;
    try {
      const data = readGoalForm(fd);
      if (goal) {
        await financeService.updateGoal(goal.id, data);
        showToast('Goal updated', 'success');
      } else {
        await financeService.createGoal(book.id, data);
        showToast('Goal created', 'success');
      }
      await renderGoals(_ctx, outlet);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  };

  outlet.querySelector('#btn-new')?.addEventListener('click', () => openForm(null));

  outlet.querySelector('#btn-template')?.addEventListener('click', async () => {
    const templates = financeService.DEFAULT_GOAL_TEMPLATES;
    const opts = templates
      .map((t, i) => `<option value="${i}">${escapeHtml(t.name)} (${escapeHtml(t.category)})</option>`)
      .join('');
    const fd = await formModal({
      title: 'Goal template',
      confirmLabel: 'Continue',
      fieldsHtml: `
        <label class="field"><span class="field__label">Template</span>
          <select class="input" name="idx">${opts}</select></label>`,
    });
    if (!fd) return;
    const idx = Number(fd.get('idx') || 0);
    await openForm(null, templates[idx]);
  });

  outlet.querySelectorAll('.list-item').forEach((el) => {
    const id = el.getAttribute('data-id');
    const goal = goals.find((g) => g.id === id);
    if (!goal) return;

    el.querySelector('[data-action="edit"]')?.addEventListener('click', () => openForm(goal));

    el.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
      const ok = await confirmModal({
        title: 'Delete goal?',
        bodyHtml: `<p>Delete <strong>${escapeHtml(goal.name)}</strong>?</p>`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;
      try {
        await financeService.deleteGoal(id);
        showToast('Goal deleted', 'success');
        await renderGoals(_ctx, outlet);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed', 'error');
      }
    });
  });

  wireCsvImport(outlet, {
    labels: CSV_LABELS.goals,
    sampleRows: CSV_SAMPLES.goals,
    fileName: 'goals_template.csv',
    onRows: (rows) => importGoals(book.id, rows),
    onDone: async (result) => {
      if (result.created > 0) await renderGoals(_ctx, outlet);
    },
  });
}

/**
 * @param {{ assetLedgers: any[], goal?: any, template?: any }} opts
 */
function goalFields(opts) {
  const g = opts.goal;
  const t = opts.template;
  const catOpts = financeService.GOAL_CATEGORY_LIST.map(
    (c) =>
      `<option value="${escapeHtml(c)}" ${(g?.category || t?.category) === c ? 'selected' : ''}>${escapeHtml(c)}</option>`
  ).join('');
  const ledOpts =
    `<option value="">— Manual amount —</option>` +
    opts.assetLedgers
      .map(
        (l) =>
          `<option value="${l.id}" ${g?.linkedLedgerId === l.id ? 'selected' : ''}>${escapeHtml(l.name)}</option>`
      )
      .join('');

  return `
    <label class="field"><span class="field__label">Name *</span>
      <input class="input" name="name" required value="${escapeHtml(g?.name || t?.name || '')}" /></label>
    <label class="field"><span class="field__label">Category *</span>
      <select class="input" name="category">${catOpts}</select></label>
    <label class="field"><span class="field__label">Target amount *</span>
      <input class="input" name="targetAmount" type="number" min="0.01" step="0.01" required value="${g?.targetAmount ?? t?.targetAmount ?? 0}" /></label>
    <label class="field"><span class="field__label">Current amount</span>
      <input class="input" name="currentAmount" type="number" min="0" step="0.01" value="${g?.currentAmount ?? 0}" />
      <span class="field__hint">Ignored when a linked ledger is set</span></label>
    <label class="field"><span class="field__label">Linked asset ledger</span>
      <select class="input" name="linkedLedgerId">${ledOpts}</select></label>
    <label class="field"><span class="field__label">Target date</span>
      <input class="input" name="targetDate" type="date" value="${escapeHtml(g?.targetDate || '')}" /></label>
    <label class="field"><span class="field__label">Notes</span>
      <textarea class="input" name="notes" rows="2">${escapeHtml(g?.notes || '')}</textarea></label>
    ${
      g
        ? `<label class="field field--checkbox">
            <input type="checkbox" name="isActive" value="1" ${g.isActive !== false ? 'checked' : ''} />
            <span>Active</span>
          </label>`
        : ''
    }
  `;
}

/** @param {FormData} fd */
function readGoalForm(fd) {
  return {
    name: String(fd.get('name') || ''),
    category: String(fd.get('category') || ''),
    targetAmount: Number(fd.get('targetAmount') || 0),
    currentAmount: Number(fd.get('currentAmount') || 0),
    linkedLedgerId: String(fd.get('linkedLedgerId') || '') || null,
    targetDate: String(fd.get('targetDate') || '') || null,
    notes: String(fd.get('notes') || ''),
    isActive: fd.has('isActive') ? fd.get('isActive') === '1' : true,
  };
}
