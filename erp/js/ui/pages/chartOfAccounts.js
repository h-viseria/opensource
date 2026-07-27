/**
 * Chart of Accounts — expandable tree view + CSV load.
 */

import * as bookService from '../../services/bookService.js';
import * as coaService from '../../services/coaService.js';
import {
  CSV_LABELS,
  CSV_SAMPLES,
  importChartOfAccounts,
} from '../../services/csvBulkImport.js';
import { escapeHtml } from '../modal.js';
import { showToast } from '../toast.js';
import { csvImportPanelHtml, wireCsvImport } from '../csvImport.js';

/**
 * @param {import('../../core/router.js').RouteContext} _ctx
 * @param {HTMLElement} outlet
 */
export async function renderChartOfAccounts(_ctx, outlet) {
  const { book } = await bookService.getSessionContext();
  if (!book) {
    outlet.innerHTML = `<p class="muted">No active book.</p>`;
    return;
  }

  await coaService.ensureChartOfAccounts(book.id);
  const { roots, stats } = await coaService.getChartTree(book.id);

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/masters">Masters</a> / Chart of Accounts</p>
        <h1 class="page-header__title">Chart of Accounts</h1>
        <p class="page-header__desc">
          ${stats.groups} groups · ${stats.ledgers} ledgers. Expand a group to see accounts.
        </p>
      </div>
      <div class="page-header__actions">
        <a class="btn btn--secondary" href="#/masters/groups">Groups</a>
        <a class="btn btn--primary" href="#/masters/ledgers">Ledgers</a>
      </div>
    </div>

    ${csvImportPanelHtml({
      title: 'Load chart via CSV',
      hint:
        'Download the template and set Kind to Group or Ledger on each row. Groups are imported first (use Parent group for nesting), then ledgers (set Group to the parent group name). Column order does not matter — labels must match exactly.',
    })}

    <div class="panel coa-panel">
      ${
        roots.length === 0
          ? `<div class="empty-state">
             <div class="empty-state__icon">▦</div>
             <h2 class="empty-state__title">No accounts yet</h2>
             <p class="empty-state__desc">
               Upload a CSV above, or seed the built-in default template.
             </p>
             <button type="button" class="btn btn--primary" id="btn-seed-coa">Load default chart</button>
           </div>`
          : `<div class="coa-tree" id="coa-tree">${roots.map((n) => renderNode(n, 0)).join('')}</div>`
      }
    </div>
  `;

  wireCsvImport(outlet, {
    labels: CSV_LABELS.chartOfAccounts,
    sampleRows: CSV_SAMPLES.chartOfAccounts,
    fileName: 'chart_of_accounts_template.csv',
    onRows: (rows) => importChartOfAccounts(book.id, rows),
    onDone: async (result) => {
      if (result.created > 0) await renderChartOfAccounts(_ctx, outlet);
    },
  });

  outlet.querySelector('#btn-seed-coa')?.addEventListener('click', async () => {
    try {
      const result = await coaService.seedDefaultChartOfAccounts(book.id);
      showToast(`Seeded ${result.groups} groups, ${result.ledgers} ledgers`, 'success');
      await renderChartOfAccounts(_ctx, outlet);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Seed failed', 'error');
    }
  });

  outlet.querySelectorAll('[data-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-toggle');
      const body = outlet.querySelector(`[data-node-body="${id}"]`);
      const row = btn.closest('.coa-row');
      if (!body || !row) return;
      const open = body.hasAttribute('hidden');
      if (open) {
        body.removeAttribute('hidden');
        row.classList.add('is-open');
        btn.setAttribute('aria-expanded', 'true');
      } else {
        body.setAttribute('hidden', '');
        row.classList.remove('is-open');
        btn.setAttribute('aria-expanded', 'false');
      }
    });
  });
}

/**
 * @param {{ type: string, group: import('../../models/types.js').LedgerGroup, children: any[], ledgers: import('../../models/types.js').Ledger[] }} node
 * @param {number} depth
 */
function renderNode(node, depth) {
  const g = node.group;
  const hasKids = node.children.length > 0 || node.ledgers.length > 0;
  const pad = depth * 1.25;
  const ledgerTotal = countLedgers(node);

  const childHtml = [
    ...node.children.map((c) => renderNode(c, depth + 1)),
    ...node.ledgers.map((led) => renderLedger(led, depth + 1)),
  ].join('');

  return `
    <div class="coa-node">
      <div class="coa-row coa-row--group ${g.isPrimary ? 'coa-row--primary' : ''} ${hasKids ? 'is-open' : ''}" style="padding-left:${pad}rem">
        ${
          hasKids
            ? `<button type="button" class="coa-toggle" data-toggle="${g.id}" aria-expanded="true" aria-label="Toggle">▾</button>`
            : `<span class="coa-toggle coa-toggle--spacer"></span>`
        }
        <span class="coa-kind badge badge--muted">${escapeHtml(g.nature)}</span>
        <span class="coa-name">${escapeHtml(g.name)}</span>
        ${g.code ? `<span class="coa-code mono faint">${escapeHtml(g.code)}</span>` : ''}
        ${g.isSystem ? `<span class="badge badge--info">System</span>` : ''}
        <span class="coa-count faint">${ledgerTotal} ledger${ledgerTotal === 1 ? '' : 's'}</span>
      </div>
      ${hasKids ? `<div data-node-body="${g.id}">${childHtml}</div>` : ''}
    </div>`;
}

function countLedgers(node) {
  let n = (node.ledgers || []).length;
  for (const c of node.children || []) n += countLedgers(c);
  return n;
}

/**
 * @param {import('../../models/types.js').Ledger} led
 * @param {number} depth
 */
function renderLedger(led, depth) {
  const pad = depth * 1.25;
  const opening =
    led.openingBalance && led.openingBalance !== 0
      ? `${led.openingBalanceType === 'credit' ? 'Cr' : 'Dr'} ${formatAmt(led.openingBalance)}`
      : '';

  return `
    <div class="coa-row coa-row--ledger" style="padding-left:${pad}rem">
      <span class="coa-toggle coa-toggle--spacer"></span>
      <span class="coa-kind badge badge--success">Ledger</span>
      <a class="coa-name" href="#/masters/ledgers?id=${encodeURIComponent(led.id)}">${escapeHtml(led.name)}</a>
      ${led.code ? `<span class="coa-code mono faint">${escapeHtml(led.code)}</span>` : ''}
      ${!led.isActive ? `<span class="badge badge--warning">Inactive</span>` : ''}
      ${opening ? `<span class="coa-opening mono faint">${opening}</span>` : ''}
    </div>`;
}

function formatAmt(n) {
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
