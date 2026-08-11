/**
 * Book application service.
 * UI → BookService → Repositories → IndexedDB
 */

import { SETTINGS_KEYS, EVENTS } from '../core/constants.js';
import { emit } from '../core/eventBus.js';
import { uuid } from '../core/uuid.js';
import {
  nowIso,
  toDateInput,
  defaultFyStart,
  defaultFyEnd,
  suggestFyLabel,
} from '../utils/date.js';
import { bookRepository } from '../repositories/bookRepository.js';
import { financialYearRepository } from '../repositories/financialYearRepository.js';
import { settingsRepository } from '../repositories/settingsRepository.js';
import { auditLogRepository } from '../repositories/auditLogRepository.js';
import * as activityLogService from './activityLogService.js';
import * as coaService from './coaService.js';
import { getBookTemplate, DEFAULT_BOOK_TEMPLATE_ID } from '../data/bookTemplates.js';

/**
 * @returns {Promise<import('../models/types.js').Book[]>}
 */
export async function listBooks() {
  return bookRepository.findAllSorted();
}

/**
 * @param {string} id
 */
export async function getBook(id) {
  return bookRepository.findById(id);
}

/**
 * Create a book and its first financial year.
 * @param {{
 *   name: string,
 *   legalName?: string,
 *   currency?: string,
 *   country?: string,
 *   fyStartMonth?: number,
 *   address?: string,
 *   taxId?: string,
 *   templateId?: string,
 * }} input
 */
export async function createBook(input) {
  const name = String(input.name || '').trim();
  if (!name) {
    throw new Error('Book name is required');
  }

  const existing = await bookRepository.findByName(name);
  if (existing) {
    throw new Error(`A book named "${name}" already exists`);
  }

  const template = getBookTemplate(input.templateId || DEFAULT_BOOK_TEMPLATE_ID);
  const fyStartMonth = Number(input.fyStartMonth) || 4;
  const now = nowIso();
  const bookId = uuid();

  /** @type {import('../models/types.js').Book} */
  const book = {
    id: bookId,
    name,
    legalName: String(input.legalName || name).trim(),
    currency: String(input.currency || 'INR').trim().toUpperCase(),
    country: String(input.country || '').trim(),
    fyStartMonth,
    address: String(input.address || '').trim(),
    taxId: String(input.taxId || '').trim(),
    templateId: template.id,
    createdAt: now,
    updatedAt: now,
  };

  const fyStart = defaultFyStart(new Date(), fyStartMonth);
  const fyEnd = defaultFyEnd(fyStart);

  /** @type {import('../models/types.js').FinancialYear} */
  const fy = {
    id: uuid(),
    bookId,
    name: suggestFyLabel(fyStart),
    startDate: toDateInput(fyStart),
    endDate: toDateInput(fyEnd),
    isActive: true,
    isClosed: false,
    createdAt: now,
  };

  await bookRepository.create(book);
  await financialYearRepository.create(fy);
  await coaService.seedDefaultChartOfAccounts(bookId, template.id);
  await (await import('./inventoryService.js')).ensureInventoryMasters(bookId, {
    catalogueTypes: template.catalogueTypes ?? null,
    categories: template.categories,
    units: template.units,
  });
  await (await import('./taxService.js')).ensureTaxMasters(bookId);
  await auditLogRepository.log({
    bookId,
    entity: 'Book',
    recordId: bookId,
    operation: 'Create',
    detail: { name: book.name, templateId: template.id, templateName: template.name },
  });

  try {
    await activityLogService.recordActivity({
      category: 'Book',
      bookName: book.name,
      message: `Created book “${book.name}” (${template.name})`,
    });
  } catch {
    /* ignore */
  }

  await setActiveBook(bookId, fy.id);
  emit(EVENTS.BOOK_CREATED, { book, financialYear: fy });
  return { book, financialYear: fy };
}

/**
 * @param {string} bookId
 * @param {Partial<import('../models/types.js').Book>} patch
 */
export async function updateBook(bookId, patch) {
  const book = await bookRepository.findById(bookId);
  if (!book) throw new Error('Book not found');

  if (patch.name !== undefined) {
    const name = String(patch.name).trim();
    if (!name) throw new Error('Book name is required');
    const clash = await bookRepository.findByName(name);
    if (clash && clash.id !== bookId) {
      throw new Error(`A book named "${name}" already exists`);
    }
    book.name = name;
  }

  for (const key of ['legalName', 'currency', 'country', 'address', 'taxId']) {
    if (patch[key] !== undefined) {
      book[key] = String(patch[key] ?? '').trim();
    }
  }
  if (patch.fyStartMonth !== undefined) {
    book.fyStartMonth = Number(patch.fyStartMonth) || book.fyStartMonth;
  }

  book.updatedAt = nowIso();
  await bookRepository.save(book);
  await auditLogRepository.log({
    bookId,
    entity: 'Book',
    recordId: bookId,
    operation: 'Update',
    detail: patch,
  });

  const activeId = await getActiveBookId();
  if (activeId === bookId) {
    emit(EVENTS.BOOK_CHANGED, { bookId, book });
  }

  return book;
}

/**
 * Delete a book, its financial years, and chart of accounts.
 * @param {string} bookId
 */
export async function deleteBook(bookId) {
  const book = await bookRepository.findById(bookId);
  if (!book) throw new Error('Book not found');

  await coaService.purgeChartOfAccounts(bookId);
  await (await import('./voucherService.js')).purgeVouchers(bookId);
  await (await import('./inventoryService.js')).purgeInventory(bookId);
  await (await import('./taxService.js')).purgeTax(bookId);
  await (await import('./personalFinanceService.js')).purgeFinance(bookId);

  const years = await financialYearRepository.findByBook(bookId);
  for (const fy of years) {
    await financialYearRepository.delete(fy.id);
  }
  await bookRepository.delete(bookId);
  await auditLogRepository.log({
    bookId: null,
    entity: 'Book',
    recordId: bookId,
    operation: 'Delete',
    detail: { name: book.name },
  });

  try {
    await activityLogService.recordActivity({
      category: 'Book',
      bookName: book.name,
      message: `Deleted book “${book.name}”`,
    });
  } catch {
    /* ignore */
  }

  const activeId = await getActiveBookId();
  if (activeId === bookId) {
    await clearActiveBook();
  }

  emit(EVENTS.BOOK_DELETED, { bookId });
}

/**
 * @param {string} bookId
 * @param {string} [financialYearId]
 */
export async function setActiveBook(bookId, financialYearId) {
  const book = await bookRepository.findById(bookId);
  if (!book) throw new Error('Book not found');

  // Phase 1 books created before COA seeding get the default template on open
  await coaService.ensureChartOfAccounts(bookId);
  await (await import('./inventoryService.js')).ensureInventoryMasters(bookId);
  await (await import('./taxService.js')).ensureTaxMasters(bookId);

  let fyId = financialYearId;
  if (!fyId) {
    const fy = await financialYearRepository.findActive(bookId);
    fyId = fy?.id ?? null;
  }

  await settingsRepository.setValue(SETTINGS_KEYS.ACTIVE_BOOK_ID, bookId);
  await settingsRepository.setValue(SETTINGS_KEYS.ACTIVE_FY_ID, fyId);

  book.updatedAt = nowIso();
  await bookRepository.save(book);

  emit(EVENTS.BOOK_CHANGED, { bookId, financialYearId: fyId, book });
  return { book, financialYearId: fyId };
}

export async function clearActiveBook() {
  await settingsRepository.removeValue(SETTINGS_KEYS.ACTIVE_BOOK_ID);
  await settingsRepository.removeValue(SETTINGS_KEYS.ACTIVE_FY_ID);
  emit(EVENTS.BOOK_CHANGED, { bookId: null, financialYearId: null, book: null });
}

export async function getActiveBookId() {
  return /** @type {string|undefined} */ (
    await settingsRepository.getValue(SETTINGS_KEYS.ACTIVE_BOOK_ID)
  );
}

export async function getActiveFinancialYearId() {
  return /** @type {string|undefined} */ (
    await settingsRepository.getValue(SETTINGS_KEYS.ACTIVE_FY_ID)
  );
}

/**
 * Resolve active book + FY for the shell.
 */
export async function getSessionContext() {
  const bookId = await getActiveBookId();
  if (!bookId) {
    return { book: null, financialYear: null };
  }

  const book = await bookRepository.findById(bookId);
  if (!book) {
    await clearActiveBook();
    return { book: null, financialYear: null };
  }

  const fyId = await getActiveFinancialYearId();
  let financialYear = fyId
    ? await financialYearRepository.findById(fyId)
    : null;

  if (!financialYear || financialYear.bookId !== bookId) {
    financialYear = await financialYearRepository.findActive(bookId);
    if (financialYear) {
      await settingsRepository.setValue(SETTINGS_KEYS.ACTIVE_FY_ID, financialYear.id);
    }
  }

  return { book, financialYear };
}

/**
 * @param {string} bookId
 */
export async function listFinancialYears(bookId) {
  return financialYearRepository.findByBook(bookId);
}
