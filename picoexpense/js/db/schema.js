/**
 * IndexedDB object stores and indexes. Schema version: DB_VERSION.
 * Future modules (investments, recurring) add new stores via migrations — never recreate.
 */

import { STORES } from '../core/constants.js';

/**
 * @param {IDBObjectStore} store
 * @param {string} name
 * @param {string|string[]} keyPath
 * @param {IDBIndexParameters} [opts]
 */
function ensureIndex(store, name, keyPath, opts) {
  if (!store.indexNames.contains(name)) store.createIndex(name, keyPath, opts);
}

/**
 * Create v1 stores. Called from onupgradeneeded.
 * @param {IDBDatabase} db
 * @param {IDBTransaction} tx
 */
export function createV1Stores(db, tx) {
  const txns = db.objectStoreNames.contains(STORES.TRANSACTIONS)
    ? tx.objectStore(STORES.TRANSACTIONS)
    : db.createObjectStore(STORES.TRANSACTIONS, { keyPath: 'id' });
  ensureIndex(txns, 'date', 'date');
  ensureIndex(txns, 'accountId', 'accountId');
  ensureIndex(txns, 'categoryId', 'categoryId');
  ensureIndex(txns, 'merchantId', 'merchantId');
  ensureIndex(txns, 'type', 'type');
  ensureIndex(txns, 'deletedAt', 'deletedAt');
  ensureIndex(txns, 'personId', 'personId');
  ensureIndex(txns, 'updatedAt', 'updatedAt');

  const splits = db.objectStoreNames.contains(STORES.SPLITS)
    ? tx.objectStore(STORES.SPLITS)
    : db.createObjectStore(STORES.SPLITS, { keyPath: 'id' });
  ensureIndex(splits, 'transactionId', 'transactionId');

  const accounts = db.objectStoreNames.contains(STORES.ACCOUNTS)
    ? tx.objectStore(STORES.ACCOUNTS)
    : db.createObjectStore(STORES.ACCOUNTS, { keyPath: 'id' });
  ensureIndex(accounts, 'type', 'type');
  ensureIndex(accounts, 'active', 'active');

  const cats = db.objectStoreNames.contains(STORES.CATEGORIES)
    ? tx.objectStore(STORES.CATEGORIES)
    : db.createObjectStore(STORES.CATEGORIES, { keyPath: 'id' });
  ensureIndex(cats, 'parentId', 'parentId');
  ensureIndex(cats, 'sortOrder', 'sortOrder');
  ensureIndex(cats, 'kind', 'kind');

  const merchants = db.objectStoreNames.contains(STORES.MERCHANTS)
    ? tx.objectStore(STORES.MERCHANTS)
    : db.createObjectStore(STORES.MERCHANTS, { keyPath: 'id' });
  ensureIndex(merchants, 'normalizedName', 'normalizedName', { unique: false });

  const tags = db.objectStoreNames.contains(STORES.TAGS)
    ? tx.objectStore(STORES.TAGS)
    : db.createObjectStore(STORES.TAGS, { keyPath: 'id' });
  ensureIndex(tags, 'name', 'name', { unique: false });

  const people = db.objectStoreNames.contains(STORES.PEOPLE)
    ? tx.objectStore(STORES.PEOPLE)
    : db.createObjectStore(STORES.PEOPLE, { keyPath: 'id' });

  const budgets = db.objectStoreNames.contains(STORES.BUDGETS)
    ? tx.objectStore(STORES.BUDGETS)
    : db.createObjectStore(STORES.BUDGETS, { keyPath: 'id' });
  ensureIndex(budgets, 'period', 'period');
  ensureIndex(budgets, 'categoryId', 'categoryId');

  const goals = db.objectStoreNames.contains(STORES.GOALS)
    ? tx.objectStore(STORES.GOALS)
    : db.createObjectStore(STORES.GOALS, { keyPath: 'id' });

  const attachments = db.objectStoreNames.contains(STORES.ATTACHMENTS)
    ? tx.objectStore(STORES.ATTACHMENTS)
    : db.createObjectStore(STORES.ATTACHMENTS, { keyPath: 'id' });
  ensureIndex(attachments, 'transactionId', 'transactionId');

  const receipts = db.objectStoreNames.contains(STORES.RECEIPTS)
    ? tx.objectStore(STORES.RECEIPTS)
    : db.createObjectStore(STORES.RECEIPTS, { keyPath: 'id' });
  ensureIndex(receipts, 'transactionId', 'transactionId');

  db.objectStoreNames.contains(STORES.CURRENCIES) ||
    db.createObjectStore(STORES.CURRENCIES, { keyPath: 'code' });

  const rates = db.objectStoreNames.contains(STORES.EXCHANGE_RATES)
    ? tx.objectStore(STORES.EXCHANGE_RATES)
    : db.createObjectStore(STORES.EXCHANGE_RATES, { keyPath: 'id' });
  ensureIndex(rates, 'pairDate', ['fromCurrency', 'toCurrency', 'date']);

  const rules = db.objectStoreNames.contains(STORES.RULES)
    ? tx.objectStore(STORES.RULES)
    : db.createObjectStore(STORES.RULES, { keyPath: 'id' });
  ensureIndex(rules, 'priority', 'priority');

  db.objectStoreNames.contains(STORES.SAVED_FILTERS) ||
    db.createObjectStore(STORES.SAVED_FILTERS, { keyPath: 'id' });

  const audit = db.objectStoreNames.contains(STORES.AUDIT_LOG)
    ? tx.objectStore(STORES.AUDIT_LOG)
    : db.createObjectStore(STORES.AUDIT_LOG, { keyPath: 'id' });
  ensureIndex(audit, 'createdAt', 'createdAt');
  ensureIndex(audit, 'entityId', 'entityId');

  const activity = db.objectStoreNames.contains(STORES.ACTIVITY_LOG)
    ? tx.objectStore(STORES.ACTIVITY_LOG)
    : db.createObjectStore(STORES.ACTIVITY_LOG, { keyPath: 'id' });
  ensureIndex(activity, 'createdAt', 'createdAt');

  db.objectStoreNames.contains(STORES.SETTINGS) ||
    db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });

  db.objectStoreNames.contains(STORES.METADATA) ||
    db.createObjectStore(STORES.METADATA, { keyPath: 'key' });
}

/**
 * @param {IDBDatabase} db
 * @param {number} oldVersion
 * @param {number|null} newVersion
 * @param {IDBTransaction} tx
 */
export function migrate(db, oldVersion, newVersion, tx) {
  if (oldVersion < 1) createV1Stores(db, tx);
  // Future: if (oldVersion < 2) add investment stores — never delete/recreate.
  void newVersion;
}
