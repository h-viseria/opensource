/**
 * Personal finance hub — net worth, cashflow, budgets, goals.
 */

import * as bookService from '../../services/bookService.js';
import * as financeService from '../../services/personalFinanceService.js';
import { escapeHtml } from '../modal.js';
import { formatMoney } from '../../utils/money.js';
import * as router from '../../core/router.js';

/**
 * @param {import('../../core/router.js').RouteContext} ctx
 * @param {HTMLElement} outlet
 */
export async function renderFinance(ctx, outlet) {
  const { book } = await bookService.getSessionContext();
  if (!book) {
    outlet.innerHTML = `<p class="muted">No active book.</p>`;
    return;
  }

  const month = ctx.query.month || financeService.monthKey();
  const dash = await financeService.getFinanceDashboard(book.id, { month });
  const currency = book.currency || 'INR';
  const nw = dash.netWorth;
  const cf = dash.cashflow;

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-header__title">Personal finance</h1>
        <p class="page-header__desc">
          Net worth, cashflow, budgets, and goals for <strong>${escapeHtml(book.name)}</strong>.
          Figures come from live ledger balances — nothing is stored as report totals.
        </p>
      </div>
      <div class="page-header__actions">
        <a class="btn btn--secondary" href="#/finance/budgets">Budgets</a>
        <a class="btn btn--primary" href="#/finance/goals">Goals</a>
      </div>
    </div>

    <form class="toolbar" id="month-filter" style="margin-bottom:1rem">
      <label class="field" style="margin:0">
        <span class="field__label">Month</span>
        <input class="input" type="month" name="month" value="${escapeHtml(month)}" />
      </label>
      <button type="submit" class="btn btn--secondary btn--sm" style="align-self:end">Apply</button>
    </form>

    <div class="stat-grid">
      <div class="stat-tile">
        <div class="stat-tile__label">Net worth</div>
        <div class="stat-tile__value mono">${formatMoney(nw.netWorth, currency)}</div>
        <div class="stat-tile__hint">Assets − Liabilities · as of ${escapeHtml(dash.asOfDate)}</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__label">Monthly income</div>
        <div class="stat-tile__value mono">${formatMoney(cf.income, currency)}</div>
        <div class="stat-tile__hint">${escapeHtml(month)}</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__label">Monthly expense</div>
        <div class="stat-tile__value mono">${formatMoney(cf.expense, currency)}</div>
        <div class="stat-tile__hint">${escapeHtml(month)}</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__label">Savings rate</div>
        <div class="stat-tile__value mono">${cf.savingsRate}%</div>
        <div class="stat-tile__hint">Saved ${formatMoney(cf.savings, currency)}</div>
      </div>
    </div>

    <div class="master-grid">
      <a class="master-card" href="#/reports/net-worth">
        <div class="master-card__icon" aria-hidden="true">▣</div>
        <div class="master-card__title">Net worth statement</div>
        <div class="master-card__desc">Assets, liabilities, investments, loans</div>
        <div class="master-card__meta mono">${formatMoney(nw.netWorth, currency)}</div>
      </a>
      <a class="master-card" href="#/finance/budgets">
        <div class="master-card__icon" aria-hidden="true">▤</div>
        <div class="master-card__title">Budgets</div>
        <div class="master-card__desc">Monthly or yearly budget vs actual</div>
        <div class="master-card__meta mono">${dash.counts.budgets} this month${dash.counts.overBudget ? ` · ${dash.counts.overBudget} over` : ''}</div>
      </a>
      <a class="master-card" href="#/finance/goals">
        <div class="master-card__icon" aria-hidden="true">◈</div>
        <div class="master-card__title">Goals</div>
        <div class="master-card__desc">Emergency fund, retirement, education…</div>
        <div class="master-card__meta mono">${dash.counts.goals} active</div>
      </a>
      <a class="master-card" href="#/reports/budget-variance">
        <div class="master-card__icon" aria-hidden="true">≡</div>
        <div class="master-card__title">Budget variance</div>
        <div class="master-card__desc">Budgeted vs spent for the period</div>
      </a>
    </div>

    <div class="panel" style="margin-top:1.25rem">
      <h2 class="panel__title">Asset allocation</h2>
      ${allocationBars(nw.assetAllocation, currency) || `<p class="muted">No asset balances yet.</p>`}
    </div>

    <div class="panel" style="margin-top:1rem">
      <h2 class="panel__title">Liability breakdown</h2>
      ${allocationBars(nw.liabilityBreakdown, currency) || `<p class="muted">No liability balances yet.</p>`}
    </div>

    <div class="panel" style="margin-top:1rem">
      <h2 class="panel__title">Goals progress</h2>
      ${
        dash.goals.length === 0
          ? `<p class="muted">No active goals. <a href="#/finance/goals">Create one</a> from the templates (Emergency Fund, Retirement…).</p>`
          : dash.goals
              .map(({ goal, progress }) => `
          <div class="progress-row">
            <div class="progress-row__head">
              <strong>${escapeHtml(goal.name)}</strong>
              <span class="muted">${escapeHtml(goal.category)}</span>
              <span class="mono">${formatMoney(progress.current, currency)} / ${formatMoney(progress.target, currency)}</span>
            </div>
            <div class="progress-bar" aria-valuenow="${progress.pct}" aria-valuemin="0" aria-valuemax="100">
              <div class="progress-bar__fill ${progress.complete ? 'is-complete' : ''}" style="width:${Math.min(progress.pct, 100)}%"></div>
            </div>
            <div class="progress-row__meta muted">${progress.pct}% · ${progress.complete ? 'Complete' : `${formatMoney(progress.remaining, currency)} to go`}</div>
          </div>`
              )
              .join('')
      }
    </div>

    ${
      dash.budgets.rows.length
        ? `<div class="panel" style="margin-top:1rem">
            <h2 class="panel__title">Budgets this month</h2>
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Budget</th>
                    <th>Ledger</th>
                    <th class="num">Budgeted</th>
                    <th class="num">Actual</th>
                    <th class="num">Variance</th>
                    <th class="num">Used</th>
                  </tr>
                </thead>
                <tbody>
                  ${dash.budgets.rows
                    .map(
                      (r) => `
                    <tr class="${r.overBudget ? 'is-warning' : ''}">
                      <td>${escapeHtml(r.budget.name)}</td>
                      <td>${escapeHtml(r.ledger?.name || '—')}</td>
                      <td class="num mono">${formatMoney(r.budgeted, currency)}</td>
                      <td class="num mono">${formatMoney(r.actual, currency)}</td>
                      <td class="num mono">${formatMoney(r.variance, currency)}</td>
                      <td class="num mono">${r.pctUsed}%${r.overBudget ? ' <span class="badge badge--danger">Over</span>' : ''}</td>
                    </tr>`
                    )
                    .join('')}
                </tbody>
              </table>
            </div>
          </div>`
        : ''
    }
  `;

  outlet.querySelector('#month-filter')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(/** @type {HTMLFormElement} */ (e.target));
    const m = String(fd.get('month') || '');
    router.navigate(m ? `/finance?month=${encodeURIComponent(m)}` : '/finance');
  });
}

/**
 * @param {{ label: string, amount: number, pct: number }[]} rows
 * @param {string} currency
 */
function allocationBars(rows, currency) {
  if (!rows.length) return '';
  return rows
    .slice(0, 8)
    .map(
      (r) => `
    <div class="alloc-row">
      <div class="alloc-row__label">
        <span>${escapeHtml(r.label)}</span>
        <span class="mono">${formatMoney(r.amount, currency)} · ${r.pct}%</span>
      </div>
      <div class="progress-bar progress-bar--thin">
        <div class="progress-bar__fill" style="width:${Math.min(r.pct, 100)}%"></div>
      </div>
    </div>`
    )
    .join('');
}
