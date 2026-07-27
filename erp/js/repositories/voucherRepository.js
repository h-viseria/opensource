/**
 * Voucher header repository.
 */

import { STORES } from '../core/constants.js';
import { BaseRepository } from './baseRepository.js';
import { withTransaction } from '../db/database.js';
import * as idb from '../db/idb.js';

export class VoucherRepository extends BaseRepository {
  constructor() {
    super(STORES.VOUCHERS);
  }

  /**
   * @param {string} bookId
   * @returns {Promise<import('../models/types.js').Voucher[]>}
   */
  async findByBook(bookId) {
    const rows = await this.findByIndex('bookId', bookId);
    return rows.sort((a, b) => {
      const d = String(b.date).localeCompare(String(a.date));
      if (d !== 0) return d;
      return String(b.voucherNumber).localeCompare(String(a.voucherNumber));
    });
  }

  /**
   * @param {string} bookId
   * @param {string} voucherType
   */
  async findByBookAndType(bookId, voucherType) {
    const all = await this.findByBook(bookId);
    return all.filter((v) => v.voucherType === voucherType);
  }

  /**
   * Highest sequence for type in book (from voucherNumber suffix).
   * @param {string} bookId
   * @param {string} voucherType
   */
  async maxSequence(bookId, voucherType) {
    const rows = await this.findByBookAndType(bookId, voucherType);
    let max = 0;
    for (const v of rows) {
      const m = String(v.voucherNumber || '').match(/(\d+)\s*$/);
      if (m) max = Math.max(max, Number(m[1]) || 0);
    }
    return max;
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

export const voucherRepository = new VoucherRepository();
