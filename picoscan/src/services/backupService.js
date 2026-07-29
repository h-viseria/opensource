/**
 * Full IndexedDB backup / restore for PicoScan.
 */

import { APP_NAME, APP_VERSION, DB_NAME, DB_VERSION, EVENTS, STORES } from '../core/constants.js';
import { emit } from '../core/eventBus.js';
import { openDb } from '../db/idb.js';
import { downloadText } from './exportService.js';

const FORMAT = 'picoscan.backup';
const STORE_LIST = Object.freeze([
  STORES.DOCUMENTS,
  STORES.SETTINGS,
  STORES.KNOWLEDGE,
  STORES.CATEGORIES,
]);

/**
 * @returns {Promise<{ format: string, version: number, app: string, appVersion: string, dbName: string, dbVersion: number, exportedAt: string, stores: Record<string, unknown[]> }>}
 */
export async function buildFullBackup() {
  const db = await openDb();
  /** @type {Record<string, unknown[]>} */
  const stores = {};
  for (const name of STORE_LIST) {
    stores[name] = await readAll(db, name);
  }
  return {
    format: FORMAT,
    version: 1,
    app: APP_NAME,
    appVersion: APP_VERSION,
    dbName: DB_NAME,
    dbVersion: DB_VERSION,
    exportedAt: new Date().toISOString(),
    stores,
  };
}

/**
 * Download full backup JSON.
 */
export async function downloadFullBackup() {
  const pack = await buildFullBackup();
  const stamp = new Date().toISOString().slice(0, 10);
  downloadText(JSON.stringify(pack), `picoscan-backup-${stamp}.json`, 'application/json');
  emit(EVENTS.LOG, {
    level: 'ok',
    message: `Full backup downloaded (${countRows(pack.stores)} records)`,
  });
  return pack;
}

/**
 * Restore from backup file/text.
 * @param {string|File|Blob} source
 * @param {{ mode?: 'replace'|'merge' }} [opts]
 */
export async function restoreFullBackup(source, opts = {}) {
  const text = typeof source === 'string' ? source : await source.text();
  let pack;
  try {
    pack = JSON.parse(text);
  } catch {
    throw new Error('Invalid backup JSON');
  }
  if (!pack || pack.format !== FORMAT || !pack.stores || typeof pack.stores !== 'object') {
    throw new Error('Not a PicoScan full backup file');
  }

  const mode = opts.mode === 'merge' ? 'merge' : 'replace';
  const db = await openDb();
  /** @type {Record<string, number>} */
  const counts = {};

  for (const name of STORE_LIST) {
    const rows = Array.isArray(pack.stores[name]) ? /** @type {object[]} */ (pack.stores[name]) : [];
    const valid = rows.filter((row) => isValidRow(name, row));
    counts[name] = await writeStore(db, name, valid, mode);
  }

  emit(EVENTS.HISTORY_CHANGED);
  emit(EVENTS.KNOWLEDGE_CHANGED, { action: 'restore', mode, counts });
  emit(EVENTS.LOG, {
    level: 'ok',
    message: `Full restore complete (${mode}): ${summarizeCounts(counts)}`,
  });
  return { mode, counts };
}

/**
 * @param {IDBDatabase} db
 * @param {string} storeName
 * @returns {Promise<unknown[]>}
 */
function readAll(db, storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

/**
 * @param {IDBDatabase} db
 * @param {string} storeName
 * @param {object[]} rows
 * @param {'replace'|'merge'} mode
 * @returns {Promise<number>}
 */
function writeStore(db, storeName, rows, mode) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    if (mode === 'replace') store.clear();
    for (const row of rows) store.put(row);
    tx.oncomplete = () => resolve(rows.length);
    tx.onerror = () => reject(tx.error || new Error(`Restore failed for ${storeName}`));
  });
}

/**
 * @param {string} storeName
 * @param {unknown} row
 */
function isValidRow(storeName, row) {
  if (!row || typeof row !== 'object') return false;
  const r = /** @type {Record<string, unknown>} */ (row);
  if (storeName === STORES.SETTINGS) return typeof r.key === 'string';
  if (storeName === STORES.CATEGORIES) return typeof r.name === 'string';
  if (storeName === STORES.DOCUMENTS || storeName === STORES.KNOWLEDGE) return typeof r.id === 'string';
  return true;
}

/**
 * @param {Record<string, unknown[]>} stores
 */
function countRows(stores) {
  return Object.values(stores || {}).reduce((n, rows) => n + (rows?.length || 0), 0);
}

/**
 * @param {Record<string, number>} counts
 */
function summarizeCounts(counts) {
  return Object.entries(counts)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');
}
