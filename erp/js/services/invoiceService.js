/**
 * Invoice application service — Sales / Purchase with stock + tax + GL.
 */

import {
  EVENTS,
  INVENTORY_TXN_TYPES,
  TAX_COMPONENTS,
  VOUCHER_TYPES,
} from '../core/constants.js';
import { emit } from '../core/eventBus.js';
import { uuid } from '../core/uuid.js';
import { nowIso, toDateInput, formatDisplayDate } from '../utils/date.js';
import { roundMoney, formatMoney } from '../utils/money.js';
import { calcTaxAmount } from '../engine/taxEngine.js';
import { invoiceRepository } from '../repositories/invoiceRepository.js';
import { ledgerRepository } from '../repositories/ledgerRepository.js';
import { itemRepository } from '../repositories/itemRepository.js';
import { unitRepository } from '../repositories/unitRepository.js';
import { warehouseRepository } from '../repositories/warehouseRepository.js';
import { taxCodeRepository } from '../repositories/taxCodeRepository.js';
import { auditLogRepository } from '../repositories/auditLogRepository.js';
import * as bookService from './bookService.js';
import * as voucherService from './voucherService.js';
import * as inventoryService from './inventoryService.js';
import * as taxService from './taxService.js';
import * as invoiceTemplateService from './invoiceTemplateService.js';

export const INVOICE_TYPES = Object.freeze({
  SALES: 'Sales',
  PURCHASE: 'Purchase',
});

/**
 * @param {string} bookId
 * @param {{ invoiceType?: string, fromDate?: string, toDate?: string }} [filters]
 */
export async function listInvoices(bookId, filters = {}) {
  let rows = await invoiceRepository.findByBook(bookId);
  if (filters.invoiceType) rows = rows.filter((r) => r.invoiceType === filters.invoiceType);
  if (filters.fromDate) rows = rows.filter((r) => r.date >= filters.fromDate);
  if (filters.toDate) rows = rows.filter((r) => r.date <= filters.toDate);
  return rows;
}

/** @param {string} id */
export async function getInvoice(id) {
  return invoiceRepository.findById(id);
}

/**
 * @param {string} bookId
 * @param {'Sales'|'Purchase'} invoiceType
 */
export async function nextInvoiceNumber(bookId, invoiceType) {
  const seq = (await invoiceRepository.maxSequence(bookId, invoiceType)) + 1;
  const prefix = invoiceType === INVOICE_TYPES.PURCHASE ? 'PINV' : 'SINV';
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
 * @param {string} id
 */
export async function deleteInvoice(id) {
  const invoice = await invoiceRepository.findById(id);
  if (!invoice) throw new Error('Invoice not found');

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

  await invoiceRepository.delete(id);
  await auditLogRepository.log({
    bookId: invoice.bookId,
    entity: 'Invoice',
    recordId: invoice.id,
    operation: 'Delete',
    detail: { invoiceNumber: invoice.invoiceNumber },
  });
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
      <h1 class="invoice-print__title">${escape(invoice.invoiceType)} Invoice</h1>
      <p class="invoice-print__meta">
        <strong>${escape(invoice.invoiceNumber)}</strong>
        · ${escape(formatDisplayDate(invoice.date))}
        · ${escape(book?.name || '')}
      </p>
      <div class="invoice-print__party">
        <div><span class="muted">Party</span><br><strong>${escape(invoice.partyName)}</strong></div>
        <div><span class="muted">Warehouse</span><br>${escape(invoice.warehouseName || '—')}</div>
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
