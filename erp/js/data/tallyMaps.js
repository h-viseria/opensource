/**
 * Tally reserved groups and voucher types → PicoERP natures / types.
 * Static lookup only (no I/O).
 */

import { ACCOUNT_NATURES } from '../core/accountTypes.js';
import { VOUCHER_TYPES } from '../core/constants.js';

/** Parent names Tally uses for top-level (not imported as groups). */
export const TALLY_PRIMARY_PARENTS = Object.freeze(['', 'primary', 'null', 'none']);

/**
 * Reserved / common Tally group names (lowercase) → PicoERP nature.
 * Children inherit by walking PARENT until a hit.
 */
export const TALLY_GROUP_NATURE = Object.freeze({
  // PicoERP natures (if they appear as Tally names)
  asset: ACCOUNT_NATURES.ASSET,
  assets: ACCOUNT_NATURES.ASSET,
  liability: ACCOUNT_NATURES.LIABILITY,
  liabilities: ACCOUNT_NATURES.LIABILITY,
  equity: ACCOUNT_NATURES.EQUITY,
  income: ACCOUNT_NATURES.INCOME,
  incomes: ACCOUNT_NATURES.INCOME,
  expense: ACCOUNT_NATURES.EXPENSE,
  expenses: ACCOUNT_NATURES.EXPENSE,

  // Tally reserved groups
  'capital account': ACCOUNT_NATURES.EQUITY,
  'capital accounts': ACCOUNT_NATURES.EQUITY,
  'reserves & surplus': ACCOUNT_NATURES.EQUITY,
  'reserves and surplus': ACCOUNT_NATURES.EQUITY,
  'profit & loss a/c': ACCOUNT_NATURES.EQUITY,
  'profit & loss a/c.': ACCOUNT_NATURES.EQUITY,
  'profit and loss a/c': ACCOUNT_NATURES.EQUITY,
  'profit & loss': ACCOUNT_NATURES.EQUITY,

  'loans (liability)': ACCOUNT_NATURES.LIABILITY,
  'bank od a/c': ACCOUNT_NATURES.LIABILITY,
  'bank occ a/c': ACCOUNT_NATURES.LIABILITY,
  'secured loans': ACCOUNT_NATURES.LIABILITY,
  'unsecured loans': ACCOUNT_NATURES.LIABILITY,
  'current liabilities': ACCOUNT_NATURES.LIABILITY,
  'duties & taxes': ACCOUNT_NATURES.LIABILITY,
  'duties and taxes': ACCOUNT_NATURES.LIABILITY,
  provisions: ACCOUNT_NATURES.LIABILITY,
  'sundry creditors': ACCOUNT_NATURES.LIABILITY,
  'accounts payable': ACCOUNT_NATURES.LIABILITY,
  'deposits (liabilities)': ACCOUNT_NATURES.LIABILITY,
  'branch / divisions': ACCOUNT_NATURES.ASSET,
  'suspense a/c': ACCOUNT_NATURES.ASSET,

  'current assets': ACCOUNT_NATURES.ASSET,
  'bank accounts': ACCOUNT_NATURES.ASSET,
  'cash-in-hand': ACCOUNT_NATURES.ASSET,
  'cash in hand': ACCOUNT_NATURES.ASSET,
  'deposits (asset)': ACCOUNT_NATURES.ASSET,
  'loans & advances (asset)': ACCOUNT_NATURES.ASSET,
  'loans and advances (asset)': ACCOUNT_NATURES.ASSET,
  'stock-in-hand': ACCOUNT_NATURES.ASSET,
  'sundry debtors': ACCOUNT_NATURES.ASSET,
  'accounts receivable': ACCOUNT_NATURES.ASSET,
  'fixed assets': ACCOUNT_NATURES.ASSET,
  investments: ACCOUNT_NATURES.ASSET,
  'miscellaneous expenses (asset)': ACCOUNT_NATURES.ASSET,

  'sales accounts': ACCOUNT_NATURES.INCOME,
  'direct incomes': ACCOUNT_NATURES.INCOME,
  'indirect incomes': ACCOUNT_NATURES.INCOME,

  'purchase accounts': ACCOUNT_NATURES.EXPENSE,
  'direct expenses': ACCOUNT_NATURES.EXPENSE,
  'indirect expenses': ACCOUNT_NATURES.EXPENSE,
});

/**
 * Tally voucher type name (lowercase) → PicoERP voucher type.
 * Missing keys are treated as Journal unless listed in TALLY_SKIP_VOUCHER_TYPES.
 */
export const TALLY_VOUCHER_TYPE = Object.freeze({
  payment: VOUCHER_TYPES.PAYMENT,
  receipt: VOUCHER_TYPES.RECEIPT,
  contra: VOUCHER_TYPES.CONTRA,
  journal: VOUCHER_TYPES.JOURNAL,
  sales: VOUCHER_TYPES.SALES,
  purchase: VOUCHER_TYPES.PURCHASE,
  'credit note': VOUCHER_TYPES.CREDIT_NOTE,
  'debit note': VOUCHER_TYPES.DEBIT_NOTE,
  'reversing journal': VOUCHER_TYPES.JOURNAL,
  'opening balance': VOUCHER_TYPES.OPENING,
  opening: VOUCHER_TYPES.OPENING,
});

/**
 * Non-accounting / inventory Tally types — skipped by default (user can include).
 */
export const TALLY_SKIP_VOUCHER_TYPES = Object.freeze([
  'sales order',
  'purchase order',
  'quotation',
  'indent',
  'delivery note',
  'receipt note',
  'rejections in',
  'rejections out',
  'stock journal',
  'physical stock',
  'material in',
  'material out',
  'job work in',
  'job work out',
  'attendance',
  'payroll',
  'memorandum',
  'optional',
]);
