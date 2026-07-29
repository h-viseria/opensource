/**
 * Lightweight local document classification (browser-side heuristics).
 * Designed as a drop-in point for a future small ONNX / Transformers.js model.
 */

import { DOCUMENT_TYPES } from '../core/constants.js';

/**
 * @param {string} rawText
 * @returns {{ documentType: string, confidence: number, scores: Record<string, number> }}
 */
export function classifyDocument(rawText) {
  const text = String(rawText || '');
  const lower = text.toLowerCase();

  /** @type {Record<string, { weight: number, patterns: RegExp[] }>} */
  const rules = {
    [DOCUMENT_TYPES.INVOICE]: {
      weight: 1,
      patterns: [/invoice/i, /tax invoice/i, /bill to/i, /invoice\s*#/i, /gstin/i, /subtotal/i],
    },
    [DOCUMENT_TYPES.RECEIPT]: {
      weight: 1,
      patterns: [/receipt/i, /thank you for (your )?purchase/i, /cashiering/i, /change due/i],
    },
    [DOCUMENT_TYPES.BANK_STATEMENT]: {
      weight: 1,
      patterns: [/statement of account/i, /opening balance/i, /closing balance/i, /account number/i, /ifsc/i],
    },
    [DOCUMENT_TYPES.PURCHASE_ORDER]: {
      weight: 1,
      patterns: [/purchase order/i, /\bpo\s*#/i, /ship to/i, /order date/i],
    },
    [DOCUMENT_TYPES.DELIVERY_NOTE]: {
      weight: 1,
      patterns: [/delivery note/i, /delivered to/i, /goods received/i, /packing list/i],
    },
    [DOCUMENT_TYPES.BUSINESS_CARD]: {
      weight: 0.9,
      patterns: [/@[a-z0-9.-]+\.[a-z]{2,}/i, /\b(tel|phone|mobile|fax)\b/i, /\b(ceo|director|manager)\b/i],
    },
    [DOCUMENT_TYPES.PASSPORT]: {
      weight: 1.1,
      patterns: [
        /passport/i,
        /nationality/i,
        /date of expiry/i,
        /place of birth/i,
        /passport no/i,
        /surname/i,
        /given\s*names?/i,
        /\bP<[A-Z]{3}/,
        /[A-Z0-9<]{30,}/,
      ],
    },
    [DOCUMENT_TYPES.IDENTITY_CARD]: {
      weight: 1,
      patterns: [/\baadhaar\b/i, /\bpan\b/i, /identity card/i, /date of birth/i, /id number/i],
    },
  };

  /** @type {Record<string, number>} */
  const scores = {};
  let bestType = DOCUMENT_TYPES.UNKNOWN;
  let best = 0;

  for (const [type, rule] of Object.entries(rules)) {
    let score = 0;
    for (const re of rule.patterns) {
      if (re.test(lower)) score += rule.weight;
    }
    // Length heuristic: business cards / IDs tend to be short
    if (type === DOCUMENT_TYPES.BUSINESS_CARD && text.length < 600) score += 0.4;
    if (type === DOCUMENT_TYPES.INVOICE && /total/i.test(lower) && /date/i.test(lower)) score += 0.5;
    scores[type] = score;
    if (score > best) {
      best = score;
      bestType = type;
    }
  }

  const confidence = best <= 0 ? 0.2 : Math.min(0.95, 0.35 + best * 0.15);
  return {
    documentType: best <= 0 ? DOCUMENT_TYPES.UNKNOWN : bestType,
    confidence,
    scores,
  };
}
