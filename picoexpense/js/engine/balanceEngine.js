/**
 * Pure account-balance math. Amounts in minor units of the account currency.
 * Transfers never change net worth; CC payments reduce liability without being expenses.
 */

import { ACCOUNT_TYPES, LIABILITY_ACCOUNT_TYPES, TXN_TYPES } from '../core/constants.js';

/**
 * @param {string} type
 */
export function isLiabilityType(type) {
  return LIABILITY_ACCOUNT_TYPES.includes(type);
}

/**
 * Signed delta for one account from one live (non-deleted) transaction.
 * Assets: positive = cash in. Liabilities: positive = outstanding increases.
 * @param {import('../models/types.js').Transaction} txn
 * @param {string} accountId
 * @param {boolean} liability
 */
export function transactionDeltaForAccount(txn, accountId, liability) {
  if (!txn || txn.deletedAt) return 0;
  const amt = Math.trunc(txn.amountMinor || 0);
  const isSource = txn.accountId === accountId;
  const isDest = txn.transferAccountId === accountId;
  if (!isSource && !isDest) return 0;

  const assetSign = liability ? -1 : 1;

  switch (txn.type) {
    case TXN_TYPES.EXPENSE:
      if (!isSource) return 0;
      return liability ? amt : -amt;
    case TXN_TYPES.INCOME:
    case TXN_TYPES.REIMBURSEMENT:
      if (!isSource) return 0;
      return liability ? -amt : amt;
    case TXN_TYPES.REFUND:
      if (!isSource) return 0;
      return liability ? -amt : amt;
    case TXN_TYPES.ADJUSTMENT:
      if (!isSource) return 0;
      return Math.trunc(txn.amountMinor || 0) * assetSign;
    case TXN_TYPES.TRANSFER:
    case TXN_TYPES.CASH_WITHDRAWAL:
    case TXN_TYPES.CASH_DEPOSIT:
    case TXN_TYPES.CREDIT_CARD_PAYMENT:
      if (isSource) return liability ? amt : -amt;
      if (isDest) return liability ? -amt : amt;
      return 0;
    default:
      return 0;
  }
}

/**
 * @param {{ openingBalanceMinor?: number, type: string, id: string }} account
 * @param {import('../models/types.js').Transaction[]} txns
 */
export function calculateAccountBalance(account, txns) {
  const liability = isLiabilityType(account.type);
  let bal = Math.trunc(account.openingBalanceMinor || 0);
  for (const t of txns) {
    bal += transactionDeltaForAccount(t, account.id, liability);
  }
  return bal;
}

/**
 * Credit-card snapshot.
 * @param {{ openingBalanceMinor?: number, creditLimitMinor?: number, type: string, id: string, statementDate?: number, paymentDueDate?: number }} account
 * @param {import('../models/types.js').Transaction[]} txns
 */
export function creditCardSnapshot(account, txns) {
  const outstanding = calculateAccountBalance(account, txns);
  const limit = Math.trunc(account.creditLimitMinor || 0);
  const available = limit - outstanding;
  const utilization = limit > 0 ? outstanding / limit : 0;
  return {
    outstanding,
    available,
    limit,
    utilization,
    statementDate: account.statementDate ?? null,
    paymentDueDate: account.paymentDueDate ?? null,
    minimumPaymentMinor: Math.max(0, Math.round(outstanding * 0.05)),
    fullPaymentMinor: Math.max(0, outstanding),
  };
}

export { ACCOUNT_TYPES };
