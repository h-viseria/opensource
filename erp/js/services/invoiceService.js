/**
 * Invoice application service — Sales / Purchase with stock + tax + GL.
 */

import {
  EVENTS,
  INVENTORY_TXN_TYPES,
  INVOICE_STATUS,
  TAX_COMPONENTS,
  VOUCHER_TYPES,
} from '../core/constants.js';
import { emit } from '../core/eventBus.js';
import { uuid } from '../core/uuid.js';
import { nowIso, toDateInput, formatDisplayDate } from '../utils/date.js';
import { roundMoney, formatMoney } from '../utils/money.js';
import { calcTaxAmount } from '../engine/taxEngine.js';
import { roundQty } from '../engine/inventoryEngine.js';
import { invoiceRepository } from '../repositories/invoiceRepository.js';
import { ledgerRepository } from '../repositories/ledgerRepository.js';
import { itemRepository } from '../repositories/itemRepository.js';
import { unitRepository } from '../repositories/unitRepository.js';
import { warehouseRepository } from '../repositories/warehouseRepository.js';
import { taxCodeRepository } from '../repositories/taxCodeRepository.js';
import { inventoryTransactionRepository } from '../repositories/inventoryTransactionRepository.js';
import { auditLogRepository } from '../repositories/auditLogRepository.js';
import * as activityLogService from './activityLogService.js';
import * as bookService from './bookService.js';
import * as voucherService from './voucherService.js';
import * as inventoryService from './inventoryService.js';
import * as taxService from './taxService.js';
import * as invoiceTemplateService from './invoiceTemplateService.js';

export const INVOICE_TYPES = Object.freeze({
  SALES: 'Sales',
  PURCHASE: 'Purchase',
  CREDIT_NOTE: 'Credit Note',
  DEBIT_NOTE: 'Debit Note',
});

const SOURCE_TYPES = new Set([INVOICE_TYPES.SALES, INVOICE_TYPES.PURCHASE]);
const NOTE_TYPES = new Set([INVOICE_TYPES.CREDIT_NOTE, INVOICE_TYPES.DEBIT_NOTE]);

/**
 * @param {any} invoice
 */
export function normalizeInvoice(invoice) {
  if (!invoice) return invoice;
  const lines = (invoice.lines || []).map((l) => ({
    ...l,
    returnedQuantity: roundQty(Number(l.returnedQuantity) || 0),
  }));
  return {
    ...invoice,
    status: invoice.status || INVOICE_STATUS.POSTED,
    returnInvoiceIds: Array.isArray(invoice.returnInvoiceIds) ? invoice.returnInvoiceIds : [],
    sourceInvoiceId: invoice.sourceInvoiceId || null,
    lines,
  };
}

/**
 * Remaining returnable quantity per line on a Sales/Purchase invoice.
 * @param {any} invoice
 */
export function getReturnableLines(invoice) {
  const inv = normalizeInvoice(invoice);
  return (inv.lines || [])
    .map((l) => {
      const returnableQuantity = roundQty(l.quantity - (Number(l.returnedQuantity) || 0));
      return { ...l, returnableQuantity };
    })
    .filter((l) => l.returnableQuantity > 0.0001);
}

/**
 * @param {any} invoice
 */
export function isSourceInvoice(invoice) {
  return SOURCE_TYPES.has(invoice?.invoiceType);
}

/**
 * @param {any} invoice
 */
export function isReturnNote(invoice) {
  return NOTE_TYPES.has(invoice?.invoiceType);
}

/**
 * @param {string} bookId
 * @param {{ invoiceType?: string, fromDate?: string, toDate?: string, status?: string }} [filters]
 */
export async function listInvoices(bookId, filters = {}) {
  let rows = (await invoiceRepository.findByBook(bookId)).map(normalizeInvoice);
  if (filters.invoiceType) rows = rows.filter((r) => r.invoiceType === filters.invoiceType);
  if (filters.status) rows = rows.filter((r) => r.status === filters.status);
  if (filters.fromDate) rows = rows.filter((r) => r.date >= filters.fromDate);
  if (filters.toDate) rows = rows.filter((r) => r.date <= filters.toDate);
  return rows;
}

/** @param {string} id */
export async function getInvoice(id) {
  return normalizeInvoice(await invoiceRepository.findById(id));
}

/**
 * @param {string} bookId
 * @param {string} invoiceType
 */
export async function nextInvoiceNumber(bookId, invoiceType) {
  const seq = (await invoiceRepository.maxSequence(bookId, invoiceType)) + 1;
  const prefix =
    invoiceType === INVOICE_TYPES.PURCHASE
      ? 'PINV'
      : invoiceType === INVOICE_TYPES.CREDIT_NOTE
        ? 'CN'
        : invoiceType === INVOICE_TYPES.DEBIT_NOTE
          ? 'DN'
          : 'SINV';
  return `${prefix}-${String(seq).padStart(4, '0')}`;
}

/**
 * Create a Sales or Purchase invoice: stock + tax + accounting voucher.
 * @param {{
 *   bookId: string,
 *   financialYearId?: string,
 *   invoiceType: 'Sales'|'Purchase',
 *   date?: string,
 *   invoiceNumber?: string,
 *   partyLedgerId: string,
 *   salesLedgerId?: string,
 *   warehouseId: string,
 *   narration?: string,
 *   lines: {
 *     itemId: string,
 *     quantity: number,
 *     rate: number,
 *     taxCodeId?: string|null,
 *   }[],
 * }} input
 */
export async function createInvoice(input) {
  const bookId = input.bookId;
  const session = await bookService.getSessionContext();
  const financialYearId = input.financialYearId || session.financialYear?.id;
  if (!financialYearId) throw new Error('Select a financial year first');

  const invoiceType = input.invoiceType;
  if (invoiceType !== INVOICE_TYPES.SALES && invoiceType !== INVOICE_TYPES.PURCHASE) {
    throw new Error('Invoice type must be Sales or Purchase');
  }

  await inventoryService.ensureInventoryMasters(bookId);
  await taxService.ensureTaxMasters(bookId);

  const party = await ledgerRepository.findById(input.partyLedgerId);
  if (!party || party.bookId !== bookId) throw new Error('Party ledger not found');

  const warehouse = await warehouseRepository.findById(input.warehouseId);
  if (!warehouse || warehouse.bookId !== bookId) throw new Error('Warehouse not found');

  const salesLedger =
    invoiceType === INVOICE_TYPES.SALES
      ? await resolveSalesLedger(bookId, input.salesLedgerId)
      : null;

  const stockLedger = await requireLedgerByName(bookId, 'Stock');
  const date = String(input.date || '').trim() || toDateInput(new Date());
  const invoiceNumber =
    String(input.invoiceNumber || '').trim() || (await nextInvoiceNumber(bookId, invoiceType));

  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    throw new Error('Add at least one invoice line');
  }

  /** @type {any[]} */
  const builtLines = [];
  let subtotal = 0;
  let taxTotal = 0;

  for (let i = 0; i < input.lines.length; i++) {
    const raw = input.lines[i];
    const item = await itemRepository.findById(raw.itemId);
    if (!item || item.bookId !== bookId) throw new Error(`Line ${i + 1}: item not found`);
    if (!item.isActive) throw new Error(`Line ${i + 1}: item is inactive`);

    const qty = Number(raw.quantity) || 0;
    const rate = roundMoney(Number(raw.rate) || 0);
    if (qty <= 0) throw new Error(`Line ${i + 1}: quantity must be positive`);
    if (rate < 0) throw new Error(`Line ${i + 1}: rate cannot be negative`);

    const amount = roundMoney(qty * rate);
    let taxCode = null;
    let taxAmount = 0;
    if (raw.taxCodeId) {
      taxCode = await taxCodeRepository.findById(raw.taxCodeId);
      if (!taxCode || taxCode.bookId !== bookId) throw new Error(`Line ${i + 1}: tax code not found`);
      const expected =
        invoiceType === INVOICE_TYPES.SALES ? TAX_COMPONENTS.OUTPUT : TAX_COMPONENTS.INPUT;
      if (taxCode.component !== expected) {
        throw new Error(
          `Line ${i + 1}: use an ${expected} tax code for ${invoiceType.toLowerCase()} invoices`
        );
      }
      taxAmount = calcTaxAmount(amount, taxCode.rate);
    }

    subtotal = roundMoney(subtotal + amount);
    taxTotal = roundMoney(taxTotal + taxAmount);
    builtLines.push({
      lineNo: i + 1,
      itemId: item.id,
      itemName: item.name,
      itemCode: item.code || '',
      unitId: item.unitId || null,
      quantity: qty,
      rate,
      amount,
      taxCodeId: taxCode?.id || null,
      taxCodeName: taxCode?.name || '',
      taxRate: taxCode?.rate || 0,
      taxAmount,
      lineTotal: roundMoney(amount + taxAmount),
      inventoryTxnId: null,
      returnedQuantity: 0,
    });
  }

  const grandTotal = roundMoney(subtotal + taxTotal);
  const narration =
    String(input.narration || '').trim() ||
    `${invoiceType} invoice ${invoiceNumber} — ${party.name}`;

  /** @type {string[]} */
  const inventoryTxnIds = [];
  /** @type {string[]} */
  const stockVoucherIds = [];
  let costTotal = 0;

  try {
    for (const line of builtLines) {
      const mov = await inventoryService.postMovement({
        bookId,
        financialYearId,
        date,
        itemId: line.itemId,
        warehouseId: input.warehouseId,
        type:
          invoiceType === INVOICE_TYPES.SALES
            ? INVENTORY_TXN_TYPES.SALE
            : INVENTORY_TXN_TYPES.PURCHASE,
        quantity: line.quantity,
        rate: line.rate,
        value: line.amount,
        narration: `${invoiceNumber} / ${line.itemName}`,
        postAccounting: false,
        counterLedgerId: undefined,
      });
      line.inventoryTxnId = mov.transaction.id;
      inventoryTxnIds.push(mov.transaction.id);
      if (invoiceType === INVOICE_TYPES.SALES) {
        costTotal = roundMoney(costTotal + (Number(mov.transaction.value) || 0));
      }
    }

    // Sales: perpetual inventory COGS voucher (cost side)
    if (invoiceType === INVOICE_TYPES.SALES && costTotal > 0) {
      const cogs = await requireLedgerByName(bookId, 'Cost of Goods Sold');
      const cogsResult = await voucherService.createVoucher({
        bookId,
        financialYearId,
        voucherType: VOUCHER_TYPES.JOURNAL,
        date,
        narration: `COGS for ${invoiceNumber}`,
        lines: [
          { ledgerId: cogs.id, debit: costTotal, credit: 0 },
          { ledgerId: stockLedger.id, debit: 0, credit: costTotal },
        ],
      });
      stockVoucherIds.push(cogsResult.voucher.id);
    }

    /** @type {{ ledgerId: string, debit: number, credit: number, taxCodeId?: string|null, narration?: string }[]} */
    const glLines = [];

    if (invoiceType === INVOICE_TYPES.SALES) {
      glLines.push({
        ledgerId: party.id,
        debit: grandTotal,
        credit: 0,
        narration: `Receivable — ${invoiceNumber}`,
      });
      glLines.push({
        ledgerId: /** @type {any} */ (salesLedger).id,
        debit: 0,
        credit: subtotal,
        narration: `Sales — ${invoiceNumber}`,
      });
      await appendTaxCredits(glLines, builtLines, bookId);
    } else {
      glLines.push({
        ledgerId: stockLedger.id,
        debit: subtotal,
        credit: 0,
        narration: `Stock — ${invoiceNumber}`,
      });
      await appendTaxDebits(glLines, builtLines, bookId);
      glLines.push({
        ledgerId: party.id,
        debit: 0,
        credit: grandTotal,
        narration: `Payable — ${invoiceNumber}`,
      });
    }

    const voucherType =
      invoiceType === INVOICE_TYPES.SALES ? VOUCHER_TYPES.SALES : VOUCHER_TYPES.PURCHASE;
    const main = await voucherService.createVoucher({
      bookId,
      financialYearId,
      voucherType,
      date,
      narration,
      lines: glLines,
    });

    const now = nowIso();
    /** @type {any} */
    const invoice = {
      id: uuid(),
      bookId,
      financialYearId,
      invoiceType,
      invoiceNumber,
      date,
      partyLedgerId: party.id,
      partyName: party.name,
      salesLedgerId: salesLedger?.id || null,
      warehouseId: input.warehouseId,
      warehouseName: warehouse.name,
      narration,
      lines: builtLines,
      subtotal,
      taxTotal,
      grandTotal,
      costTotal: invoiceType === INVOICE_TYPES.SALES ? costTotal : 0,
      voucherId: main.voucher.id,
      stockVoucherIds,
      inventoryTxnIds,
      status: INVOICE_STATUS.POSTED,
      sourceInvoiceId: null,
      returnInvoiceIds: [],
      createdAt: now,
      updatedAt: now,
    };

    await invoiceRepository.create(invoice);
    await auditLogRepository.log({
      bookId,
      entity: 'Invoice',
      recordId: invoice.id,
      operation: 'Create',
      detail: {
        invoiceType,
        invoiceNumber,
        grandTotal,
        voucherId: main.voucher.id,
      },
    });
    try {
      const book = await bookService.getBook(bookId);
      await activityLogService.recordActivity({
        category: 'Invoice',
        bookName: book?.name,
        message: `Posted ${invoiceType.toLowerCase()} invoice ${invoiceNumber} · ${party.name} · ${formatMoney(grandTotal, book?.currency || 'INR')}`,
      });
    } catch {
      /* ignore */
    }
    emit(EVENTS.INVOICE_CHANGED, { bookId, id: invoice.id, operation: 'Create' });
    emit(EVENTS.VOUCHER_CHANGED, { bookId });
    emit(EVENTS.INVENTORY_CHANGED, { bookId });
    return invoice;
  } catch (err) {
    // Best-effort cleanup of inventory postings if GL fails mid-way
    for (const id of [...inventoryTxnIds].reverse()) {
      try {
        await inventoryService.deleteMovement(id);
      } catch {
        /* ignore */
      }
    }
    for (const id of [...stockVoucherIds].reverse()) {
      try {
        await voucherService.deleteVoucher(id);
      } catch {
        /* ignore */
      }
    }
    throw err;
  }
}

/**
 * Post a Credit Note (sales return) or Debit Note (purchase return) against a source invoice.
 * Supports partial quantities per line.
 *
 * @param {{
 *   sourceInvoiceId: string,
 *   date?: string,
 *   invoiceNumber?: string,
 *   narration?: string,
 *   reason?: string,
 *   lines: { lineNo: number, quantity: number }[],
 * }} input
 */
export async function createReturnNote(input) {
  const source = await getInvoice(input.sourceInvoiceId);
  if (!source) throw new Error('Source invoice not found');
  if (!isSourceInvoice(source)) {
    throw new Error('Returns can only be posted against Sales or Purchase invoices');
  }
  if (source.status === INVOICE_STATUS.CANCELLED) {
    throw new Error('Invoice is already cancelled — nothing left to return');
  }

  const bookId = source.bookId;
  const session = await bookService.getSessionContext();
  const financialYearId = session.financialYear?.id;
  if (!financialYearId) throw new Error('Select a financial year first');

  const noteType =
    source.invoiceType === INVOICE_TYPES.SALES
      ? INVOICE_TYPES.CREDIT_NOTE
      : INVOICE_TYPES.DEBIT_NOTE;

  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    throw new Error('Select at least one line to return');
  }

  const sourceByLine = new Map((source.lines || []).map((l) => [l.lineNo, l]));
  /** @type {any[]} */
  const builtLines = [];
  let subtotal = 0;
  let taxTotal = 0;

  for (let i = 0; i < input.lines.length; i++) {
    const raw = input.lines[i];
    const srcLine = sourceByLine.get(Number(raw.lineNo));
    if (!srcLine) throw new Error(`Line ${raw.lineNo}: not found on source invoice`);

    const qty = roundQty(Number(raw.quantity) || 0);
    const already = roundQty(Number(srcLine.returnedQuantity) || 0);
    const returnable = roundQty(srcLine.quantity - already);
    if (qty <= 0) throw new Error(`Line ${srcLine.lineNo}: quantity must be positive`);
    if (qty > returnable + 0.0001) {
      throw new Error(
        `Line ${srcLine.lineNo}: only ${returnable} of ${srcLine.quantity} remaining to return`
      );
    }

    const rate = roundMoney(Number(srcLine.rate) || 0);
    const amount = roundMoney(qty * rate);
    let taxAmount = 0;
    if (srcLine.taxCodeId && srcLine.taxRate) {
      taxAmount = calcTaxAmount(amount, srcLine.taxRate);
    } else if (srcLine.taxCodeId && srcLine.taxAmount && srcLine.quantity) {
      taxAmount = roundMoney((srcLine.taxAmount * qty) / srcLine.quantity);
    }

    subtotal = roundMoney(subtotal + amount);
    taxTotal = roundMoney(taxTotal + taxAmount);
    builtLines.push({
      lineNo: i + 1,
      sourceLineNo: srcLine.lineNo,
      itemId: srcLine.itemId,
      itemName: srcLine.itemName,
      itemCode: srcLine.itemCode || '',
      unitId: srcLine.unitId || null,
      quantity: qty,
      rate,
      amount,
      taxCodeId: srcLine.taxCodeId || null,
      taxCodeName: srcLine.taxCodeName || '',
      taxRate: srcLine.taxRate || 0,
      taxAmount,
      lineTotal: roundMoney(amount + taxAmount),
      inventoryTxnId: null,
      returnedQuantity: 0,
      sourceInventoryTxnId: srcLine.inventoryTxnId || null,
    });
  }

  const grandTotal = roundMoney(subtotal + taxTotal);
  const date = String(input.date || '').trim() || toDateInput(new Date());
  const invoiceNumber =
    String(input.invoiceNumber || '').trim() || (await nextInvoiceNumber(bookId, noteType));
  const reason = String(input.reason || input.narration || '').trim();
  const narration =
    reason ||
    `${noteType} against ${source.invoiceNumber} — ${source.partyName}`;

  const party = await ledgerRepository.findById(source.partyLedgerId);
  if (!party || party.bookId !== bookId) throw new Error('Party ledger not found');

  const salesLedger =
    noteType === INVOICE_TYPES.CREDIT_NOTE
      ? await resolveSalesLedger(bookId, source.salesLedgerId || undefined)
      : null;
  const stockLedger = await requireLedgerByName(bookId, 'Stock');

  /** @type {string[]} */
  const inventoryTxnIds = [];
  /** @type {string[]} */
  const stockVoucherIds = [];
  let costTotal = 0;

  try {
    for (const line of builtLines) {
      let costRate = line.rate;
      if (noteType === INVOICE_TYPES.CREDIT_NOTE && line.sourceInventoryTxnId) {
        const origTxn = await inventoryTransactionRepository.findById(line.sourceInventoryTxnId);
        if (origTxn && Number(origTxn.rate) > 0) {
          costRate = roundMoney(Number(origTxn.rate));
        }
      }

      const mov = await inventoryService.postMovement({
        bookId,
        financialYearId,
        date,
        itemId: line.itemId,
        warehouseId: source.warehouseId,
        type:
          noteType === INVOICE_TYPES.CREDIT_NOTE
            ? INVENTORY_TXN_TYPES.SALES_RETURN
            : INVENTORY_TXN_TYPES.PURCHASE_RETURN,
        quantity: line.quantity,
        rate: costRate,
        value: roundMoney(line.quantity * costRate),
        narration: `${invoiceNumber} / ${line.itemName} (vs ${source.invoiceNumber})`,
        postAccounting: false,
        counterLedgerId: undefined,
      });
      line.inventoryTxnId = mov.transaction.id;
      inventoryTxnIds.push(mov.transaction.id);
      if (noteType === INVOICE_TYPES.CREDIT_NOTE) {
        costTotal = roundMoney(costTotal + (Number(mov.transaction.value) || 0));
      }
    }

    // Credit note: reverse COGS (Dr Stock Cr COGS)
    if (noteType === INVOICE_TYPES.CREDIT_NOTE && costTotal > 0) {
      const cogs = await requireLedgerByName(bookId, 'Cost of Goods Sold');
      const cogsResult = await voucherService.createVoucher({
        bookId,
        financialYearId,
        voucherType: VOUCHER_TYPES.JOURNAL,
        date,
        narration: `COGS reversal for ${invoiceNumber}`,
        lines: [
          { ledgerId: stockLedger.id, debit: costTotal, credit: 0 },
          { ledgerId: cogs.id, debit: 0, credit: costTotal },
        ],
      });
      stockVoucherIds.push(cogsResult.voucher.id);
    }

    /** @type {{ ledgerId: string, debit: number, credit: number, taxCodeId?: string|null, narration?: string }[]} */
    const glLines = [];

    if (noteType === INVOICE_TYPES.CREDIT_NOTE) {
      glLines.push({
        ledgerId: /** @type {any} */ (salesLedger).id,
        debit: subtotal,
        credit: 0,
        narration: `Sales return — ${invoiceNumber}`,
      });
      await appendTaxDebits(glLines, builtLines, bookId);
      // Relabel tax narration for output reversal
      for (const gl of glLines) {
        if (gl.narration === 'Input tax') gl.narration = 'Output tax reversal';
      }
      glLines.push({
        ledgerId: party.id,
        debit: 0,
        credit: grandTotal,
        narration: `Credit note — ${invoiceNumber}`,
      });
    } else {
      glLines.push({
        ledgerId: party.id,
        debit: grandTotal,
        credit: 0,
        narration: `Debit note — ${invoiceNumber}`,
      });
      glLines.push({
        ledgerId: stockLedger.id,
        debit: 0,
        credit: subtotal,
        narration: `Purchase return — ${invoiceNumber}`,
      });
      await appendTaxCredits(glLines, builtLines, bookId);
      for (const gl of glLines) {
        if (gl.narration === 'Output tax') gl.narration = 'Input tax reversal';
      }
    }

    const voucherType =
      noteType === INVOICE_TYPES.CREDIT_NOTE
        ? VOUCHER_TYPES.CREDIT_NOTE
        : VOUCHER_TYPES.DEBIT_NOTE;
    const main = await voucherService.createVoucher({
      bookId,
      financialYearId,
      voucherType,
      date,
      narration,
      lines: glLines,
    });

    const now = nowIso();
    /** @type {any} */
    const note = {
      id: uuid(),
      bookId,
      financialYearId,
      invoiceType: noteType,
      invoiceNumber,
      date,
      partyLedgerId: party.id,
      partyName: party.name,
      salesLedgerId: salesLedger?.id || null,
      warehouseId: source.warehouseId,
      warehouseName: source.warehouseName,
      narration,
      reason: reason || '',
      lines: builtLines,
      subtotal,
      taxTotal,
      grandTotal,
      costTotal: noteType === INVOICE_TYPES.CREDIT_NOTE ? costTotal : 0,
      voucherId: main.voucher.id,
      stockVoucherIds,
      inventoryTxnIds,
      status: INVOICE_STATUS.POSTED,
      sourceInvoiceId: source.id,
      sourceInvoiceNumber: source.invoiceNumber,
      returnInvoiceIds: [],
      createdAt: now,
      updatedAt: now,
    };

    await invoiceRepository.create(note);

    // Update source returned quantities + status
    const updatedSourceLines = (source.lines || []).map((l) => {
      const ret = builtLines.find((b) => b.sourceLineNo === l.lineNo);
      if (!ret) return l;
      return {
        ...l,
        returnedQuantity: roundQty((Number(l.returnedQuantity) || 0) + ret.quantity),
      };
    });
    const returnInvoiceIds = [...(source.returnInvoiceIds || []), note.id];
    const updatedSource = {
      ...source,
      lines: updatedSourceLines,
      returnInvoiceIds,
      status: computeSourceStatus(updatedSourceLines),
      updatedAt: now,
    };
    await invoiceRepository.save(updatedSource);

    await auditLogRepository.log({
      bookId,
      entity: 'Invoice',
      recordId: note.id,
      operation: 'Create',
      detail: {
        invoiceType: noteType,
        invoiceNumber,
        grandTotal,
        sourceInvoiceId: source.id,
        sourceInvoiceNumber: source.invoiceNumber,
      },
    });
    try {
      const book = await bookService.getBook(bookId);
      await activityLogService.recordActivity({
        category: 'Return',
        bookName: book?.name,
        message: `Posted ${noteType.toLowerCase()} ${invoiceNumber} against ${source.invoiceNumber} · ${source.partyName} · ${formatMoney(grandTotal, book?.currency || 'INR')}`,
      });
    } catch {
      /* ignore */
    }
    emit(EVENTS.INVOICE_CHANGED, { bookId, id: note.id, operation: 'Create' });
    emit(EVENTS.VOUCHER_CHANGED, { bookId });
    emit(EVENTS.INVENTORY_CHANGED, { bookId });
    return normalizeInvoice(note);
  } catch (err) {
    for (const id of [...inventoryTxnIds].reverse()) {
      try {
        await inventoryService.deleteMovement(id);
      } catch {
        /* ignore */
      }
    }
    for (const id of [...stockVoucherIds].reverse()) {
      try {
        await voucherService.deleteVoucher(id);
      } catch {
        /* ignore */
      }
    }
    throw err;
  }
}

/**
 * Cancel a Sales/Purchase invoice by returning all remaining quantities.
 * @param {string} id
 * @param {{ date?: string, reason?: string }} [opts]
 */
export async function cancelInvoice(id, opts = {}) {
  const source = await getInvoice(id);
  if (!source) throw new Error('Invoice not found');
  if (!isSourceInvoice(source)) {
    throw new Error('Only Sales or Purchase invoices can be cancelled');
  }
  if (source.status === INVOICE_STATUS.CANCELLED) {
    throw new Error('Invoice is already cancelled');
  }

  const remaining = getReturnableLines(source);
  if (remaining.length === 0) {
    throw new Error('Nothing left to cancel — all quantities already returned');
  }

  const reason = String(opts.reason || '').trim() || `Cancellation of ${source.invoiceNumber}`;
  const note = await createReturnNote({
    sourceInvoiceId: id,
    date: opts.date,
    reason,
    narration: reason,
    lines: remaining.map((l) => ({ lineNo: l.lineNo, quantity: l.returnableQuantity })),
  });

  const refreshed = await getInvoice(id);
  if (refreshed) {
    refreshed.status = INVOICE_STATUS.CANCELLED;
    refreshed.cancelledAt = nowIso();
    refreshed.cancelReason = reason;
    refreshed.updatedAt = nowIso();
    await invoiceRepository.save(refreshed);
  }

  await auditLogRepository.log({
    bookId: source.bookId,
    entity: 'Invoice',
    recordId: id,
    operation: 'Cancel',
    detail: { invoiceNumber: source.invoiceNumber, returnNoteId: note.id, reason },
  });
  try {
    const book = await bookService.getBook(source.bookId);
    await activityLogService.recordActivity({
      category: 'Invoice',
      bookName: book?.name,
      message: `Cancelled ${source.invoiceType.toLowerCase()} invoice ${source.invoiceNumber} (via ${note.invoiceNumber})`,
    });
  } catch {
    /* ignore */
  }
  emit(EVENTS.INVOICE_CHANGED, { bookId: source.bookId, id, operation: 'Cancel' });
  return { invoice: await getInvoice(id), returnNote: note };
}

/**
 * @param {any[]} lines
 */
function computeSourceStatus(lines) {
  let anyReturned = false;
  let allReturned = true;
  for (const l of lines || []) {
    const returned = roundQty(Number(l.returnedQuantity) || 0);
    if (returned > 0.0001) anyReturned = true;
    if (returned + 0.0001 < roundQty(l.quantity)) allReturned = false;
  }
  if (allReturned && anyReturned) return INVOICE_STATUS.CANCELLED;
  if (anyReturned) return INVOICE_STATUS.PARTIALLY_RETURNED;
  return INVOICE_STATUS.POSTED;
}

/**
 * @param {string} id
 */
export async function deleteInvoice(id) {
  const invoice = await getInvoice(id);
  if (!invoice) throw new Error('Invoice not found');

  if (isSourceInvoice(invoice) && (invoice.returnInvoiceIds || []).length > 0) {
    throw new Error(
      'This invoice has credit/debit notes. Delete the return notes first, or keep the invoice for audit.'
    );
  }

  for (const txnId of invoice.inventoryTxnIds || []) {
    try {
      await inventoryService.deleteMovement(txnId);
    } catch (err) {
      console.warn('[Invoice] could not delete movement', txnId, err);
    }
  }
  for (const vid of invoice.stockVoucherIds || []) {
    try {
      await voucherService.deleteVoucher(vid);
    } catch (err) {
      console.warn('[Invoice] could not delete stock voucher', vid, err);
    }
  }
  if (invoice.voucherId) {
    try {
      await voucherService.deleteVoucher(invoice.voucherId);
    } catch (err) {
      console.warn('[Invoice] could not delete invoice voucher', invoice.voucherId, err);
    }
  }

  if (isReturnNote(invoice) && invoice.sourceInvoiceId) {
    const source = await getInvoice(invoice.sourceInvoiceId);
    if (source) {
      const noteLinesBySource = new Map(
        (invoice.lines || []).map((l) => [l.sourceLineNo, l.quantity])
      );
      const updatedLines = (source.lines || []).map((l) => {
        const qty = noteLinesBySource.get(l.lineNo) || 0;
        if (!qty) return l;
        return {
          ...l,
          returnedQuantity: roundQty(Math.max(0, (Number(l.returnedQuantity) || 0) - qty)),
        };
      });
      const returnInvoiceIds = (source.returnInvoiceIds || []).filter((rid) => rid !== invoice.id);
      const updated = {
        ...source,
        lines: updatedLines,
        returnInvoiceIds,
        status: computeSourceStatus(updatedLines),
        cancelledAt: undefined,
        cancelReason: undefined,
        updatedAt: nowIso(),
      };
      await invoiceRepository.save(updated);
    }
  }

  await invoiceRepository.delete(id);
  await auditLogRepository.log({
    bookId: invoice.bookId,
    entity: 'Invoice',
    recordId: invoice.id,
    operation: 'Delete',
    detail: { invoiceNumber: invoice.invoiceNumber, invoiceType: invoice.invoiceType },
  });
  try {
    const book = await bookService.getBook(invoice.bookId);
    await activityLogService.recordActivity({
      category: 'Invoice',
      bookName: book?.name,
      message: `Deleted ${String(invoice.invoiceType || 'invoice').toLowerCase()} ${invoice.invoiceNumber}`,
    });
  } catch {
    /* ignore */
  }
  emit(EVENTS.INVOICE_CHANGED, { bookId: invoice.bookId, id: invoice.id, operation: 'Delete' });
  return true;
}

/**
 * Build printable HTML for an invoice (used by PDF preview).
 * @param {any} invoice
 * @param {{ book?: any, currency?: string }} [ctx]
 */
export async function buildInvoicePrintHtml(invoice, ctx = {}) {
  const book = ctx.book || (await bookService.getBook(invoice.bookId));
  const currency = ctx.currency || book?.currency || 'INR';
  const units = await unitRepository.findByBook(invoice.bookId);
  const unitById = new Map(units.map((u) => [u.id, u]));

  const rows = (invoice.lines || [])
    .map((l) => {
      const unit = l.unitId ? unitById.get(l.unitId)?.symbol || unitById.get(l.unitId)?.name || '' : '';
      return `<tr>
        <td>${l.lineNo}</td>
        <td>${escape(l.itemName)}${l.itemCode ? ` <span class="muted">(${escape(l.itemCode)})</span>` : ''}</td>
        <td class="num">${l.quantity}${unit ? ` ${escape(unit)}` : ''}</td>
        <td class="num mono">${formatMoney(l.rate, currency)}</td>
        <td class="num mono">${formatMoney(l.amount, currency)}</td>
        <td class="num mono">${l.taxRate ? `${l.taxRate}%` : '—'}</td>
        <td class="num mono">${formatMoney(l.taxAmount, currency)}</td>
        <td class="num mono">${formatMoney(l.lineTotal, currency)}</td>
      </tr>`;
    })
    .join('');

  return `
    <div class="invoice-print">
      <div class="invoice-print__brand">PicoERP</div>
      <h1 class="invoice-print__title">${escape(invoice.invoiceType)}${
        isReturnNote(invoice) ? '' : ' Invoice'
      }</h1>
      <p class="invoice-print__meta">
        <strong>${escape(invoice.invoiceNumber)}</strong>
        · ${escape(formatDisplayDate(invoice.date))}
        · ${escape(book?.name || '')}
        ${invoice.status && invoice.status !== 'Posted' ? ` · ${escape(invoice.status)}` : ''}
      </p>
      <div class="invoice-print__party">
        <div><span class="muted">Party</span><br><strong>${escape(invoice.partyName)}</strong></div>
        <div><span class="muted">Warehouse</span><br>${escape(invoice.warehouseName || '—')}</div>
        ${
          invoice.sourceInvoiceNumber
            ? `<div><span class="muted">Against</span><br>${escape(invoice.sourceInvoiceNumber)}</div>`
            : ''
        }
      </div>
      ${invoice.narration ? `<p class="invoice-print__narration">${escape(invoice.narration)}</p>` : ''}
      <table class="data-table">
        <thead>
          <tr>
            <th>#</th><th>Item</th><th class="num">Qty</th><th class="num">Rate</th>
            <th class="num">Amount</th><th class="num">Tax</th><th class="num">Tax amt</th><th class="num">Total</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr><td colspan="7"><strong>Subtotal</strong></td><td class="num mono"><strong>${formatMoney(invoice.subtotal, currency)}</strong></td></tr>
          <tr><td colspan="7"><strong>Tax</strong></td><td class="num mono"><strong>${formatMoney(invoice.taxTotal, currency)}</strong></td></tr>
          <tr class="report-total"><td colspan="7"><strong>Grand total</strong></td><td class="num mono"><strong>${formatMoney(invoice.grandTotal, currency)}</strong></td></tr>
        </tfoot>
      </table>
    </div>`;
}

/**
 * Fill a Word/ODT template and return a downloadable file.
 * @param {string} invoiceId
 * @param {string} [templateId]
 */
export async function generateInvoiceFromTemplate(invoiceId, templateId) {
  const invoice = await invoiceRepository.findById(invoiceId);
  if (!invoice) throw new Error('Invoice not found');
  const book = await bookService.getBook(invoice.bookId);
  const currency = book?.currency || 'INR';

  let template = null;
  if (templateId) {
    template = await invoiceTemplateService.getTemplate(templateId);
  } else {
    template = await invoiceTemplateService.getDefaultTemplate(invoice.bookId, invoice.invoiceType);
  }
  if (!template) throw new Error('No invoice template found — upload one under Invoice templates');

  const units = await unitRepository.findByBook(invoice.bookId);
  const unitById = new Map(units.map((u) => [u.id, u]));
  const data = invoiceTemplateService.buildPlaceholderData(invoice, {
    book,
    currency,
    unitById,
  });
  return invoiceTemplateService.fillTemplate(template, data);
}

/**
 * @param {any[]} glLines
 * @param {any[]} builtLines
 * @param {string} [_bookId]
 */
async function appendTaxCredits(glLines, builtLines, _bookId) {
  /** @type {Map<string, { ledgerId: string, amount: number, taxCodeId: string }>} */
  const byCode = new Map();
  for (const line of builtLines) {
    if (!line.taxCodeId || line.taxAmount <= 0) continue;
    const taxCode = await taxCodeRepository.findById(line.taxCodeId);
    if (!taxCode?.ledgerId) throw new Error(`Tax code ${line.taxCodeName} has no linked ledger`);
    const prev = byCode.get(line.taxCodeId) || {
      ledgerId: taxCode.ledgerId,
      amount: 0,
      taxCodeId: line.taxCodeId,
    };
    prev.amount = roundMoney(prev.amount + line.taxAmount);
    byCode.set(line.taxCodeId, prev);
  }
  for (const t of byCode.values()) {
    glLines.push({
      ledgerId: t.ledgerId,
      debit: 0,
      credit: t.amount,
      taxCodeId: t.taxCodeId,
      narration: 'Output tax',
    });
  }
}

/**
 * @param {any[]} glLines
 * @param {any[]} builtLines
 * @param {string} [_bookId]
 */
async function appendTaxDebits(glLines, builtLines, _bookId) {
  /** @type {Map<string, { ledgerId: string, amount: number, taxCodeId: string }>} */
  const byCode = new Map();
  for (const line of builtLines) {
    if (!line.taxCodeId || line.taxAmount <= 0) continue;
    const taxCode = await taxCodeRepository.findById(line.taxCodeId);
    if (!taxCode?.ledgerId) throw new Error(`Tax code ${line.taxCodeName} has no linked ledger`);
    const prev = byCode.get(line.taxCodeId) || {
      ledgerId: taxCode.ledgerId,
      amount: 0,
      taxCodeId: line.taxCodeId,
    };
    prev.amount = roundMoney(prev.amount + line.taxAmount);
    byCode.set(line.taxCodeId, prev);
  }
  for (const t of byCode.values()) {
    glLines.push({
      ledgerId: t.ledgerId,
      debit: t.amount,
      credit: 0,
      taxCodeId: t.taxCodeId,
      narration: 'Input tax',
    });
  }
}

/**
 * @param {string} bookId
 * @param {string} [salesLedgerId]
 */
async function resolveSalesLedger(bookId, salesLedgerId) {
  if (salesLedgerId) {
    const led = await ledgerRepository.findById(salesLedgerId);
    if (!led || led.bookId !== bookId) throw new Error('Sales ledger not found');
    return led;
  }
  return requireLedgerByName(bookId, 'Sales');
}

/**
 * @param {string} bookId
 * @param {string} name
 */
async function requireLedgerByName(bookId, name) {
  const ledgers = await ledgerRepository.findByBook(bookId);
  const led = ledgers.find((l) => l.name.toLowerCase() === name.toLowerCase());
  if (!led) throw new Error(`Ledger “${name}” not found — open Masters to seed the chart`);
  return led;
}

/** @param {string} s */
function escape(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
