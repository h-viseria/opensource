/**
 * Pure reporting over normalized transactions (live rows only).
 * Transfers and credit-card payments are excluded from income/expense.
 */

import { EXPENSE_LIKE, INCOME_LIKE, TRANSFER_LIKE, TXN_TYPES } from '../core/constants.js';
import { monthBounds, yearBounds, inRange } from '../utils/date.js';

/**
 * Amount in base currency minor units. Incomplete if FX missing.
 * @param {object} txn
 * @param {string} baseCurrency
 * @param {(from: string, to: string, date: string) => number|null} rateLookup
 */
export function baseMinor(txn, baseCurrency, rateLookup) {
  if (txn.baseCurrency === baseCurrency && Number.isInteger(txn.baseAmountMinor)) {
    return { minor: txn.baseAmountMinor, incomplete: false };
  }
  if (txn.currency === baseCurrency) {
    return { minor: Math.trunc(txn.amountMinor || 0), incomplete: false };
  }
  if (txn.originalCurrency === baseCurrency && Number.isInteger(txn.originalAmountMinor)) {
    return { minor: txn.originalAmountMinor, incomplete: false };
  }
  const from = txn.currency;
  const rate = rateLookup?.(from, baseCurrency, txn.date);
  if (rate == null) return { minor: 0, incomplete: true };
  const fromDec = txn._fromDecimals ?? 2;
  const toDec = txn._toDecimals ?? 2;
  const major = Math.trunc(txn.amountMinor || 0) / 10 ** fromDec;
  return { minor: Math.round(major * rate * 10 ** toDec), incomplete: false };
}

/**
 * @param {object} txn
 */
export function isLive(txn) {
  return txn && !txn.deletedAt;
}

/**
 * @param {object} txn
 */
export function isExpense(txn) {
  return EXPENSE_LIKE.includes(txn.type);
}

/**
 * @param {object} txn
 */
export function isIncome(txn) {
  return INCOME_LIKE.includes(txn.type);
}

/**
 * @param {object} txn
 */
export function isTransfer(txn) {
  return TRANSFER_LIKE.includes(txn.type);
}

/**
 * Refunds reduce expenses.
 * @param {object[]} txns
 * @param {string} start
 * @param {string} end
 * @param {(t: object) => { minor: number, incomplete: boolean }} toBase
 */
export function periodTotals(txns, start, end, toBase) {
  let income = 0;
  let expenses = 0;
  let incomplete = false;
  let largest = null;
  const byCategory = new Map();
  const byDay = new Map();
  const byMerchant = new Map();

  for (const t of txns) {
    if (!isLive(t) || isTransfer(t)) continue;
    if (!inRange(t.date, start, end)) continue;
    const { minor, incomplete: inc } = toBase(t);
    if (inc) {
      incomplete = true;
      continue;
    }
    const abs = Math.abs(minor);
    if (isIncome(t)) income += abs;
    else if (isExpense(t)) {
      expenses += abs;
      if (!largest || abs > largest.abs) largest = { abs, txn: t };
      const cat = t.subcategoryId || t.categoryId || 'uncategorized';
      byCategory.set(cat, (byCategory.get(cat) || 0) + abs);
      byDay.set(t.date, (byDay.get(t.date) || 0) + abs);
      const merch = t.merchantId || t.description || '—';
      byMerchant.set(merch, (byMerchant.get(merch) || 0) + abs);
    } else if (t.type === TXN_TYPES.REFUND) {
      expenses -= abs;
    }
  }

  const savings = income - expenses;
  const savingsRate = income > 0 ? savings / income : null;
  const days = daysInRange(start, end) || 1;
  return {
    income,
    expenses: Math.max(0, expenses),
    savings,
    savingsRate,
    incomplete,
    largest,
    byCategory,
    byDay,
    byMerchant,
    avgDaily: expenses > 0 ? Math.round(Math.max(0, expenses) / days) : 0,
  };
}

/**
 * @param {string} start
 * @param {string} end
 */
function daysInRange(start, end) {
  const a = Date.parse(`${start}T12:00:00`);
  const b = Date.parse(`${end}T12:00:00`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 1;
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

/**
 * @param {object[]} txns
 * @param {string} isoDate
 * @param {(t: object) => { minor: number, incomplete: boolean }} toBase
 */
export function monthReport(txns, isoDate, toBase) {
  const { start, end, year, month } = monthBounds(isoDate);
  return { start, end, year, month, ...periodTotals(txns, start, end, toBase) };
}

/**
 * @param {object[]} txns
 * @param {number} year
 * @param {(t: object) => { minor: number, incomplete: boolean }} toBase
 */
export function annualReport(txns, year, toBase) {
  const { start, end } = yearBounds(year);
  const totals = periodTotals(txns, start, end, toBase);
  const monthly = [];
  for (let m = 1; m <= 12; m++) {
    const iso = `${year}-${String(m).padStart(2, '0')}-01`;
    monthly.push(monthReport(txns, iso, toBase));
  }
  return { year, start, end, monthly, ...totals };
}

export { monthBounds, yearBounds };
