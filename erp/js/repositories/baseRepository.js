/**
 * Generic repository — CRUD over a single IndexedDB object store.
 * All domain repositories extend or compose this.
 */

import { withTransaction } from '../db/database.js';
import * as idb from '../db/idb.js';

export class BaseRepository {
  /**
   * @param {string} storeName
   */
  constructor(storeName) {
    this.storeName = storeName;
  }

  /**
   * @template T
   * @param {string} id
   * @returns {Promise<T|undefined>}
   */
  async findById(id) {
    return withTransaction(this.storeName, 'readonly', async (tx) => {
      return idb.get(idb.store(tx, this.storeName), id);
    });
  }

  /**
   * @template T
   * @returns {Promise<T[]>}
   */
  async findAll() {
    return withTransaction(this.storeName, 'readonly', async (tx) => {
      return idb.getAll(idb.store(tx, this.storeName));
    });
  }

  /**
   * Query by index.
   * @template T
   * @param {string} indexName
   * @param {IDBValidKey|IDBKeyRange} key
   * @returns {Promise<T[]>}
   */
  async findByIndex(indexName, key) {
    return withTransaction(this.storeName, 'readonly', async (tx) => {
      const index = idb.store(tx, this.storeName).index(indexName);
      return idb.getAll(index, key);
    });
  }

  /**
   * First match on index (e.g. unique key).
   * @template T
   * @param {string} indexName
   * @param {IDBValidKey} key
   * @returns {Promise<T|undefined>}
   */
  async findOneByIndex(indexName, key) {
    return withTransaction(this.storeName, 'readonly', async (tx) => {
      const index = idb.store(tx, this.storeName).index(indexName);
      return idb.get(index, key);
    });
  }

  /**
   * Paginated cursor read.
   * @template T
   * @param {{ indexName?: string, query?: IDBKeyRange|IDBValidKey|null, direction?: IDBCursorDirection, limit?: number, offset?: number }} opts
   * @returns {Promise<T[]>}
   */
  async findPage(opts = {}) {
    return withTransaction(this.storeName, 'readonly', async (tx) => {
      const objectStore = idb.store(tx, this.storeName);
      const source = opts.indexName ? objectStore.index(opts.indexName) : objectStore;
      return idb.cursorGetAll(source, {
        query: opts.query ?? null,
        direction: opts.direction ?? 'next',
        limit: opts.limit ?? 50,
        offset: opts.offset ?? 0,
      });
    });
  }

  /**
   * @param {string} [indexName]
   * @param {IDBValidKey|IDBKeyRange|null} [query]
   */
  async count(indexName, query = null) {
    return withTransaction(this.storeName, 'readonly', async (tx) => {
      const objectStore = idb.store(tx, this.storeName);
      const source = indexName ? objectStore.index(indexName) : objectStore;
      return idb.count(source, query);
    });
  }

  /**
   * Insert or update.
   * @template T
   * @param {T} entity
   * @returns {Promise<T>}
   */
  async save(entity) {
    return withTransaction(this.storeName, 'readwrite', async (tx) => {
      await idb.put(idb.store(tx, this.storeName), entity);
      return entity;
    });
  }

  /**
   * Insert only.
   * @template T
   * @param {T} entity
   * @returns {Promise<T>}
   */
  async create(entity) {
    return withTransaction(this.storeName, 'readwrite', async (tx) => {
      await idb.add(idb.store(tx, this.storeName), entity);
      return entity;
    });
  }

  /**
   * @param {string} id
   */
  async delete(id) {
    return withTransaction(this.storeName, 'readwrite', async (tx) => {
      await idb.remove(idb.store(tx, this.storeName), id);
    });
  }

  /**
   * Bulk put inside one transaction.
   * @template T
   * @param {T[]} entities
   */
  async saveMany(entities) {
    return withTransaction(this.storeName, 'readwrite', async (tx) => {
      const objectStore = idb.store(tx, this.storeName);
      for (const entity of entities) {
        await idb.put(objectStore, entity);
      }
      return entities;
    });
  }
}
