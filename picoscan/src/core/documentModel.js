/**
 * Shared PicoScan document model — single source of truth for UI/export.
 */

import { DOCUMENT_TYPES } from './constants.js';

/**
 * @typedef {Object} ScanField
 * @property {string} id
 * @property {string} key
 * @property {string} label
 * @property {string} value
 * @property {number} confidence 0–1
 */

/**
 * @typedef {Object} ScanTable
 * @property {string} id
 * @property {string[]} headers
 * @property {string[][]} rows
 */

/**
 * @typedef {Object} ScanDocument
 * @property {string} id
 * @property {string} documentType
 * @property {number} confidence
 * @property {ScanField[]} fields
 * @property {ScanTable[]} tables
 * @property {string} rawText
 * @property {Record<string, unknown>} metadata
 * @property {string} [previewDataUrl]
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @returns {string}
 */
export function uuid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `ps_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @param {Partial<ScanDocument>} [partial]
 * @returns {ScanDocument}
 */
export function createEmptyDocument(partial = {}) {
  const now = new Date().toISOString();
  return {
    id: partial.id || uuid(),
    documentType: partial.documentType || DOCUMENT_TYPES.UNKNOWN,
    confidence: partial.confidence ?? 0,
    fields: Array.isArray(partial.fields) ? partial.fields.map(normalizeField) : [],
    tables: Array.isArray(partial.tables) ? partial.tables : [],
    rawText: partial.rawText || '',
    metadata: { ...(partial.metadata || {}) },
    previewDataUrl: partial.previewDataUrl,
    createdAt: partial.createdAt || now,
    updatedAt: partial.updatedAt || now,
  };
}

/**
 * @param {Partial<ScanField> & { key?: string, label?: string, value?: string }} input
 * @returns {ScanField}
 */
export function normalizeField(input = {}) {
  const key = String(input.key || input.label || 'field')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '') || 'field';
  return {
    id: input.id || uuid(),
    key,
    label: String(input.label || key).trim() || key,
    value: String(input.value ?? ''),
    confidence: clamp01(Number(input.confidence) || 0),
  };
}

/**
 * @param {number} n
 */
function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * @param {ScanDocument} doc
 * @param {string} fieldId
 * @param {Partial<ScanField>} patch
 */
export function updateField(doc, fieldId, patch) {
  const fields = doc.fields.map((f) => {
    if (f.id !== fieldId) return f;
    const next = normalizeField({ ...f, ...patch, id: f.id });
    return next;
  });
  return touch({ ...doc, fields });
}

/**
 * @param {ScanDocument} doc
 * @param {Partial<ScanField>} field
 */
export function addField(doc, field) {
  return touch({ ...doc, fields: [...doc.fields, normalizeField(field)] });
}

/**
 * @param {ScanDocument} doc
 * @param {string} fieldId
 */
export function deleteField(doc, fieldId) {
  return touch({ ...doc, fields: doc.fields.filter((f) => f.id !== fieldId) });
}

/**
 * @param {ScanDocument} doc
 * @returns {Record<string, string>}
 */
export function fieldsToObject(doc) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const f of doc.fields) out[f.key] = f.value;
  return out;
}

/**
 * @param {ScanDocument} doc
 */
function touch(doc) {
  return { ...doc, updatedAt: new Date().toISOString() };
}
