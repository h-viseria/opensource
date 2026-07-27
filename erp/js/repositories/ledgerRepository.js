/**
 * Ledger (account) repository.
 */

import { STORES } from '../core/constants.js';
import { BaseRepository } from './baseRepository.js';
import { withTransaction } from '../db/database.js';
import * as idb from '../db/idb.js';

export class LedgerRepository extends BaseRepository {
  constructor() {
    super(STORES.LEDGERS);
  }

  /**
   * @param {string} bookId
   * @returns {Promise<import('../models/types.js').Ledger[]>}
   */
  async findByBook(bookId) {
    const rows = await this.findByIndex('bookId', bookId);
    return rows.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }

  /**
   * @param {string} groupId
   */
  async findByGroup(groupId) {
    const rows = await this.findByIndex('groupId', groupId);
    return rows.sort((a, b) => String(a.name).localeCompare(String(b.name)));
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
   * @param {string} bookId
   */
  async countByBook(bookId) {
    return this.count('bookId', bookId);
  }
}

export const ledgerRepository = new LedgerRepository();
