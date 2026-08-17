import { EVENTS, STORES } from '../core/constants.js';
import { emit } from '../core/eventBus.js';
import { uuid } from '../core/uuid.js';
import { nowIso } from '../utils/date.js';
import { assertCurrency, assertMinor } from '../utils/validation.js';
import { budgetRepository, goalRepository } from '../repositories/index.js';
import { listTransactions } from './transactionService.js';
import { getBaseCurrency, getRate } from './currencyService.js';
import { budgetVariance } from '../engine/budgetEngine.js';
import { baseMinor } from '../engine/reportingEngine.js';
import { decimalsFor } from '../utils/money.js';
import { markLocalDataChanged } from './settingsService.js';
import { todayIsoDate } from '../utils/date.js';

export async function saveBudget(input) {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('Budget name is required');
  const currency = String(input.currency || (await getBaseCurrency())).toUpperCase();
  assertCurrency(currency);
  const amountMinor = Math.trunc(input.amountMinor);
  assertMinor(amountMinor);
  const rec = {
    id: input.id || uuid(),
    name,
    period: input.period === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY',
    categoryId: input.categoryId || null,
    amountMinor,
    currency,
    rolloverEnabled: Boolean(input.rolloverEnabled),
    startDate: input.startDate || null,
    endDate: input.endDate || null,
    createdAt: input.createdAt || nowIso(),
    updatedAt: nowIso(),
  };
  await budgetRepository.put(rec);
  await markLocalDataChanged();
  emit(EVENTS.MASTER_CHANGED, rec);
  return rec;
}

export async function listBudgets() {
  return budgetRepository.getAll();
}

export async function deleteBudget(id) {
  await budgetRepository.remove(id);
  await markLocalDataChanged();
}

export async function evaluateBudgets(asOfDate = todayIsoDate()) {
  const budgets = await listBudgets();
  const txns = await listTransactions();
  const base = await getBaseCurrency();
  const toBase = makeToBase(base);
  return Promise.all(budgets.map(async (b) => ({ budget: b, ...budgetVariance(b, txns, asOfDate, toBase) })));
}

export async function saveGoal(input) {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('Goal name is required');
  const currency = String(input.currency || (await getBaseCurrency())).toUpperCase();
  assertCurrency(currency);
  const rec = {
    id: input.id || uuid(),
    name,
    targetAmountMinor: Math.trunc(input.targetAmountMinor || 0),
    currentAmountMinor: Math.trunc(input.currentAmountMinor || 0),
    currency,
    targetDate: input.targetDate || '',
    notes: String(input.notes || ''),
    createdAt: input.createdAt || nowIso(),
    updatedAt: nowIso(),
  };
  await goalRepository.put(rec);
  await markLocalDataChanged();
  emit(EVENTS.MASTER_CHANGED, rec);
  return rec;
}

export async function listGoals() {
  return goalRepository.getAll();
}

export async function deleteGoal(id) {
  await goalRepository.remove(id);
  await markLocalDataChanged();
}

export function goalProgress(goal) {
  const target = Math.trunc(goal.targetAmountMinor || 0);
  const current = Math.trunc(goal.currentAmountMinor || 0);
  const remaining = target - current;
  const pct = target > 0 ? current / target : 0;
  return { current, target, remaining, pct };
}

/**
 * @param {string} base
 */
export function makeToBase(base) {
  /** @type {Map<string, number|null>} */
  const cache = new Map();
  return (txn) => {
    const patched = {
      ...txn,
      _fromDecimals: decimalsFor(txn.currency),
      _toDecimals: decimalsFor(base),
    };
    return baseMinor(patched, base, (from, to, date) => {
      const key = `${from}|${to}|${date}`;
      if (cache.has(key)) return cache.get(key);
      return null;
    });
  };
}

/**
 * Async toBase using stored rates.
 * @param {string} base
 */
export function makeAsyncToBase(base) {
  return async (txn) => {
    if (txn.currency === base) return { minor: Math.trunc(txn.amountMinor || 0), incomplete: false };
    if (txn.baseCurrency === base && Number.isInteger(txn.baseAmountMinor)) {
      return { minor: txn.baseAmountMinor, incomplete: false };
    }
    const rate = await getRate(txn.currency, base, txn.date);
    if (rate == null) return { minor: 0, incomplete: true };
    const fromDec = decimalsFor(txn.currency);
    const toDec = decimalsFor(base);
    const major = Math.trunc(txn.amountMinor || 0) / 10 ** fromDec;
    return { minor: Math.round(major * rate * 10 ** toDec), incomplete: false };
  };
}

export { STORES };
