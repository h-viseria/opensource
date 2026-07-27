/**
 * Inventory item repository.
 */

import { STORES } from '../core/constants.js';
import { BaseRepository } from './baseRepository.js';
import { withTransaction } from '../db/database.js';
import * as idb from '../db/idb.js';

export class ItemRepository extends BaseRepository {
  constructor() {
    super(STORES.ITEMS);
  }

  /** @param {string} bookId */
  async findByBook(bookId) {
    const rows = await this.findByIndex('bookId', bookId);
    return rows.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }

  /**
   * @param {string} bookId
   * @param {string} name
   */
  async findByBookAndName(bookId, name) {
    const rows = await this.findByIndex('bookId', bookId);
    return rows.find((r) => r.name.toLowerCase() === name.toLowerCase());
  }

  /** @param {string} categoryId */
  async findByCategory(categoryId) {
    return this.findByIndex('categoryId', categoryId);
  }

  /** @param {string} bookId */
  async countByBook(bookId) {
    return this.count('bookId', bookId);
  }

  /** @param {string} bookId */
  async deleteByBook(bookId) {
    const rows = await this.findByBook(bookId);
    return withTransaction(this.storeName, 'readwrite', async (tx) => {
      const store = idb.store(tx, this.storeName);
      for (const row of rows) await idb.remove(store, row.id);
      return rows.length;
    });
  }
}

export const itemRepository = new ItemRepository();
