/**
 * Shared IndexedDB open/migrate for PicoScan.
 */

import { DB_NAME, DB_VERSION, STORES } from '../core/constants.js';

/** @type {Promise<IDBDatabase>|null} */
let dbPromise = null;

/**
 * Reset cached connection (after version change / tests).
 */
export function resetDbCache() {
  dbPromise = null;
}

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const oldVersion = event.oldVersion || 0;

      if (!db.objectStoreNames.contains(STORES.DOCUMENTS)) {
        const store = db.createObjectStore(STORES.DOCUMENTS, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
        store.createIndex('documentType', 'documentType', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
        db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
      }
      if (oldVersion < 2 || !db.objectStoreNames.contains(STORES.KNOWLEDGE)) {
        if (!db.objectStoreNames.contains(STORES.KNOWLEDGE)) {
          const kb = db.createObjectStore(STORES.KNOWLEDGE, { keyPath: 'id' });
          kb.createIndex('category', 'category', { unique: false });
          kb.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      }
      if (oldVersion < 2 || !db.objectStoreNames.contains(STORES.CATEGORIES)) {
        if (!db.objectStoreNames.contains(STORES.CATEGORIES)) {
          db.createObjectStore(STORES.CATEGORIES, { keyPath: 'name' });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  });
  return dbPromise;
}

/**
 * @template T
 * @param {string} storeName
 * @param {IDBTransactionMode} mode
 * @param {(store: IDBObjectStore) => IDBRequest|Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withStore(storeName, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let req;
    try {
      req = fn(store);
    } catch (err) {
      reject(err);
      return;
    }
    if (req && typeof req.then === 'function') {
      /** @type {Promise<T>} */ (req).then(resolve, reject);
      return;
    }
    const idbReq = /** @type {IDBRequest} */ (req);
    idbReq.onsuccess = () => resolve(idbReq.result);
    idbReq.onerror = () => reject(idbReq.error);
  });
}
