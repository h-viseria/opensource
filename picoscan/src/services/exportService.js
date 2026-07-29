/**
 * Export helpers — always from editable document model (never raw OCR alone).
 */

import * as XLSX from '../../vendor/xlsx/xlsx.mjs';
import { fieldsToObject } from '../core/documentModel.js';
import { EVENTS } from '../core/constants.js';
import { emit } from '../core/eventBus.js';

/**
 * @param {import('../core/documentModel.js').ScanDocument} doc
 */
export function documentToJson(doc) {
  return {
    documentType: doc.documentType,
    confidence: doc.confidence,
    fields: doc.fields.map((f) => ({
      key: f.key,
      label: f.label,
      value: f.value,
      confidence: f.confidence,
    })),
    tables: doc.tables,
    rawText: doc.rawText,
    metadata: {
      id: doc.id,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      sourceName: doc.metadata?.sourceName,
      engine: doc.metadata?.engine,
    },
  };
}

/**
 * Prefer transaction/table CSV when present; otherwise field label/value CSV.
 * @param {import('../core/documentModel.js').ScanDocument} doc
 */
export function documentToCsv(doc) {
  const table = primaryTable(doc);
  if (table?.rows?.length) {
    return tableToCsv(table);
  }
  return fieldsToCsv(doc);
}

/**
 * @param {import('../core/documentModel.js').ScanDocument} doc
 */
function fieldsToCsv(doc) {
  const header = ['label', 'key', 'value', 'confidence'];
  const lines = [header.join(',')];
  for (const f of doc.fields) {
    lines.push(
      [f.label, f.key, f.value, String(Math.round(f.confidence * 100) / 100)]
        .map(csvEscape)
        .join(',')
    );
  }
  return lines.join('\n');
}

/**
 * @param {import('../core/documentModel.js').ScanTable} table
 */
function tableToCsv(table) {
  const lines = [table.headers.map(csvEscape).join(',')];
  for (const row of table.rows) {
    lines.push(row.map(csvEscape).join(','));
  }
  return lines.join('\n');
}

/**
 * @param {import('../core/documentModel.js').ScanDocument} doc
 */
function primaryTable(doc) {
  const tables = Array.isArray(doc.tables) ? doc.tables : [];
  return tables.find((t) => Array.isArray(t?.rows) && t.rows.length) || null;
}

/**
 * @param {string} value
 */
function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * @param {string} text
 * @param {string} fileName
 * @param {string} mime
 */
export function downloadText(text, fileName, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/**
 * @param {import('../core/documentModel.js').ScanDocument} doc
 */
export function exportJson(doc) {
  const payload = documentToJson(doc);
  downloadText(JSON.stringify(payload, null, 2), suggestName(doc, 'json'), 'application/json');
  emit(EVENTS.EXPORT_COMPLETED, { format: 'json' });
  return payload;
}

/**
 * @param {import('../core/documentModel.js').ScanDocument} doc
 */
export function exportCsv(doc) {
  const csv = documentToCsv(doc);
  downloadText(csv, suggestName(doc, 'csv'), 'text/csv;charset=utf-8');
  emit(EVENTS.EXPORT_COMPLETED, { format: 'csv', rows: primaryTable(doc)?.rows?.length || doc.fields.length });
  return csv;
}

/**
 * @param {import('../core/documentModel.js').ScanDocument} doc
 */
export function exportExcel(doc) {
  const book = XLSX.utils.book_new();
  const table = primaryTable(doc);

  if (table?.rows?.length) {
    const txRows = table.rows.map((row) => {
      /** @type {Record<string, string>} */
      const obj = {};
      table.headers.forEach((h, i) => {
        obj[h] = row[i] ?? '';
      });
      return obj;
    });
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(txRows), 'Transactions');
  }

  const fieldRows = doc.fields.map((f) => ({
    Label: f.label,
    Key: f.key,
    Value: f.value,
    Confidence: f.confidence,
  }));
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.json_to_sheet(
      fieldRows.length ? fieldRows : [{ Label: '', Key: '', Value: '', Confidence: '' }]
    ),
    'Fields'
  );

  const meta = XLSX.utils.json_to_sheet([
    {
      DocumentType: doc.documentType,
      Confidence: doc.confidence,
      TransactionRows: table?.rows?.length || 0,
      ...fieldsToObject(doc),
    },
  ]);
  XLSX.utils.book_append_sheet(book, meta, 'Summary');
  XLSX.writeFile(book, suggestName(doc, 'xlsx'));
  emit(EVENTS.EXPORT_COMPLETED, { format: 'xlsx' });
}

/**
 * @param {import('../core/documentModel.js').ScanDocument} doc
 */
export async function copyJson(doc) {
  const text = JSON.stringify(documentToJson(doc), null, 2);
  await navigator.clipboard.writeText(text);
  emit(EVENTS.EXPORT_COMPLETED, { format: 'clipboard-json' });
  return text;
}

/**
 * @param {import('../core/documentModel.js').ScanDocument} doc
 * @param {string} ext
 */
function suggestName(doc, ext) {
  const base = String(doc.metadata?.sourceName || doc.documentType || 'picoscan')
    .replace(/\.[^.]+$/, '')
    .replace(/[^\w\-]+/g, '_')
    .slice(0, 40);
  return `${base || 'picoscan'}_${doc.id.slice(0, 8)}.${ext}`;
}
