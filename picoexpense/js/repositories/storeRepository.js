/**
 * Generic IndexedDB repository. UI never imports this — services do.
 */

import { getDb } from '../db/database.js';
import * as idb from '../db/idb.js';

/**
 * @param {string} storeName
 */
export function createRepository(storeName) {
  return {
    storeName,

    /** @returns {Promise<any[]>} */
    async getAll() {
      const db = await getDb();
      const tx = db.transaction(storeName, 'readonly');
      return idb.getAll(tx.objectStore(storeName));
    },

    /**
     * @param {IDBValidKey} key
     */
    async getById(key) {
      const db = await getDb();
      const tx = db.transaction(storeName, 'readonly');
      return idb.get(tx.objectStore(storeName), key);
    },

    /**
     * @param {any} record
     */
    async put(record) {
      const db = await getDb();
      const tx = db.transaction(storeName, 'readwrite');
      await idb.put(tx.objectStore(storeName), record);
      await idb.txDone(tx);
      return record;
    },

    /**
     * @param {any[]} records
     */
    async putMany(records) {
      const db = await getDb();
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      for (const r of records) store.put(r);
      await idb.txDone(tx);
    },

    /**
     * @param {IDBValidKey} key
     */
    async remove(key) {
      const db = await getDb();
      const tx = db.transaction(storeName, 'readwrite');
      await idb.remove(tx.objectStore(storeName), key);
      await idb.txDone(tx);
    },

    async clear() {
      const db = await getDb();
      const tx = db.transaction(storeName, 'readwrite');
      await idb.clear(tx.objectStore(storeName));
      await idb.txDone(tx);
    },

    async count() {
      const db = await getDb();
      const tx = db.transaction(storeName, 'readonly');
      return idb.count(tx.objectStore(storeName));
    },

    /**
     * @param {string} indexName
     * @param {IDBValidKey|IDBKeyRange} query
     */
    async getAllByIndex(indexName, query) {
      const db = await getDb();
      const tx = db.transaction(storeName, 'readonly');
      return idb.getAll(tx.objectStore(storeName).index(indexName), query);
    },

    /**
     * @param {string} [indexName]
     * @param {{ query?: IDBKeyRange|IDBValidKey|null, direction?: IDBCursorDirection, limit?: number, offset?: number }} [opts]
     */
    async page(indexName, opts = {}) {
      const db = await getDb();
      const tx = db.transaction(storeName, 'readonly');
      const source = indexName
        ? tx.objectStore(storeName).index(indexName)
        : tx.objectStore(storeName);
      return idb.cursorGetAll(source, opts);
    },
  };
}

/**
 * Multi-store atomic write.
 * @param {string[]} storeNames
 * @param {(stores: Record<string, IDBObjectStore>, tx: IDBTransaction) => Promise<void>|void} fn
 */
export async function withTransaction(storeNames, fn) {
  const db = await getDb();
  const tx = db.transaction(storeNames, 'readwrite');
  /** @type {Record<string, IDBObjectStore>} */
  const stores = {};
  for (const n of storeNames) stores[n] = tx.objectStore(n);
  await fn(stores, tx);
  await idb.txDone(tx);
}
