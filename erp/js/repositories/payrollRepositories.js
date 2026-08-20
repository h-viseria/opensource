/**
 * Repositories for Payroll module (Phase 2).
 */

import { STORES } from '../core/constants.js';
import { BaseRepository } from './baseRepository.js';
import { withTransaction } from '../db/database.js';
import * as idb from '../db/idb.js';

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

export const salaryHeadRepository = createBookScopedRepo(STORES.SALARY_HEADS);
export const employeeSalaryLineRepository = createBookScopedRepo(STORES.EMPLOYEE_SALARY_LINES);
export const salaryAdjustmentRepository = createBookScopedRepo(STORES.SALARY_ADJUSTMENTS);
export const payrollRunRepository = createBookScopedRepo(STORES.PAYROLL_RUNS);
export const payrollItemRepository = createBookScopedRepo(STORES.PAYROLL_ITEMS);
export const employeePayrollAccountRepository = createBookScopedRepo(STORES.EMPLOYEE_PAYROLL_ACCOUNTS);

class PayrollSettingsRepository extends BaseRepository {
  constructor() {
    super(STORES.PAYROLL_SETTINGS);
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

export const payrollSettingsRepository = new PayrollSettingsRepository();

employeeSalaryLineRepository.findByEmployee = async function findByEmployee(employeeId) {
  return this.findByIndex('employeeId', employeeId);
};

payrollItemRepository.findByRun = async function findByRun(payrollRunId) {
  return this.findByIndex('payrollRunId', payrollRunId);
};

salaryAdjustmentRepository.findByRun = async function findByRun(payrollRunId) {
  return this.findByIndex('payrollRunId', payrollRunId);
};

employeePayrollAccountRepository.findByEmployee = async function findByEmployee(employeeId) {
  return this.findOneByIndex('employeeId', employeeId);
};
