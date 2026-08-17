/**
 * PicoScan core constants.
 */

export const APP_NAME = 'PicoScan';
export const APP_VERSION = '0.2.3';
export const DB_NAME = 'picoscanDataStore';
export const DB_VERSION = 2;

/** @enum {string} */
export const DOCUMENT_TYPES = Object.freeze({
  INVOICE: 'Invoice',
  RECEIPT: 'Receipt',
  BANK_STATEMENT: 'Bank Statement',
  PURCHASE_ORDER: 'Purchase Order',
  DELIVERY_NOTE: 'Delivery Note',
  BUSINESS_CARD: 'Business Card',
  PASSPORT: 'Passport',
  IDENTITY_CARD: 'Identity Card',
  UNKNOWN: 'Unknown',
});

export const DOCUMENT_TYPE_LIST = Object.freeze(Object.values(DOCUMENT_TYPES));

export const EVENTS = Object.freeze({
  SCAN_STARTED: 'scanStarted',
  OCR_COMPLETED: 'ocrCompleted',
  CLASSIFICATION_COMPLETED: 'classificationCompleted',
  FIELDS_EXTRACTED: 'fieldsExtracted',
  FIELD_EDITED: 'fieldEdited',
  EXPORT_COMPLETED: 'exportCompleted',
  DOCUMENT_CHANGED: 'documentChanged',
  HISTORY_CHANGED: 'historyChanged',
  KNOWLEDGE_CHANGED: 'knowledgeChanged',
  LOG: 'log',
  ERROR: 'error',
  WIDGET_OPENED: 'widgetOpened',
  WIDGET_CLOSED: 'widgetClosed',
});

export const STORES = Object.freeze({
  DOCUMENTS: 'documents',
  SETTINGS: 'settings',
  KNOWLEDGE: 'knowledge',
  CATEGORIES: 'categories',
});
