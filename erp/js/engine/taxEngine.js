/**
 * Tax engine — calculate amounts and summarise tagged voucher lines (spec §11).
 */

import { TAX_COMPONENTS, TAX_TYPES } from '../core/constants.js';
import { roundMoney } from '../utils/money.js';

export const TAX_TYPE_LIST = Object.freeze(Object.values(TAX_TYPES));
export const TAX_COMPONENT_LIST = Object.freeze(Object.values(TAX_COMPONENTS));

/**
 * @param {number} baseAmount
 * @param {number} ratePercent
 */
export function calcTaxAmount(baseAmount, ratePercent) {
  const base = Math.abs(Number(baseAmount) || 0);
  const rate = Number(ratePercent) || 0;
  if (base <= 0 || rate < 0) return 0;
  return roundMoney((base * rate) / 100);
}

/**
 * Inclusive price → exclusive base + tax.
 * @param {number} inclusive
 * @param {number} ratePercent
 */
export function splitInclusive(inclusive, ratePercent) {
  const total = Math.abs(Number(inclusive) || 0);
  const rate = Number(ratePercent) || 0;
  if (total <= 0) return { base: 0, tax: 0 };
  if (rate <= 0) return { base: roundMoney(total), tax: 0 };
  const base = roundMoney(total / (1 + rate / 100));
  const tax = roundMoney(total - base);
  return { base, tax };
}

/**
 * @param {string} taxType
 */
export function isKnownTaxType(taxType) {
  return TAX_TYPE_LIST.includes(taxType);
}

/**
 * @param {string} component
 */
export function isKnownTaxComponent(component) {
  return TAX_COMPONENT_LIST.includes(component);
}

/**
 * Absolute tax amount on a voucher line (single-sided).
 * @param {{ debit?: number, credit?: number }} line
 */
export function lineTaxAmount(line) {
  return roundMoney(Math.max(Number(line.debit) || 0, Number(line.credit) || 0));
}

/**
 * Build tax summary from tagged voucher lines.
 * @param {{
 *   taxCodes: import('../models/types.js').TaxCode[],
 *   lines: import('../models/types.js').VoucherLine[],
 *   vouchersById?: Map<string, import('../models/types.js').Voucher>,
 * }} input
 */
export function buildTaxSummary(input) {
  const codeById = new Map(input.taxCodes.map((c) => [c.id, c]));

  /** @type {Map<string, { taxCode: import('../models/types.js').TaxCode, debit: number, credit: number, lineCount: number }>} */
  const byCode = new Map();

  for (const line of input.lines) {
    if (!line.taxCodeId) continue;
    const code = codeById.get(line.taxCodeId);
    if (!code) continue;
    if (!byCode.has(code.id)) {
      byCode.set(code.id, {
        taxCode: code,
        debit: 0,
        credit: 0,
        lineCount: 0,
      });
    }
    const row = /** @type {{ taxCode: any, debit: number, credit: number, lineCount: number }} */ (
      byCode.get(code.id)
    );
    row.debit = roundMoney(row.debit + (Number(line.debit) || 0));
    row.credit = roundMoney(row.credit + (Number(line.credit) || 0));
    row.lineCount += 1;
  }

  /** @type {any[]} */
  const rows = [];
  let totalInput = 0;
  let totalOutput = 0;

  for (const row of byCode.values()) {
    const isInput = row.taxCode.component === TAX_COMPONENTS.INPUT;
    // Input recoverable ≈ debit − credit; Output collected ≈ credit − debit
    const net = isInput
      ? roundMoney(row.debit - row.credit)
      : roundMoney(row.credit - row.debit);
    if (isInput) totalInput = roundMoney(totalInput + Math.max(net, 0));
    else totalOutput = roundMoney(totalOutput + Math.max(net, 0));

    rows.push({
      ...row,
      net,
      direction: isInput ? 'Input' : 'Output',
    });
  }

  rows.sort((a, b) => {
    const d = String(a.direction).localeCompare(String(b.direction));
    if (d !== 0) return d;
    return String(a.taxCode.name).localeCompare(String(b.taxCode.name));
  });

  const netPayable = roundMoney(totalOutput - totalInput);

  return {
    rows,
    totals: {
      totalInput,
      totalOutput,
      netPayable,
      lineCount: rows.reduce((s, r) => s + r.lineCount, 0),
      codesUsed: rows.length,
    },
  };
}

/**
 * Flat tax ledger entries for a period.
 * @param {{
 *   taxCodes: import('../models/types.js').TaxCode[],
 *   lines: import('../models/types.js').VoucherLine[],
 *   vouchersById: Map<string, import('../models/types.js').Voucher>,
 *   ledgersById?: Map<string, import('../models/types.js').Ledger>,
 *   taxCodeId?: string,
 * }} input
 */
export function buildTaxLedger(input) {
  const codeById = new Map(input.taxCodes.map((c) => [c.id, c]));
  /** @type {any[]} */
  const entries = [];

  for (const line of input.lines) {
    if (!line.taxCodeId) continue;
    if (input.taxCodeId && line.taxCodeId !== input.taxCodeId) continue;
    const code = codeById.get(line.taxCodeId);
    if (!code) continue;
    const voucher = input.vouchersById.get(line.voucherId);
    const ledger = input.ledgersById?.get(line.ledgerId);
    entries.push({
      line,
      taxCode: code,
      voucher,
      ledger,
      amount: lineTaxAmount(line),
    });
  }

  entries.sort((a, b) => {
    const d = String(a.line.date).localeCompare(String(b.line.date));
    if (d !== 0) return d;
    return String(a.voucher?.voucherNumber || '').localeCompare(
      String(b.voucher?.voucherNumber || '')
    );
  });

  return entries;
}
