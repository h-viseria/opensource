const DB_NAME = 'mf-holdings-transactions-db';
const DB_VERSION = 1;
const STORE_NAME = 'transactions';

function promisifyRequest(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function openDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                store.createIndex('schemeNameNormalized', 'schemeNameNormalized', { unique: false });
                store.createIndex('transactionDate', 'transactionDate', { unique: false });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function withStore(mode, operation) {
    const db = await openDb();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        const result = operation(store);

        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}

export async function replaceTransactions(transactions, metadata = {}) {
    await withStore('readwrite', (store) => {
        store.clear();
        transactions.forEach((transaction) => {
            store.add({
                ...transaction,
                importMetadata: metadata,
            });
        });
    });
}

export async function getAllTransactions() {
    return withStore('readonly', (store) => promisifyRequest(store.getAll()));
}

export async function clearAllTransactions() {
    await withStore('readwrite', (store) => store.clear());
}
