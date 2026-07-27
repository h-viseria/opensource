/**
 * Financial year repository.
 */

import { STORES } from '../core/constants.js';
import { BaseRepository } from './baseRepository.js';

export class FinancialYearRepository extends BaseRepository {
  constructor() {
    super(STORES.FINANCIAL_YEARS);
  }

  /**
   * @param {string} bookId
   */
  async findByBook(bookId) {
    const years = await this.findByIndex('bookId', bookId);
    return years.sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
  }

  /**
   * @param {string} bookId
   */
  async findActive(bookId) {
    const years = await this.findByBook(bookId);
    return years.find((y) => y.isActive) ?? years[years.length - 1] ?? null;
  }
}

export const financialYearRepository = new FinancialYearRepository();
