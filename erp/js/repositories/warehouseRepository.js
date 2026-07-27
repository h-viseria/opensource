/**
 * Warehouse repository.
 */

import { STORES } from '../core/constants.js';
import { BaseRepository } from './baseRepository.js';
import { withTransaction } from '../db/database.js';
import * as idb from '../db/idb.js';

export class WarehouseRepository extends BaseRepository {
  constructor() {
    super(STORES.WAREHOUSES);
  }

  /** @param {string} bookId */
  async findByBook(bookId) {
    const rows = await this.findByIndex('bookId', bookId);
    return rows.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }

  /** @param {string} bookId */
  async findDefault(bookId) {
    const rows = await this.findByBook(bookId);
    return rows.find((w) => w.isDefault) || rows[0] || null;
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

export const warehouseRepository = new WarehouseRepository();
