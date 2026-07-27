/**
 * Application-wide constants for PicoERP.
 */

export const APP_NAME = 'PicoERP';
export const APP_VERSION = '0.13.1';

/** IndexedDB database name. */
export const DB_NAME = 'erpDataStore';
/** Bump when schema changes. v4 adds catalogue (item type) masters. */
export const DB_VERSION = 4;

/**
 * Store names — full schema from master specification §5.
 */
export const STORES = Object.freeze({
  BOOKS: 'books',
  FINANCIAL_YEARS: 'financialYears',
  LEDGER_GROUPS: 'ledgerGroups',
  LEDGERS: 'ledgers',
  CUSTOMERS: 'customers',
  SUPPLIERS: 'suppliers',
  COST_CENTERS: 'costCenters',
  UNITS: 'units',
  ITEM_CATEGORIES: 'itemCategories',
  CATALOGUE_TYPES: 'catalogueTypes',
  ITEMS: 'items',
  WAREHOUSES: 'warehouses',
  TAX_CODES: 'taxCodes',
  VOUCHERS: 'vouchers',
  VOUCHER_LINES: 'voucherLines',
  INVENTORY_TRANSACTIONS: 'inventoryTransactions',
  INVOICES: 'invoices',
  INVOICE_TEMPLATES: 'invoiceTemplates',
  BUDGETS: 'budgets',
  GOALS: 'goals',
  ATTACHMENTS: 'attachments',
  AUDIT_LOGS: 'auditLogs',
  SETTINGS: 'settings',
});

/** Session / settings keys. */
export const SETTINGS_KEYS = Object.freeze({
  ACTIVE_BOOK_ID: 'activeBookId',
  ACTIVE_FY_ID: 'activeFinancialYearId',
  UI_PREFERENCES: 'uiPreferences',
});

/** Event bus channel names. */
export const EVENTS = Object.freeze({
  ROUTE_CHANGE: 'route:change',
  BOOK_CHANGED: 'book:changed',
  BOOK_CREATED: 'book:created',
  BOOK_DELETED: 'book:deleted',
  COA_CHANGED: 'coa:changed',
  VOUCHER_CHANGED: 'voucher:changed',
  INVENTORY_CHANGED: 'inventory:changed',
  INVOICE_CHANGED: 'invoice:changed',
  TAX_CHANGED: 'tax:changed',
  FINANCE_CHANGED: 'finance:changed',
  NAV_TOGGLE: 'nav:toggle',
  TOAST: 'toast:show',
  DB_READY: 'db:ready',
  APP_ERROR: 'app:error',
});

/** Voucher types from specification §6. */
export const VOUCHER_TYPES = Object.freeze({
  OPENING: 'Opening',
  JOURNAL: 'Journal',
  PAYMENT: 'Payment',
  RECEIPT: 'Receipt',
  CONTRA: 'Contra',
  SALES: 'Sales',
  PURCHASE: 'Purchase',
  CREDIT_NOTE: 'Credit Note',
  DEBIT_NOTE: 'Debit Note',
});

/** Inventory movement types — master specification §10. */
export const INVENTORY_TXN_TYPES = Object.freeze({
  OPENING: 'Opening',
  PURCHASE: 'Purchase',
  SALE: 'Sale',
  ADJUSTMENT: 'Adjustment',
  TRANSFER: 'Transfer',
});

/** Tax types and components — master specification §11. */
export const TAX_TYPES = Object.freeze({
  VAT: 'VAT',
  GST: 'GST',
  SALES_TAX: 'Sales Tax',
});

export const TAX_COMPONENTS = Object.freeze({
  INPUT: 'Input',
  OUTPUT: 'Output',
});

/** Personal finance goal categories — master specification §8. */
export const GOAL_CATEGORIES = Object.freeze({
  EMERGENCY: 'Emergency Fund',
  RETIREMENT: 'Retirement',
  EDUCATION: 'Education',
  VACATION: 'Vacation',
  HOUSE: 'House Purchase',
  OTHER: 'Other',
});

export const BUDGET_PERIODS = Object.freeze({
  MONTH: 'month',
  YEAR: 'year',
});

/** Default financial year helpers. */
export const DEFAULT_FY_START_MONTH = 4; // April (common India FY); adjustable per book
