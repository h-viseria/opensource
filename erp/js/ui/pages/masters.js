/**
 * Masters hub — Chart of Accounts entry points.
 */

import * as bookService from '../../services/bookService.js';
import * as coaService from '../../services/coaService.js';
import { escapeHtml } from '../modal.js';
import { NATURE_ORDER } from '../../core/accountTypes.js';

/**
 * @param {import('../../core/router.js').RouteContext} _ctx
 * @param {HTMLElement} outlet
 */
export async function renderMasters(_ctx, outlet) {
  const { book } = await bookService.getSessionContext();
  if (!book) {
    outlet.innerHTML = `<p class="muted">No active book.</p>`;
    return;
  }

  await coaService.ensureChartOfAccounts(book.id);
  const tree = await coaService.getChartTree(book.id);

  const natureCards = NATURE_ORDER.map((n) => {
    const s = tree.stats.byNature[n] || { groups: 0, ledgers: 0 };
    return `
      <div class="stat-tile">
        <div class="stat-tile__label">${escapeHtml(n)}</div>
        <div class="stat-tile__value mono">${s.ledgers}</div>
        <div class="stat-tile__hint">${s.groups} primary group${s.groups === 1 ? '' : 's'}</div>
      </div>`;
  }).join('');

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-header__title">Masters</h1>
        <p class="page-header__desc">
          Chart of accounts for <strong>${escapeHtml(book.name)}</strong>.
          Groups organise ledgers; all vouchers post to ledgers.
        </p>
      </div>
    </div>

    <div class="stat-grid">${natureCards}</div>

    <div class="master-grid">
      <a class="master-card" href="#/masters/chart">
        <div class="master-card__icon" aria-hidden="true">▦</div>
        <div class="master-card__title">Chart of Accounts</div>
        <div class="master-card__desc">Hierarchical view of groups and ledgers</div>
        <div class="master-card__meta mono">${tree.stats.groups} groups · ${tree.stats.ledgers} ledgers</div>
      </a>
      <a class="master-card" href="#/masters/groups">
        <div class="master-card__icon" aria-hidden="true">☰</div>
        <div class="master-card__title">Ledger Groups</div>
        <div class="master-card__desc">Create and organise account groups</div>
      </a>
      <a class="master-card" href="#/masters/ledgers">
        <div class="master-card__icon" aria-hidden="true">≡</div>
        <div class="master-card__title">Ledgers</div>
        <div class="master-card__desc">Individual accounts for posting</div>
      </a>
      <a class="master-card" href="#/masters/gnucash-import">
        <div class="master-card__icon" aria-hidden="true">⇩</div>
        <div class="master-card__title">GNUCash Import/Export</div>
        <div class="master-card__desc">Import or export accounts + transactions CSV (GNUCash format)</div>
      </a>
    </div>
  `;
}
