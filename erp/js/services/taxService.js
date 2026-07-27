/**
 * Tax application service — masters, seeding, and reports (spec §11).
 */

import { EVENTS, TAX_COMPONENTS, TAX_TYPES } from '../core/constants.js';
import { emit } from '../core/eventBus.js';
import { uuid } from '../core/uuid.js';
import { nowIso } from '../utils/date.js';
import { ACCOUNT_NATURES, normalBalanceFor } from '../core/accountTypes.js';
import {
  TAX_TYPE_LIST,
  TAX_COMPONENT_LIST,
  isKnownTaxType,
  isKnownTaxComponent,
  calcTaxAmount,
  splitInclusive,
  buildTaxSummary,
  buildTaxLedger,
} from '../engine/taxEngine.js';
import { DEFAULT_TAX_CODES } from '../data/taxDefaults.js';
import { taxCodeRepository } from '../repositories/taxCodeRepository.js';
import { ledgerRepository } from '../repositories/ledgerRepository.js';
import { ledgerGroupRepository } from '../repositories/ledgerGroupRepository.js';
import { voucherRepository } from '../repositories/voucherRepository.js';
import { voucherLineRepository } from '../repositories/voucherLineRepository.js';
import { auditLogRepository } from '../repositories/auditLogRepository.js';

export {
  TAX_TYPE_LIST,
  TAX_COMPONENT_LIST,
  TAX_TYPES,
  TAX_COMPONENTS,
  calcTaxAmount,
  splitInclusive,
};

const LEDGER_NAMES = {
  INPUT: 'Input Tax',
  OUTPUT: 'Output Tax',
  PAYABLE: 'Tax Payable',
};

/**
 * Ensure tax ledgers + default tax codes exist for a book.
 * @param {string} bookId
 */
export async function ensureTaxMasters(bookId) {
  await ensureTaxLedgers(bookId);
  const existing = await taxCodeRepository.findByBook(bookId);
  if (existing.length > 0) {
    return { seeded: false, codes: existing.length };
  }

  const ledgers = await ledgerRepository.findByBook(bookId);
  const byName = new Map(ledgers.map((l) => [l.name.toLowerCase(), l]));
  const now = nowIso();

  /** @type {import('../models/types.js').TaxCode[]} */
  const rows = DEFAULT_TAX_CODES.map((def) => {
    const ledger = byName.get(def.ledgerName.toLowerCase());
    return {
      id: uuid(),
      bookId,
      name: def.name,
      code: def.code,
      taxType: /** @type {any} */ (def.taxType),
      component: /** @type {any} */ (def.component),
      rate: def.rate,
      ledgerId: ledger?.id || null,
      isActive: true,
      isSystem: true,
      notes: '',
      createdAt: now,
      updatedAt: now,
    };
  });

  await taxCodeRepository.saveMany(rows);
  return { seeded: true, codes: rows.length };
}

/**
 * Ensure Input Tax / Output Tax / Tax Payable ledgers (for books seeded before Phase 6).
 * @param {string} bookId
 */
export async function ensureTaxLedgers(bookId) {
  const ledgers = await ledgerRepository.findByBook(bookId);
  const byName = new Map(ledgers.map((l) => [l.name.toLowerCase(), l]));
  const now = nowIso();
  const created = [];

  if (!byName.has(LEDGER_NAMES.INPUT.toLowerCase())) {
    const group = await findOrCreateGroup(bookId, 'Tax Receivable', ACCOUNT_NATURES.ASSET, '1700');
    const row = makeLedger(bookId, group.id, LEDGER_NAMES.INPUT, '1701', ACCOUNT_NATURES.ASSET, now);
    await ledgerRepository.create(row);
    created.push(row.name);
  }

  if (!byName.has(LEDGER_NAMES.OUTPUT.toLowerCase())) {
    const group = await findOrCreateGroup(bookId, 'Tax Payable', ACCOUNT_NATURES.LIABILITY, '2400');
    const row = makeLedger(bookId, group.id, LEDGER_NAMES.OUTPUT, '2402', ACCOUNT_NATURES.LIABILITY, now);
    await ledgerRepository.create(row);
    created.push(row.name);
  }

  if (!byName.has(LEDGER_NAMES.PAYABLE.toLowerCase())) {
    const group = await findOrCreateGroup(bookId, 'Tax Payable', ACCOUNT_NATURES.LIABILITY, '2400');
    const row = makeLedger(bookId, group.id, LEDGER_NAMES.PAYABLE, '2401', ACCOUNT_NATURES.LIABILITY, now);
    await ledgerRepository.create(row);
    created.push(row.name);
  }

  return created;
}

/**
 * @param {string} bookId
 * @param {string} groupId
 * @param {string} name
 * @param {string} code
 * @param {string} nature
 * @param {string} now
 */
function makeLedger(bookId, groupId, name, code, nature, now) {
  return {
    id: uuid(),
    bookId,
    groupId,
    name,
    code,
    nature,
    normalBalance: normalBalanceFor(nature),
    openingBalance: 0,
    openingBalanceType: nature === ACCOUNT_NATURES.LIABILITY ? 'credit' : 'debit',
    isSystem: true,
    isActive: true,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * @param {string} bookId
 * @param {string} name
 * @param {string} nature
 * @param {string} code
 */
async function findOrCreateGroup(bookId, name, nature, code) {
  const groups = await ledgerGroupRepository.findByBook(bookId);
  const existing = groups.find((g) => g.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing;

  const primary = groups.find((g) => g.isPrimary && g.nature === nature && !g.parentId);
  const now = nowIso();
  const group = {
    id: uuid(),
    bookId,
    name,
    code,
    nature,
    parentId: primary?.id ?? null,
    isPrimary: !primary,
    isSystem: true,
    sortOrder: groups.length,
    createdAt: now,
    updatedAt: now,
  };
  await ledgerGroupRepository.create(group);
  return group;
}

/** @param {string} bookId */
export async function listTaxCodes(bookId, opts = {}) {
  let rows = await taxCodeRepository.findByBook(bookId);
  if (opts.activeOnly) rows = rows.filter((t) => t.isActive);
  return rows;
}

/**
 * @param {string} bookId
 * @param {{
 *   name: string,
 *   code?: string,
 *   taxType: string,
 *   component: string,
 *   rate: number,
 *   ledgerId?: string|null,
 *   notes?: string,
 * }} input
 */
export async function createTaxCode(bookId, input) {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('Tax code name is required');
  if (!isKnownTaxType(input.taxType)) throw new Error('Invalid tax type');
  if (!isKnownTaxComponent(input.component)) throw new Error('Invalid tax component');
  const rate = Number(input.rate);
  if (!Number.isFinite(rate) || rate < 0) throw new Error('Rate must be zero or greater');

  const clash = await taxCodeRepository.findByBookAndName(bookId, name);
  if (clash) throw new Error(`Tax code "${name}" already exists`);

  if (input.ledgerId) {
    const led = await ledgerRepository.findById(input.ledgerId);
    if (!led || led.bookId !== bookId) throw new Error('Invalid ledger');
  }

  const now = nowIso();
  const row = {
    id: uuid(),
    bookId,
    name,
    code: String(input.code || '').trim(),
    taxType: /** @type {any} */ (input.taxType),
    component: /** @type {any} */ (input.component),
    rate,
    ledgerId: input.ledgerId || null,
    isActive: true,
    isSystem: false,
    notes: String(input.notes || '').trim(),
    createdAt: now,
    updatedAt: now,
  };
  await taxCodeRepository.create(row);
  await auditLogRepository.log({
    bookId,
    entity: 'TaxCode',
    recordId: row.id,
    operation: 'Create',
    detail: { name, rate },
  });
  emit(EVENTS.TAX_CHANGED, { bookId, entity: 'TaxCode', operation: 'Create' });
  return row;
}

/**
 * @param {string} id
 * @param {Partial<import('../models/types.js').TaxCode>} patch
 */
export async function updateTaxCode(id, patch) {
  const row = await taxCodeRepository.findById(id);
  if (!row) throw new Error('Tax code not found');

  if (patch.name !== undefined) {
    const name = String(patch.name).trim();
    if (!name) throw new Error('Tax code name is required');
    const clash = await taxCodeRepository.findByBookAndName(row.bookId, name);
    if (clash && clash.id !== id) throw new Error(`Tax code "${name}" already exists`);
    row.name = name;
  }
  if (patch.code !== undefined) row.code = String(patch.code).trim();
  if (patch.taxType !== undefined) {
    if (!isKnownTaxType(patch.taxType)) throw new Error('Invalid tax type');
    row.taxType = /** @type {any} */ (patch.taxType);
  }
  if (patch.component !== undefined) {
    if (!isKnownTaxComponent(patch.component)) throw new Error('Invalid tax component');
    row.component = /** @type {any} */ (patch.component);
  }
  if (patch.rate !== undefined) {
    const rate = Number(patch.rate);
    if (!Number.isFinite(rate) || rate < 0) throw new Error('Rate must be zero or greater');
    row.rate = rate;
  }
  if (patch.ledgerId !== undefined) {
    if (patch.ledgerId) {
      const led = await ledgerRepository.findById(patch.ledgerId);
      if (!led || led.bookId !== row.bookId) throw new Error('Invalid ledger');
    }
    row.ledgerId = patch.ledgerId || null;
  }
  if (patch.isActive !== undefined) row.isActive = Boolean(patch.isActive);
  if (patch.notes !== undefined) row.notes = String(patch.notes).trim();

  row.updatedAt = nowIso();
  await taxCodeRepository.save(row);
  emit(EVENTS.TAX_CHANGED, { bookId: row.bookId, entity: 'TaxCode', operation: 'Update' });
  return row;
}

/** @param {string} id */
export async function deleteTaxCode(id) {
  const row = await taxCodeRepository.findById(id);
  if (!row) throw new Error('Tax code not found');
  if (row.isSystem) throw new Error('System tax codes cannot be deleted — deactivate instead');

  const lines = await voucherLineRepository.findByBook(row.bookId);
  if (lines.some((l) => l.taxCodeId === id)) {
    throw new Error('Tax code is used on voucher lines — deactivate instead');
  }

  await taxCodeRepository.delete(id);
  emit(EVENTS.TAX_CHANGED, { bookId: row.bookId, entity: 'TaxCode', operation: 'Delete' });
}

/**
 * Hub stats.
 * @param {string} bookId
 */
export async function getTaxHubStats(bookId) {
  await ensureTaxMasters(bookId);
  const codes = await taxCodeRepository.findByBook(bookId);
  const lines = await voucherLineRepository.findByBook(bookId);
  const tagged = lines.filter((l) => l.taxCodeId);
  return {
    codes: codes.length,
    activeCodes: codes.filter((c) => c.isActive).length,
    taggedLines: tagged.length,
    byType: {
      GST: codes.filter((c) => c.taxType === TAX_TYPES.GST).length,
      VAT: codes.filter((c) => c.taxType === TAX_TYPES.VAT).length,
      'Sales Tax': codes.filter((c) => c.taxType === TAX_TYPES.SALES_TAX).length,
    },
  };
}

/**
 * @param {string} bookId
 * @param {{ fromDate: string, toDate: string }} range
 */
export async function taxSummaryReport(bookId, range) {
  await ensureTaxMasters(bookId);
  const [taxCodes, vouchers, allLines] = await Promise.all([
    taxCodeRepository.findByBook(bookId),
    voucherRepository.findByBook(bookId),
    voucherLineRepository.findByBook(bookId),
  ]);

  const voucherIds = new Set(
    vouchers
      .filter((v) => v.date >= range.fromDate && v.date <= range.toDate)
      .map((v) => v.id)
  );
  const lines = allLines.filter((l) => voucherIds.has(l.voucherId) && l.taxCodeId);

  return {
    ...buildTaxSummary({ taxCodes, lines }),
    range,
    taxCodes,
  };
}

/**
 * @param {string} bookId
 * @param {{ fromDate: string, toDate: string, taxCodeId?: string }} range
 */
export async function taxLedgerReport(bookId, range) {
  await ensureTaxMasters(bookId);
  const [taxCodes, vouchers, allLines, ledgers] = await Promise.all([
    taxCodeRepository.findByBook(bookId),
    voucherRepository.findByBook(bookId),
    voucherLineRepository.findByBook(bookId),
    ledgerRepository.findByBook(bookId),
  ]);

  const vouchersInRange = vouchers.filter(
    (v) => v.date >= range.fromDate && v.date <= range.toDate
  );
  const vouchersById = new Map(vouchersInRange.map((v) => [v.id, v]));
  const lines = allLines.filter((l) => vouchersById.has(l.voucherId) && l.taxCodeId);
  const ledgersById = new Map(ledgers.map((l) => [l.id, l]));

  const entries = buildTaxLedger({
    taxCodes,
    lines,
    vouchersById,
    ledgersById,
    taxCodeId: range.taxCodeId,
  });

  return { entries, taxCodes, range };
}

/**
 * Net tax payable for a period (Output − Input).
 * @param {string} bookId
 * @param {{ fromDate: string, toDate: string }} range
 */
export async function taxPayableReport(bookId, range) {
  const summary = await taxSummaryReport(bookId, range);
  const inputRows = summary.rows.filter((r) => r.direction === 'Input');
  const outputRows = summary.rows.filter((r) => r.direction === 'Output');
  return {
    ...summary,
    inputRows,
    outputRows,
    netPayable: summary.totals.netPayable,
  };
}

/** Ledgers suitable for linking to tax codes. */
export async function listTaxLedgers(bookId) {
  await ensureTaxLedgers(bookId);
  const ledgers = await ledgerRepository.findByBook(bookId);
  return ledgers.filter(
    (l) =>
      l.isActive &&
      (l.nature === ACCOUNT_NATURES.ASSET || l.nature === ACCOUNT_NATURES.LIABILITY) &&
      (l.name.toLowerCase().includes('tax') ||
        l.name === LEDGER_NAMES.INPUT ||
        l.name === LEDGER_NAMES.OUTPUT ||
        l.name === LEDGER_NAMES.PAYABLE)
  );
}

/** @param {string} bookId */
export async function purgeTax(bookId) {
  await taxCodeRepository.deleteByBook(bookId);
}

/**
 * Suggest a voucher tax line from base amount + tax code.
 * @param {import('../models/types.js').TaxCode} taxCode
 * @param {number} baseAmount
 * @param {'debit'|'credit'} [side] Override; default from component
 */
export function suggestTaxLine(taxCode, baseAmount, side) {
  const tax = calcTaxAmount(baseAmount, taxCode.rate);
  const autoSide =
    side ||
    (taxCode.component === TAX_COMPONENTS.INPUT ? 'debit' : 'credit');
  return {
    ledgerId: taxCode.ledgerId || '',
    taxCodeId: taxCode.id,
    debit: autoSide === 'debit' ? tax : 0,
    credit: autoSide === 'credit' ? tax : 0,
    amount: tax,
    rate: taxCode.rate,
  };
}
