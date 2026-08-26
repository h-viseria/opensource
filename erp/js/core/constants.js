/**
 * Application-wide constants for PicoERP.
 */

export const APP_NAME = 'PicoERP';
export const APP_VERSION = '0.23.0';

/** IndexedDB database name. */
export const DB_NAME = 'erpDataStore';
/** Bump when schema changes. v5 People; v6 Payroll; v7 Payroll accounting. */
export const DB_VERSION = 7;

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
  // People / HR (Phase 1)
  EMPLOYEES: 'employees',
  EMPLOYEE_CUSTOM_FIELDS: 'employeeCustomFields',
  EMPLOYEE_DOCUMENTS: 'employeeDocuments',
  ATTENDANCE_STATUSES: 'attendanceStatuses',
  ATTENDANCE_RECORDS: 'attendanceRecords',
  ATTENDANCE_SETTINGS: 'attendanceSettings',
  LEAVE_TYPES: 'leaveTypes',
  LEAVE_RECORDS: 'leaveRecords',
  // Payroll (Phase 2)
  SALARY_HEADS: 'salaryHeads',
  EMPLOYEE_SALARY_LINES: 'employeeSalaryLines',
  PAYROLL_SETTINGS: 'payrollSettings',
  SALARY_ADJUSTMENTS: 'salaryAdjustments',
  PAYROLL_RUNS: 'payrollRuns',
  PAYROLL_ITEMS: 'payrollItems',
  EMPLOYEE_PAYROLL_ACCOUNTS: 'employeePayrollAccounts',
});

/** Session / settings keys. */
export const SETTINGS_KEYS = Object.freeze({
  ACTIVE_BOOK_ID: 'activeBookId',
  ACTIVE_FY_ID: 'activeFinancialYearId',
  UI_PREFERENCES: 'uiPreferences',
  GOOGLE_DRIVE_CLIENT_ID: 'googleDriveClientId',
  GOOGLE_DRIVE_API_KEY: 'googleDriveApiKey',
  GOOGLE_DRIVE_APP_ID: 'googleDriveAppId',
  GOOGLE_DRIVE_SYNC: 'googleDriveSync',
  LOCAL_DATA_UPDATED_AT: 'localDataUpdatedAt',
  ACTIVITY_LOG: 'activityLog',
  BANK_STATEMENT_IMPORT: 'bankStatementImport',
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
  PEOPLE_CHANGED: 'people:changed',
  PAYROLL_CHANGED: 'payroll:changed',
  NAV_TOGGLE: 'nav:toggle',
  TOAST: 'toast:show',
  DB_READY: 'db:ready',
  APP_ERROR: 'app:error',
  DRIVE_SYNC_CHANGED: 'driveSync:changed',
});

export const EMPLOYMENT_STATUS = Object.freeze({
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
});

export const EMPLOYMENT_TYPES = Object.freeze([
  'Full Time',
  'Part Time',
  'Contract',
  'Temporary',
  'Other',
]);

export const EMPLOYEE_FIELD_TYPES = Object.freeze([
  'Text',
  'Number',
  'Currency',
  'Date',
  'Checkbox',
]);

export const LEAVE_ACCRUAL_METHODS = Object.freeze({
  NONE: 'None',
  ANNUAL: 'Annual',
  MONTHLY: 'Monthly',
});

export const SALARY_HEAD_TYPES = Object.freeze({
  EARNING: 'Earning',
  DEDUCTION: 'Deduction',
});

export const SALARY_CALC_TYPES = Object.freeze({
  FIXED: 'Fixed',
  PERCENTAGE: 'Percentage',
  FORMULA: 'Formula',
  ATTENDANCE: 'AttendanceBased',
  HOURS: 'HoursBased',
  MANUAL: 'Manual',
});

export const SALARY_CALC_BASIS = Object.freeze({
  BASIC: 'BasicSalary',
  GROSS: 'GrossEarnings',
  SPECIFIC_HEAD: 'SpecificSalaryHead',
  TOTAL_EARNINGS: 'TotalEarnings',
  TOTAL_DEDUCTIONS: 'TotalDeductions',
  ATTENDANCE_DAYS: 'AttendanceDays',
  LEAVE_DAYS: 'LeaveDays',
  UNPAID_LEAVE_DAYS: 'UnpaidLeaveDays',
  OVERTIME_HOURS: 'OvertimeHours',
  MANUAL: 'ManualValue',
});

export const PAYROLL_FREQUENCIES = Object.freeze({
  MONTHLY: 'Monthly',
  WEEKLY: 'Weekly',
  BIWEEKLY: 'Biweekly',
});

export const DAILY_RATE_METHODS = Object.freeze({
  CALENDAR: 'MonthlySalary / CalendarDays',
  WORKING: 'MonthlySalary / WorkingDays',
  CUSTOM: 'Custom',
});

export const HOURLY_RATE_METHODS = Object.freeze({
  MONTHLY_HOURS: 'MonthlySalary / WorkingHours',
  DAILY_HOURS: 'DailyRate / DailyHours',
  CUSTOM: 'Custom',
});

export const PAYROLL_RUN_STATUS = Object.freeze({
  DRAFT: 'Draft',
  CALCULATED: 'Calculated',
  REVIEWED: 'Reviewed',
  FINALIZED: 'Finalized',
});

/** Accounting classification for salary heads (Phase 3). */
export const PAYROLL_ACCOUNTING_CLASS = Object.freeze({
  SALARY: 'Salary',
  DEDUCTION: 'Deduction',
  TAX: 'Tax',
});

/** Payroll run accounting / payment status (Phase 3). */
export const PAYROLL_ACCOUNTING_STATUS = Object.freeze({
  NOT_POSTED: 'NotPosted',
  POSTED: 'Posted',
  REVERSED: 'Reversed',
  PAID: 'Paid',
});

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

export const INVENTORY_TXN_TYPES = Object.freeze({
  OPENING: 'Opening',
  PURCHASE: 'Purchase',
  SALE: 'Sale',
  SALES_RETURN: 'Sales Return',
  PURCHASE_RETURN: 'Purchase Return',
  ADJUSTMENT: 'Adjustment',
  TRANSFER: 'Transfer',
});

export const INVOICE_STATUS = Object.freeze({
  POSTED: 'Posted',
  PARTIALLY_RETURNED: 'PartiallyReturned',
  CANCELLED: 'Cancelled',
});

export const TAX_TYPES = Object.freeze({
  VAT: 'VAT',
  GST: 'GST',
  SALES_TAX: 'Sales Tax',
});

export const TAX_COMPONENTS = Object.freeze({
  INPUT: 'Input',
  OUTPUT: 'Output',
});

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

export const DEFAULT_FY_START_MONTH = 4;
