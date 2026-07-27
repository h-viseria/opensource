/**
 * Audit log repository — create/update/delete trail.
 */

import { STORES } from '../core/constants.js';
import { BaseRepository } from './baseRepository.js';
import { uuid } from '../core/uuid.js';
import { nowIso } from '../utils/date.js';

export class AuditLogRepository extends BaseRepository {
  constructor() {
    super(STORES.AUDIT_LOGS);
  }

  /**
   * @param {{ bookId?: string|null, entity: string, recordId?: string|null, operation: string, detail?: unknown }} entry
   */
  async log(entry) {
    const row = {
      id: uuid(),
      bookId: entry.bookId ?? null,
      entity: entry.entity,
      recordId: entry.recordId ?? null,
      operation: entry.operation,
      detail: entry.detail ?? null,
      timestamp: nowIso(),
    };
    return this.create(row);
  }

  /**
   * @param {string} bookId
   * @param {{ limit?: number }} [opts]
   */
  async findRecentByBook(bookId, opts = {}) {
    return this.findPage({
      indexName: 'bookId',
      query: bookId,
      direction: 'prev',
      limit: opts.limit ?? 50,
    });
  }
}

export const auditLogRepository = new AuditLogRepository();
