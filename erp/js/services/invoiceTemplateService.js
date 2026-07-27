/**
 * Invoice template service — upload Word/ODT templates and fill placeholders.
 */

import { EVENTS } from '../core/constants.js';
import { emit } from '../core/eventBus.js';
import { uuid } from '../core/uuid.js';
import { nowIso, formatDisplayDate } from '../utils/date.js';
import { formatMoney } from '../utils/money.js';
import { unzip, zipStore } from '../utils/zip.js';
import { invoiceTemplateRepository } from '../repositories/invoiceTemplateRepository.js';
import { auditLogRepository } from '../repositories/auditLogRepository.js';
import { buildSampleInvoiceDocx } from './sampleInvoiceTemplates.js';

export const TEMPLATE_PLACEHOLDERS = Object.freeze([
  { key: '{{invoice_number}}', desc: 'Invoice number (e.g. SINV-0001)' },
  { key: '{{invoice_type}}', desc: 'Sales or Purchase' },
  { key: '{{invoice_date}}', desc: 'Invoice date (display format)' },
  { key: '{{invoice_date_iso}}', desc: 'Invoice date YYYY-MM-DD' },
  { key: '{{book_name}}', desc: 'Active book name' },
  { key: '{{currency}}', desc: 'Book currency code' },
  { key: '{{party_name}}', desc: 'Customer or supplier ledger name' },
  { key: '{{warehouse_name}}', desc: 'Warehouse name' },
  { key: '{{narration}}', desc: 'Invoice narration' },
  { key: '{{subtotal}}', desc: 'Goods total before tax' },
  { key: '{{tax_total}}', desc: 'Total tax amount' },
  { key: '{{grand_total}}', desc: 'Invoice grand total' },
  { key: '{{line_count}}', desc: 'Number of item lines' },
  {
    key: '{{items_table}}',
    desc: 'All item lines as plain text rows (No | Item | Qty | Rate | Amount | Tax | Total)',
  },
  {
    key: '{{#lines}} … {{/lines}}',
    desc: 'Repeat block per item. Inside use {{line_no}}, {{item_name}}, {{item_code}}, {{qty}}, {{unit}}, {{rate}}, {{amount}}, {{tax_rate}}, {{tax_amount}}, {{line_total}}',
  },
]);

/**
 * @param {string} bookId
 */
export async function listTemplates(bookId) {
  return invoiceTemplateRepository.findByBook(bookId);
}

/** @param {string} id */
export async function getTemplate(id) {
  return invoiceTemplateRepository.findById(id);
}

/**
 * @param {string} bookId
 * @param {'Sales'|'Purchase'|string} [invoiceType]
 */
export async function getDefaultTemplate(bookId, invoiceType) {
  const all = await listTemplates(bookId);
  if (!all.length) return null;
  const typed = invoiceType
    ? all.find((t) => t.isDefault && (t.appliesTo === invoiceType || t.appliesTo === 'Both'))
    : null;
  if (typed) return typed;
  const anyDefault = all.find((t) => t.isDefault);
  return anyDefault || all[0];
}

/**
 * @param {{
 *   bookId: string,
 *   name: string,
 *   fileName: string,
 *   format: 'docx'|'odt',
 *   appliesTo?: 'Sales'|'Purchase'|'Both',
 *   isDefault?: boolean,
 *   bytes: ArrayBuffer,
 * }} input
 */
export async function saveTemplate(input) {
  const format = input.format === 'odt' ? 'odt' : 'docx';
  if (!input.bytes || !(input.bytes instanceof ArrayBuffer) || input.bytes.byteLength === 0) {
    throw new Error('Template file is empty');
  }
  // Validate ZIP structure early
  await unzip(input.bytes);

  if (input.isDefault) {
    await clearDefaultFlags(input.bookId, input.appliesTo || 'Both');
  }

  const now = nowIso();
  const row = {
    id: uuid(),
    bookId: input.bookId,
    name: String(input.name || input.fileName || 'Template').trim(),
    fileName: String(input.fileName || `template.${format}`),
    format,
    appliesTo: input.appliesTo === 'Sales' || input.appliesTo === 'Purchase' ? input.appliesTo : 'Both',
    isDefault: Boolean(input.isDefault),
    bytesBase64: arrayBufferToBase64(input.bytes),
    size: input.bytes.byteLength,
    createdAt: now,
    updatedAt: now,
  };
  await invoiceTemplateRepository.create(row);
  await auditLogRepository.log({
    bookId: input.bookId,
    entity: 'InvoiceTemplate',
    recordId: row.id,
    operation: 'Create',
    detail: { name: row.name, format: row.format },
  });
  emit(EVENTS.INVOICE_CHANGED, { bookId: input.bookId, entity: 'Template', operation: 'Create' });
  return row;
}

/**
 * @param {string} id
 * @param {{ name?: string, appliesTo?: string, isDefault?: boolean }} patch
 */
export async function updateTemplate(id, patch) {
  const row = await invoiceTemplateRepository.findById(id);
  if (!row) throw new Error('Template not found');
  if (patch.isDefault) {
    await clearDefaultFlags(row.bookId, patch.appliesTo || row.appliesTo || 'Both');
  }
  const next = {
    ...row,
    name: patch.name != null ? String(patch.name).trim() : row.name,
    appliesTo:
      patch.appliesTo === 'Sales' || patch.appliesTo === 'Purchase' || patch.appliesTo === 'Both'
        ? patch.appliesTo
        : row.appliesTo,
    isDefault: patch.isDefault != null ? Boolean(patch.isDefault) : row.isDefault,
    updatedAt: nowIso(),
  };
  await invoiceTemplateRepository.save(next);
  return next;
}

/** @param {string} id */
export async function deleteTemplate(id) {
  const row = await invoiceTemplateRepository.findById(id);
  if (!row) throw new Error('Template not found');
  await invoiceTemplateRepository.delete(id);
  emit(EVENTS.INVOICE_CHANGED, { bookId: row.bookId, entity: 'Template', operation: 'Delete' });
  return true;
}

/**
 * @param {any} template
 * @param {Record<string, string>} data
 */
export async function fillTemplate(template, data) {
  const buffer = base64ToArrayBuffer(template.bytesBase64 || '');
  if (!buffer.byteLength) throw new Error('Template file data is missing');
  const files = await unzip(buffer);
  const xmlPath = template.format === 'odt' ? 'content.xml' : 'word/document.xml';
  const xmlBytes = files.get(xmlPath);
  if (!xmlBytes) throw new Error(`Template is missing ${xmlPath}`);

  let xml = new TextDecoder('utf-8').decode(xmlBytes);
  xml = expandLineBlocks(xml, data);
  xml = replacePlaceholders(xml, data);

  files.set(xmlPath, new TextEncoder().encode(xml));
  const out = zipStore(files);
  const base = String(template.fileName || `invoice.${template.format}`).replace(/\.(docx|odt)$/i, '');
  const fileName = `${base}-${data.invoice_number_raw || 'filled'}.${template.format}`;
  return {
    bytes: out,
    fileName,
    mime:
      template.format === 'odt'
        ? 'application/vnd.oasis.opendocument.text'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
}

/**
 * @param {any} invoice
 * @param {{ book?: any, currency?: string, unitById?: Map<string, any> }} ctx
 */
export function buildPlaceholderData(invoice, ctx = {}) {
  const currency = ctx.currency || 'INR';
  const unitById = ctx.unitById || new Map();
  const lines = invoice.lines || [];

  const itemRows = lines.map((l) => {
    const unit = l.unitId
      ? unitById.get(l.unitId)?.symbol || unitById.get(l.unitId)?.name || ''
      : '';
    return {
      line_no: String(l.lineNo),
      item_name: String(l.itemName || ''),
      item_code: String(l.itemCode || ''),
      qty: String(l.quantity),
      unit: String(unit),
      rate: formatMoney(l.rate, currency),
      amount: formatMoney(l.amount, currency),
      tax_rate: l.taxRate ? `${l.taxRate}%` : '',
      tax_amount: formatMoney(l.taxAmount, currency),
      line_total: formatMoney(l.lineTotal, currency),
    };
  });

  const itemsTable = itemRows
    .map(
      (r) =>
        `${r.line_no} | ${r.item_name}${r.item_code ? ` (${r.item_code})` : ''} | ${r.qty}${
          r.unit ? ` ${r.unit}` : ''
        } | ${r.rate} | ${r.amount} | ${r.tax_rate || '—'} | ${r.tax_amount} | ${r.line_total}`
    )
    .join('\n');

  return {
    invoice_number: String(invoice.invoiceNumber || ''),
    invoice_number_raw: String(invoice.invoiceNumber || '').replace(/[^\w.-]+/g, '_'),
    invoice_type: String(invoice.invoiceType || ''),
    invoice_date: formatDisplayDate(invoice.date),
    invoice_date_iso: String(invoice.date || ''),
    book_name: String(ctx.book?.name || ''),
    currency,
    party_name: String(invoice.partyName || ''),
    warehouse_name: String(invoice.warehouseName || ''),
    narration: String(invoice.narration || ''),
    subtotal: formatMoney(invoice.subtotal, currency),
    tax_total: formatMoney(invoice.taxTotal, currency),
    grand_total: formatMoney(invoice.grandTotal, currency),
    line_count: String(lines.length),
    items_table: itemsTable,
    __lines: itemRows,
  };
}

/**
 * Download a built-in shop sample .docx (Sales or Purchase).
 * @param {'Sales'|'Purchase'} invoiceType
 */
export function downloadSampleTemplate(invoiceType) {
  const sample = buildSampleInvoiceDocx(invoiceType === 'Purchase' ? 'Purchase' : 'Sales');
  downloadFilledTemplate({
    bytes: sample.bytes,
    fileName: sample.fileName,
    mime: sample.mime,
  });
  return sample;
}

/**
 * Save a built-in sample into the book as an editable template (and optionally set default).
 * @param {string} bookId
 * @param {'Sales'|'Purchase'} invoiceType
 * @param {{ isDefault?: boolean }} [opts]
 */
export async function installSampleTemplate(bookId, invoiceType, opts = {}) {
  const sample = buildSampleInvoiceDocx(invoiceType === 'Purchase' ? 'Purchase' : 'Sales');
  return saveTemplate({
    bookId,
    name: sample.name,
    fileName: sample.fileName,
    format: 'docx',
    appliesTo: sample.appliesTo,
    isDefault: opts.isDefault !== false,
    bytes: sample.bytes,
  });
}

/**
 * Trigger browser download of filled template bytes.
 * @param {{ bytes: ArrayBuffer, fileName: string, mime: string }} file
 */
export function downloadFilledTemplate(file) {
  const blob = new Blob([file.bytes], { type: file.mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * @param {string} bookId
 * @param {string} appliesTo
 */
async function clearDefaultFlags(bookId, appliesTo) {
  const all = await listTemplates(bookId);
  for (const t of all) {
    if (!t.isDefault) continue;
    if (appliesTo !== 'Both' && t.appliesTo !== 'Both' && t.appliesTo !== appliesTo) continue;
    await invoiceTemplateRepository.save({ ...t, isDefault: false, updatedAt: nowIso() });
  }
}

/**
 * @param {string} xml
 * @param {Record<string, any>} data
 */
function expandLineBlocks(xml, data) {
  const lines = data.__lines || [];
  const startToken = '{{#lines}}';
  const endToken = '{{/lines}}';
  let out = xml;
  let guard = 0;
  while (guard++ < 20) {
    const sIdx = out.indexOf(startToken);
    if (sIdx < 0) break;
    const eIdx = out.indexOf(endToken, sIdx + startToken.length);
    if (eIdx < 0) break;
    const blockInner = out.slice(sIdx + startToken.length, eIdx);
    const expanded = lines
      .map((line) => replacePlaceholders(blockInner, { ...data, ...line }))
      .join('');
    out = out.slice(0, sIdx) + expanded + out.slice(eIdx + endToken.length);
  }
  return out;
}

/**
 * @param {string} xml
 * @param {Record<string, string>} data
 */
function replacePlaceholders(xml, data) {
  let out = xml;
  const keys = [
    'invoice_number',
    'invoice_type',
    'invoice_date',
    'invoice_date_iso',
    'book_name',
    'currency',
    'party_name',
    'warehouse_name',
    'narration',
    'subtotal',
    'tax_total',
    'grand_total',
    'line_count',
    'items_table',
    'line_no',
    'item_name',
    'item_code',
    'qty',
    'unit',
    'rate',
    'amount',
    'tax_rate',
    'tax_amount',
    'line_total',
  ];
  for (const key of keys) {
    if (data[key] == null) continue;
    const token = `{{${key}}}`;
    out = out.split(token).join(escapeXml(String(data[key])));
  }
  // Remove leftover block markers if present
  out = out.replace(/\{\{\s*#lines\s*\}\}/gi, '').replace(/\{\{\s*\/lines\s*\}\}/gi, '');
  return out;
}

/** @param {string} s */
function escapeXml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** @param {ArrayBuffer} buffer */
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** @param {string} b64 */
function base64ToArrayBuffer(b64) {
  const binary = atob(String(b64 || ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
