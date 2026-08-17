import { getDb } from '../db/database.js';
import { idbReq, idbTxDone } from '../db/idb.js';

/**
 * @param {string} storeName
 */
export function createRepository(storeName) {
  return {
    async getById(id) {
      const db = await getDb();
      return idbReq(db.transaction(storeName, 'readonly').objectStore(storeName).get(id));
    },
    async getAll() {
      const db = await getDb();
      return idbReq(db.transaction(storeName, 'readonly').objectStore(storeName).getAll());
    },
    async put(record) {
      const db = await getDb();
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(record);
      await idbTxDone(tx);
      return record;
    },
    async putMany(records) {
      if (!records?.length) return;
      const db = await getDb();
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      for (const r of records) store.put(r);
      await idbTxDone(tx);
    },
    async delete(id) {
      const db = await getDb();
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(id);
      await idbTxDone(tx);
    },
    async clear() {
      const db = await getDb();
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).clear();
      await idbTxDone(tx);
    },
    async count() {
      const db = await getDb();
      return idbReq(db.transaction(storeName, 'readonly').objectStore(storeName).count());
    },
    /**
     * @param {string} indexName
     * @param {IDBValidKey|IDBKeyRange} key
     */
    async getAllByIndex(indexName, key) {
      const db = await getDb();
      const store = db.transaction(storeName, 'readonly').objectStore(storeName);
      return idbReq(store.index(indexName).getAll(key));
    },
    /**
     * @param {string} indexName
     * @param {IDBValidKey|IDBKeyRange} key
     */
    async deleteByIndex(indexName, key) {
      const db = await getDb();
      const tx = db.transaction(storeName, 'readwrite');
      const index = tx.objectStore(storeName).index(indexName);
      const keys = await idbReq(index.getAllKeys(key));
      for (const k of keys) tx.objectStore(storeName).delete(k);
      await idbTxDone(tx);
    },
  };
}
