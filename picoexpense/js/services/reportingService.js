/**
 * Reporting service — UI calls these, never IndexedDB.
 */

import { TXN_TYPES } from '../core/constants.js';
import { listTransactions } from './transactionService.js';
import { getBalances } from './accountService.js';
import { evaluateBudgets } from './budgetService.js';
import { getBaseCurrency, getRate } from './currencyService.js';
import { annualReport, monthReport, periodTotals, isExpense, isIncome, isLive, isTransfer } from '../engine/reportingEngine.js';
import { todayIsoDate, monthBounds, inRange } from '../utils/date.js';
import { decimalsFor } from '../utils/money.js';
import { REIMBURSEMENT_STATUS } from '../core/constants.js';

async function toBaseFn() {
  const base = await getBaseCurrency();
  return {
    base,
    /**
     * @param {object} txn
     */
    async convert(txn) {
      if (txn.currency === base && Number.isInteger(txn.amountMinor)) {
        return { minor: txn.amountMinor, incomplete: false };
      }
      if (txn.baseCurrency === base && Number.isInteger(txn.baseAmountMinor) && !txn.fxIncomplete) {
        return { minor: txn.baseAmountMinor, incomplete: false };
      }
      const rate = await getRate(txn.currency, base, txn.date);
      if (rate == null) return { minor: 0, incomplete: true };
      const major = txn.amountMinor / 10 ** decimalsFor(txn.currency);
      return { minor: Math.round(major * rate * 10 ** decimalsFor(base)), incomplete: false };
    },
    /**
     * Precompute all conversions then return sync lookup.
     * @param {object[]} txns
     */
    async bind(txns) {
      /** @type {Map<string, { minor: number, incomplete: boolean }>} */
      const map = new Map();
      for (const t of txns) map.set(t.id, await this.convert(t));
      return (txn) => map.get(txn.id) || { minor: 0, incomplete: true };
    },
  };
}

export async function getDashboard(isoDate = todayIsoDate()) {
  const txns = await listTransactions();
  const { base, bind } = await toBaseFn();
  const toBase = await bind(txns);
  const month = monthReport(txns, isoDate, toBase);
  const balances = await getBalances();
  let cash = 0;
  let assets = 0;
  let ccOut = 0;
  let incompleteBal = false;
  for (const row of balances) {
    if (row.account.active === false) continue;
    if (row.account.currency !== base) incompleteBal = true;
    if (row.liability) ccOut += row.balanceMinor;
    else {
      assets += row.balanceMinor;
      if (['CASH', 'WALLET'].includes(row.account.type)) cash += row.balanceMinor;
    }
  }
  const budgets = await evaluateBudgets(isoDate);
  const pendingReimb = txns
    .filter(
      (t) =>
        isLive(t) &&
        t.isReimbursable &&
        t.reimbursementStatus !== REIMBURSEMENT_STATUS.RECEIVED &&
        t.reimbursementStatus !== REIMBURSEMENT_STATUS.NONE
    )
    .reduce((s, t) => s + Math.abs(toBase(t).minor), 0);

  return {
    baseCurrency: base,
    month,
    totalBalanceMinor: assets,
    cashBalanceMinor: cash,
    creditCardOutstandingMinor: ccOut,
    balancesIncomplete: incompleteBal,
    budgets,
    pendingReimbursementMinor: pendingReimb,
    incomplete: month.incomplete || incompleteBal,
  };
}

export async function getMonthlyView(isoDate) {
  const txns = await listTransactions();
  const { base, bind } = await toBaseFn();
  const toBase = await bind(txns);
  const report = monthReport(txns, isoDate, toBase);
  const { start, end } = monthBounds(isoDate);
  const largest = txns
    .filter((t) => isLive(t) && !isTransfer(t) && isExpense(t) && inRange(t.date, start, end))
    .map((t) => ({ t, ...toBase(t) }))
    .filter((x) => !x.incomplete)
    .sort((a, b) => b.minor - a.minor)
    .slice(0, 10);
  const budgets = await evaluateBudgets(isoDate);
  return { baseCurrency: base, report, largest, budgets };
}

export async function getAnnualView(year) {
  const txns = await listTransactions();
  const { base, bind } = await toBaseFn();
  const toBase = await bind(txns);
  const report = annualReport(txns, year, toBase);
  return { baseCurrency: base, report };
}

export async function getExpensesByCategory(start, end) {
  const txns = await listTransactions();
  const { base, bind } = await toBaseFn();
  const toBase = await bind(txns);
  return periodTotals(txns, start, end, toBase);
}

export async function getCashFlow(start, end) {
  return getExpensesByCategory(start, end);
}

export async function getTopMerchants(start, end) {
  const totals = await getExpensesByCategory(start, end);
  return [...totals.byMerchant.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
}

export async function getSavingsRate(start, end) {
  const t = await getExpensesByCategory(start, end);
  return { savings: t.savings, savingsRate: t.savingsRate, income: t.income, expenses: t.expenses, incomplete: t.incomplete };
}

export async function getTaxFlagged() {
  const txns = await listTransactions();
  return txns.filter((t) => t.isTaxRelated || t.isTaxDeductible || t.isTaxableIncome);
}

export async function filterTransactions(filters) {
  const txns = await listTransactions({ includeDeleted: Boolean(filters.includeDeleted) });
  return txns.filter((t) => {
    if (filters.start && t.date < filters.start) return false;
    if (filters.end && t.date > filters.end) return false;
    if (filters.minMinor != null && Math.abs(t.amountMinor) < filters.minMinor) return false;
    if (filters.maxMinor != null && Math.abs(t.amountMinor) > filters.maxMinor) return false;
    if (filters.categoryId && t.categoryId !== filters.categoryId && t.subcategoryId !== filters.categoryId) return false;
    if (filters.accountId && t.accountId !== filters.accountId && t.transferAccountId !== filters.accountId) return false;
    if (filters.merchantId && t.merchantId !== filters.merchantId) return false;
    if (filters.personId && t.personId !== filters.personId) return false;
    if (filters.tagId && !(t.tagIds || []).includes(filters.tagId)) return false;
    if (filters.currency && t.currency !== filters.currency) return false;
    if (filters.type && t.type !== filters.type) return false;
    if (filters.paymentMethod && t.paymentMethod !== filters.paymentMethod) return false;
    if (filters.reimbursable === true && !t.isReimbursable) return false;
    if (filters.taxRelated === true && !t.isTaxRelated) return false;
    return true;
  });
}

export { TXN_TYPES, isExpense, isIncome, isLive, isTransfer };
