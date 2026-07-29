/**
 * Knowledge-base training + import/export.
 * Pair a sample document (OCR/PDF text) with a mapped CSV to teach a category.
 */

import { DOCUMENT_TYPE_LIST, DOCUMENT_TYPES, EVENTS, APP_VERSION } from '../core/constants.js';
import { emit } from '../core/eventBus.js';
import { uuid } from '../core/documentModel.js';
import { loadImageFromFile } from '../engine/preprocess.js';
import { runOcr } from '../engine/ocr.js';
import * as knowledgeDb from '../db/knowledge.js';
import { downloadText } from './exportService.js';

/**
 * @typedef {import('../db/knowledge.js').KnowledgeEntry} KnowledgeEntry
 * @typedef {import('../db/knowledge.js').KnowledgeMapping} KnowledgeMapping
 */

/**
 * Built-in + custom category names for dropdowns.
 * @returns {Promise<string[]>}
 */
export async function listAllCategories() {
  const custom = await knowledgeDb.listCategories();
  const fromKb = (await knowledgeDb.listKnowledge()).map((e) => e.category);
  const set = new Set([
    ...DOCUMENT_TYPE_LIST.filter((t) => t !== DOCUMENT_TYPES.UNKNOWN),
    ...custom.map((c) => c.name),
    ...fromKb,
  ]);
  return [...set].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

/**
 * Ensure category exists in categories store (for custom names).
 * @param {string} name
 */
export async function ensureCategory(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('Category is required');
  const builtin = DOCUMENT_TYPE_LIST.includes(trimmed);
  if (!builtin) {
    await knowledgeDb.saveCategory({ name: trimmed });
  }
  return trimmed;
}

/**
 * Parse CSV text into headers + rows (supports quoted fields).
 * @param {string} csvText
 * @returns {{ headers: string[], rows: string[][] }}
 */
export function parseCsv(csvText) {
  const rows = parseCsvRows(String(csvText || '').replace(/^\uFEFF/, ''));
  if (!rows.length) return { headers: [], rows: [] };
  const headers = rows[0].map((h) => String(h || '').trim()).filter((h, i, arr) => h || arr.length > 1);
  const body = rows
    .slice(1)
    .map((r) => {
      const out = headers.map((_, i) => String(r[i] ?? '').trim());
      return out;
    })
    .filter((r) => r.some((c) => c));
  return { headers, rows: body };
}

/**
 * Build a mapping object from parsed CSV (+ optional doc text).
 * @param {{ headers: string[], rows: string[][] }} parsed
 * @returns {KnowledgeMapping}
 */
export function mappingFromCsv(parsed) {
  const headers = parsed.headers || [];
  const rows = parsed.rows || [];
  const lower = headers.map((h) => h.toLowerCase());

  const isFieldCsv =
    lower.includes('label') &&
    (lower.includes('value') || lower.includes('key')) &&
    headers.length <= 5;

  /** @type {import('../db/knowledge.js').KnowledgeFieldHint[]} */
  const fields = [];

  if (isFieldCsv) {
    const li = lower.indexOf('label');
    const ki = lower.indexOf('key');
    const vi = lower.indexOf('value');
    for (const row of rows) {
      const label = row[li] || '';
      const key =
        (ki >= 0 ? row[ki] : '') ||
        label
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_|_$/g, '');
      const value = vi >= 0 ? row[vi] : '';
      if (!label && !key) continue;
      const existing = fields.find((f) => f.key === key);
      if (existing) {
        if (value && !existing.examples.includes(value)) existing.examples.push(value);
      } else {
        fields.push({ label: label || key, key: key || 'field', examples: value ? [value] : [] });
      }
    }
    return { kind: 'fields', fields, table: undefined };
  }

  // Table CSV — column headers become table schema; also seed field hints from first columns
  for (const h of headers) {
    if (!h) continue;
    const key = h
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    fields.push({
      label: h,
      key,
      examples: rows
        .slice(0, 5)
        .map((r) => r[headers.indexOf(h)])
        .filter(Boolean),
    });
  }

  return {
    kind: rows.length ? 'mixed' : 'table',
    fields,
    table: { headers, sampleRowCount: rows.length },
  };
}

/**
 * Train: document file + mapped CSV → knowledge entry for category.
 * @param {{ category: string, documentFile: File, csvFile: File, password?: string, name?: string, onStatus?: (m: string) => void }} input
 */
export async function trainFromFiles(input) {
  const category = await ensureCategory(input.category);
  const onStatus = input.onStatus || (() => {});

  onStatus('Reading mapped CSV…');
  const csvText = await input.csvFile.text();
  const parsed = parseCsv(csvText);
  if (!parsed.headers.length) throw new Error('CSV has no header row');
  const mapping = mappingFromCsv(parsed);

  onStatus('Reading sample document…');
  let text = '';
  try {
    const loaded = await loadImageFromFile(input.documentFile, { password: input.password || '' });
    text = String(loaded.embeddedText || '').trim();
    if (text.length < 40) {
      onStatus('Running OCR on sample…');
      const ocr = await runOcr(loaded.dataUrl, onStatus, category);
      text = ocr.text || text;
    }
  } catch (err) {
    throw err;
  }

  const now = new Date().toISOString();
  /** @type {KnowledgeEntry} */
  const entry = {
    id: uuid(),
    category,
    name: input.name || `${category} · ${input.documentFile.name}`,
    createdAt: now,
    updatedAt: now,
    sourceDocumentName: input.documentFile.name,
    sourceCsvName: input.csvFile.name,
    textSnippet: text.slice(0, 4000),
    mapping,
    rawCsv: csvText,
  };

  await knowledgeDb.saveKnowledge(entry);
  emit(EVENTS.KNOWLEDGE_CHANGED, { action: 'train', id: entry.id, category });
  emit(EVENTS.LOG, {
    level: 'ok',
    message: `Trained “${category}” (${mapping.kind}${mapping.table ? `, ${mapping.table.headers.length} cols` : ''})`,
  });
  return entry;
}

/**
 * Latest / best mapping for a category (most recently updated).
 * @param {string} category
 * @returns {Promise<KnowledgeMapping|null>}
 */
export async function getMappingForCategory(category) {
  const rows = await knowledgeDb.listKnowledgeByCategory(category);
  if (!rows.length) return null;
  // Prefer entries that include a table schema when multiple exist
  const withTable = rows.find((r) => r.mapping?.table?.headers?.length);
  return (withTable || rows[0]).mapping || null;
}

/**
 * @returns {Promise<KnowledgeEntry[]>}
 */
export async function listKnowledgeEntries() {
  return knowledgeDb.listKnowledge();
}

/**
 * @param {string} id
 */
export async function removeKnowledgeEntry(id) {
  await knowledgeDb.deleteKnowledge(id);
  emit(EVENTS.KNOWLEDGE_CHANGED, { action: 'delete', id });
}

/**
 * Download full knowledge base JSON.
 */
export async function downloadKnowledgeBase() {
  const pack = await buildKnowledgePack();
  downloadText(JSON.stringify(pack, null, 2), `picoscan-knowledgebase-${dateStamp()}.json`, 'application/json');
  return pack;
}

/**
 * @param {string|File|Blob} source
 * @param {{ mode?: 'merge'|'replace' }} [opts]
 */
export async function uploadKnowledgeBase(source, opts = {}) {
  const text = typeof source === 'string' ? source : await source.text();
  const pack = JSON.parse(text);
  if (!pack || pack.format !== 'picoscan.knowledgebase') {
    throw new Error('Not a PicoScan knowledge base file');
  }

  const mode = opts.mode || 'merge';
  if (mode === 'replace') {
    await knowledgeDb.clearKnowledge();
    await knowledgeDb.clearCategories();
  }

  const categories = Array.isArray(pack.categories) ? pack.categories : [];
  for (const c of categories) {
    const name = typeof c === 'string' ? c : c?.name;
    if (name) await knowledgeDb.saveCategory({ name: String(name), createdAt: c?.createdAt });
  }

  const entries = Array.isArray(pack.entries) ? pack.entries : [];
  let saved = 0;
  for (const e of entries) {
    if (!e?.id || !e?.category || !e?.mapping) continue;
    await knowledgeDb.saveKnowledge({
      ...e,
      updatedAt: new Date().toISOString(),
    });
    saved += 1;
  }

  emit(EVENTS.KNOWLEDGE_CHANGED, { action: 'import', count: saved, mode });
  emit(EVENTS.LOG, { level: 'ok', message: `Knowledge base imported (${saved} entries, ${mode})` });
  return { saved, mode };
}

async function buildKnowledgePack() {
  const [entries, categories] = await Promise.all([
    knowledgeDb.listKnowledge(),
    knowledgeDb.listCategories(),
  ]);
  return {
    format: 'picoscan.knowledgebase',
    version: 1,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    categories,
    entries,
  };
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Minimal CSV row parser (RFC4180-ish).
 * @param {string} text
 */
function parseCsvRows(text) {
  /** @type {string[][]} */
  const rows = [];
  /** @type {string[]} */
  let row = [];
  let cell = '';
  let i = 0;
  let inQuotes = false;
  const s = String(text || '');
  while (i < s.length) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      row.push(cell);
      cell = '';
      i += 1;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => String(c).trim()));
}
