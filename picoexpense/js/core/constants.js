/**
 * Pico Personal Finance (PicoExpense) — identity and enumerations.
 * Architecture is name-agnostic; display name lives here and in the manifest.
 */

export const APP_NAME = 'PicoExpense';
export const APP_DISPLAY_NAME = 'Pico Personal Finance';
export const APP_VERSION = '0.1.2';
export const APP_SLUG = 'picoexpense';

export const DB_NAME = 'PicoPersonalFinance';
export const DB_VERSION = 1;

export const BACKUP_FORMAT = 'picoexpense.exp.json';
export const BACKUP_MIME = 'application/json';
export const BACKUP_KIND = 'picoexpense-backup';

export const TXN_TYPES = Object.freeze({
  EXPENSE: 'EXPENSE',
  INCOME: 'INCOME',
  TRANSFER: 'TRANSFER',
  REFUND: 'REFUND',
  REIMBURSEMENT: 'REIMBURSEMENT',
  ADJUSTMENT: 'ADJUSTMENT',
  CASH_WITHDRAWAL: 'CASH_WITHDRAWAL',
  CASH_DEPOSIT: 'CASH_DEPOSIT',
  CREDIT_CARD_PAYMENT: 'CREDIT_CARD_PAYMENT',
});

/** Types that count as spending in reports (not transfers). */
export const EXPENSE_LIKE = Object.freeze([
  TXN_TYPES.EXPENSE,
]);

/** Types that count as income in reports (not transfers). */
export const INCOME_LIKE = Object.freeze([
  TXN_TYPES.INCOME,
  TXN_TYPES.REIMBURSEMENT,
]);

/** Transfer-like: never inflate income/expense totals. */
export const TRANSFER_LIKE = Object.freeze([
  TXN_TYPES.TRANSFER,
  TXN_TYPES.CASH_WITHDRAWAL,
  TXN_TYPES.CASH_DEPOSIT,
  TXN_TYPES.CREDIT_CARD_PAYMENT,
]);

export const ACCOUNT_TYPES = Object.freeze({
  BANK: 'BANK',
  SAVINGS: 'SAVINGS',
  CURRENT: 'CURRENT',
  CASH: 'CASH',
  WALLET: 'WALLET',
  DEBIT_CARD: 'DEBIT_CARD',
  CREDIT_CARD: 'CREDIT_CARD',
  PREPAID: 'PREPAID',
  OTHER_ASSET: 'OTHER_ASSET',
  OTHER_LIABILITY: 'OTHER_LIABILITY',
});

export const LIABILITY_ACCOUNT_TYPES = Object.freeze([
  ACCOUNT_TYPES.CREDIT_CARD,
  ACCOUNT_TYPES.OTHER_LIABILITY,
]);

export const PAYMENT_METHODS = Object.freeze({
  CASH: 'CASH',
  DEBIT_CARD: 'DEBIT_CARD',
  CREDIT_CARD: 'CREDIT_CARD',
  BANK_TRANSFER: 'BANK_TRANSFER',
  UPI: 'UPI',
  WALLET: 'WALLET',
  CHEQUE: 'CHEQUE',
  OTHER: 'OTHER',
});

export const REIMBURSEMENT_STATUS = Object.freeze({
  NONE: 'NONE',
  PENDING: 'PENDING',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  RECEIVED: 'RECEIVED',
});

export const BUDGET_PERIODS = Object.freeze({
  MONTHLY: 'MONTHLY',
  ANNUAL: 'ANNUAL',
});

export const BUDGET_STATUS = Object.freeze({
  NORMAL: 'NORMAL',
  WARNING: 'WARNING',
  EXCEEDED: 'EXCEEDED',
});

export const THEMES = Object.freeze({
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
});

export const STORES = Object.freeze({
  TRANSACTIONS: 'transactions',
  SPLITS: 'transactionSplits',
  ACCOUNTS: 'accounts',
  CATEGORIES: 'categories',
  MERCHANTS: 'merchants',
  TAGS: 'tags',
  PEOPLE: 'people',
  BUDGETS: 'budgets',
  GOALS: 'goals',
  ATTACHMENTS: 'attachments',
  RECEIPTS: 'receipts',
  CURRENCIES: 'currencies',
  EXCHANGE_RATES: 'exchangeRates',
  RULES: 'categorizationRules',
  SAVED_FILTERS: 'savedFilters',
  AUDIT_LOG: 'auditLog',
  ACTIVITY_LOG: 'activityLog',
  SETTINGS: 'settings',
  METADATA: 'metadata',
});

export const SETTINGS_KEYS = Object.freeze({
  SETUP_COMPLETE: 'setupComplete',
  PROFILE_NAME: 'profileName',
  COUNTRY: 'country',
  LOCALE: 'locale',
  BASE_CURRENCY: 'baseCurrency',
  DATE_FORMAT: 'dateFormat',
  NUMBER_FORMAT: 'numberFormat',
  THEME: 'theme',
  DEFAULT_ACCOUNT_ID: 'defaultAccountId',
  DEFAULT_CATEGORY_ID: 'defaultCategoryId',
  DEFAULT_TXN_DATE: 'defaultTxnDate',
  MONTH_START_DAY: 'monthStartDay',
  LAST_BACKUP_AT: 'lastBackupAt',
  LAST_RESTORE_AT: 'lastRestoreAt',
  LAST_ACCOUNT_ID: 'lastAccountId',
  LAST_CATEGORY_ID: 'lastCategoryId',
  LAST_MERCHANT_ID: 'lastMerchantId',
  SAMPLE_DATA: 'sampleData',
  LARGE_TEXT: 'largeText',
  HIGH_CONTRAST: 'highContrast',
  REDUCED_MOTION: 'reducedMotion',
  GOOGLE_DRIVE_CLIENT_ID: 'googleDriveClientId',
  GOOGLE_DRIVE_API_KEY: 'googleDriveApiKey',
  GOOGLE_DRIVE_APP_ID: 'googleDriveAppId',
  GOOGLE_DRIVE_SYNC: 'googleDriveSync',
  LOCAL_DATA_UPDATED_AT: 'localDataUpdatedAt',
  PICOSCAN_WIDGET_URL: 'picoscanWidgetUrl',
});

export const EVENTS = Object.freeze({
  ROUTE_CHANGE: 'route:change',
  TOAST: 'ui:toast',
  DATA_CHANGED: 'data:changed',
  SETTINGS_CHANGED: 'settings:changed',
  TXN_CHANGED: 'txn:changed',
  ACCOUNT_CHANGED: 'account:changed',
  MASTER_CHANGED: 'master:changed',
  DRIVE_SYNC_CHANGED: 'drive:sync-changed',
  THEME_CHANGED: 'theme:changed',
});

export const AUDIT_ACTIONS = Object.freeze({
  CREATED: 'Created',
  MODIFIED: 'Modified',
  DELETED: 'Deleted',
  RESTORED: 'Restored',
  IMPORTED: 'Imported',
  PERMANENT_DELETE: 'Permanently deleted',
});
