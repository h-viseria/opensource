/**
 * Account natures and normal balances for double-entry COA.
 */

export const ACCOUNT_NATURES = Object.freeze({
  ASSET: 'Asset',
  LIABILITY: 'Liability',
  EQUITY: 'Equity',
  INCOME: 'Income',
  EXPENSE: 'Expense',
});

/** Normal balance side for each nature (debit or credit). */
export const NORMAL_BALANCE = Object.freeze({
  [ACCOUNT_NATURES.ASSET]: 'debit',
  [ACCOUNT_NATURES.LIABILITY]: 'credit',
  [ACCOUNT_NATURES.EQUITY]: 'credit',
  [ACCOUNT_NATURES.INCOME]: 'credit',
  [ACCOUNT_NATURES.EXPENSE]: 'debit',
});

export const NATURE_ORDER = Object.freeze([
  ACCOUNT_NATURES.ASSET,
  ACCOUNT_NATURES.LIABILITY,
  ACCOUNT_NATURES.EQUITY,
  ACCOUNT_NATURES.INCOME,
  ACCOUNT_NATURES.EXPENSE,
]);

/**
 * @param {string} nature
 * @returns {'debit'|'credit'}
 */
export function normalBalanceFor(nature) {
  return NORMAL_BALANCE[nature] || 'debit';
}

/**
 * Balance sheet vs profit-and-loss classification.
 * @param {string} nature
 */
export function isBalanceSheetNature(nature) {
  return (
    nature === ACCOUNT_NATURES.ASSET ||
    nature === ACCOUNT_NATURES.LIABILITY ||
    nature === ACCOUNT_NATURES.EQUITY
  );
}

/**
 * @param {string} nature
 */
export function isProfitAndLossNature(nature) {
  return nature === ACCOUNT_NATURES.INCOME || nature === ACCOUNT_NATURES.EXPENSE;
}
