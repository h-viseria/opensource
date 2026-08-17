/**
 * Open PicoPersonalFinance. Call migrate() on upgrade — never delete/recreate.
 */

import { DB_NAME, DB_VERSION } from '../core/constants.js';
import { openDatabase } from './idb.js';
import { migrate } from './schema.js';

/** @type {IDBDatabase|null} */
let db = null;
/** @type {Promise<IDBDatabase>|null} */
let opening = null;

/**
 * @returns {Promise<IDBDatabase>}
 */
export async function getDb() {
  if (db) return db;
  if (opening) return opening;
  opening = openDatabase(DB_NAME, DB_VERSION, (database, oldVersion, newVersion, tx) => {
    migrate(database, oldVersion, newVersion, tx);
  }).then((opened) => {
    db = opened;
    opened.onclose = () => {
      db = null;
    };
    opening = null;
    return opened;
  }).catch((err) => {
    opening = null;
    throw err;
  });
  return opening;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Used by restore: close so the next getDb() reopens after import.
 */
export function resetDbConnection() {
  closeDb();
}
