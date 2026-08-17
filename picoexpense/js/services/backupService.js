import { APP_NAME, APP_VERSION, BACKUP_KIND, DB_VERSION, SETTINGS_KEYS, STORES } from '../core/constants.js';
import { nowIso } from '../utils/date.js';
import { zipDeflate, unzip } from '../utils/zip.js';
import { encryptText, decryptText, isEncryptedBackup } from '../utils/crypto.js';
import { getDb, resetDbConnection } from '../db/database.js';
import * as idb from '../db/idb.js';
import { setSetting } from './settingsService.js';
import { recordAudit, AUDIT_ACTIONS } from './auditService.js';

const BOOK_STORES = Object.values(STORES);

/**
 * @returns {Promise<{ payload: object, fileName: string, summary: object }>}
 */
export async function exportFullBackup() {
  const db = await getDb();
  /** @type {Record<string, unknown[]>} */
  const stores = {};
  let totalRecords = 0;
  const tx = db.transaction(BOOK_STORES, 'readonly');
  for (const name of BOOK_STORES) {
    const rows = await idb.getAll(tx.objectStore(name));
    stores[name] = rows;
    totalRecords += rows.length;
  }
  const payload = {
    kind: BACKUP_KIND,
    format: 'json',
    scope: 'full',
    appName: APP_NAME,
    appVersion: APP_VERSION,
    schemaVersion: DB_VERSION,
    exportedAt: nowIso(),
    stores,
  };
  const stamp = payload.exportedAt.slice(0, 10);
  return {
    payload,
    fileName: `PicoExpense_${stamp}.exp.json`,
    summary: { totalRecords, storeCount: BOOK_STORES.length },
  };
}

/**
 * @param {object} payload
 */
export function stringifyBackup(payload) {
  return JSON.stringify(payload);
}

/**
 * @param {object} payload
 * @param {string} fileName
 */
export async function buildBackupZip(payload, fileName) {
  const jsonName = fileName.endsWith('.json') ? fileName : `${fileName}.json`;
  const bytes = new TextEncoder().encode(stringifyBackup(payload));
  const buf = await zipDeflate({ [jsonName]: bytes });
  const zipFileName = jsonName.replace(/\.json$/i, '.zip');
  return { blob: new Blob([buf], { type: 'application/zip' }), zipFileName };
}

/**
 * @param {object} payload
 * @param {string} fileName
 */
export function downloadBackup(payload, fileName) {
  const blob = new Blob([stringifyBackup(payload)], { type: 'application/json' });
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
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * @param {string} text
 * @param {string} [passphrase]
 */
export async function parseBackupText(text, passphrase) {
  let rawText = text;
  if (isEncryptedBackup(text)) {
    if (!passphrase) {
      return { ok: false, errors: ['This backup is encrypted. Enter the passphrase.'], encrypted: true };
    }
    rawText = await decryptText(text, passphrase);
  }
  let raw;
  try {
    raw = JSON.parse(rawText);
  } catch {
    return { ok: false, errors: ['File is not valid JSON'] };
  }
  return validateBackup(raw);
}

/**
 * @param {Blob} blob
 * @param {string} [fileName]
 * @param {string} [passphrase]
 */
export async function parseBackupFile(blob, fileName = '', passphrase) {
  const name = fileName.toLowerCase();
  if (name.endsWith('.zip') || blob.type.includes('zip')) {
    const buf = await blob.arrayBuffer();
    const files = await unzip(buf);
    const jsonEntry = [...files.entries()].find(([n]) => n.toLowerCase().endsWith('.json'));
    if (!jsonEntry) return { ok: false, errors: ['ZIP does not contain a JSON backup'] };
    const text = new TextDecoder().decode(jsonEntry[1]);
    return parseBackupText(text, passphrase);
  }
  const text = await blob.text();
  return parseBackupText(text, passphrase);
}

/**
 * @param {object} raw
 */
export function validateBackup(raw) {
  const errors = [];
  const warnings = [];
  if (!raw || typeof raw !== 'object') errors.push('Invalid backup');
  if (raw.kind && raw.kind !== BACKUP_KIND) warnings.push(`Unexpected kind ${raw.kind}`);
  if (raw.schemaVersion != null && Number(raw.schemaVersion) > DB_VERSION) {
    errors.push(`Backup schema ${raw.schemaVersion} is newer than this app (${DB_VERSION})`);
  }
  if (!raw.stores || typeof raw.stores !== 'object') errors.push('Backup has no stores');
  const storeCount = raw.stores ? Object.keys(raw.stores).length : 0;
  let totalRecords = 0;
  let attachments = 0;
  if (raw.stores) {
    for (const [k, v] of Object.entries(raw.stores)) {
      if (!Array.isArray(v)) errors.push(`Store ${k} is not an array`);
      else {
        totalRecords += v.length;
        if (k === STORES.RECEIPTS || k === STORES.ATTACHMENTS) attachments += v.length;
      }
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    raw,
    scope: raw.scope || 'full',
    exportedAt: raw.exportedAt,
    appVersion: raw.appVersion,
    schemaVersion: raw.schemaVersion,
    totalRecords,
    attachments,
    storeCount,
  };
}

/**
 * Replace all local stores. Fails closed — existing data remains if this throws before clear.
 * @param {object} raw
 */
export async function restoreFullBackup(raw) {
  const parsed = validateBackup(raw);
  if (!parsed.ok) throw new Error(parsed.errors.join('; '));
  const db = await getDb();
  const names = BOOK_STORES.filter((n) => db.objectStoreNames.contains(n));
  const tx = db.transaction(names, 'readwrite');
  for (const name of names) {
    tx.objectStore(name).clear();
    const rows = Array.isArray(raw.stores[name]) ? raw.stores[name] : [];
    for (const row of rows) tx.objectStore(name).put(row);
  }
  await idb.txDone(tx);
  await setSetting(SETTINGS_KEYS.LAST_RESTORE_AT, nowIso());
  await recordAudit({ action: AUDIT_ACTIONS.RESTORED, entity: 'database', detail: 'Full restore' });
}

/**
 * Merge by UUID — existing ids kept unless overwrite true.
 * @param {object} raw
 * @param {{ overwrite?: boolean }} [opts]
 */
export async function mergeBackup(raw, opts = {}) {
  const parsed = validateBackup(raw);
  if (!parsed.ok) throw new Error(parsed.errors.join('; '));
  const db = await getDb();
  const names = BOOK_STORES.filter((n) => db.objectStoreNames.contains(n));
  const tx = db.transaction(names, 'readwrite');
  for (const name of names) {
    const rows = Array.isArray(raw.stores[name]) ? raw.stores[name] : [];
    const store = tx.objectStore(name);
    for (const row of rows) {
      const key = store.keyPath;
      const id = row[key];
      const existingReq = store.get(id);
      await new Promise((resolve, reject) => {
        existingReq.onsuccess = () => {
          if (existingReq.result && !opts.overwrite) {
            resolve();
            return;
          }
          const p = store.put(row);
          p.onsuccess = () => resolve();
          p.onerror = () => reject(p.error);
        };
        existingReq.onerror = () => reject(existingReq.error);
      });
    }
  }
  await idb.txDone(tx);
  await setSetting(SETTINGS_KEYS.LAST_RESTORE_AT, nowIso());
}

/**
 * @param {string} json
 * @param {string} passphrase
 */
export async function encryptBackupJson(json, passphrase) {
  return encryptText(json, passphrase);
}

export async function deleteAllData() {
  const db = await getDb();
  const names = BOOK_STORES.filter((n) => db.objectStoreNames.contains(n));
  const tx = db.transaction(names, 'readwrite');
  for (const name of names) tx.objectStore(name).clear();
  await idb.txDone(tx);
}

export { isEncryptedBackup, decryptText, resetDbConnection };
