/**
 * Input validation used by services before IndexedDB writes.
 */

import { TXN_TYPES, PAYMENT_METHODS, REIMBURSEMENT_STATUS } from '../core/constants.js';
import { decimalsFor } from './money.js';

const TYPE_SET = new Set(Object.values(TXN_TYPES));
const PAY_SET = new Set(Object.values(PAYMENT_METHODS));
const REIMB_SET = new Set(Object.values(REIMBURSEMENT_STATUS));

/**
 * @param {string} date
 */
export function assertDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) {
    throw new Error('Date must be YYYY-MM-DD');
  }
}

/**
 * @param {number} minor
 */
export function assertMinor(minor) {
  if (!Number.isInteger(minor)) throw new Error('Amount must be an integer in minor units');
}

/**
 * @param {string} code
 */
export function assertCurrency(code) {
  if (!/^[A-Z]{3}$/.test(String(code || ''))) throw new Error('Currency must be a 3-letter code');
  decimalsFor(code);
}

/**
 * @param {string} type
 */
export function assertTxnType(type) {
  if (!TYPE_SET.has(type)) throw new Error(`Invalid transaction type: ${type}`);
}

/**
 * @param {string} [method]
 */
export function assertPaymentMethod(method) {
  if (method && !PAY_SET.has(method)) throw new Error(`Invalid payment method: ${method}`);
}

/**
 * @param {string} [status]
 */
export function assertReimbursement(status) {
  if (status && !REIMB_SET.has(status)) throw new Error('Invalid reimbursement status');
}

/**
 * @param {number} parentMinor
 * @param {{ amountMinor: number }[]} splits
 */
export function assertSplitsBalance(parentMinor, splits) {
  if (!splits?.length) return;
  const sum = splits.reduce((a, s) => a + Math.trunc(s.amountMinor || 0), 0);
  if (sum !== parentMinor) {
    throw new Error('Split amounts must equal the transaction amount');
  }
}

/**
 * @param {string} fromId
 * @param {string} toId
 */
export function assertDifferentAccounts(fromId, toId) {
  if (!fromId || !toId) throw new Error('Transfer needs source and destination accounts');
  if (fromId === toId) throw new Error('Transfer source and destination cannot be the same account');
}
