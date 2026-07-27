/**
 * Accounting engine — double-entry validation and totals.
 * UI → Services → Engine → Repository
 */

import { VOUCHER_TYPES } from '../core/constants.js';
import { ACCOUNT_NATURES } from '../core/accountTypes.js';
import { roundMoney, moneyEquals } from '../utils/money.js';

export const VOUCHER_TYPE_LIST = Object.freeze(Object.values(VOUCHER_TYPES));

/** Short series prefixes for voucher numbers. */
export const VOUCHER_PREFIX = Object.freeze({
  [VOUCHER_TYPES.OPENING]: 'OP',
  [VOUCHER_TYPES.JOURNAL]: 'JV',
  [VOUCHER_TYPES.PAYMENT]: 'PV',
  [VOUCHER_TYPES.RECEIPT]: 'RV',
  [VOUCHER_TYPES.CONTRA]: 'CV',
  [VOUCHER_TYPES.SALES]: 'SV',
  [VOUCHER_TYPES.PURCHASE]: 'PU',
  [VOUCHER_TYPES.CREDIT_NOTE]: 'CN',
  [VOUCHER_TYPES.DEBIT_NOTE]: 'DN',
});

/**
 * @typedef {{ ledgerId: string, debit?: number, credit?: number, costCenterId?: string|null, taxCodeId?: string|null, narration?: string }} LineInput
 * @typedef {{ ok: boolean, errors: string[], warnings: string[], debitTotal: number, creditTotal: number, lines: NormalizedLine[] }} ValidationResult
 * @typedef {{ ledgerId: string, debit: number, credit: number, costCenterId: string|null, taxCodeId: string|null, narration: string, lineNo: number }} NormalizedLine
 */

/**
 * Normalize and validate voucher lines. Blocks save when ok === false.
 * Rule: Sum(Debits) === Sum(Credits)
 *
 * @param {LineInput[]} rawLines
 * @param {{ voucherType?: string, ledgersById?: Map<string, import('../models/types.js').Ledger> }} [ctx]
 * @returns {ValidationResult}
 */
export function validateVoucherLines(rawLines, ctx = {}) {
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];

  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    return {
      ok: false,
      errors: ['At least two voucher lines are required'],
      warnings,
      debitTotal: 0,
      creditTotal: 0,
      lines: [],
    };
  }

  /** @type {NormalizedLine[]} */
  const lines = [];
  let debitTotal = 0;
  let creditTotal = 0;
  let lineNo = 0;

  for (const raw of rawLines) {
    const ledgerId = String(raw?.ledgerId || '').trim();
    const debit = roundMoney(raw?.debit);
    const credit = roundMoney(raw?.credit);

    // Skip completely empty rows (UI convenience)
    if (!ledgerId && debit === 0 && credit === 0) continue;

    lineNo += 1;

    if (!ledgerId) {
      errors.push(`Line ${lineNo}: ledger is required`);
      continue;
    }

    if (debit < 0 || credit < 0) {
      errors.push(`Line ${lineNo}: amounts cannot be negative`);
    }

    if (debit > 0 && credit > 0) {
      errors.push(`Line ${lineNo}: enter either debit or credit, not both`);
    }

    if (debit === 0 && credit === 0) {
      errors.push(`Line ${lineNo}: enter a debit or credit amount`);
    }

    if (ctx.ledgersById && !ctx.ledgersById.has(ledgerId)) {
      errors.push(`Line ${lineNo}: ledger not found in this book`);
    }

    const ledger = ctx.ledgersById?.get(ledgerId);
    if (ledger && ledger.isActive === false) {
      errors.push(`Line ${lineNo}: ledger "${ledger.name}" is inactive`);
    }

    debitTotal = roundMoney(debitTotal + debit);
    creditTotal = roundMoney(creditTotal + credit);

    lines.push({
      ledgerId,
      debit,
      credit,
      costCenterId: raw.costCenterId ? String(raw.costCenterId) : null,
      taxCodeId: raw.taxCodeId ? String(raw.taxCodeId) : null,
      narration: String(raw.narration || '').trim(),
      lineNo,
    });
  }

  if (lines.length < 2) {
    errors.push('At least two voucher lines with amounts are required');
  }

  // Distinct ledgers preferred but not required (split postings allowed)
  if (!moneyEquals(debitTotal, creditTotal)) {
    errors.push(
      `Debits (${debitTotal.toFixed(2)}) must equal credits (${creditTotal.toFixed(2)})`
    );
  }

  applyTypeHints(ctx.voucherType, lines, ctx.ledgersById, warnings);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    debitTotal,
    creditTotal,
    lines,
  };
}

/**
 * Soft type-specific guidance (does not block save).
 * @param {string|undefined} voucherType
 * @param {NormalizedLine[]} lines
 * @param {Map<string, import('../models/types.js').Ledger>|undefined} ledgersById
 * @param {string[]} warnings
 */
function applyTypeHints(voucherType, lines, ledgersById, warnings) {
  if (!voucherType || !ledgersById || lines.length === 0) return;

  const natures = lines.map((l) => ledgersById.get(l.ledgerId)?.nature).filter(Boolean);

  if (voucherType === VOUCHER_TYPES.CONTRA) {
    const nonAsset = natures.filter((n) => n !== ACCOUNT_NATURES.ASSET);
    if (nonAsset.length > 0) {
      warnings.push('Contra vouchers typically move between Cash/Bank (asset) accounts only');
    }
  }

  if (voucherType === VOUCHER_TYPES.PAYMENT) {
    const hasCreditAsset = lines.some((l) => {
      const led = ledgersById.get(l.ledgerId);
      return led?.nature === ACCOUNT_NATURES.ASSET && l.credit > 0;
    });
    if (!hasCreditAsset) {
      warnings.push('Payment vouchers usually credit a Cash or Bank ledger');
    }
  }

  if (voucherType === VOUCHER_TYPES.RECEIPT) {
    const hasDebitAsset = lines.some((l) => {
      const led = ledgersById.get(l.ledgerId);
      return led?.nature === ACCOUNT_NATURES.ASSET && l.debit > 0;
    });
    if (!hasDebitAsset) {
      warnings.push('Receipt vouchers usually debit a Cash or Bank ledger');
    }
  }
}

/**
 * Format next voucher number for a series.
 * @param {string} voucherType
 * @param {number} sequence 1-based
 */
export function formatVoucherNumber(voucherType, sequence) {
  const prefix = VOUCHER_PREFIX[voucherType] || 'VX';
  return `${prefix}-${String(sequence).padStart(4, '0')}`;
}

/**
 * @param {string} voucherType
 */
export function isKnownVoucherType(voucherType) {
  return VOUCHER_TYPE_LIST.includes(voucherType);
}

/**
 * Suggest blank entry lines for a voucher type (UI defaults).
 * @param {string} voucherType
 * @returns {LineInput[]}
 */
export function defaultLinesForType(voucherType) {
  // Two empty lines — user fills ledgers
  void voucherType;
  return [
    { ledgerId: '', debit: 0, credit: 0 },
    { ledgerId: '', debit: 0, credit: 0 },
  ];
}
