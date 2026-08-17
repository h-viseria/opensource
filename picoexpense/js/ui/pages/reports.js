import { getAnnualView, getMonthlyView, getTaxFlagged, filterTransactions } from '../../services/reportingService.js';
import { listCategories } from '../../services/categoryService.js';
import { listMerchants } from '../../services/masterService.js';
import { money, percent } from '../../utils/format.js';
import { escapeHtml } from '../../utils/html.js';
import { todayIsoDate, addMonths, formatDisplayDate } from '../../utils/date.js';
import { donutHtml, groupedBarsHtml } from '../charts.js';
import * as router from '../../core/router.js';

export async function renderReports(ctx) {
  const outlet = document.getElementById('outlet');
  const date = ctx.query.date || todayIsoDate();
  const view = await getMonthlyView(date);
  const cats = await listCategories({ includeArchived: true });
  const cmap = Object.fromEntries(cats.map((c) => [c.id, c.name]));
  const items = [...view.report.byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({ key: k, label: cmap[k] || 'Other', value: v }));
  const tax = await getTaxFlagged();
  outlet.innerHTML = `
    <section class="page">
      <h2>Reports</h2>
      <p><a href="#/monthly">Monthly</a> · <a href="#/annual">Annual</a></p>
      ${view.report.incomplete ? '<p class="banner">Incomplete — missing exchange rates.</p>' : ''}
      <p>Income ${money(view.report.income, view.baseCurrency)} · Expenses ${money(view.report.expenses, view.baseCurrency)} · Savings ${percent(view.report.savingsRate)}</p>
      ${items.length ? donutHtml(items.slice(0, 10), view.baseCurrency) : '<p class="muted">No data</p>'}
      <h3>Tax-flagged</h3>
      <p class="muted">${tax.length} transactions marked tax-related / deductible / taxable income.</p>
    </section>
  `;
  outlet.querySelectorAll('[data-key]').forEach((el) => {
    el.addEventListener('click', () => router.navigate(`/transactions?categoryId=${el.getAttribute('data-key')}`));
  });
}

export async function renderMonthly(ctx) {
  const outlet = document.getElementById('outlet');
  const date = ctx.query.date || todayIsoDate();
  const view = await getMonthlyView(date);
  const merchants = await listMerchants();
  const mmap = Object.fromEntries(merchants.map((m) => [m.id, m.name]));
  const cats = await listCategories({ includeArchived: true });
  const cmap = Object.fromEntries(cats.map((c) => [c.id, c.name]));
  const items = [...view.report.byCategory.entries()].map(([k, v]) => ({ key: k, label: cmap[k] || 'Other', value: v }));
  outlet.innerHTML = `
    <section class="page">
      <div class="month-nav">
        <a class="btn btn--ghost" href="#/monthly?date=${addMonths(date, -1)}">←</a>
        <h2>${formatDisplayDate(view.report.start)}</h2>
        <a class="btn btn--ghost" href="#/monthly?date=${addMonths(date, 1)}">→</a>
      </div>
      ${view.report.incomplete ? '<p class="banner">Incomplete FX</p>' : ''}
      <dl class="stat-grid">
        <div><dt>Income</dt><dd class="amount--in">${money(view.report.income, view.baseCurrency)}</dd></div>
        <div><dt>Expenses</dt><dd class="amount--out">${money(view.report.expenses, view.baseCurrency)}</dd></div>
        <div><dt>Net</dt><dd>${money(view.report.savings, view.baseCurrency)}</dd></div>
        <div><dt>Savings rate</dt><dd>${percent(view.report.savingsRate)}</dd></div>
      </dl>
      ${items.length ? donutHtml(items, view.baseCurrency) : ''}
      <h3>Largest</h3>
      <ul>${view.largest.map((x) => `<li><a href="#/transactions/${x.t.id}">${escapeHtml(mmap[x.t.merchantId] || x.t.description || x.t.type)}</a> ${money(x.minor, view.baseCurrency)}</li>`).join('')}</ul>
      <h3>Budget variance</h3>
      <ul>${view.budgets.map((b) => `<li>${escapeHtml(b.budget.name)} · ${b.status} · ${percent(b.pct)}</li>`).join('') || '<li class="muted">None</li>'}</ul>
    </section>
  `;
}

export async function renderAnnual(ctx) {
  const outlet = document.getElementById('outlet');
  const year = Number(ctx.query.year || todayIsoDate().slice(0, 4));
  const view = await getAnnualView(year);
  const bars = view.report.monthly.map((m) => ({
    label: String(m.month),
    a: m.income,
    b: m.expenses,
  }));
  outlet.innerHTML = `
    <section class="page">
      <div class="month-nav">
        <a class="btn btn--ghost" href="#/annual?year=${year - 1}">←</a>
        <h2>${year}</h2>
        <a class="btn btn--ghost" href="#/annual?year=${year + 1}">→</a>
      </div>
      ${view.report.incomplete ? '<p class="banner">Incomplete FX</p>' : ''}
      <dl class="stat-grid">
        <div><dt>Income</dt><dd class="amount--in">${money(view.report.income, view.baseCurrency)}</dd></div>
        <div><dt>Expenses</dt><dd class="amount--out">${money(view.report.expenses, view.baseCurrency)}</dd></div>
        <div><dt>Savings</dt><dd>${money(view.report.savings, view.baseCurrency)}</dd></div>
        <div><dt>Rate</dt><dd>${percent(view.report.savingsRate)}</dd></div>
      </dl>
      ${groupedBarsHtml(bars, view.baseCurrency, 'Income', 'Expense')}
    </section>
  `;
  void filterTransactions;
}
