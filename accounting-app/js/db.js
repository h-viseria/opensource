/**
 * db.js — IndexedDB wrapper for the Accounting System
 * Stores: 'accounts' (keyPath: shortCode), 'transactions' (keyPath: id, autoIncrement)
 */

const DB_NAME = 'AccountingDB';
const DB_VERSION = 1;

let _db = null;

export function openDB() {
    return new Promise((resolve, reject) => {
        if (_db) { resolve(_db); return; }
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('accounts')) {
                const accStore = db.createObjectStore('accounts', { keyPath: 'shortCode' });
                accStore.createIndex('parentShortCode', 'parentShortCode', { unique: false });
            }
            if (!db.objectStoreNames.contains('transactions')) {
                const txStore = db.createObjectStore('transactions', { keyPath: 'id', autoIncrement: true });
                txStore.createIndex('mainAccount', 'mainAccount', { unique: false });
                txStore.createIndex('targetAccount', 'targetAccount', { unique: false });
            }
        };

        req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
        req.onerror = (e) => reject(e.target.error);
    });
}

export async function clearStore(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).clear();
        tx.oncomplete = resolve;
        tx.onerror = (e) => reject(e.target.error);
    });
}

export async function bulkInsert(storeName, records) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        records.forEach(r => store.put(r));
        tx.oncomplete = resolve;
        tx.onerror = (e) => reject(e.target.error);
    });
}

export async function clearAndBulkInsert(storeName, records) {
    await clearStore(storeName);
    await bulkInsert(storeName, records);
}

export async function getAll(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).getAll();
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
    });
}

export async function getByIndex(storeName, indexName, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).index(indexName).getAll(value);
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
    });
}

export async function exportData() {
    const accounts = await getAll('accounts');
    const transactions = await getAll('transactions');
    return { accounts, transactions };
}

export async function importData(data) {
    if (data.accounts) await clearAndBulkInsert('accounts', data.accounts);
    if (data.transactions) await clearAndBulkInsert('transactions', data.transactions);
}

