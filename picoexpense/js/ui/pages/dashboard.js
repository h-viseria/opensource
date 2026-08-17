import { getDashboard } from '../../services/reportingService.js';
import { listCategories } from '../../services/categoryService.js';
import { money, percent } from '../../utils/format.js';
import { escapeHtml } from '../../utils/html.js';
import { todayIsoDate, addMonths, formatDisplayDate } from '../../utils/date.js';
import { donutHtml, groupedBarsHtml, budgetBarsHtml } from '../charts.js';
import * as router from '../../core/router.js';

export async function renderDashboard(ctx) {
  const outlet = document.getElementById('outlet');
  const date = ctx.query.date || todayIsoDate();
  const dash = await getDashboard(date);
  const cats = await listCategories({ includeArchived: true });
  const cmap = Object.fromEntries(cats.map((c) => [c.id, c.name]));
  const catItems = [...dash.month.byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k, v]) => ({ key: k, label: cmap[k] || 'Uncategorized', value: v }));
  const m = dash.month;
  const prev = addMonths(date, -5);
  // last 6 months from reporting would need extra calls — keep current month donut + budget bars
  outlet.innerHTML = `
    <section class="page">
      <div class="month-nav">
        <a class="btn btn--ghost" href="#/home?date=${addMonths(date, -1)}">←</a>
        <h2>${formatDisplayDate(m.start)}</h2>
        <a class="btn btn--ghost" href="#/home?date=${addMonths(date, 1)}">→</a>
      </div>
      ${dash.incomplete ? `<p class="banner" role="status">Some totals are incomplete — add a manual exchange rate in Settings.</p>` : ''}
      <div class="stat-hero">
        <div>
          <p class="muted">This month</p>
          <p class="hero-amount amount--out">${money(m.expenses, dash.baseCurrency)}</p>
          <p class="muted">spent</p>
        </div>
        <dl class="stat-grid">
          <div><dt>Income</dt><dd class="amount--in">${money(m.income, dash.baseCurrency)}</dd></div>
          <div><dt>Net</dt><dd>${money(m.savings, dash.baseCurrency)}</dd></div>
          <div><dt>Savings rate</dt><dd>${percent(m.savingsRate)}</dd></div>
          <div><dt>Daily avg</dt><dd>${money(m.avgDaily, dash.baseCurrency)}</dd></div>
          <div><dt>Cash &amp; banks</dt><dd>${money(dash.totalBalanceMinor, dash.baseCurrency)}</dd></div>
          <div><dt>Cash</dt><dd>${money(dash.cashBalanceMinor, dash.baseCurrency)}</dd></div>
          <div><dt>Cards outstanding</dt><dd class="amount--out">${money(dash.creditCardOutstandingMinor, dash.baseCurrency)}</dd></div>
          <div><dt>Pending reimbursement</dt><dd>${money(dash.pendingReimbursementMinor, dash.baseCurrency)}</dd></div>
        </dl>
      </div>
      <h3>By category</h3>
      ${catItems.length ? donutHtml(catItems, dash.baseCurrency) : '<p class="muted">No expenses this month.</p>'}
      <h3>Budgets</h3>
      ${
        dash.budgets.length
          ? budgetBarsHtml(
              dash.budgets.map((b) => ({
                label: b.budget.name,
                value: b.pct,
                status: b.status,
              })),
              dash.baseCurrency
            )
          : '<p class="muted">No budgets yet. <a href="#/budgets">Create one</a></p>'
      }
      ${
        m.largest
          ? `<p>Largest expense: <a href="#/transactions/${m.largest.txn.id}">${escapeHtml(m.largest.txn.description || 'Transaction')}</a> ${money(m.largest.abs, dash.baseCurrency)}</p>`
          : ''
      }
      ${groupedBarsHtml(
        [{ label: 'This month', a: m.income, b: m.expenses }],
        dash.baseCurrency,
        'Income',
        'Expense'
      )}
    </section>
  `;
  outlet.querySelectorAll('[data-key]').forEach((el) => {
    el.addEventListener('click', () => {
      const key = el.getAttribute('data-key');
      if (key && key.includes('-') === false) router.navigate(`/transactions?categoryId=${encodeURIComponent(key)}`);
    });
  });
  void prev;
}
