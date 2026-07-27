/**
 * Invoice repository.
 */

import { STORES } from '../core/constants.js';
import { BaseRepository } from './baseRepository.js';
import { withTransaction } from '../db/database.js';
import * as idb from '../db/idb.js';

export class InvoiceRepository extends BaseRepository {
  constructor() {
    super(STORES.INVOICES);
  }

  /** @param {string} bookId */
  async findByBook(bookId) {
    const rows = await this.findByIndex('bookId', bookId);
    return rows.sort((a, b) => {
      const d = String(b.date).localeCompare(String(a.date));
      if (d !== 0) return d;
      return String(b.invoiceNumber).localeCompare(String(a.invoiceNumber));
    });
  }

  /**
   * @param {string} bookId
   * @param {'Sales'|'Purchase'} invoiceType
   */
  async maxSequence(bookId, invoiceType) {
    const rows = (await this.findByBook(bookId)).filter((r) => r.invoiceType === invoiceType);
    let max = 0;
    for (const r of rows) {
      const m = String(r.invoiceNumber || '').match(/(\d+)\s*$/);
      if (m) max = Math.max(max, Number(m[1]) || 0);
    }
    return max;
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

export const invoiceRepository = new InvoiceRepository();
