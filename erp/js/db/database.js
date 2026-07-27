/**
 * Database singleton — open once, reuse connection.
 * Dependency rule: Repository → this module → idb/schema.
 */

import { DB_NAME, DB_VERSION } from '../core/constants.js';
import { STORE_DEFINITIONS } from './schema.js';
import { openDatabase } from './idb.js';

/** @type {IDBDatabase | null} */
let dbInstance = null;

/** @type {Promise<IDBDatabase> | null} */
let opening = null;

/**
 * Ensure object stores and indexes exist for the current schema.
 * @param {IDBDatabase} db
 * @param {IDBTransaction} tx
 */
function upgrade(db, tx) {
  for (const def of STORE_DEFINITIONS) {
    let objectStore;

    if (!db.objectStoreNames.contains(def.name)) {
      objectStore = db.createObjectStore(def.name, {
        keyPath: def.keyPath,
        autoIncrement: def.autoIncrement ?? false,
      });
    } else {
      objectStore = tx.objectStore(def.name);
    }

    if (objectStore && def.indexes) {
      for (const idx of def.indexes) {
        if (!objectStore.indexNames.contains(idx.name)) {
          objectStore.createIndex(idx.name, idx.keyPath, {
            unique: idx.unique ?? false,
            multiEntry: idx.multiEntry ?? false,
          });
        }
      }
    }
  }
}

function schemaComplete(db) {
  return STORE_DEFINITIONS.every((def) => db.objectStoreNames.contains(def.name));
}

/**
 * Open the application database (idempotent).
 * @returns {Promise<IDBDatabase>}
 */
export async function getDatabase() {
  if (dbInstance) return dbInstance;
  if (opening) return opening;

  opening = openDatabase(DB_NAME, DB_VERSION, (db, _oldVersion, _newVersion, tx) => {
    upgrade(db, tx);
  })
    .then((db) => {
      if (!schemaComplete(db)) {
        db.close();
        throw new Error(
          'IndexedDB schema incomplete. Use Settings → Delete all local data, then reload.'
        );
      }
      dbInstance = db;
      db.onversionchange = () => {
        db.close();
        dbInstance = null;
        console.warn('[DB] Database version changed — connection closed');
      };
      db.onclose = () => {
        dbInstance = null;
      };
      opening = null;
      return db;
    })
    .catch((err) => {
      opening = null;
      throw err;
    });

  return opening;
}

/**
 * Run a transaction against one or more stores.
 * @template T
 * @param {string|string[]} storeNames
 * @param {IDBTransactionMode} mode
 * @param {(tx: IDBTransaction, db: IDBDatabase) => Promise<T>|T} work
 * @returns {Promise<T>}
 */
export async function withTransaction(storeNames, mode, work) {
  const db = await getDatabase();
  const names = Array.isArray(storeNames) ? storeNames : [storeNames];
  const tx = db.transaction(names, mode);

  // Register completion handlers before work so we never miss oncomplete.
  const done = new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });

  try {
    const result = await work(tx, db);
    await done;
    return result;
  } catch (err) {
    try {
      tx.abort();
    } catch {
      /* already finished */
    }
    throw err;
  }
}

/**
 * Close the database connection (tests / reset).
 */
export function closeDatabase() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
  opening = null;
}

/**
 * Delete the entire database (dangerous — used for factory reset).
 * @returns {Promise<void>}
 */
export async function deleteDatabase() {
  closeDatabase();
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Failed to delete database'));
    request.onblocked = () => {
      console.warn('[DB] delete blocked');
    };
  });
}

/**
 * Health check — returns store names present.
 */
export async function getStoreNames() {
  const db = await getDatabase();
  return [...db.objectStoreNames];
}
