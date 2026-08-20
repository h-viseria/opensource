/**
 * Repositories for People module (employees, attendance, leave).
 */

import { STORES } from '../core/constants.js';
import { BaseRepository } from './baseRepository.js';
import { withTransaction } from '../db/database.js';
import * as idb from '../db/idb.js';

/**
 * @param {string} storeName
 */
function createBookScopedRepo(storeName) {
  class Repo extends BaseRepository {
    constructor() {
      super(storeName);
    }

    /** @param {string} bookId */
    async findByBook(bookId) {
      return this.findByIndex('bookId', bookId);
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
  return new Repo();
}

export const employeeRepository = createBookScopedRepo(STORES.EMPLOYEES);
export const employeeCustomFieldRepository = createBookScopedRepo(STORES.EMPLOYEE_CUSTOM_FIELDS);
export const employeeDocumentRepository = createBookScopedRepo(STORES.EMPLOYEE_DOCUMENTS);
export const attendanceStatusRepository = createBookScopedRepo(STORES.ATTENDANCE_STATUSES);
export const attendanceRecordRepository = createBookScopedRepo(STORES.ATTENDANCE_RECORDS);
export const leaveTypeRepository = createBookScopedRepo(STORES.LEAVE_TYPES);
export const leaveRecordRepository = createBookScopedRepo(STORES.LEAVE_RECORDS);

class AttendanceSettingsRepository extends BaseRepository {
  constructor() {
    super(STORES.ATTENDANCE_SETTINGS);
  }

  /** @param {string} bookId */
  async findByBook(bookId) {
    return this.findOneByIndex('bookId', bookId);
  }

  /** @param {string} bookId */
  async deleteByBook(bookId) {
    const row = await this.findByBook(bookId);
    if (!row) return 0;
    await this.delete(row.id);
    return 1;
  }
}

export const attendanceSettingsRepository = new AttendanceSettingsRepository();

/**
 * Extra helpers on employee / attendance records.
 */
employeeRepository.findByCode = async function findByCode(bookId, employeeCode) {
  const rows = await this.findByIndex('bookId_employeeCode', [bookId, employeeCode]);
  return rows[0];
};

attendanceRecordRepository.findByBookAndDate = async function findByBookAndDate(bookId, date) {
  return this.findByIndex('bookId_date', [bookId, date]);
};

attendanceRecordRepository.findByEmployeeAndDate = async function findByEmployeeAndDate(
  bookId,
  employeeId,
  date,
) {
  const rows = await this.findByIndex('bookId_employeeId_date', [bookId, employeeId, date]);
  return rows[0];
};

employeeDocumentRepository.findByEmployee = async function findByEmployee(employeeId) {
  return this.findByIndex('employeeId', employeeId);
};

leaveRecordRepository.findByEmployee = async function findByEmployee(employeeId) {
  return this.findByIndex('employeeId', employeeId);
};
