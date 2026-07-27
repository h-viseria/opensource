/**
 * Personal finance application service (spec §8).
 * Budgets, goals, net worth, and cashflow metrics from live ledger balances.
 */

import { EVENTS, GOAL_CATEGORIES, BUDGET_PERIODS } from '../core/constants.js';
import { emit } from '../core/eventBus.js';
import { uuid } from '../core/uuid.js';
import { nowIso, toDateInput } from '../utils/date.js';
import { roundMoney } from '../utils/money.js';
import { ACCOUNT_NATURES } from '../core/accountTypes.js';
import { computeLedgerMovements } from '../engine/reportingEngine.js';
import {
  buildNetWorth,
  buildCashflowMetrics,
  buildBudgetVariance,
  goalProgress,
  monthKey,
  monthRange,
  yearKey,
  yearRange,
} from '../engine/personalFinanceEngine.js';
import { DEFAULT_GOAL_TEMPLATES } from '../data/financeDefaults.js';
import { budgetRepository } from '../repositories/budgetRepository.js';
import { goalRepository } from '../repositories/goalRepository.js';
import { ledgerRepository } from '../repositories/ledgerRepository.js';
import { ledgerGroupRepository } from '../repositories/ledgerGroupRepository.js';
import { voucherLineRepository } from '../repositories/voucherLineRepository.js';
import { auditLogRepository } from '../repositories/auditLogRepository.js';

export {
  GOAL_CATEGORIES,
  BUDGET_PERIODS,
  DEFAULT_GOAL_TEMPLATES,
  monthKey,
  monthRange,
  yearKey,
  yearRange,
};

export const GOAL_CATEGORY_LIST = Object.freeze(Object.values(GOAL_CATEGORIES));

/**
 * @param {string} bookId
 */
async function loadMovements(bookId, range) {
  const [ledgers, groups, lines] = await Promise.all([
    ledgerRepository.findByBook(bookId),
    ledgerGroupRepository.findByBook(bookId),
    voucherLineRepository.findByBook(bookId),
  ]);
  const movements = computeLedgerMovements(ledgers, lines, range);
  return { ledgers, groups, lines, movements };
}

/* ── Budgets ───────────────────────────────────────────── */

/** @param {string} bookId */
export async function listBudgets(bookId, filters = {}) {
  let rows = await budgetRepository.findByBook(bookId);
  if (filters.periodKey) rows = rows.filter((b) => b.periodKey === filters.periodKey);
  if (filters.periodType) rows = rows.filter((b) => b.periodType === filters.periodType);
  return rows;
}

/**
 * @param {string} bookId
 * @param {{
 *   name: string,
 *   ledgerId: string,
 *   periodType?: string,
 *   periodKey?: string,
 *   amount: number,
 *   notes?: string,
 * }} input
 */
export async function createBudget(bookId, input) {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('Budget name is required');
  if (!input.ledgerId) throw new Error('Ledger is required');
  const led = await ledgerRepository.findById(input.ledgerId);
  if (!led || led.bookId !== bookId) throw new Error('Invalid ledger');
  if (led.nature !== ACCOUNT_NATURES.EXPENSE && led.nature !== ACCOUNT_NATURES.INCOME) {
    throw new Error('Budgets apply to Income or Expense ledgers');
  }

  const periodType =
    input.periodType === BUDGET_PERIODS.YEAR ? BUDGET_PERIODS.YEAR : BUDGET_PERIODS.MONTH;
  const periodKey =
    String(input.periodKey || '').trim() ||
    (periodType === BUDGET_PERIODS.YEAR ? yearKey() : monthKey());
  const amount = roundMoney(input.amount);
  if (amount < 0) throw new Error('Amount cannot be negative');

  const now = nowIso();
  const row = {
    id: uuid(),
    bookId,
    name,
    ledgerId: input.ledgerId,
    periodType,
    periodKey,
    amount,
    notes: String(input.notes || '').trim(),
    createdAt: now,
    updatedAt: now,
  };
  await budgetRepository.create(row);
  await auditLogRepository.log({
    bookId,
    entity: 'Budget',
    recordId: row.id,
    operation: 'Create',
    detail: { name, amount, periodKey },
  });
  emit(EVENTS.FINANCE_CHANGED, { bookId, entity: 'Budget', operation: 'Create' });
  return row;
}

/**
 * @param {string} id
 * @param {Partial<import('../models/types.js').Budget>} patch
 */
export async function updateBudget(id, patch) {
  const row = await budgetRepository.findById(id);
  if (!row) throw new Error('Budget not found');

  if (patch.name !== undefined) {
    const name = String(patch.name).trim();
    if (!name) throw new Error('Budget name is required');
    row.name = name;
  }
  if (patch.ledgerId !== undefined) {
    const led = await ledgerRepository.findById(patch.ledgerId);
    if (!led || led.bookId !== row.bookId) throw new Error('Invalid ledger');
    if (led.nature !== ACCOUNT_NATURES.EXPENSE && led.nature !== ACCOUNT_NATURES.INCOME) {
      throw new Error('Budgets apply to Income or Expense ledgers');
    }
    row.ledgerId = patch.ledgerId;
  }
  if (patch.periodType !== undefined) {
    row.periodType =
      patch.periodType === BUDGET_PERIODS.YEAR ? BUDGET_PERIODS.YEAR : BUDGET_PERIODS.MONTH;
  }
  if (patch.periodKey !== undefined) {
    const key = String(patch.periodKey).trim();
    if (!key) throw new Error('Period is required');
    row.periodKey = key;
  }
  if (patch.amount !== undefined) {
    const amount = roundMoney(patch.amount);
    if (amount < 0) throw new Error('Amount cannot be negative');
    row.amount = amount;
  }
  if (patch.notes !== undefined) row.notes = String(patch.notes).trim();

  row.updatedAt = nowIso();
  await budgetRepository.save(row);
  emit(EVENTS.FINANCE_CHANGED, { bookId: row.bookId, entity: 'Budget', operation: 'Update' });
  return row;
}

/** @param {string} id */
export async function deleteBudget(id) {
  const row = await budgetRepository.findById(id);
  if (!row) throw new Error('Budget not found');
  await budgetRepository.delete(id);
  emit(EVENTS.FINANCE_CHANGED, { bookId: row.bookId, entity: 'Budget', operation: 'Delete' });
}

/* ── Goals ─────────────────────────────────────────────── */

/** @param {string} bookId */
export async function listGoals(bookId, opts = {}) {
  let rows = await goalRepository.findByBook(bookId);
  if (opts.activeOnly) rows = rows.filter((g) => g.isActive);
  return rows;
}

/**
 * @param {string} bookId
 * @param {{
 *   name: string,
 *   category?: string,
 *   targetAmount: number,
 *   currentAmount?: number,
 *   linkedLedgerId?: string|null,
 *   targetDate?: string|null,
 *   notes?: string,
 * }} input
 */
export async function createGoal(bookId, input) {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('Goal name is required');
  const targetAmount = roundMoney(input.targetAmount);
  if (targetAmount <= 0) throw new Error('Target amount must be greater than zero');

  if (input.linkedLedgerId) {
    const led = await ledgerRepository.findById(input.linkedLedgerId);
    if (!led || led.bookId !== bookId) throw new Error('Invalid linked ledger');
  }

  const category = String(input.category || GOAL_CATEGORIES.OTHER).trim();
  const now = nowIso();
  const row = {
    id: uuid(),
    bookId,
    name,
    category: GOAL_CATEGORY_LIST.includes(category) ? category : GOAL_CATEGORIES.OTHER,
    targetAmount,
    currentAmount: roundMoney(input.currentAmount || 0),
    linkedLedgerId: input.linkedLedgerId || null,
    targetDate: input.targetDate ? String(input.targetDate) : null,
    isActive: true,
    notes: String(input.notes || '').trim(),
    createdAt: now,
    updatedAt: now,
  };
  await goalRepository.create(row);
  await auditLogRepository.log({
    bookId,
    entity: 'Goal',
    recordId: row.id,
    operation: 'Create',
    detail: { name, targetAmount },
  });
  emit(EVENTS.FINANCE_CHANGED, { bookId, entity: 'Goal', operation: 'Create' });
  return row;
}

/**
 * @param {string} id
 * @param {Partial<import('../models/types.js').Goal>} patch
 */
export async function updateGoal(id, patch) {
  const row = await goalRepository.findById(id);
  if (!row) throw new Error('Goal not found');

  if (patch.name !== undefined) {
    const name = String(patch.name).trim();
    if (!name) throw new Error('Goal name is required');
    row.name = name;
  }
  if (patch.category !== undefined) {
    const category = String(patch.category).trim();
    row.category = GOAL_CATEGORY_LIST.includes(category) ? category : GOAL_CATEGORIES.OTHER;
  }
  if (patch.targetAmount !== undefined) {
    const targetAmount = roundMoney(patch.targetAmount);
    if (targetAmount <= 0) throw new Error('Target amount must be greater than zero');
    row.targetAmount = targetAmount;
  }
  if (patch.currentAmount !== undefined) {
    row.currentAmount = roundMoney(patch.currentAmount);
  }
  if (patch.linkedLedgerId !== undefined) {
    if (patch.linkedLedgerId) {
      const led = await ledgerRepository.findById(patch.linkedLedgerId);
      if (!led || led.bookId !== row.bookId) throw new Error('Invalid linked ledger');
    }
    row.linkedLedgerId = patch.linkedLedgerId || null;
  }
  if (patch.targetDate !== undefined) {
    row.targetDate = patch.targetDate ? String(patch.targetDate) : null;
  }
  if (patch.isActive !== undefined) row.isActive = Boolean(patch.isActive);
  if (patch.notes !== undefined) row.notes = String(patch.notes).trim();

  row.updatedAt = nowIso();
  await goalRepository.save(row);
  emit(EVENTS.FINANCE_CHANGED, { bookId: row.bookId, entity: 'Goal', operation: 'Update' });
  return row;
}

/** @param {string} id */
export async function deleteGoal(id) {
  const row = await goalRepository.findById(id);
  if (!row) throw new Error('Goal not found');
  await goalRepository.delete(id);
  emit(EVENTS.FINANCE_CHANGED, { bookId: row.bookId, entity: 'Goal', operation: 'Delete' });
}

/* ── Dashboards & reports ──────────────────────────────── */

/**
 * Personal finance hub dashboard.
 * @param {string} bookId
 * @param {{ month?: string }} [opts]
 */
export async function getFinanceDashboard(bookId, opts = {}) {
  const month = opts.month || monthKey();
  const range = monthRange(month);
  const asOf = toDateInput(new Date());

  const [{ ledgers, groups, movements: monthMovements }, nwData, budgets, goals] =
    await Promise.all([
      loadMovements(bookId, range),
      loadMovements(bookId, { asOfDate: asOf }),
      listBudgets(bookId, { periodKey: month, periodType: BUDGET_PERIODS.MONTH }),
      listGoals(bookId, { activeOnly: true }),
    ]);

  const netWorth = buildNetWorth(nwData.ledgers, nwData.movements, nwData.groups);
  const cashflow = buildCashflowMetrics(ledgers, monthMovements);
  const variance = buildBudgetVariance(budgets, ledgers, monthMovements);

  const ledgersById = new Map(nwData.ledgers.map((l) => [l.id, l]));
  const goalRows = goals.map((g) => ({
    goal: g,
    progress: goalProgress(g, nwData.movements, ledgersById),
  }));

  return {
    month,
    range,
    asOfDate: asOf,
    netWorth,
    cashflow,
    budgets: variance,
    goals: goalRows,
    counts: {
      budgets: budgets.length,
      goals: goals.length,
      overBudget: variance.rows.filter((r) => r.overBudget).length,
    },
  };
}

/**
 * @param {string} bookId
 * @param {{ asOfDate?: string }} [opts]
 */
export async function netWorthReport(bookId, opts = {}) {
  const asOfDate = opts.asOfDate || toDateInput(new Date());
  const { ledgers, groups, movements } = await loadMovements(bookId, { asOfDate });
  return {
    asOfDate,
    ...buildNetWorth(ledgers, movements, groups),
  };
}

/**
 * @param {string} bookId
 * @param {{ periodKey?: string, periodType?: string }} [opts]
 */
export async function budgetVarianceReport(bookId, opts = {}) {
  const periodType =
    opts.periodType === BUDGET_PERIODS.YEAR ? BUDGET_PERIODS.YEAR : BUDGET_PERIODS.MONTH;
  const periodKey =
    opts.periodKey || (periodType === BUDGET_PERIODS.YEAR ? yearKey() : monthKey());
  const range =
    periodType === BUDGET_PERIODS.YEAR ? yearRange(periodKey) : monthRange(periodKey);

  const budgets = await listBudgets(bookId, { periodKey, periodType });
  const { ledgers, movements } = await loadMovements(bookId, range);
  const variance = buildBudgetVariance(budgets, ledgers, movements);

  return {
    periodKey,
    periodType,
    range,
    ...variance,
  };
}

/**
 * Income/expense ledgers for budget forms.
 * @param {string} bookId
 */
export async function listBudgetLedgers(bookId) {
  const ledgers = await ledgerRepository.findByBook(bookId);
  return ledgers.filter(
    (l) =>
      l.isActive &&
      (l.nature === ACCOUNT_NATURES.EXPENSE || l.nature === ACCOUNT_NATURES.INCOME)
  );
}

/**
 * Asset ledgers suitable for goal linking.
 * @param {string} bookId
 */
export async function listGoalLedgers(bookId) {
  const ledgers = await ledgerRepository.findByBook(bookId);
  return ledgers.filter((l) => l.isActive && l.nature === ACCOUNT_NATURES.ASSET);
}

/** @param {string} bookId */
export async function purgeFinance(bookId) {
  await budgetRepository.deleteByBook(bookId);
  await goalRepository.deleteByBook(bookId);
}
