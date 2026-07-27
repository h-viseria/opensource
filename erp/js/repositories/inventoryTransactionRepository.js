/**
 * Inventory transaction repository.
 */

import { STORES } from '../core/constants.js';
import { BaseRepository } from './baseRepository.js';
import { withTransaction } from '../db/database.js';
import * as idb from '../db/idb.js';

export class InventoryTransactionRepository extends BaseRepository {
  constructor() {
    super(STORES.INVENTORY_TRANSACTIONS);
  }

  /** @param {string} bookId */
  async findByBook(bookId) {
    const rows = await this.findByIndex('bookId', bookId);
    return rows.sort((a, b) => {
      const d = String(a.date).localeCompare(String(b.date));
      if (d !== 0) return d;
      return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    });
  }

  /** @param {string} itemId */
  async findByItem(itemId) {
    const rows = await this.findByIndex('itemId', itemId);
    return rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }

  /** @param {string} voucherId */
  async findByVoucher(voucherId) {
    return this.findByIndex('voucherId', voucherId);
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

export const inventoryTransactionRepository = new InventoryTransactionRepository();
