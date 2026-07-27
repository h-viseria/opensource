/**
 * Ledgers — list / create / edit / delete.
 */

import * as bookService from '../../services/bookService.js';
import * as coaService from '../../services/coaService.js';
import { CSV_LABELS, CSV_SAMPLES, importLedgers } from '../../services/csvBulkImport.js';
import { showToast } from '../toast.js';
import { confirmModal, formModal, escapeHtml } from '../modal.js';
import { csvImportPanelHtml, wireCsvImport } from '../csvImport.js';

/**
 * @param {import('../../core/router.js').RouteContext} ctx
 * @param {HTMLElement} outlet
 */
export async function renderLedgers(ctx, outlet) {
  const { book } = await bookService.getSessionContext();
  if (!book) {
    outlet.innerHTML = `<p class="muted">No active book.</p>`;
    return;
  }

  await coaService.ensureChartOfAccounts(book.id);
  const [ledgers, groupOptions, groups] = await Promise.all([
    coaService.listLedgers(book.id),
    coaService.listGroupOptions(book.id),
    coaService.listGroups(book.id),
  ]);

  const groupById = new Map(groups.map((g) => [g.id, g]));
  const q = (ctx.query.q || '').trim().toLowerCase();
  const highlightId = ctx.query.id || '';

  const filtered = q
    ? ledgers.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          (l.code || '').toLowerCase().includes(q) ||
          (groupById.get(l.groupId)?.name || '').toLowerCase().includes(q)
      )
    : ledgers;

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/masters">Masters</a> / Ledgers</p>
        <h1 class="page-header__title">Ledgers</h1>
        <p class="page-header__desc">Accounts used for voucher postings. Opening balances are carried into the financial year.</p>
      </div>
      <div class="page-header__actions">
        <button type="button" class="btn btn--primary" id="btn-new-ledger">New ledger</button>
      </div>
    </div>

    ${csvImportPanelHtml()}

    <div class="toolbar">
      <form class="toolbar__search" id="form-search" action="#">
        <input class="input" name="q" type="search" placeholder="Search ledgers…" value="${escapeHtml(ctx.query.q || '')}" />
      </form>
      <a class="btn btn--secondary btn--sm" href="#/masters/chart">View chart</a>
    </div>

    <div class="list">
      ${filtered.length === 0
        ? `<div class="panel empty-state"><p class="muted">No ledgers match.</p></div>`
        : filtered
            .map((led) => {
              const grp = groupById.get(led.groupId);
              const highlight = led.id === highlightId ? ' list-item--highlight' : '';
              const opening =
                led.openingBalance && led.openingBalance !== 0
                  ? ` · Opening ${led.openingBalanceType === 'credit' ? 'Cr' : 'Dr'} ${formatAmt(led.openingBalance)}`
                  : '';
              return `
                <div class="list-item${highlight}" data-ledger-id="${led.id}" id="ledger-${led.id}">
                  <div class="list-item__body">
                    <div class="list-item__title">
                      ${escapeHtml(led.name)}
                      <span class="badge badge--muted" style="margin-left:0.4rem">${escapeHtml(led.nature)}</span>
                      ${led.isSystem ? '<span class="badge badge--info">System</span>' : ''}
                      ${!led.isActive ? '<span class="badge badge--warning">Inactive</span>' : ''}
                    </div>
                    <div class="list-item__meta">
                      ${led.code ? `<span class="mono">${escapeHtml(led.code)}</span> · ` : ''}
                      ${grp ? escapeHtml(grp.name) : '—'}
                      ${opening}
                    </div>
                  </div>
                  <div class="list-item__actions">
                    <button type="button" class="btn btn--secondary btn--sm" data-action="edit">Edit</button>
                    ${led.isSystem ? '' : '<button type="button" class="btn btn--ghost btn--sm" data-action="delete">Delete</button>'}
                  </div>
                </div>`;
            })
            .join('')}
    </div>
  `;

  if (highlightId) {
    const el = outlet.querySelector(`[data-ledger-id="${highlightId}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  outlet.querySelector('#form-search')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(/** @type {HTMLFormElement} */ (e.target));
    const query = String(fd.get('q') || '').trim();
    location.hash = query ? `#/masters/ledgers?q=${encodeURIComponent(query)}` : '#/masters/ledgers';
  });

  outlet.querySelector('#btn-new-ledger')?.addEventListener('click', async () => {
    const fd = await formModal({
      title: 'New ledger',
      confirmLabel: 'Create',
      fieldsHtml: ledgerFieldsHtml(groupOptions, null),
    });
    if (!fd) return;
    try {
      await coaService.createLedger({
        bookId: book.id,
        groupId: String(fd.get('groupId') || ''),
        name: String(fd.get('name') || ''),
        code: String(fd.get('code') || ''),
        openingBalance: Number(fd.get('openingBalance') || 0),
        openingBalanceType: /** @type {'debit'|'credit'} */ (fd.get('openingBalanceType') || 'debit'),
        notes: String(fd.get('notes') || ''),
      });
      showToast('Ledger created', 'success');
      await renderLedgers(ctx, outlet);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not create ledger', 'error');
    }
  });

  outlet.querySelectorAll('[data-ledger-id]').forEach((row) => {
    const id = row.getAttribute('data-ledger-id');
    if (!id) return;

    row.querySelector('[data-action="edit"]')?.addEventListener('click', async () => {
      const ledger = await coaService.getLedger(id);
      if (!ledger) return;
      const fd = await formModal({
        title: 'Edit ledger',
        confirmLabel: 'Save',
        fieldsHtml: ledgerFieldsHtml(groupOptions, ledger),
      });
      if (!fd) return;
      try {
        await coaService.updateLedger(id, {
          name: String(fd.get('name') || ''),
          code: String(fd.get('code') || ''),
          groupId: String(fd.get('groupId') || ''),
          openingBalance: Number(fd.get('openingBalance') || 0),
          openingBalanceType: /** @type {'debit'|'credit'} */ (fd.get('openingBalanceType') || 'debit'),
          notes: String(fd.get('notes') || ''),
          isActive: fd.get('isActive') === '1',
        });
        showToast('Ledger updated', 'success');
        await renderLedgers(ctx, outlet);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Could not update ledger', 'error');
      }
    });

    row.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
      const ledger = await coaService.getLedger(id);
      if (!ledger) return;
      const ok = await confirmModal({
        title: 'Delete ledger?',
        danger: true,
        confirmLabel: 'Delete',
        bodyHtml: `<p>Delete ledger <strong>${escapeHtml(ledger.name)}</strong>?</p>`,
      });
      if (!ok) return;
      try {
        await coaService.deleteLedger(id);
        showToast('Ledger deleted', 'success');
        await renderLedgers(ctx, outlet);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Could not delete ledger', 'error');
      }
    });
  });

  wireCsvImport(outlet, {
    labels: CSV_LABELS.ledgers,
    sampleRows: CSV_SAMPLES.ledgers,
    fileName: 'ledgers_template.csv',
    onRows: (rows) => importLedgers(book.id, rows),
    onDone: async (result) => {
      if (result.created > 0) await renderLedgers(ctx, outlet);
    },
  });
}

/**
 * @param {{ id: string, label: string }[]} groupOptions
 * @param {import('../../models/types.js').Ledger|null} ledger
 */
function ledgerFieldsHtml(groupOptions, ledger) {
  // Prefer non-primary (leaf-ish) groups first in the list — already sorted by label
  const opts = groupOptions
    .map(
      (o) =>
        `<option value="${o.id}" ${ledger?.groupId === o.id ? 'selected' : ''}>${escapeHtml(o.label)}</option>`
    )
    .join('');

  const obType = ledger?.openingBalanceType || 'debit';

  return `
    <div class="form">
      <div class="field">
        <label class="field__label" for="l-name">Name</label>
        <input class="input" id="l-name" name="name" required maxlength="120" value="${escapeHtml(ledger?.name || '')}" />
      </div>
      <div class="field">
        <label class="field__label" for="l-group">Group</label>
        <select class="select" id="l-group" name="groupId" required>${opts}</select>
      </div>
      <div class="form-row form-row--2">
        <div class="field">
          <label class="field__label" for="l-code">Code</label>
          <input class="input" id="l-code" name="code" maxlength="32" value="${escapeHtml(ledger?.code || '')}" />
        </div>
        <div class="field">
          <label class="field__label" for="l-ob">Opening balance</label>
          <input class="input" id="l-ob" name="openingBalance" type="number" step="0.01" value="${ledger?.openingBalance ?? 0}" />
        </div>
      </div>
      <div class="form-row form-row--2">
        <div class="field">
          <label class="field__label" for="l-ob-type">Opening type</label>
          <select class="select" id="l-ob-type" name="openingBalanceType">
            <option value="debit" ${obType === 'debit' ? 'selected' : ''}>Debit</option>
            <option value="credit" ${obType === 'credit' ? 'selected' : ''}>Credit</option>
          </select>
        </div>
        ${
          ledger
            ? `<div class="field">
                 <label class="field__label" for="l-active">Status</label>
                 <select class="select" id="l-active" name="isActive">
                   <option value="1" ${ledger.isActive ? 'selected' : ''}>Active</option>
                   <option value="0" ${!ledger.isActive ? 'selected' : ''}>Inactive</option>
                 </select>
               </div>`
            : '<div></div>'
        }
      </div>
      <div class="field">
        <label class="field__label" for="l-notes">Notes</label>
        <textarea class="textarea" id="l-notes" name="notes" maxlength="500">${escapeHtml(ledger?.notes || '')}</textarea>
      </div>
    </div>`;
}

function formatAmt(n) {
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
