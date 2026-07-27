/**
 * Ledger Groups — list / create / edit / delete.
 */

import * as bookService from '../../services/bookService.js';
import * as coaService from '../../services/coaService.js';
import { CSV_LABELS, CSV_SAMPLES, importGroups } from '../../services/csvBulkImport.js';
import { ACCOUNT_NATURES, NATURE_ORDER } from '../../core/accountTypes.js';
import { showToast } from '../toast.js';
import { confirmModal, formModal, escapeHtml } from '../modal.js';
import { csvImportPanelHtml, wireCsvImport } from '../csvImport.js';

/**
 * @param {import('../../core/router.js').RouteContext} ctx
 * @param {HTMLElement} outlet
 */
export async function renderLedgerGroups(ctx, outlet) {
  const { book } = await bookService.getSessionContext();
  if (!book) {
    outlet.innerHTML = `<p class="muted">No active book.</p>`;
    return;
  }

  await coaService.ensureChartOfAccounts(book.id);
  const [groups, options] = await Promise.all([
    coaService.listGroups(book.id),
    coaService.listGroupOptions(book.id),
  ]);

  const filterNature = ctx.query.nature || '';
  const filtered = filterNature
    ? groups.filter((g) => g.nature === filterNature)
    : groups;

  const byId = new Map(groups.map((g) => [g.id, g]));

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/masters">Masters</a> / Ledger Groups</p>
        <h1 class="page-header__title">Ledger Groups</h1>
        <p class="page-header__desc">Organise accounts under Assets, Liabilities, Equity, Income, and Expense.</p>
      </div>
      <div class="page-header__actions">
        <button type="button" class="btn btn--primary" id="btn-new-group">New group</button>
      </div>
    </div>

    ${csvImportPanelHtml()}

    <div class="toolbar">
      <div class="toolbar__filters">
        <a class="chip ${!filterNature ? 'is-active' : ''}" href="#/masters/groups">All</a>
        ${NATURE_ORDER.map(
          (n) =>
            `<a class="chip ${filterNature === n ? 'is-active' : ''}" href="#/masters/groups?nature=${encodeURIComponent(n)}">${escapeHtml(n)}</a>`
        ).join('')}
      </div>
      <a class="btn btn--secondary btn--sm" href="#/masters/chart">View chart</a>
    </div>

    <div class="list">
      ${filtered.length === 0
        ? `<div class="panel empty-state"><p class="muted">No groups in this filter.</p></div>`
        : filtered
            .map((g) => {
              const parent = g.parentId ? byId.get(g.parentId) : null;
              return `
                <div class="list-item" data-group-id="${g.id}">
                  <div class="list-item__body">
                    <div class="list-item__title">
                      ${escapeHtml(g.name)}
                      <span class="badge badge--muted" style="margin-left:0.4rem">${escapeHtml(g.nature)}</span>
                      ${g.isSystem ? '<span class="badge badge--info">System</span>' : ''}
                      ${g.isPrimary ? '<span class="badge badge--success">Primary</span>' : ''}
                    </div>
                    <div class="list-item__meta">
                      ${g.code ? `<span class="mono">${escapeHtml(g.code)}</span> · ` : ''}
                      ${parent ? `Under ${escapeHtml(parent.name)}` : 'Top-level group'}
                    </div>
                  </div>
                  <div class="list-item__actions">
                    <button type="button" class="btn btn--secondary btn--sm" data-action="edit">Edit</button>
                    ${g.isSystem ? '' : '<button type="button" class="btn btn--ghost btn--sm" data-action="delete">Delete</button>'}
                  </div>
                </div>`;
            })
            .join('')}
    </div>
  `;

  outlet.querySelector('#btn-new-group')?.addEventListener('click', async () => {
    const fd = await formModal({
      title: 'New ledger group',
      confirmLabel: 'Create',
      fieldsHtml: groupFieldsHtml(options, null),
    });
    if (!fd) return;
    try {
      await coaService.createGroup({
        bookId: book.id,
        name: String(fd.get('name') || ''),
        code: String(fd.get('code') || ''),
        nature: String(fd.get('nature') || ACCOUNT_NATURES.ASSET),
        parentId: String(fd.get('parentId') || '') || null,
      });
      showToast('Group created', 'success');
      await renderLedgerGroups(ctx, outlet);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not create group', 'error');
    }
  });

  outlet.querySelectorAll('[data-group-id]').forEach((row) => {
    const id = row.getAttribute('data-group-id');
    if (!id) return;

    row.querySelector('[data-action="edit"]')?.addEventListener('click', async () => {
      const group = await coaService.getGroup(id);
      if (!group) return;
      const fd = await formModal({
        title: 'Edit group',
        confirmLabel: 'Save',
        fieldsHtml: groupFieldsHtml(
          options.filter((o) => o.id !== id),
          group
        ),
      });
      if (!fd) return;
      try {
        await coaService.updateGroup(id, {
          name: String(fd.get('name') || ''),
          code: String(fd.get('code') || ''),
          parentId: String(fd.get('parentId') || '') || null,
          nature: String(fd.get('nature') || group.nature),
        });
        showToast('Group updated', 'success');
        await renderLedgerGroups(ctx, outlet);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Could not update group', 'error');
      }
    });

    row.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
      const group = await coaService.getGroup(id);
      if (!group) return;
      const ok = await confirmModal({
        title: 'Delete group?',
        danger: true,
        confirmLabel: 'Delete',
        bodyHtml: `<p>Delete group <strong>${escapeHtml(group.name)}</strong>?</p>`,
      });
      if (!ok) return;
      try {
        await coaService.deleteGroup(id);
        showToast('Group deleted', 'success');
        await renderLedgerGroups(ctx, outlet);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Could not delete group', 'error');
      }
    });
  });

  wireCsvImport(outlet, {
    labels: CSV_LABELS.groups,
    sampleRows: CSV_SAMPLES.groups,
    fileName: 'groups_template.csv',
    onRows: (rows) => importGroups(book.id, rows),
    onDone: async (result) => {
      if (result.created > 0) await renderLedgerGroups(ctx, outlet);
    },
  });
}

/**
 * @param {{ id: string, label: string, nature: string }[]} options
 * @param {import('../../models/types.js').LedgerGroup|null} group
 */
function groupFieldsHtml(options, group) {
  const natureOpts = NATURE_ORDER.map(
    (n) =>
      `<option value="${n}" ${group?.nature === n || (!group && n === ACCOUNT_NATURES.ASSET) ? 'selected' : ''}>${n}</option>`
  ).join('');

  const parentOpts = [
    `<option value="">— None (primary group) —</option>`,
    ...options.map(
      (o) =>
        `<option value="${o.id}" ${group?.parentId === o.id ? 'selected' : ''}>${escapeHtml(o.label)}</option>`
    ),
  ].join('');

  const lockNature = Boolean(group?.isSystem && group?.isPrimary);

  return `
    <div class="form">
      <div class="field">
        <label class="field__label" for="g-name">Name</label>
        <input class="input" id="g-name" name="name" required maxlength="120" value="${escapeHtml(group?.name || '')}" />
      </div>
      <div class="form-row form-row--2">
        <div class="field">
          <label class="field__label" for="g-code">Code</label>
          <input class="input" id="g-code" name="code" maxlength="32" value="${escapeHtml(group?.code || '')}" />
        </div>
        <div class="field">
          <label class="field__label" for="g-nature">Nature</label>
          <select class="select" id="g-nature" name="nature" ${lockNature ? 'disabled' : ''}>${natureOpts}</select>
          ${lockNature ? `<input type="hidden" name="nature" value="${escapeHtml(group.nature)}" />` : ''}
          <span class="field__hint">Inherited from parent when nested</span>
        </div>
      </div>
      <div class="field">
        <label class="field__label" for="g-parent">Parent group</label>
        <select class="select" id="g-parent" name="parentId">${parentOpts}</select>
      </div>
    </div>`;
}
