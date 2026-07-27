/**
 * Personal finance engine — net worth, cashflow metrics, budget variance (spec §8).
 */

import { ACCOUNT_NATURES } from '../core/accountTypes.js';
import { roundMoney } from '../utils/money.js';

/**
 * Present ledger closing as positive "display" amount by nature.
 * Assets/Expenses: debit positive. Liabilities/Equity/Income: credit positive.
 * @param {string} nature
 * @param {number} signedClosing
 */
export function displayAmount(nature, signedClosing) {
  const s = Number(signedClosing) || 0;
  if (
    nature === ACCOUNT_NATURES.ASSET ||
    nature === ACCOUNT_NATURES.EXPENSE
  ) {
    return roundMoney(Math.max(s, 0));
  }
  return roundMoney(Math.max(-s, 0));
}

/**
 * Period activity as income (credit net) or expense (debit net).
 * @param {string} nature
 * @param {{ periodDebit: number, periodCredit: number }} movement
 */
export function periodActivity(nature, movement) {
  const dr = Number(movement.periodDebit) || 0;
  const cr = Number(movement.periodCredit) || 0;
  if (nature === ACCOUNT_NATURES.INCOME) return roundMoney(Math.max(cr - dr, 0));
  if (nature === ACCOUNT_NATURES.EXPENSE) return roundMoney(Math.max(dr - cr, 0));
  return 0;
}

/**
 * @param {import('../models/types.js').Ledger[]} ledgers
 * @param {Map<string, import('./reportingEngine.js').LedgerMovement>} movements
 * @param {import('../models/types.js').LedgerGroup[]} [groups]
 */
export function buildNetWorth(ledgers, movements, groups = []) {
  const groupById = new Map(groups.map((g) => [g.id, g]));

  /** @type {any[]} */
  const assets = [];
  /** @type {any[]} */
  const liabilities = [];
  /** @type {any[]} */
  const investments = [];
  /** @type {any[]} */
  const loans = [];

  let totalAssets = 0;
  let totalLiabilities = 0;

  for (const led of ledgers) {
    const m = movements.get(led.id);
    if (!m) continue;
    const amount = displayAmount(led.nature, m.signedClosing);
    if (amount === 0) continue;

    const groupName = groupById.get(led.groupId)?.name || '';
    const row = {
      ledger: led,
      groupName,
      amount,
      signedClosing: m.signedClosing,
    };

    if (led.nature === ACCOUNT_NATURES.ASSET) {
      assets.push(row);
      totalAssets = roundMoney(totalAssets + amount);
      if (/invest/i.test(led.name) || /invest/i.test(groupName)) {
        investments.push(row);
      }
    } else if (led.nature === ACCOUNT_NATURES.LIABILITY) {
      liabilities.push(row);
      totalLiabilities = roundMoney(totalLiabilities + amount);
      if (/loan/i.test(led.name) || /loan/i.test(groupName) || /credit card/i.test(led.name)) {
        loans.push(row);
      }
    }
  }

  assets.sort((a, b) => b.amount - a.amount);
  liabilities.sort((a, b) => b.amount - a.amount);

  const netWorth = roundMoney(totalAssets - totalLiabilities);

  /** @type {{ label: string, amount: number, pct: number }[]} */
  const assetAllocation = assets.map((a) => ({
    label: a.ledger.name,
    amount: a.amount,
    pct: totalAssets > 0 ? roundMoney((a.amount / totalAssets) * 100) : 0,
  }));

  /** @type {{ label: string, amount: number, pct: number }[]} */
  const liabilityBreakdown = liabilities.map((l) => ({
    label: l.ledger.name,
    amount: l.amount,
    pct: totalLiabilities > 0 ? roundMoney((l.amount / totalLiabilities) * 100) : 0,
  }));

  return {
    totalAssets,
    totalLiabilities,
    netWorth,
    assets,
    liabilities,
    investments,
    loans,
    investmentTotal: roundMoney(investments.reduce((s, r) => s + r.amount, 0)),
    loanTotal: roundMoney(loans.reduce((s, r) => s + r.amount, 0)),
    assetAllocation,
    liabilityBreakdown,
  };
}

/**
 * Monthly income / expense / savings rate from P&L natures.
 * @param {import('../models/types.js').Ledger[]} ledgers
 * @param {Map<string, import('./reportingEngine.js').LedgerMovement>} movements
 */
export function buildCashflowMetrics(ledgers, movements) {
  let income = 0;
  let expense = 0;
  /** @type {any[]} */
  const incomeRows = [];
  /** @type {any[]} */
  const expenseRows = [];

  for (const led of ledgers) {
    const m = movements.get(led.id);
    if (!m) continue;
    const amt = periodActivity(led.nature, m);
    if (amt === 0) continue;
    if (led.nature === ACCOUNT_NATURES.INCOME) {
      income = roundMoney(income + amt);
      incomeRows.push({ ledger: led, amount: amt });
    } else if (led.nature === ACCOUNT_NATURES.EXPENSE) {
      expense = roundMoney(expense + amt);
      expenseRows.push({ ledger: led, amount: amt });
    }
  }

  incomeRows.sort((a, b) => b.amount - a.amount);
  expenseRows.sort((a, b) => b.amount - a.amount);

  const savings = roundMoney(income - expense);
  const savingsRate = income > 0 ? roundMoney((savings / income) * 100) : 0;

  return { income, expense, savings, savingsRate, incomeRows, expenseRows };
}

/**
 * Budget vs actual for expense/income ledgers.
 * @param {import('../models/types.js').Budget[]} budgets
 * @param {import('../models/types.js').Ledger[]} ledgers
 * @param {Map<string, import('./reportingEngine.js').LedgerMovement>} movements
 */
export function buildBudgetVariance(budgets, ledgers, movements) {
  const ledgerById = new Map(ledgers.map((l) => [l.id, l]));
  /** @type {any[]} */
  const rows = [];
  let budgetTotal = 0;
  let actualTotal = 0;

  for (const b of budgets) {
    const led = ledgerById.get(b.ledgerId);
    const m = movements.get(b.ledgerId);
    const actual = led && m ? periodActivity(led.nature, m) : 0;
    const budgeted = roundMoney(b.amount);
    const variance = roundMoney(budgeted - actual);
    const pctUsed = budgeted > 0 ? roundMoney((actual / budgeted) * 100) : 0;
    budgetTotal = roundMoney(budgetTotal + budgeted);
    actualTotal = roundMoney(actualTotal + actual);
    rows.push({
      budget: b,
      ledger: led,
      budgeted,
      actual,
      variance,
      pctUsed,
      overBudget: actual > budgeted && budgeted > 0,
    });
  }

  rows.sort((a, b) => String(a.budget.name).localeCompare(String(b.budget.name)));

  return {
    rows,
    totals: {
      budgeted: budgetTotal,
      actual: actualTotal,
      variance: roundMoney(budgetTotal - actualTotal),
    },
  };
}

/**
 * Goal progress using manual amount or linked ledger balance.
 * @param {import('../models/types.js').Goal} goal
 * @param {Map<string, import('./reportingEngine.js').LedgerMovement>} [movements]
 * @param {Map<string, import('../models/types.js').Ledger>} [ledgersById]
 */
export function goalProgress(goal, movements, ledgersById) {
  let current = roundMoney(goal.currentAmount || 0);
  if (goal.linkedLedgerId && movements) {
    const m = movements.get(goal.linkedLedgerId);
    const led = ledgersById?.get(goal.linkedLedgerId);
    if (m && led) {
      current = displayAmount(led.nature, m.signedClosing);
    }
  }
  const target = roundMoney(goal.targetAmount || 0);
  const pct = target > 0 ? Math.min(100, roundMoney((current / target) * 100)) : 0;
  const remaining = roundMoney(Math.max(target - current, 0));
  return { current, target, pct, remaining, complete: target > 0 && current >= target };
}

/**
 * @param {string|Date} [date]
 * @returns {string} YYYY-MM
 */
export function monthKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * First/last day of YYYY-MM.
 * @param {string} key
 */
export function monthRange(key) {
  const [ys, ms] = String(key).split('-');
  const y = Number(ys);
  const m = Number(ms);
  if (!y || !m) return { fromDate: '', toDate: '' };
  const fromDate = `${ys}-${ms}-01`;
  const last = new Date(y, m, 0).getDate();
  const toDate = `${ys}-${ms}-${String(last).padStart(2, '0')}`;
  return { fromDate, toDate };
}

/**
 * @param {string|Date} [date]
 */
export function yearKey(date = new Date()) {
  return String((date instanceof Date ? date : new Date(date)).getFullYear());
}

/**
 * @param {string} key YYYY
 */
export function yearRange(key) {
  const y = String(key || new Date().getFullYear());
  return { fromDate: `${y}-01-01`, toDate: `${y}-12-31` };
}
