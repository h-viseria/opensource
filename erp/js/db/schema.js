/**
 * IndexedDB schema definition — master specification §5.
 * All stores created in DB_VERSION 1 so Phase 2+ add indexes/data only.
 */

import { STORES } from '../core/constants.js';

/**
 * @typedef {{ name: string, keyPath?: string, autoIncrement?: boolean, indexes?: IndexDef[] }} StoreDef
 * @typedef {{ name: string, keyPath: string|string[], unique?: boolean, multiEntry?: boolean }} IndexDef
 */

/**
 * Full store catalogue with mandatory indexes (id, bookId, date, ledgerId, voucherId, name, code)
 * where applicable to each entity.
 * @type {StoreDef[]}
 */
export const STORE_DEFINITIONS = [
  {
    name: STORES.BOOKS,
    keyPath: 'id',
    indexes: [
      { name: 'name', keyPath: 'name', unique: false },
      { name: 'updatedAt', keyPath: 'updatedAt', unique: false },
    ],
  },
  {
    name: STORES.FINANCIAL_YEARS,
    keyPath: 'id',
    indexes: [
      { name: 'bookId', keyPath: 'bookId', unique: false },
      { name: 'name', keyPath: 'name', unique: false },
      { name: 'bookId_name', keyPath: ['bookId', 'name'], unique: true },
    ],
  },
  {
    name: STORES.LEDGER_GROUPS,
    keyPath: 'id',
    indexes: [
      { name: 'bookId', keyPath: 'bookId', unique: false },
      { name: 'name', keyPath: 'name', unique: false },
      { name: 'code', keyPath: 'code', unique: false },
      { name: 'parentId', keyPath: 'parentId', unique: false },
      { name: 'bookId_name', keyPath: ['bookId', 'name'], unique: false },
    ],
  },
  {
    name: STORES.LEDGERS,
    keyPath: 'id',
    indexes: [
      { name: 'bookId', keyPath: 'bookId', unique: false },
      { name: 'name', keyPath: 'name', unique: false },
      { name: 'code', keyPath: 'code', unique: false },
      { name: 'groupId', keyPath: 'groupId', unique: false },
      { name: 'bookId_name', keyPath: ['bookId', 'name'], unique: false },
    ],
  },
  {
    name: STORES.CUSTOMERS,
    keyPath: 'id',
    indexes: [
      { name: 'bookId', keyPath: 'bookId', unique: false },
      { name: 'name', keyPath: 'name', unique: false },
      { name: 'code', keyPath: 'code', unique: false },
      { name: 'ledgerId', keyPath: 'ledgerId', unique: false },
    ],
  },
  {
    name: STORES.SUPPLIERS,
    keyPath: 'id',
    indexes: [
      { name: 'bookId', keyPath: 'bookId', unique: false },
      { name: 'name', keyPath: 'name', unique: false },
      { name: 'code', keyPath: 'code', unique: false },
      { name: 'ledgerId', keyPath: 'ledgerId', unique: false },
    ],
  },
  {
    name: STORES.COST_CENTERS,
    keyPath: 'id',
    indexes: [
      { name: 'bookId', keyPath: 'bookId', unique: false },
      { name: 'name', keyPath: 'name', unique: false },
      { name: 'code', keyPath: 'code', unique: false },
    ],
  },
  {
    name: STORES.UNITS,
    keyPath: 'id',
    indexes: [
      { name: 'bookId', keyPath: 'bookId', unique: false },
      { name: 'name', keyPath: 'name', unique: false },
      { name: 'code', keyPath: 'code', unique: false },
    ],
  },
  {
    name: STORES.ITEM_CATEGORIES,
    keyPath: 'id',
    indexes: [
      { name: 'bookId', keyPath: 'bookId', unique: false },
      { name: 'name', keyPath: 'name', unique: false },
      { name: 'code', keyPath: 'code', unique: false },
    ],
  },
  {
    name: STORES.CATALOGUE_TYPES,
    keyPath: 'id',
    indexes: [
      { name: 'bookId', keyPath: 'bookId', unique: false },
      { name: 'name', keyPath: 'name', unique: false },
      { name: 'code', keyPath: 'code', unique: false },
      { name: 'bookId_name', keyPath: ['bookId', 'name'], unique: false },
    ],
  },
  {
    name: STORES.ITEMS,
    keyPath: 'id',
    indexes: [
      { name: 'bookId', keyPath: 'bookId', unique: false },
      { name: 'name', keyPath: 'name', unique: false },
      { name: 'code', keyPath: 'code', unique: false },
      { name: 'categoryId', keyPath: 'categoryId', unique: false },
    ],
  },
  {
    name: STORES.WAREHOUSES,
    keyPath: 'id',
    indexes: [
      { name: 'bookId', keyPath: 'bookId', unique: false },
      { name: 'name', keyPath: 'name', unique: false },
      { name: 'code', keyPath: 'code', unique: false },
    ],
  },
  {
    name: STORES.TAX_CODES,
    keyPath: 'id',
    indexes: [
      { name: 'bookId', keyPath: 'bookId', unique: false },
      { name: 'name', keyPath: 'name', unique: false },
      { name: 'code', keyPath: 'code', unique: false },
    ],
  },
  {
    name: STORES.VOUCHERS,
    keyPath: 'id',
    indexes: [
      { name: 'bookId', keyPath: 'bookId', unique: false },
      { name: 'date', keyPath: 'date', unique: false },
      { name: 'voucherType', keyPath: 'voucherType', unique: false },
      { name: 'voucherNumber', keyPath: 'voucherNumber', unique: false },
      { name: 'financialYearId', keyPath: 'financialYearId', unique: false },
      { name: 'bookId_date', keyPath: ['bookId', 'date'], unique: false },
      { name: 'bookId_voucherType_voucherNumber', keyPath: ['bookId', 'voucherType', 'voucherNumber'], unique: false },
    ],
  },
  {
    name: STORES.VOUCHER_LINES,
    keyPath: 'id',
    indexes: [
      { name: 'bookId', keyPath: 'bookId', unique: false },
      { name: 'voucherId', keyPath: 'voucherId', unique: false },
      { name: 'ledgerId', keyPath: 'ledgerId', unique: false },
      { name: 'date', keyPath: 'date', unique: false },
      { name: 'bookId_ledgerId', keyPath: ['bookId', 'ledgerId'], unique: false },
      { name: 'bookId_date', keyPath: ['bookId', 'date'], unique: false },
    ],
  },
  {
    name: STORES.INVENTORY_TRANSACTIONS,
    keyPath: 'id',
    indexes: [
      { name: 'bookId', keyPath: 'bookId', unique: false },
      { name: 'date', keyPath: 'date', unique: false },
      { name: 'itemId', keyPath: 'itemId', unique: false },
      { name: 'voucherId', keyPath: 'voucherId', unique: false },
      { name: 'warehouseId', keyPath: 'warehouseId', unique: false },
    ],
  },
  {
    name: STORES.INVOICES,
    keyPath: 'id',
    indexes: [
      { name: 'bookId', keyPath: 'bookId', unique: false },
      { name: 'date', keyPath: 'date', unique: false },
      { name: 'invoiceType', keyPath: 'invoiceType', unique: false },
      { name: 'invoiceNumber', keyPath: 'invoiceNumber', unique: false },
      { name: 'voucherId', keyPath: 'voucherId', unique: false },
      { name: 'bookId_invoiceNumber', keyPath: ['bookId', 'invoiceNumber'], unique: false },
    ],
  },
  {
    name: STORES.INVOICE_TEMPLATES,
    keyPath: 'id',
    indexes: [
      { name: 'bookId', keyPath: 'bookId', unique: false },
      { name: 'name', keyPath: 'name', unique: false },
      { name: 'format', keyPath: 'format', unique: false },
    ],
  },
  {
    name: STORES.BUDGETS,
    keyPath: 'id',
    indexes: [
      { name: 'bookId', keyPath: 'bookId', unique: false },
      { name: 'name', keyPath: 'name', unique: false },
      { name: 'ledgerId', keyPath: 'ledgerId', unique: false },
    ],
  },
  {
    name: STORES.GOALS,
    keyPath: 'id',
    indexes: [
      { name: 'bookId', keyPath: 'bookId', unique: false },
      { name: 'name', keyPath: 'name', unique: false },
    ],
  },
  {
    name: STORES.ATTACHMENTS,
    keyPath: 'id',
    indexes: [
      { name: 'bookId', keyPath: 'bookId', unique: false },
      { name: 'entityType', keyPath: 'entityType', unique: false },
      { name: 'entityId', keyPath: 'entityId', unique: false },
    ],
  },
  {
    name: STORES.AUDIT_LOGS,
    keyPath: 'id',
    indexes: [
      { name: 'bookId', keyPath: 'bookId', unique: false },
      { name: 'timestamp', keyPath: 'timestamp', unique: false },
      { name: 'entity', keyPath: 'entity', unique: false },
      { name: 'operation', keyPath: 'operation', unique: false },
    ],
  },
  {
    name: STORES.SETTINGS,
    keyPath: 'id',
    indexes: [
      { name: 'key', keyPath: 'key', unique: true },
    ],
  },
];
