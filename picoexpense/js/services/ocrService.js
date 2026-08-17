/**
 * OCR façade — UI talks to extract(), never to PicoScan directly.
 */

import { extract as adapterExtract, isAvailable } from '../ocr/picoScanAdapter.js';
import { parseReceiptText } from '../ocr/receiptParser.js';

/**
 * @param {{ file?: File, document?: object, rawText?: string }} input
 */
export async function extract(input) {
  if (input?.document) {
    return normalizeScan(input.document);
  }
  if (input?.rawText) {
    return parseReceiptText(input.rawText);
  }
  if (input?.file) {
    const scanned = await adapterExtract(input.file);
    if (scanned) return scanned;
  }
  throw new Error('PicoScan is currently unavailable. You can enter the transaction manually.');
}

export async function picoScanAvailable() {
  return isAvailable();
}

function normalizeScan(doc) {
  const fields = Array.isArray(doc.fields) ? doc.fields : [];
  const map = {};
  for (const f of fields) {
    const key = String(f.key || f.label || '').toLowerCase();
    map[key] = f.value;
  }
  const text = doc.rawText || fields.map((f) => `${f.label}: ${f.value}`).join('\n');
  const parsed = parseReceiptText(text, map);
  return {
    ...parsed,
    documentType: doc.documentType,
    confidence: doc.confidence,
    rawText: text,
    fields,
    tables: doc.tables || [],
    previewDataUrl: doc.previewDataUrl || doc.metadata?.previewDataUrl,
    source: 'picoscan',
  };
}

export { normalizeScan };
