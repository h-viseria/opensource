const DB_NAME = 'mf-holdings-db';
const DB_VERSION = 1;

const STORES = {
    HOLDINGS: 'holdings',
    SCHEME_CODES: 'schemeCodes',
    NAV_SNAPSHOTS: 'navSnapshots',
};

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

            if (!db.objectStoreNames.contains(STORES.HOLDINGS)) {
                db.createObjectStore(STORES.HOLDINGS, { keyPath: 'id', autoIncrement: true });
            }

            if (!db.objectStoreNames.contains(STORES.SCHEME_CODES)) {
                db.createObjectStore(STORES.SCHEME_CODES, { keyPath: 'schemeNameNormalized' });
            }

            if (!db.objectStoreNames.contains(STORES.NAV_SNAPSHOTS)) {
                db.createObjectStore(STORES.NAV_SNAPSHOTS, { keyPath: 'schemeCode' });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function withStore(storeName, mode, operation) {
    const db = await openDb();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const result = operation(store);

        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}

export function normalizeSchemeName(name) {
    return String(name || '')
        .toLowerCase()
        .replace(/\([^)]*\)/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export async function replaceHoldings(holdings) {
    await withStore(STORES.HOLDINGS, 'readwrite', (store) => {
        store.clear();
        holdings.forEach((holding) => store.add(holding));
    });
}

export async function getAllHoldings() {
    return withStore(STORES.HOLDINGS, 'readonly', (store) => promisifyRequest(store.getAll()));
}

export async function upsertSchemeCode(mapping) {
    await withStore(STORES.SCHEME_CODES, 'readwrite', (store) => store.put(mapping));
}

export async function getAllSchemeCodes() {
    return withStore(STORES.SCHEME_CODES, 'readonly', (store) => promisifyRequest(store.getAll()));
}

export async function upsertNavSnapshot(snapshot) {
    await withStore(STORES.NAV_SNAPSHOTS, 'readwrite', (store) => store.put(snapshot));
}

export async function getAllNavSnapshots() {
    return withStore(STORES.NAV_SNAPSHOTS, 'readonly', (store) => promisifyRequest(store.getAll()));
}

export async function clearNavSnapshots() {
    await withStore(STORES.NAV_SNAPSHOTS, 'readwrite', (store) => store.clear());
}

export async function clearAllData() {
    const db = await openDb();

    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORES.HOLDINGS, STORES.SCHEME_CODES, STORES.NAV_SNAPSHOTS], 'readwrite');
        tx.objectStore(STORES.HOLDINGS).clear();
        tx.objectStore(STORES.SCHEME_CODES).clear();
        tx.objectStore(STORES.NAV_SNAPSHOTS).clear();

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}

