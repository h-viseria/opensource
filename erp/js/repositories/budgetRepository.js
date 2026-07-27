/**
 * Budget repository.
 */

import { STORES } from '../core/constants.js';
import { BaseRepository } from './baseRepository.js';
import { withTransaction } from '../db/database.js';
import * as idb from '../db/idb.js';

export class BudgetRepository extends BaseRepository {
  constructor() {
    super(STORES.BUDGETS);
  }

  /** @param {string} bookId */
  async findByBook(bookId) {
    const rows = await this.findByIndex('bookId', bookId);
    return rows.sort((a, b) => {
      const p = String(b.periodKey).localeCompare(String(a.periodKey));
      if (p !== 0) return p;
      return String(a.name).localeCompare(String(b.name));
    });
  }

  /** @param {string} ledgerId */
  async findByLedger(ledgerId) {
    return this.findByIndex('ledgerId', ledgerId);
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

export const budgetRepository = new BudgetRepository();
