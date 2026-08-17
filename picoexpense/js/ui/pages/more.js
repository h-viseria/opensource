import { NAV_GROUPS } from '../layout.js';
import { escapeHtml } from '../../utils/html.js';
import { listTransactions, restoreTransaction, permanentlyDeleteTransaction, emptyTrash } from '../../services/transactionService.js';
import { money } from '../../utils/format.js';
import { confirmModal } from '../modal.js';
import { showToast } from '../toast.js';

export async function renderMore() {
  const outlet = document.getElementById('outlet');
  outlet.innerHTML = `
    <section class="page">
      <h2>More</h2>
      <p class="lede">Accounts, reports, backup, and settings.</p>
      ${NAV_GROUPS.filter((g) => g.items.length)
        .map(
          (g) => `
        <h3 class="filter-panel__title">${escapeHtml(g.label)}</h3>
        <nav class="more-nav">${g.items
          .map((n) => `<a class="nav-link" href="${n.href}">${escapeHtml(n.label)}</a>`)
          .join('')}</nav>`
        )
        .join('')}
    </section>
  `;
}

export async function renderTrash() {
  const outlet = document.getElementById('outlet');
  const rows = (await listTransactions({ includeDeleted: true })).filter((t) => t.deletedAt);
  outlet.innerHTML = `
    <section class="page">
      <div class="page-head"><h2>Trash</h2>
        <button type="button" class="btn btn--danger" id="empty">Empty trash</button></div>
      <ul>${rows
        .map(
          (t) => `<li>${escapeHtml(t.date)} ${escapeHtml(t.description || t.type)} ${money(t.amountMinor, t.currency)}
            <button type="button" class="btn btn--ghost btn--sm" data-rest="${t.id}">Restore</button>
            <button type="button" class="btn btn--ghost btn--sm" data-del="${t.id}">Delete forever</button></li>`
        )
        .join('') || '<li class="muted">Trash is empty</li>'}</ul>
    </section>
  `;
  outlet.querySelector('#empty')?.addEventListener('click', async () => {
    if (!(await confirmModal({ title: 'Empty trash?', bodyHtml: '<p>Permanent.</p>', danger: true }))) return;
    await emptyTrash();
    renderTrash();
  });
  outlet.querySelectorAll('[data-rest]').forEach((b) =>
    b.addEventListener('click', async () => {
      await restoreTransaction(b.getAttribute('data-rest'));
      showToast('Restored', 'success');
      renderTrash();
    })
  );
  outlet.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!(await confirmModal({ title: 'Delete forever?', bodyHtml: '<p>Receipts stay unless you delete them separately.</p>', danger: true }))) return;
      await permanentlyDeleteTransaction(b.getAttribute('data-del'));
      renderTrash();
    })
  );
}

export async function renderNotFound() {
  const outlet = document.getElementById('outlet');
  outlet.innerHTML = `<section class="page"><h2>Not found</h2><a href="#/home">Home</a></section>`;
}
