/**
 * Backup / restore — JSON export of IndexedDB (spec §17).
 * Format: *.erp.json with schema validation on restore.
 */

import { APP_NAME, APP_VERSION, DB_VERSION, STORES, EVENTS } from '../core/constants.js';
import { emit } from '../core/eventBus.js';
import { getDatabase, withTransaction, closeDatabase, deleteDatabase } from '../db/database.js';
import * as idb from '../db/idb.js';
import { nowIso, toDateInput } from '../utils/date.js';
import { auditLogRepository } from '../repositories/auditLogRepository.js';

export const BACKUP_FORMAT = 'picoerp.erp.json';
/** Accepted legacy formats from the former LedgerForge branding. */
const LEGACY_BACKUP_FORMATS = Object.freeze(['ledgerforge.erp.json']);
export const BACKUP_SCHEMA_VERSION = 1;

/** Stores that carry bookId (everything except books + settings). */
const BOOK_SCOPED_STORES = Object.freeze([
  STORES.FINANCIAL_YEARS,
  STORES.LEDGER_GROUPS,
  STORES.LEDGERS,
  STORES.CUSTOMERS,
  STORES.SUPPLIERS,
  STORES.COST_CENTERS,
  STORES.UNITS,
  STORES.ITEM_CATEGORIES,
  STORES.CATALOGUE_TYPES,
  STORES.ITEMS,
  STORES.WAREHOUSES,
  STORES.TAX_CODES,
  STORES.VOUCHERS,
  STORES.VOUCHER_LINES,
  STORES.INVENTORY_TRANSACTIONS,
  STORES.INVOICES,
  STORES.INVOICE_TEMPLATES,
  STORES.BUDGETS,
  STORES.GOALS,
  STORES.ATTACHMENTS,
  STORES.AUDIT_LOGS,
]);

const ALL_STORE_NAMES = Object.freeze(Object.values(STORES));

/**
 * @returns {Promise<Record<string, unknown[]>>}
 */
async function dumpAllStores() {
  const db = await getDatabase();
  /** @type {Record<string, unknown[]>} */
  const stores = {};
  await withTransaction(ALL_STORE_NAMES, 'readonly', async (tx) => {
    for (const name of ALL_STORE_NAMES) {
      if (!db.objectStoreNames.contains(name)) {
        stores[name] = [];
        continue;
      }
      stores[name] = await idb.getAll(idb.store(tx, name));
    }
  });
  return stores;
}

/**
 * @param {string} bookId
 * @param {Record<string, unknown[]>} all
 */
function filterBookStores(bookId, all) {
  /** @type {Record<string, unknown[]>} */
  const stores = {};
  stores[STORES.BOOKS] = (all[STORES.BOOKS] || []).filter((b) => b && b.id === bookId);
  for (const name of BOOK_SCOPED_STORES) {
    stores[name] = (all[name] || []).filter((row) => row && row.bookId === bookId);
  }
  // Settings are global — omit from book-only backup (or include empty)
  stores[STORES.SETTINGS] = [];
  return stores;
}

/**
 * @param {Record<string, unknown[]>} stores
 */
function countStores(stores) {
  /** @type {Record<string, number>} */
  const counts = {};
  let total = 0;
  for (const [name, rows] of Object.entries(stores)) {
    const n = Array.isArray(rows) ? rows.length : 0;
    counts[name] = n;
    total += n;
  }
  return { counts, totalRecords: total };
}

/**
 * Build download filename: BookName_YYYYMMDD.erp.json
 * @param {string} baseName
 */
export function backupFileName(baseName) {
  const safe = String(baseName || 'PicoERP')
    .replace(/[^\w\-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60) || 'PicoERP';
  const day = toDateInput(new Date()).replace(/-/g, '');
  return `${safe}_${day}.erp.json`;
}

/**
 * Full application backup (all books + settings).
 */
export async function exportFullBackup() {
  const stores = await dumpAllStores();
  const { counts, totalRecords } = countStores(stores);
  const payload = {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appName: APP_NAME,
    appVersion: APP_VERSION,
    dbVersion: DB_VERSION,
    scope: 'full',
    exportedAt: nowIso(),
    stores,
    meta: { counts, totalRecords },
  };
  return {
    payload,
    fileName: backupFileName(APP_NAME),
    summary: { scope: 'full', totalRecords, bookCount: (stores[STORES.BOOKS] || []).length },
  };
}

/**
 * Single-book backup.
 * @param {string} bookId
 */
export async function exportBookBackup(bookId) {
  const all = await dumpAllStores();
  const book = (all[STORES.BOOKS] || []).find((b) => b && b.id === bookId);
  if (!book) throw new Error('Book not found');

  const stores = filterBookStores(bookId, all);
  const { counts, totalRecords } = countStores(stores);
  const payload = {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appName: APP_NAME,
    appVersion: APP_VERSION,
    dbVersion: DB_VERSION,
    scope: 'book',
    bookId,
    bookName: book.name,
    exportedAt: nowIso(),
    stores,
    meta: { counts, totalRecords },
  };
  return {
    payload,
    fileName: backupFileName(book.name),
    summary: { scope: 'book', bookName: book.name, totalRecords },
  };
}

/**
 * Validate backup JSON structure (schema validation — spec §17).
 * @param {unknown} raw
 */
export function validateBackup(raw) {
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];

  if (!raw || typeof raw !== 'object') {
    return { ok: false, errors: ['Backup is not a JSON object'], warnings };
  }

  const data = /** @type {Record<string, unknown>} */ (raw);

  if (data.format !== BACKUP_FORMAT && !LEGACY_BACKUP_FORMATS.includes(String(data.format || ''))) {
    errors.push(`Unsupported format (expected ${BACKUP_FORMAT})`);
  }

  const schemaVersion = Number(data.schemaVersion);
  if (!Number.isFinite(schemaVersion) || schemaVersion < 1) {
    errors.push('Missing or invalid schemaVersion');
  } else if (schemaVersion > BACKUP_SCHEMA_VERSION) {
    errors.push(
      `Backup schema v${schemaVersion} is newer than this app (v${BACKUP_SCHEMA_VERSION}). Upgrade PicoERP first.`
    );
  }

  if (data.scope !== 'full' && data.scope !== 'book') {
    errors.push('scope must be "full" or "book"');
  }

  if (!data.stores || typeof data.stores !== 'object') {
    errors.push('Missing stores object');
  } else {
    const stores = /** @type {Record<string, unknown>} */ (data.stores);
    for (const [name, rows] of Object.entries(stores)) {
      if (!ALL_STORE_NAMES.includes(name)) {
        warnings.push(`Unknown store ignored: ${name}`);
      }
      if (!Array.isArray(rows)) {
        errors.push(`Store "${name}" must be an array`);
      }
    }
    if (data.scope === 'book') {
      const books = stores[STORES.BOOKS];
      if (!Array.isArray(books) || books.length !== 1) {
        errors.push('Book backup must contain exactly one book');
      }
    }
    if (data.scope === 'full' && !Array.isArray(stores[STORES.BOOKS])) {
      errors.push('Full backup must include a books array');
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    scope: data.scope,
    bookName: data.bookName || null,
    exportedAt: data.exportedAt || null,
    appVersion: data.appVersion || null,
    schemaVersion,
    totalRecords: summarizeRaw(data),
  };
}

/**
 * @param {Record<string, unknown>} data
 */
function summarizeRaw(data) {
  const stores = data.stores;
  if (!stores || typeof stores !== 'object') return 0;
  let n = 0;
  for (const rows of Object.values(/** @type {Record<string, unknown>} */ (stores))) {
    if (Array.isArray(rows)) n += rows.length;
  }
  return n;
}

/**
 * Parse file text into validated backup.
 * @param {string} text
 */
export function parseBackupText(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['File is not valid JSON'], warnings: [] };
  }
  const validation = validateBackup(raw);
  return { ...validation, raw: validation.ok ? raw : null };
}

/**
 * Clear all object stores (keeps DB open).
 */
async function clearAllStores() {
  const db = await getDatabase();
  const names = ALL_STORE_NAMES.filter((n) => db.objectStoreNames.contains(n));
  await withTransaction(names, 'readwrite', async (tx) => {
    for (const name of names) {
      await idb.clear(idb.store(tx, name));
    }
  });
}

/**
 * Remove one book's records from all book-scoped stores + books row.
 * @param {string} bookId
 */
async function purgeBookRecords(bookId) {
  const db = await getDatabase();
  const names = [STORES.BOOKS, ...BOOK_SCOPED_STORES].filter((n) =>
    db.objectStoreNames.contains(n)
  );

  await withTransaction(names, 'readwrite', async (tx) => {
    const bookStore = idb.store(tx, STORES.BOOKS);
    await idb.remove(bookStore, bookId);

    for (const name of BOOK_SCOPED_STORES) {
      if (!db.objectStoreNames.contains(name)) continue;
      const objectStore = idb.store(tx, name);
      if (objectStore.indexNames.contains('bookId')) {
        const index = objectStore.index('bookId');
        const rows = await idb.getAll(index, bookId);
        for (const row of rows) {
          if (row && row.id != null) await idb.remove(objectStore, row.id);
        }
      }
    }
  });
}

/**
 * Write store payloads (put each record).
 * @param {Record<string, unknown[]>} stores
 */
async function writeStores(stores) {
  const db = await getDatabase();
  const names = Object.keys(stores).filter(
    (n) => ALL_STORE_NAMES.includes(n) && db.objectStoreNames.contains(n)
  );

  // Chunk large writes across transactions to avoid long locks
  const CHUNK = 400;
  for (const name of names) {
    const rows = stores[name] || [];
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      await withTransaction(name, 'readwrite', async (tx) => {
        const objectStore = idb.store(tx, name);
        for (const row of slice) {
          if (row && typeof row === 'object') {
            await idb.put(objectStore, row);
          }
        }
      });
    }
  }
}

/**
 * Restore a full backup — replaces all local data.
 * @param {Record<string, unknown>} backup validated payload
 */
export async function restoreFullBackup(backup) {
  const validation = validateBackup(backup);
  if (!validation.ok) throw new Error(validation.errors.join('; '));
  if (backup.scope !== 'full') throw new Error('Not a full backup — use book restore');

  const stores = /** @type {Record<string, unknown[]>} */ (backup.stores);
  await clearAllStores();
  await writeStores(stores);

  try {
    await auditLogRepository.log({
      bookId: null,
      entity: 'Backup',
      operation: 'Restore',
      detail: {
        scope: 'full',
        exportedAt: backup.exportedAt,
        totalRecords: validation.totalRecords,
      },
    });
  } catch {
    /* audit store may have been restored already */
  }

  emit(EVENTS.BOOK_CHANGED, { bookId: null });
  return { scope: 'full', totalRecords: validation.totalRecords };
}

/**
 * Restore a single book — replaces that book if id exists, otherwise imports as new.
 * @param {Record<string, unknown>} backup
 */
export async function restoreBookBackup(backup) {
  const validation = validateBackup(backup);
  if (!validation.ok) throw new Error(validation.errors.join('; '));
  if (backup.scope !== 'book' && backup.scope !== 'full') {
    throw new Error('Unsupported backup scope');
  }

  const stores = /** @type {Record<string, unknown[]>} */ (backup.stores);
  const books = stores[STORES.BOOKS] || [];
  if (books.length === 0) throw new Error('Backup contains no books');

  // If full backup passed in, restore only first book (or all books as merge)
  if (backup.scope === 'full') {
    for (const book of books) {
      if (!book || !book.id) continue;
      await purgeBookRecords(book.id);
      const filtered = filterBookStores(book.id, stores);
      await writeStores(filtered);
    }
    emit(EVENTS.BOOK_CHANGED, { bookId: books[0]?.id ?? null });
    return { scope: 'full-as-books', bookCount: books.length };
  }

  const book = books[0];
  if (!book?.id) throw new Error('Invalid book record in backup');

  await purgeBookRecords(book.id);
  // Don't restore settings from book backup
  const toWrite = { ...stores, [STORES.SETTINGS]: [] };
  await writeStores(toWrite);

  try {
    await auditLogRepository.log({
      bookId: book.id,
      entity: 'Backup',
      recordId: book.id,
      operation: 'Restore',
      detail: { scope: 'book', bookName: book.name, exportedAt: backup.exportedAt },
    });
  } catch {
    /* ignore */
  }

  emit(EVENTS.BOOK_CHANGED, { bookId: book.id, book });
  return { scope: 'book', bookId: book.id, bookName: book.name };
}

/**
 * Trigger browser download of a backup payload.
 * @param {object} payload
 * @param {string} fileName
 */
export function downloadBackup(payload, fileName) {
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  downloadBlob(blob, fileName);
}

/**
 * @param {Blob} blob
 * @param {string} fileName
 */
export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Build a compressed ZIP blob containing the backup JSON.
 * @param {object} payload
 * @param {string} [jsonFileName]
 * @returns {Promise<{ blob: Blob, zipFileName: string, jsonFileName: string }>}
 */
export async function buildBackupZip(payload, jsonFileName) {
  const { zipDeflate } = await import('../utils/zip.js');
  const inner =
    jsonFileName ||
    String(backupFileName(String(payload.bookName || payload.appName || APP_NAME))).replace(
      /\.erp\.json$/i,
      '.erp.json'
    );
  const safeInner = inner.toLowerCase().endsWith('.json') ? inner : `${inner}.erp.json`;
  const bytes = new TextEncoder().encode(JSON.stringify(payload, null, 2));
  const buffer = await zipDeflate({ [safeInner]: bytes });
  const zipFileName = safeInner.replace(/\.erp\.json$/i, '.erp.zip').replace(/\.json$/i, '.zip');
  return {
    blob: new Blob([buffer], { type: 'application/zip' }),
    zipFileName,
    jsonFileName: safeInner,
  };
}

/**
 * Read a local File/Blob as text or unzip and extract backup JSON.
 * @param {File|Blob} file
 * @param {string} [fileName]
 */
export async function parseBackupFile(file, fileName = '') {
  const name = String(fileName || (file instanceof File ? file.name : '') || '').toLowerCase();
  const isZip =
    name.endsWith('.zip') ||
    name.endsWith('.erp.zip') ||
    file.type === 'application/zip' ||
    file.type === 'application/x-zip-compressed';

  if (isZip) {
    const { unzip } = await import('../utils/zip.js');
    const buffer = await file.arrayBuffer();
    const files = await unzip(buffer);
    const jsonEntry =
      [...files.keys()].find((k) => /\.erp\.json$/i.test(k) || /\.json$/i.test(k)) || null;
    if (!jsonEntry) {
      return { ok: false, errors: ['ZIP has no .json / .erp.json backup inside'], warnings: [] };
    }
    const text = new TextDecoder('utf-8').decode(files.get(jsonEntry));
    return parseBackupText(text);
  }

  const text = await readFileAsText(file);
  return parseBackupText(text);
}

/**
 * Read a File as text.
 * @param {File|Blob} file
 */
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Could not read file'));
    reader.readAsText(file);
  });
}

export { closeDatabase, deleteDatabase };
