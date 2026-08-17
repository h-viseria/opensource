import { softDeleteTransaction, duplicateTransaction, bulkUpdate, bulkDelete } from '../../services/transactionService.js';
import { listAccounts } from '../../services/accountService.js';
import { listCategories } from '../../services/categoryService.js';
import { listMerchants } from '../../services/masterService.js';
import { filterTransactions } from '../../services/reportingService.js';
import { money } from '../../utils/format.js';
import { escapeHtml } from '../../utils/html.js';
import { formatDisplayDate } from '../../utils/date.js';
import { confirmModal } from '../modal.js';
import { showToast } from '../toast.js';
import { TXN_TYPES } from '../../core/constants.js';
import { savedFilterRepository } from '../../repositories/index.js';
import { uuid } from '../../core/uuid.js';

const PAGE_SIZE = 10;

const TYPE_LABELS = {
  [TXN_TYPES.EXPENSE]: 'Expense',
  [TXN_TYPES.INCOME]: 'Income',
  [TXN_TYPES.TRANSFER]: 'Transfer',
  [TXN_TYPES.REFUND]: 'Refund',
  [TXN_TYPES.REIMBURSEMENT]: 'Reimbursement',
  [TXN_TYPES.ADJUSTMENT]: 'Adjustment',
  [TXN_TYPES.CASH_WITHDRAWAL]: 'Cash withdrawal',
  [TXN_TYPES.CASH_DEPOSIT]: 'Cash deposit',
  [TXN_TYPES.CREDIT_CARD_PAYMENT]: 'Credit card payment',
};

export async function renderTransactions(ctx) {
  const outlet = document.getElementById('outlet');
  const [accounts, cats, merchants] = await Promise.all([
    listAccounts({ includeInactive: true }),
    listCategories({ includeArchived: true }),
    listMerchants(),
  ]);
  const filters = {
    start: ctx.query.start || '',
    end: ctx.query.end || '',
    accountId: ctx.query.accountId || '',
    categoryId: ctx.query.categoryId || '',
    type: ctx.query.type || '',
    q: ctx.query.q || '',
  };
  const filtered = Boolean(filters.start || filters.end || filters.accountId || filters.categoryId || filters.type || filters.q);
  let rows = await filterTransactions(filters);
  if (filters.q) {
    const q = filters.q.toLowerCase();
    rows = rows.filter((t) => `${t.description} ${t.notes}`.toLowerCase().includes(q));
  }
  const a = Object.fromEntries(accounts.map((x) => [x.id, x]));
  const c = Object.fromEntries(cats.map((x) => [x.id, x.name]));
  const m = Object.fromEntries(merchants.map((x) => [x.id, x.name]));
  const page = Math.max(0, Number(ctx.query.page || 0));
  const slice = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const showingFrom = rows.length ? page * PAGE_SIZE + 1 : 0;
  const showingTo = page * PAGE_SIZE + slice.length;

  outlet.innerHTML = `
    <section class="page">
      <div class="page-head">
        <div>
          <h2>Transactions</h2>
          <p class="lede">This list is for looking up activity already saved. To record a new expense, income, or transfer, use Add transaction.</p>
        </div>
        <a class="btn btn--primary" href="#/add">Add transaction</a>
      </div>

      <h3 class="section-title">Latest ${PAGE_SIZE}</h3>
      <p class="muted">${
        rows.length
          ? `Showing ${showingFrom}–${showingTo} of ${rows.length}, newest first. Open a row to edit it.`
          : filtered
            ? 'Nothing matches these filters. Clear them, or add a transaction.'
            : 'Nothing recorded yet. Add transaction to create the first one.'
      }</p>
      <div class="bulk-bar" hidden>
        <button type="button" class="btn btn--ghost" data-bulk="delete">Delete</button>
        <button type="button" class="btn btn--ghost" data-bulk="reimb">Mark reimbursable</button>
      </div>
      <ul class="txn-list">
        ${slice
          .map((t) => {
            const kind =
              t.type === 'INCOME' || t.type === 'REIMBURSEMENT'
                ? 'in'
                : t.type.includes('TRANSFER') ||
                    t.type === 'CREDIT_CARD_PAYMENT' ||
                    t.type === 'CASH_WITHDRAWAL' ||
                    t.type === 'CASH_DEPOSIT'
                  ? 'xfer'
                  : 'out';
            return `<li class="txn-row txn-row--${kind}">
              <label class="sr-only"><input type="checkbox" data-id="${t.id}" /> Select</label>
              <a href="#/transactions/${t.id}">
                <span class="txn-row__date">${formatDisplayDate(t.date)}</span>
                <span class="txn-row__who">${escapeHtml(m[t.merchantId] || t.description || TYPE_LABELS[t.type] || t.type)}</span>
                <span class="txn-row__meta">${escapeHtml(c[t.subcategoryId] || c[t.categoryId] || '—')} · ${escapeHtml(a[t.accountId]?.name || '')}</span>
                <span class="txn-row__amt">${money(t.amountMinor, t.currency)}</span>
              </a>
              <button type="button" class="btn btn--ghost btn--sm" data-dup="${t.id}" aria-label="Duplicate">⧉</button>
              <button type="button" class="btn btn--ghost btn--sm" data-del="${t.id}" aria-label="Delete">✕</button>
            </li>`;
          })
          .join('') || '<li class="muted">No transactions yet.</li>'}
      </ul>
      <p class="form-actions">
        ${page > 0 ? `<a class="btn btn--ghost" href="#/transactions?${pageQuery(ctx.query, page - 1)}">Newer</a>` : ''}
        ${showingTo < rows.length ? `<a class="btn btn--secondary" href="#/transactions?${pageQuery(ctx.query, page + 1)}">Show older</a>` : ''}
      </p>

      <details class="filter-panel" id="filter-panel" ${filtered ? 'open' : ''}>
        <summary class="filter-panel__title">Narrow this list</summary>
        <p class="muted">Optional. Leave dates empty to keep showing the latest activity.</p>
        <form id="filters">
          <div class="field-row">
            <div class="field">
              <label class="field__label" for="f-start">From date</label>
              <input class="input" id="f-start" name="start" type="date" value="${escapeHtml(filters.start)}" />
              <p class="field__hint">Earliest day to include. Not the date of a new entry.</p>
            </div>
            <div class="field">
              <label class="field__label" for="f-end">To date</label>
              <input class="input" id="f-end" name="end" type="date" value="${escapeHtml(filters.end)}" />
              <p class="field__hint">Latest day to include. Use with From date to pick a range.</p>
            </div>
          </div>
          <div class="field-row">
            <div class="field">
              <label class="field__label" for="f-account">Account</label>
              <select class="input" id="f-account" name="accountId">
                <option value="">All accounts</option>
                ${accounts.map((x) => `<option value="${x.id}" ${x.id === filters.accountId ? 'selected' : ''}>${escapeHtml(x.name)}</option>`).join('')}
              </select>
              <p class="field__hint">Wallet, bank, or card the money moved through.</p>
            </div>
            <div class="field">
              <label class="field__label" for="f-cat">Category</label>
              <select class="input" id="f-cat" name="categoryId">
                <option value="">All categories</option>
                ${cats.map((x) => `<option value="${x.id}" ${x.id === filters.categoryId ? 'selected' : ''}>${escapeHtml(x.name)}</option>`).join('')}
              </select>
              <p class="field__hint">Spending or income group, such as Groceries.</p>
            </div>
          </div>
          <div class="field-row">
            <div class="field">
              <label class="field__label" for="f-type">Type</label>
              <select class="input" id="f-type" name="type">
                <option value="">All types</option>
                ${Object.keys(TXN_TYPES)
                  .map(
                    (t) =>
                      `<option value="${t}" ${t === filters.type ? 'selected' : ''}>${escapeHtml(TYPE_LABELS[t] || t)}</option>`
                  )
                  .join('')}
              </select>
              <p class="field__hint">Expense, income, transfer, and similar kinds.</p>
            </div>
            <div class="field">
              <label class="field__label" for="f-q">Contains text</label>
              <input class="input" id="f-q" name="q" type="search" value="${escapeHtml(filters.q)}" placeholder="Merchant, notes…" />
              <p class="field__hint">Match description or notes.</p>
            </div>
          </div>
          <div class="form-actions">
            <button class="btn btn--secondary" type="submit">Apply filters</button>
            ${filtered ? '<a class="btn btn--ghost" href="#/transactions">Clear filters</a>' : ''}
            <button class="btn btn--ghost" type="button" id="save-filter">Save this filter</button>
          </div>
        </form>
      </details>
    </section>
  `;

  outlet.querySelector('#filters')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const q = new URLSearchParams();
    for (const [k, v] of fd.entries()) if (v) q.set(k, String(v));
    location.hash = '#/transactions' + (q.toString() ? `?${q}` : '');
  });
  outlet.querySelector('#save-filter')?.addEventListener('click', async () => {
    await savedFilterRepository.put({ id: uuid(), name: 'Saved filter', filters, createdAt: new Date().toISOString() });
    showToast('Filter saved', 'success');
  });
  outlet.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = await confirmModal({ title: 'Delete transaction?', bodyHtml: '<p>Moves to trash.</p>', danger: true, confirmLabel: 'Delete' });
      if (!ok) return;
      await softDeleteTransaction(btn.getAttribute('data-del'));
      showToast('Moved to trash', 'success');
      renderTransactions(ctx);
    });
  });
  outlet.querySelectorAll('[data-dup]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const rec = await duplicateTransaction(btn.getAttribute('data-dup'));
      location.hash = '#/transactions/' + rec.id;
    });
  });
  const bar = outlet.querySelector('.bulk-bar');
  const updateBar = () => {
    const ids = [...outlet.querySelectorAll('input[data-id]:checked')].map((el) => el.getAttribute('data-id'));
    bar.hidden = ids.length === 0;
    bar.dataset.ids = ids.join(',');
  };
  outlet.querySelectorAll('input[data-id]').forEach((el) => el.addEventListener('change', updateBar));
  bar?.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-bulk]')?.getAttribute('data-bulk');
    const ids = (bar.dataset.ids || '').split(',').filter(Boolean);
    if (!ids.length || !act) return;
    if (act === 'delete') {
      const ok = await confirmModal({ title: 'Delete selected?', bodyHtml: `<p>${ids.length} transactions to trash.</p>`, danger: true });
      if (ok) await bulkDelete(ids);
    }
    if (act === 'reimb') await bulkUpdate(ids, { isReimbursable: true });
    renderTransactions(ctx);
  });
}

/**
 * @param {Record<string, string>} query
 * @param {number} page
 */
function pageQuery(query, page) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(query || {})) {
    if (k === 'page' || !v) continue;
    q.set(k, v);
  }
  if (page > 0) q.set('page', String(page));
  return q.toString();
}

export async function renderTransactionDetail(ctx) {
  const { renderTransactionForm } = await import('./transactionForm.js');
  await renderTransactionForm(document.getElementById('outlet'), { id: ctx.params.id });
}

export async function renderAdd(ctx) {
  const { renderTransactionForm } = await import('./transactionForm.js');
  await renderTransactionForm(document.getElementById('outlet'), { type: ctx.query.type });
}
