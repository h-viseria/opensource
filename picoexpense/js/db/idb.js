/**
 * Promise-based IndexedDB primitives.
 * UI and services must never call these directly — use repositories.
 */

/**
 * Open (or upgrade) a database.
 * @param {string} name
 * @param {number} version
 * @param {(db: IDBDatabase, oldVersion: number, newVersion: number|null, tx: IDBTransaction) => void} onUpgrade
 * @returns {Promise<IDBDatabase>}
 */
export function openDatabase(name, version, onUpgrade) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);

    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      const tx = request.transaction;
      const oldVersion = event.oldVersion;
      const newVersion = event.newVersion;
      onUpgrade(db, oldVersion, newVersion, tx);
    };

    request.onblocked = () => {
      console.warn('[IDB] open blocked — close other tabs using this database');
    };
  });
}

/**
 * Wrap an IDBRequest in a Promise.
 * @template T
 * @param {IDBRequest<T>} request
 * @returns {Promise<T>}
 */
export function req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

/**
 * Wait for a transaction to complete.
 * @param {IDBTransaction} tx
 * @returns {Promise<void>}
 */
export function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
}

/**
 * Get object store from transaction.
 * @param {IDBTransaction} tx
 * @param {string} storeName
 */
export function store(tx, storeName) {
  return tx.objectStore(storeName);
}

/**
 * Read all records from a store (or index cursor range).
 * @template T
 * @param {IDBObjectStore|IDBIndex} source
 * @param {IDBKeyRange|IDBValidKey|null} [query]
 * @returns {Promise<T[]>}
 */
export function getAll(source, query = null) {
  return req(source.getAll(query));
}

/**
 * @template T
 * @param {IDBObjectStore|IDBIndex} source
 * @param {IDBValidKey} key
 * @returns {Promise<T|undefined>}
 */
export function get(source, key) {
  return req(source.get(key));
}

/**
 * Count records.
 * @param {IDBObjectStore|IDBIndex} source
 * @param {IDBKeyRange|IDBValidKey|null} [query]
 */
export function count(source, query = null) {
  return req(source.count(query));
}

/**
 * Put (insert or update) a record.
 * @param {IDBObjectStore} objectStore
 * @param {unknown} value
 * @param {IDBValidKey} [key]
 */
export function put(objectStore, value, key) {
  return req(key !== undefined ? objectStore.put(value, key) : objectStore.put(value));
}

/**
 * Add a record (fails if key exists).
 * @param {IDBObjectStore} objectStore
 * @param {unknown} value
 * @param {IDBValidKey} [key]
 */
export function add(objectStore, value, key) {
  return req(key !== undefined ? objectStore.add(value, key) : objectStore.add(value));
}

/**
 * Delete by key.
 * @param {IDBObjectStore} objectStore
 * @param {IDBValidKey} key
 */
export function remove(objectStore, key) {
  return req(objectStore.delete(key));
}

/**
 * Clear entire store.
 * @param {IDBObjectStore} objectStore
 */
export function clear(objectStore) {
  return req(objectStore.clear());
}

/**
 * Iterate a cursor with optional limit/offset for pagination.
 * @template T
 * @param {IDBObjectStore|IDBIndex} source
 * @param {{ query?: IDBKeyRange|IDBValidKey|null, direction?: IDBCursorDirection, limit?: number, offset?: number }} [opts]
 * @returns {Promise<T[]>}
 */
export function cursorGetAll(source, opts = {}) {
  const { query = null, direction = 'next', limit = Infinity, offset = 0 } = opts;

  return new Promise((resolve, reject) => {
    /** @type {T[]} */
    const results = [];
    let skipped = 0;
    const request = source.openCursor(query, direction);

    request.onerror = () => reject(request.error ?? new Error('Cursor failed'));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(results);
        return;
      }
      if (skipped < offset) {
        skipped += 1;
        cursor.continue();
        return;
      }
      if (results.length >= limit) {
        resolve(results);
        return;
      }
      results.push(cursor.value);
      cursor.continue();
    };
  });
}
