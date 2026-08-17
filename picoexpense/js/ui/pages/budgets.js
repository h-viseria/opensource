import { saveBudget, listBudgets, deleteBudget, evaluateBudgets } from '../../services/budgetService.js';
import { listCategories } from '../../services/categoryService.js';
import { getBaseCurrency } from '../../services/currencyService.js';
import { toMinor } from '../../utils/money.js';
import { money, percent } from '../../utils/format.js';
import { escapeHtml } from '../../utils/html.js';
import { formModal, confirmModal } from '../modal.js';
import { showToast } from '../toast.js';
import { budgetBarsHtml } from '../charts.js';

export async function renderBudgets() {
  const outlet = document.getElementById('outlet');
  const [rows, base] = await Promise.all([evaluateBudgets(), getBaseCurrency()]);
  outlet.innerHTML = `
    <section class="page">
      <div class="page-head"><h2>Budgets</h2><button type="button" class="btn btn--primary" id="btn-add">Add budget</button></div>
      ${
        rows.length
          ? budgetBarsHtml(
              rows.map((r) => ({ label: `${r.budget.name} · ${money(r.actual, base)} / ${money(r.amount, base)} (${r.status})`, value: r.pct, status: r.status })),
              base
            )
          : '<p class="muted">No budgets yet.</p>'
      }
      <ul class="card-list">
        ${rows
          .map(
            (r) => `<li>
              <h3>${escapeHtml(r.budget.name)}</h3>
              <p>${money(r.actual, base)} of ${money(r.amount, base)} · remaining ${money(r.remaining, base)} · ${percent(r.pct)} · ${escapeHtml(r.status)}</p>
              ${r.incomplete ? '<p class="banner">Incomplete FX</p>' : ''}
              <button type="button" class="btn btn--ghost btn--sm" data-del="${r.budget.id}">Delete</button>
            </li>`
          )
          .join('')}
      </ul>
    </section>
  `;
  outlet.querySelector('#btn-add')?.addEventListener('click', addBudget);
  outlet.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      const ok = await confirmModal({ title: 'Delete budget?', bodyHtml: '<p>This cannot be undone.</p>', danger: true });
      if (!ok) return;
      await deleteBudget(b.getAttribute('data-del'));
      renderBudgets();
    })
  );
  void listBudgets;
}

async function addBudget() {
  const cats = await listCategories();
  const base = await getBaseCurrency();
  const fd = await formModal({
    title: 'New budget',
    fieldsHtml: `
      <div class="field"><label class="field__label" for="n">Name</label><input class="input" id="n" name="name" required /></div>
      <div class="field"><label class="field__label" for="p">Period</label>
        <select class="input" id="p" name="period"><option>MONTHLY</option><option>ANNUAL</option></select></div>
      <div class="field"><label class="field__label" for="c">Category (optional)</label>
        <select class="input" id="c" name="categoryId"><option value="">Overall</option>${cats.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}</select></div>
      <div class="field"><label class="field__label" for="a">Amount (${escapeHtml(base)})</label><input class="input" id="a" name="amount" required /></div>`,
  });
  if (!fd) return;
  await saveBudget({
    name: String(fd.get('name')),
    period: String(fd.get('period')),
    categoryId: String(fd.get('categoryId') || '') || null,
    amountMinor: toMinor(String(fd.get('amount')), base),
    currency: base,
  });
  showToast('Budget saved', 'success');
  renderBudgets();
}
