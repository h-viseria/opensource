/**
 * Low-level IndexedDB helpers.
 */

/**
 * @param {string} name
 * @param {number} version
 * @param {(db: IDBDatabase, oldVersion: number, newVersion: number|null, tx: IDBTransaction) => void} onUpgrade
 * @returns {Promise<IDBDatabase>}
 */
export function openDatabase(name, version, onUpgrade) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      const tx = req.transaction;
      onUpgrade(db, ev.oldVersion, ev.newVersion, tx);
    };
    req.onsuccess = () => resolve(req.result);
  });
}

/**
 * @param {IDBRequest} req
 * @returns {Promise<any>}
 */
export function idbReq(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * @param {IDBTransaction} tx
 * @returns {Promise<void>}
 */
export function idbTxDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  });
}
