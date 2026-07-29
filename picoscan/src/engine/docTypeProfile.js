/**
 * Per-document-type OCR / preprocess hints.
 */

import { DOCUMENT_TYPES } from '../core/constants.js';

/**
 * @typedef {Object} DocTypeProfile
 * @property {string} psm Tesseract page segmentation mode value
 * @property {string} [whitelist] optional tessedit_char_whitelist
 * @property {boolean} grayscale
 * @property {number} contrast
 * @property {boolean} sharpen
 * @property {number} [pdfScale] reserved for future ingest tuning
 * @property {RegExp[]} scoreCues patterns that boost orientation scoring
 */

/** @type {DocTypeProfile} */
const DEFAULT_PROFILE = {
  psm: '3', // AUTO
  grayscale: false,
  contrast: 8,
  sharpen: true,
  scoreCues: [],
};

/**
 * @param {string} [documentType]
 * @returns {DocTypeProfile}
 */
export function getDocTypeProfile(documentType) {
  switch (documentType) {
    case DOCUMENT_TYPES.PASSPORT:
      return {
        psm: '6', // SINGLE_BLOCK — bio page + MRZ as one block
        grayscale: false,
        contrast: 6,
        sharpen: true,
        scoreCues: [/passport/i, /nationality/i, /surname/i, /P</, /[A-Z0-9<]{20,}/],
      };
    case DOCUMENT_TYPES.IDENTITY_CARD:
      return {
        psm: '6',
        grayscale: false,
        contrast: 8,
        sharpen: true,
        scoreCues: [/aadhaar|pan|identity|date of birth|id number/i],
      };
    case DOCUMENT_TYPES.BUSINESS_CARD:
      return {
        psm: '11', // SPARSE_TEXT
        grayscale: true,
        contrast: 12,
        sharpen: true,
        scoreCues: [/@[a-z0-9.-]+\.[a-z]{2,}/i, /\b(tel|phone|mobile)\b/i],
      };
    case DOCUMENT_TYPES.INVOICE:
    case DOCUMENT_TYPES.RECEIPT:
    case DOCUMENT_TYPES.PURCHASE_ORDER:
    case DOCUMENT_TYPES.DELIVERY_NOTE:
      return {
        psm: '4', // SINGLE_COLUMN
        grayscale: true,
        contrast: 14,
        sharpen: true,
        scoreCues: [/invoice|receipt|total|gstin|amount|purchase order|delivery/i],
      };
    case DOCUMENT_TYPES.BANK_STATEMENT:
      return {
        psm: '4',
        grayscale: true,
        contrast: 12,
        sharpen: true,
        scoreCues: [/statement|opening balance|closing balance|account/i],
      };
    default:
      return { ...DEFAULT_PROFILE };
  }
}
