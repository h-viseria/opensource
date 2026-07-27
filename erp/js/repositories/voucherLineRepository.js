/**
 * Voucher line repository.
 */

import { STORES } from '../core/constants.js';
import { BaseRepository } from './baseRepository.js';
import { withTransaction } from '../db/database.js';
import * as idb from '../db/idb.js';

export class VoucherLineRepository extends BaseRepository {
  constructor() {
    super(STORES.VOUCHER_LINES);
  }

  /**
   * @param {string} voucherId
   * @returns {Promise<import('../models/types.js').VoucherLine[]>}
   */
  async findByVoucher(voucherId) {
    const rows = await this.findByIndex('voucherId', voucherId);
    return rows.sort((a, b) => (a.lineNo || 0) - (b.lineNo || 0));
  }

  /**
   * @param {string} bookId
   */
  async findByBook(bookId) {
    return this.findByIndex('bookId', bookId);
  }

  /**
   * @param {string} voucherId
   */
  async deleteByVoucher(voucherId) {
    const rows = await this.findByVoucher(voucherId);
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
}

export const voucherLineRepository = new VoucherLineRepository();
