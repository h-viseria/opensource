/**
 * Voucher application service.
 * UI → voucherService → accountingEngine → repositories → IndexedDB
 */

import { EVENTS, STORES, VOUCHER_TYPES } from '../core/constants.js';
import { emit } from '../core/eventBus.js';
import { uuid } from '../core/uuid.js';
import { nowIso, toDateInput } from '../utils/date.js';
import { roundMoney } from '../utils/money.js';
import {
  validateVoucherLines,
  formatVoucherNumber,
  isKnownVoucherType,
  VOUCHER_TYPE_LIST,
} from '../engine/accountingEngine.js';
import { voucherRepository } from '../repositories/voucherRepository.js';
import { voucherLineRepository } from '../repositories/voucherLineRepository.js';
import { ledgerRepository } from '../repositories/ledgerRepository.js';
import { auditLogRepository } from '../repositories/auditLogRepository.js';
import { withTransaction } from '../db/database.js';
import * as idb from '../db/idb.js';
import * as bookService from './bookService.js';

export { VOUCHER_TYPE_LIST, VOUCHER_TYPES };

/**
 * @param {string} bookId
 * @param {{ voucherType?: string, fromDate?: string, toDate?: string, limit?: number }} [filters]
 */
export async function listVouchers(bookId, filters = {}) {
  let rows = await voucherRepository.findByBook(bookId);
  if (filters.voucherType) {
    rows = rows.filter((v) => v.voucherType === filters.voucherType);
  }
  if (filters.fromDate) {
    rows = rows.filter((v) => v.date >= filters.fromDate);
  }
  if (filters.toDate) {
    rows = rows.filter((v) => v.date <= filters.toDate);
  }
  if (filters.limit && filters.limit > 0) {
    rows = rows.slice(0, filters.limit);
  }
  return rows;
}

/**
 * @param {string} id
 */
export async function getVoucher(id) {
  return voucherRepository.findById(id);
}

/**
 * @param {string} id
 */
export async function getVoucherWithLines(id) {
  const voucher = await voucherRepository.findById(id);
  if (!voucher) return null;
  const lines = await voucherLineRepository.findByVoucher(id);
  return { voucher, lines };
}

/**
 * @param {string} bookId
 * @param {string} voucherType
 */
export async function nextVoucherNumber(bookId, voucherType) {
  const seq = (await voucherRepository.maxSequence(bookId, voucherType)) + 1;
  return formatVoucherNumber(voucherType, seq);
}

/**
 * Create a balanced voucher.
 * @param {{
 *   bookId: string,
 *   financialYearId: string,
 *   voucherType: string,
 *   date: string,
 *   narration?: string,
 *   voucherNumber?: string,
 *   lines: import('../engine/accountingEngine.js').LineInput[]
 * }} input
 */
export async function createVoucher(input) {
  const bookId = input.bookId;
  const voucherType = String(input.voucherType || '').trim();
  if (!isKnownVoucherType(voucherType)) {
    throw new Error(`Unknown voucher type: ${voucherType}`);
  }

  const date = String(input.date || '').trim() || toDateInput(new Date());
  const financialYearId = String(input.financialYearId || '').trim();
  if (!financialYearId) throw new Error('Financial year is required');

  const ledgers = await ledgerRepository.findByBook(bookId);
  const ledgersById = new Map(ledgers.map((l) => [l.id, l]));

  const validation = validateVoucherLines(input.lines || [], { voucherType, ledgersById });
  if (!validation.ok) {
    const err = new Error(validation.errors.join('; '));
    err.validation = validation;
    throw err;
  }

  const voucherNumber =
    String(input.voucherNumber || '').trim() ||
    (await nextVoucherNumber(bookId, voucherType));

  const now = nowIso();
  const voucherId = uuid();

  /** @type {import('../models/types.js').Voucher} */
  const voucher = {
    id: voucherId,
    bookId,
    financialYearId,
    voucherType,
    voucherNumber,
    date,
    narration: String(input.narration || '').trim(),
    debitTotal: validation.debitTotal,
    creditTotal: validation.creditTotal,
    lineCount: validation.lines.length,
    createdAt: now,
    updatedAt: now,
  };

  /** @type {import('../models/types.js').VoucherLine[]} */
  const lineRows = validation.lines.map((line) => ({
    id: uuid(),
    bookId,
    voucherId,
    financialYearId,
    voucherType,
    date,
    lineNo: line.lineNo,
    ledgerId: line.ledgerId,
    debit: line.debit,
    credit: line.credit,
    costCenterId: line.costCenterId,
    taxCodeId: line.taxCodeId,
    narration: line.narration,
    createdAt: now,
  }));

  await withTransaction([STORES.VOUCHERS, STORES.VOUCHER_LINES], 'readwrite', async (tx) => {
    const vStore = idb.store(tx, STORES.VOUCHERS);
    const lStore = idb.store(tx, STORES.VOUCHER_LINES);
    await idb.add(vStore, voucher);
    for (const row of lineRows) {
      await idb.add(lStore, row);
    }
  });

  await auditLogRepository.log({
    bookId,
    entity: 'Voucher',
    recordId: voucherId,
    operation: 'Create',
    detail: { voucherType, voucherNumber, debitTotal: voucher.debitTotal },
  });

  emit(EVENTS.VOUCHER_CHANGED, { bookId, voucherId, operation: 'Create' });
  return { voucher, lines: lineRows, warnings: validation.warnings };
}

/**
 * Replace voucher header + lines atomically.
 * @param {string} id
 * @param {{
 *   date?: string,
 *   narration?: string,
 *   voucherNumber?: string,
 *   lines: import('../engine/accountingEngine.js').LineInput[]
 * }} input
 */
export async function updateVoucher(id, input) {
  const existing = await voucherRepository.findById(id);
  if (!existing) throw new Error('Voucher not found');

  const ledgers = await ledgerRepository.findByBook(existing.bookId);
  const ledgersById = new Map(ledgers.map((l) => [l.id, l]));

  const validation = validateVoucherLines(input.lines || [], {
    voucherType: existing.voucherType,
    ledgersById,
  });
  if (!validation.ok) {
    const err = new Error(validation.errors.join('; '));
    err.validation = validation;
    throw err;
  }

  const now = nowIso();
  const date = String(input.date || existing.date).trim();
  const voucherNumber = String(input.voucherNumber || existing.voucherNumber).trim();

  /** @type {import('../models/types.js').Voucher} */
  const voucher = {
    ...existing,
    date,
    voucherNumber,
    narration: input.narration !== undefined ? String(input.narration).trim() : existing.narration,
    debitTotal: validation.debitTotal,
    creditTotal: validation.creditTotal,
    lineCount: validation.lines.length,
    updatedAt: now,
  };

  const oldLines = await voucherLineRepository.findByVoucher(id);
  /** @type {import('../models/types.js').VoucherLine[]} */
  const lineRows = validation.lines.map((line) => ({
    id: uuid(),
    bookId: existing.bookId,
    voucherId: id,
    financialYearId: existing.financialYearId,
    voucherType: existing.voucherType,
    date,
    lineNo: line.lineNo,
    ledgerId: line.ledgerId,
    debit: line.debit,
    credit: line.credit,
    costCenterId: line.costCenterId,
    taxCodeId: line.taxCodeId,
    narration: line.narration,
    createdAt: now,
  }));

  await withTransaction([STORES.VOUCHERS, STORES.VOUCHER_LINES], 'readwrite', async (tx) => {
    const vStore = idb.store(tx, STORES.VOUCHERS);
    const lStore = idb.store(tx, STORES.VOUCHER_LINES);
    await idb.put(vStore, voucher);
    for (const old of oldLines) {
      await idb.remove(lStore, old.id);
    }
    for (const row of lineRows) {
      await idb.add(lStore, row);
    }
  });

  await auditLogRepository.log({
    bookId: existing.bookId,
    entity: 'Voucher',
    recordId: id,
    operation: 'Update',
    detail: { voucherNumber, debitTotal: voucher.debitTotal },
  });

  emit(EVENTS.VOUCHER_CHANGED, { bookId: existing.bookId, voucherId: id, operation: 'Update' });
  return { voucher, lines: lineRows, warnings: validation.warnings };
}

/**
 * @param {string} id
 */
export async function deleteVoucher(id) {
  const existing = await voucherRepository.findById(id);
  if (!existing) throw new Error('Voucher not found');

  await withTransaction([STORES.VOUCHERS, STORES.VOUCHER_LINES], 'readwrite', async (tx) => {
    const vStore = idb.store(tx, STORES.VOUCHERS);
    const lStore = idb.store(tx, STORES.VOUCHER_LINES);
    const lineIndex = lStore.index('voucherId');
    const lines = await idb.getAll(lineIndex, id);
    for (const line of lines) {
      await idb.remove(lStore, line.id);
    }
    await idb.remove(vStore, id);
  });

  await auditLogRepository.log({
    bookId: existing.bookId,
    entity: 'Voucher',
    recordId: id,
    operation: 'Delete',
    detail: { voucherType: existing.voucherType, voucherNumber: existing.voucherNumber },
  });

  emit(EVENTS.VOUCHER_CHANGED, {
    bookId: existing.bookId,
    voucherId: id,
    operation: 'Delete',
  });
}

/**
 * @param {string} bookId
 */
export async function purgeVouchers(bookId) {
  const lines = await voucherLineRepository.deleteByBook(bookId);
  const vouchers = await voucherRepository.deleteByBook(bookId);
  return { vouchers, lines };
}

/**
 * Counts by type for hub dashboard.
 * @param {string} bookId
 */
export async function getVoucherStats(bookId) {
  const rows = await voucherRepository.findByBook(bookId);
  /** @type {Record<string, number>} */
  const byType = {};
  for (const t of VOUCHER_TYPE_LIST) byType[t] = 0;
  let debitTotal = 0;
  for (const v of rows) {
    byType[v.voucherType] = (byType[v.voucherType] || 0) + 1;
    debitTotal = roundMoney(debitTotal + (v.debitTotal || 0));
  }
  return { total: rows.length, byType, debitTotal };
}

/**
 * Preview validation without saving (for live UI).
 * @param {string} bookId
 * @param {string} voucherType
 * @param {import('../engine/accountingEngine.js').LineInput[]} lines
 */
export async function previewValidation(bookId, voucherType, lines) {
  const ledgers = await ledgerRepository.findByBook(bookId);
  const ledgersById = new Map(ledgers.map((l) => [l.id, l]));
  return validateVoucherLines(lines, { voucherType, ledgersById });
}

/**
 * Active session helpers for forms.
 */
export async function getEntryContext() {
  const session = await bookService.getSessionContext();
  if (!session.book || !session.financialYear) {
    throw new Error('Open a book with an active financial year first');
  }
  const ledgers = await ledgerRepository.findByBook(session.book.id);
  const activeLedgers = ledgers.filter((l) => l.isActive !== false);
  return {
    book: session.book,
    financialYear: session.financialYear,
    ledgers: activeLedgers.sort((a, b) => a.name.localeCompare(b.name)),
  };
}
