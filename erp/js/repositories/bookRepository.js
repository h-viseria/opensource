/**
 * Book repository — company books (accounting entities).
 */

import { STORES } from '../core/constants.js';
import { BaseRepository } from './baseRepository.js';

export class BookRepository extends BaseRepository {
  constructor() {
    super(STORES.BOOKS);
  }

  /**
   * @returns {Promise<import('../models/types.js').Book[]>}
   */
  async findAllSorted() {
    const books = await this.findAll();
    return books.sort((a, b) => {
      const ta = a.updatedAt || a.createdAt || '';
      const tb = b.updatedAt || b.createdAt || '';
      return tb.localeCompare(ta);
    });
  }

  /**
   * @param {string} name
   */
  async findByName(name) {
    const all = await this.findByIndex('name', name);
    return all[0];
  }
}

export const bookRepository = new BookRepository();
