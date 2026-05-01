import { deepClone, generateId, nowIso } from './utils.js';

export class GenericRepository {
    constructor({ db, storeName, idKey, idPrefix }) {
        this.db = db;
        this.storeName = storeName;
        this.idKey = idKey;
        this.idPrefix = idPrefix;
        this.cache = null;
    }

    async create(payload) {
        const all = await this.getAll();
        const id = payload[this.idKey] || generateId(this.idPrefix, all.map((x) => x[this.idKey]));
        const entity = {
            ...payload,
            [this.idKey]: id,
            createdAt: payload.createdAt || nowIso(),
        };

        await this.db.add(this.storeName, entity);
        this.#invalidateCache();
        return deepClone(entity);
    }

    async update(payload) {
        await this.db.update(this.storeName, payload);
        this.#invalidateCache();
        return deepClone(payload);
    }

    async delete(key) {
        await this.db.delete(this.storeName, key);
        this.#invalidateCache();
    }

    async get(key) {
        const row = await this.db.get(this.storeName, key);
        return row ? deepClone(row) : null;
    }

    async getAll(forceRefresh = false) {
        if (this.cache && !forceRefresh) {
            return deepClone(this.cache);
        }
        const rows = await this.db.getAll(this.storeName);
        this.cache = rows || [];
        return deepClone(this.cache);
    }

    async queryByIndex(indexName, value) {
        const rows = await this.db.queryByIndex(this.storeName, indexName, value);
        return deepClone(rows || []);
    }

    #invalidateCache() {
        this.cache = null;
    }
}

export function createRepository(options) {
    return new GenericRepository(options);
}

