/**
 * Budget vs actual. Status strings only — UI maps them to colors.
 */

import { BUDGET_STATUS } from '../core/constants.js';
import { monthBounds, yearBounds, inRange } from '../utils/date.js';
import { isExpense, isLive, isTransfer } from './reportingEngine.js';
import { TXN_TYPES } from '../core/constants.js';

/**
 * @param {object} budget
 * @param {object[]} txns
 * @param {string} asOfDate
 * @param {(t: object) => { minor: number, incomplete: boolean }} toBase
 */
export function budgetVariance(budget, txns, asOfDate, toBase) {
  const period = budget.period === 'ANNUAL' ? yearBounds(Number(String(asOfDate).slice(0, 4))) : monthBounds(asOfDate);
  let start = budget.startDate || period.start;
  let end = budget.endDate || period.end;
  if (budget.period !== 'ANNUAL') {
    start = period.start;
    end = period.end;
  }

  let actual = 0;
  let incomplete = false;
  for (const t of txns) {
    if (!isLive(t) || isTransfer(t)) continue;
    if (!inRange(t.date, start, end)) continue;
    if (budget.categoryId) {
      if (t.categoryId !== budget.categoryId && t.subcategoryId !== budget.categoryId) continue;
    }
    const { minor, incomplete: inc } = toBase(t);
    if (inc) {
      incomplete = true;
      continue;
    }
    if (isExpense(t)) actual += Math.abs(minor);
    else if (t.type === TXN_TYPES.REFUND) actual -= Math.abs(minor);
  }

  const amount = Math.trunc(budget.amountMinor || 0);
  const remaining = amount - actual;
  const pct = amount > 0 ? actual / amount : 0;
  let status = BUDGET_STATUS.NORMAL;
  if (pct >= 1) status = BUDGET_STATUS.EXCEEDED;
  else if (pct >= 0.8) status = BUDGET_STATUS.WARNING;

  return {
    budgetId: budget.id,
    amount,
    actual: Math.max(0, actual),
    remaining,
    pct,
    status,
    incomplete,
    start,
    end,
  };
}
