/**
 * Parse OCR text / PicoScan field maps into a proposed transaction.
 * Local only — no network.
 */

import { parseFlexibleDate, todayIsoDate } from '../utils/date.js';

const CURRENCY_RE = /\b(AED|INR|USD|EUR|GBP|SAR|QAR|OMR|BHD|KWD|JPY|SGD)\b/i;
const AMOUNT_RE = /(?:(?:AED|INR|USD|EUR|GBP|SAR|QR|Rs\.?|₹|\$|€)\s*)(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+\.\d{2})/i;
const TOTAL_LINE = /(?:total|amount due|grand total|net amount|amount)\s*[:\-]?\s*(?:AED|INR|USD|EUR|GBP|SAR|QR|Rs\.?|₹|\$|€)?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+\.\d{2})/i;
const TAX_LINE = /(?:vat|tax|gst)\s*[:\-]?\s*(?:AED|INR|USD|EUR|GBP|SAR|QR|Rs\.?|₹|\$|€)?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+\.\d{2})/i;
const DATE_RE = /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/;

/**
 * @param {string} text
 * @param {Record<string, string>} [fieldMap]
 */
export function parseReceiptText(text, fieldMap = {}) {
  const raw = String(text || '');
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const field = (keys) => {
    for (const k of keys) {
      const v = fieldMap[k] || fieldMap[k.replace(/\s+/g, '_')];
      if (v) return String(v).trim();
    }
    return '';
  };

  let merchant = field(['merchant', 'vendor', 'store', 'seller', 'name']);
  if (!merchant) merchant = guessMerchant(lines);

  let date = parseFlexibleDate(field(['date', 'invoice_date', 'txn_date', 'transaction_date']));
  if (!date) {
    const dm = raw.match(DATE_RE);
    date = dm ? parseFlexibleDate(dm[1]) : '';
  }
  if (!date) date = todayIsoDate();

  let currency = (field(['currency', 'ccy']) || '').toUpperCase();
  if (!currency) {
    const cm = raw.match(CURRENCY_RE);
    currency = cm ? cm[1].toUpperCase() : '';
  }

  let total = field(['total', 'amount', 'grand_total', 'amount_due', 'net_amount']);
  if (!total) {
    const tm = raw.match(TOTAL_LINE) || raw.match(AMOUNT_RE);
    total = tm ? tm[1] : '';
  }

  let tax = field(['tax', 'vat', 'gst']);
  if (!tax) {
    const xm = raw.match(TAX_LINE);
    tax = xm ? xm[1] : '';
  }

  const paymentMethod = guessPayment(raw) || field(['payment_method', 'payment', 'paid_by']);

  const lineItems = [];
  const tables = [];
  void tables;

  return {
    merchant,
    date,
    total: String(total || '').replace(/,/g, ''),
    currency: currency || 'AED',
    tax: String(tax || '').replace(/,/g, ''),
    paymentMethod,
    lineItems,
    rawText: raw,
    confidence: merchant && total ? 0.7 : 0.4,
  };
}

/**
 * @param {string[]} lines
 */
function guessMerchant(lines) {
  const skip = /receipt|invoice|tax|vat|total|tel|phone|www|http|thank/i;
  for (const line of lines.slice(0, 8)) {
    if (line.length < 3 || skip.test(line)) continue;
    if (/^\d/.test(line)) continue;
    return line.slice(0, 80);
  }
  return '';
}

function guessPayment(text) {
  const t = text.toLowerCase();
  if (/visa|mastercard|amex|credit card/.test(t)) return 'CREDIT_CARD';
  if (/\bupi\b/.test(t)) return 'UPI';
  if (/cash/.test(t)) return 'CASH';
  if (/debit/.test(t)) return 'DEBIT_CARD';
  return '';
}
