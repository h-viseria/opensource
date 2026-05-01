import { withRetry } from './utils.js';

export const DB_NAME = 'InventoryDB';
export const DB_VERSION = 1;

export const STORE_SCHEMAS = {
    suppliers: { keyPath: 'supplierId', indexes: ['name'] },
    buyers: { keyPath: 'buyerId', indexes: ['name'] },
    commodities: { keyPath: 'commodityId', indexes: ['name'] },
    commodityMaster: { keyPath: 'id', indexes: ['commodityId'] },
    orders: { keyPath: 'orderId', indexes: ['buyerId', 'status'] },
    fulfilments: { keyPath: 'fulfilmentId', indexes: ['orderId'] },
};

export class IndexedDbClient {
    constructor({ dbName = DB_NAME, version = DB_VERSION, schemas = STORE_SCHEMAS } = {}) {
        this.dbName = dbName;
        this.version = version;
        this.schemas = schemas;
        this.db = null;
    }

    async open() {
        if (this.db) return this.db;

        this.db = await new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                Object.entries(this.schemas).forEach(([storeName, schema]) => {
                    let store;
                    if (db.objectStoreNames.contains(storeName)) {
                        store = request.transaction.objectStore(storeName);
                    } else {
                        store = db.createObjectStore(storeName, { keyPath: schema.keyPath });
                    }

                    (schema.indexes || []).forEach((indexName) => {
                        if (!store.indexNames.contains(indexName)) {
                            store.createIndex(indexName, indexName, { unique: false });
                        }
                    });
                });
            };

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB.'));
        });

        this.db.onversionchange = () => {
            this.db.close();
            this.db = null;
        };

        return this.db;
    }

    async add(storeName, data) {
        return this.#runWrite(storeName, (store) => store.add(data));
    }

    async update(storeName, data) {
        return this.#runWrite(storeName, (store) => store.put(data));
    }

    async delete(storeName, key) {
        return this.#runWrite(storeName, (store) => store.delete(key));
    }

    async get(storeName, key) {
        return this.#runRead(storeName, (store) => store.get(key));
    }

    async getAll(storeName) {
        return this.#runRead(storeName, (store) => store.getAll());
    }

    async queryByIndex(storeName, indexName, value) {
        return this.#runRead(storeName, (store) => store.index(indexName).getAll(value));
    }

    async #runRead(storeName, operation) {
        await this.open();
        return withRetry(() => this.#runTransaction(storeName, 'readonly', operation));
    }

    async #runWrite(storeName, operation) {
        await this.open();
        return withRetry(() => this.#runTransaction(storeName, 'readwrite', operation));
    }

    #runTransaction(storeName, mode, operation) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, mode);
            const store = tx.objectStore(storeName);
            const request = operation(store);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error(`IndexedDB error on ${storeName}.`));
        });
    }
}

