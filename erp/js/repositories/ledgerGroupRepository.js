/**
 * Ledger group repository.
 */

import { STORES } from '../core/constants.js';
import { BaseRepository } from './baseRepository.js';
import { withTransaction } from '../db/database.js';
import * as idb from '../db/idb.js';

export class LedgerGroupRepository extends BaseRepository {
  constructor() {
    super(STORES.LEDGER_GROUPS);
  }

  /**
   * @param {string} bookId
   * @returns {Promise<import('../models/types.js').LedgerGroup[]>}
   */
  async findByBook(bookId) {
    const rows = await this.findByIndex('bookId', bookId);
    return rows.sort((a, b) => {
      const so = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      if (so !== 0) return so;
      return String(a.name).localeCompare(String(b.name));
    });
  }

  /**
   * @param {string} bookId
   * @param {string} name
   */
  async findByBookAndName(bookId, name) {
    const rows = await this.findByIndex('bookId_name', [bookId, name]);
    return rows[0];
  }

  /**
   * @param {string} bookId
   */
  async deleteByBook(bookId) {
    const rows = await this.findByBook(bookId);
    return withTransaction(this.storeName, 'readwrite', async (tx) => {
      const store = idb.store(tx, this.storeName);
      for (const row of rows) {
        await idb.remove(store, row.id);
      }
      return rows.length;
    });
  }

  /**
   * @param {string} parentId
   */
  async findByParent(parentId) {
    return this.findByIndex('parentId', parentId);
  }
}

export const ledgerGroupRepository = new LedgerGroupRepository();
