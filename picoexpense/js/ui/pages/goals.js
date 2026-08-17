import { saveGoal, listGoals, deleteGoal, goalProgress } from '../../services/budgetService.js';
import { getBaseCurrency } from '../../services/currencyService.js';
import { toMinor } from '../../utils/money.js';
import { money, percent } from '../../utils/format.js';
import { escapeHtml } from '../../utils/html.js';
import { formModal, confirmModal } from '../modal.js';
import { showToast } from '../toast.js';

export async function renderGoals() {
  const outlet = document.getElementById('outlet');
  const goals = await listGoals();
  outlet.innerHTML = `
    <section class="page">
      <div class="page-head"><h2>Goals</h2><button type="button" class="btn btn--primary" id="btn-add">Add goal</button></div>
      <ul class="card-list">
        ${goals
          .map((g) => {
            const p = goalProgress(g);
            return `<li>
              <h3>${escapeHtml(g.name)}</h3>
              <p>${money(p.current, g.currency)} of ${money(p.target, g.currency)} · ${percent(p.pct)} remaining ${money(p.remaining, g.currency)}</p>
              ${g.targetDate ? `<p class="muted">Target ${escapeHtml(g.targetDate)}</p>` : ''}
              <button type="button" class="btn btn--ghost btn--sm" data-fund="${g.id}">Update progress</button>
              <button type="button" class="btn btn--ghost btn--sm" data-del="${g.id}">Delete</button>
            </li>`;
          })
          .join('') || '<li class="muted">No goals yet.</li>'}
      </ul>
    </section>
  `;
  outlet.querySelector('#btn-add')?.addEventListener('click', addGoal);
  outlet.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!(await confirmModal({ title: 'Delete goal?', bodyHtml: '<p>Remove this goal.</p>', danger: true }))) return;
      await deleteGoal(b.getAttribute('data-del'));
      renderGoals();
    })
  );
  outlet.querySelectorAll('[data-fund]').forEach((b) =>
    b.addEventListener('click', async () => {
      const g = goals.find((x) => x.id === b.getAttribute('data-fund'));
      const fd = await formModal({
        title: 'Update progress',
        fieldsHtml: `<div class="field"><label class="field__label" for="c">Current amount</label><input class="input" id="c" name="current" value="${g.currentAmountMinor / 100}" /></div>`,
      });
      if (!fd) return;
      await saveGoal({ ...g, currentAmountMinor: toMinor(String(fd.get('current')), g.currency) });
      renderGoals();
    })
  );
}

async function addGoal() {
  const base = await getBaseCurrency();
  const fd = await formModal({
    title: 'New goal',
    fieldsHtml: `
      <div class="field"><label class="field__label" for="n">Name</label><input class="input" id="n" name="name" required placeholder="Emergency fund" /></div>
      <div class="field"><label class="field__label" for="t">Target</label><input class="input" id="t" name="target" required /></div>
      <div class="field"><label class="field__label" for="d">Target date</label><input class="input" id="d" name="targetDate" type="date" /></div>`,
  });
  if (!fd) return;
  await saveGoal({
    name: String(fd.get('name')),
    targetAmountMinor: toMinor(String(fd.get('target')), base),
    currentAmountMinor: 0,
    currency: base,
    targetDate: String(fd.get('targetDate') || ''),
  });
  showToast('Goal saved', 'success');
  renderGoals();
}
