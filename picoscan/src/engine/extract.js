/**
 * Local field + table extraction from OCR / PDF text.
 * Editable document model is the export source of truth.
 */

import { normalizeField, uuid } from '../core/documentModel.js';
import { DOCUMENT_TYPES } from '../core/constants.js';

/**
 * @param {string} rawText
 * @param {string} documentType
 * @param {{ knowledge?: import('../db/knowledge.js').KnowledgeMapping|null }} [opts]
 * @returns {{ fields: import('../core/documentModel.js').ScanField[], tables: import('../core/documentModel.js').ScanTable[] }}
 */
export function extractDocument(rawText, documentType, opts = {}) {
  const knowledge = opts.knowledge || null;
  let fields = extractFields(rawText, documentType);
  let tables = extractTables(rawText, documentType);

  if (knowledge) {
    fields = applyKnowledgeFields(rawText, fields, knowledge);
    tables = applyKnowledgeTables(rawText, tables, knowledge);
  }

  return { fields, tables };
}

/**
 * Overlay trained field hints onto heuristic extraction.
 * @param {string} rawText
 * @param {import('../core/documentModel.js').ScanField[]} fields
 * @param {import('../db/knowledge.js').KnowledgeMapping} knowledge
 */
function applyKnowledgeFields(rawText, fields, knowledge) {
  const text = String(rawText || '');
  const byKey = new Map(fields.map((f) => [f.key, f]));

  for (const hint of knowledge.fields || []) {
    const key =
      hint.key ||
      String(hint.label || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '') ||
      'field';
    const label = hint.label || key;
    let value = '';

    // Prefer label: value / label - value in text
    const labelRe = new RegExp(
      `${escapeRegExp(label)}\\s*[:\\-]?\\s*([^\\n]{2,80})`,
      'i'
    );
    const m = text.match(labelRe);
    if (m?.[1]) value = m[1].trim();

    // Fall back: find any trained example substring in text
    if (!value) {
      for (const ex of hint.examples || []) {
        if (ex && text.includes(ex)) {
          value = ex;
          break;
        }
      }
    }

    const existing = byKey.get(key);
    if (existing) {
      if (value && (!existing.value || existing.confidence < 0.85)) {
        byKey.set(key, normalizeField({ ...existing, label, value, confidence: Math.max(existing.confidence, 0.88) }));
      } else if (label && existing.label !== label) {
        byKey.set(key, normalizeField({ ...existing, label }));
      }
    } else if (value) {
      byKey.set(key, normalizeField({ key, label, value, confidence: 0.86 }));
    } else {
      // Still surface expected fields from training (empty for user edit)
      byKey.set(key, normalizeField({ key, label, value: '', confidence: 0.4 }));
    }
  }

  return [...byKey.values()];
}

/**
 * Prefer trained table headers; remap bank parser output or rebuild generic table.
 * @param {string} rawText
 * @param {import('../core/documentModel.js').ScanTable[]} tables
 * @param {import('../db/knowledge.js').KnowledgeMapping} knowledge
 */
function applyKnowledgeTables(rawText, tables, knowledge) {
  const headers = knowledge.table?.headers?.filter(Boolean);
  if (!headers?.length) return tables;

  // If we already extracted a bank-style table, remap columns by header name similarity
  const existing = tables[0];
  if (existing?.rows?.length && existing.headers?.length) {
    const remapped = remapTableHeaders(existing, headers);
    if (remapped) return [remapped];
  }

  // Generic line parser guided by trained header count
  const generic = extractGenericTable(rawText, headers);
  if (generic?.rows?.length) return [generic];

  // Keep empty schema so UI/export know the expected columns
  if (!tables.length) {
    return [{ id: uuid(), headers, rows: [] }];
  }
  return tables.map((t, i) => (i === 0 ? { ...t, headers } : t));
}

/**
 * @param {import('../core/documentModel.js').ScanTable} table
 * @param {string[]} targetHeaders
 */
function remapTableHeaders(table, targetHeaders) {
  const src = table.headers.map((h) => h.toLowerCase());
  const indexMap = targetHeaders.map((th) => {
    const needle = th.toLowerCase();
    let idx = src.findIndex((h) => h === needle);
    if (idx < 0) idx = src.findIndex((h) => h.includes(needle) || needle.includes(h));
    // common aliases
    if (idx < 0 && /withdraw|debit|dr/i.test(th)) idx = src.findIndex((h) => /withdraw|debit/i.test(h));
    if (idx < 0 && /deposit|credit|cr/i.test(th)) idx = src.findIndex((h) => /deposit|credit/i.test(h));
    if (idx < 0 && /narration|description|particular/i.test(th)) {
      idx = src.findIndex((h) => /narration|description|particular/i.test(h));
    }
    if (idx < 0 && /^date$/i.test(th)) idx = src.findIndex((h) => h === 'date');
    if (idx < 0 && /balance|closing/i.test(th)) idx = src.findIndex((h) => /balance/i.test(h));
    if (idx < 0 && /ref|chq|cheque/i.test(th)) idx = src.findIndex((h) => /ref|chq/i.test(h));
    if (idx < 0 && /value\s*date/i.test(th)) idx = src.findIndex((h) => /value/i.test(h));
    return idx;
  });

  if (indexMap.every((i) => i < 0)) return null;

  const rows = table.rows.map((row) => targetHeaders.map((_, i) => (indexMap[i] >= 0 ? row[indexMap[i]] || '' : '')));
  return { id: table.id || uuid(), headers: targetHeaders, rows };
}

/**
 * Very lightweight generic table extraction for trained headers.
 * @param {string} text
 * @param {string[]} headers
 */
function extractGenericTable(text, headers) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  // Prefer bank parser when headers look financial
  const joined = headers.join(' ').toLowerCase();
  if (/date/.test(joined) && (/withdraw|deposit|balance|narration/.test(joined))) {
    const bank = extractBankTxnTable(text);
    if (bank?.rows?.length) {
      return remapTableHeaders(bank, headers) || { id: uuid(), headers, rows: [] };
    }
  }

  /** @type {string[][]} */
  const rows = [];
  for (const line of lines) {
    if (!/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/.test(line)) continue;
    const amounts = line.match(/[\d,]+\.\d{2}/g) || [];
    const date = (line.match(/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/) || [''])[0];
    let rest = line.slice(date.length).trim();
    // strip trailing amounts from narration
    for (const a of amounts) {
      rest = rest.replace(a, '').trim();
    }
    rest = rest.replace(/\s{2,}/g, ' ').trim();

    /** @type {string[]} */
    const row = headers.map((h) => {
      const hl = h.toLowerCase();
      if (/^date$/i.test(h) || hl === 'txn date' || hl === 'transaction date') return date;
      if (/value\s*date/i.test(h)) {
        const vd = line.match(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g);
        return vd && vd[1] ? vd[1] : '';
      }
      if (/narration|description|particular|remarks/i.test(h)) return rest;
      if (/withdraw|debit/i.test(h)) return amounts.length >= 2 ? amounts[0] : '';
      if (/deposit|credit/i.test(h)) {
        if (amounts.length >= 3) return amounts[1];
        return '';
      }
      if (/balance|closing/i.test(h)) return amounts.length ? amounts[amounts.length - 1] : '';
      if (/ref|chq|cheque/i.test(h)) {
        const ref = rest.match(/\b([A-Z0-9]{10,})\b/);
        return ref ? ref[1] : '';
      }
      return '';
    });
    if (row.some((c) => c)) rows.push(row);
  }

  if (!rows.length) return null;
  return { id: uuid(), headers, rows };
}

/**
 * @param {string} s
 */
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {string} rawText
 * @param {string} documentType
 * @returns {import('../core/documentModel.js').ScanField[]}
 */
export function extractFields(rawText, documentType) {
  const text = String(rawText || '');
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  /** @type {import('../core/documentModel.js').ScanField[]} */
  const fields = [];

  const push = (label, value, confidence = 0.7) => {
    if (!value) return;
    fields.push(normalizeField({ label, value: String(value).trim(), confidence }));
  };

  push(
    'Date',
    matchFirst(text, [
      /(?:invoice\s*date|date|dated)\s*[:\-]?\s*([0-3]?\d[\/\-.][01]?\d[\/\-.](?:\d{2}|\d{4}))/i,
      /\b([0-3]?\d[\/\-.][01]?\d[\/\-.](?:\d{2}|\d{4}))\b/,
    ]),
    0.75
  );

  push(
    'Invoice Number',
    matchFirst(text, [/(?:invoice\s*(?:no|number|#)|inv\s*#?)\s*[:\-]?\s*([A-Z0-9\-\/]+)/i]),
    0.8
  );

  push(
    'PO Number',
    matchFirst(text, [
      /(?:purchase\s*order|po)\s*(?:no|number|#)?\s*[:\-]?\s*([A-Z0-9\-\/]+)/i,
    ]),
    0.75
  );

  push(
    'Total',
    matchFirst(text, [
      /(?:grand\s*total|amount\s*due|total\s*amount|total)\s*[:\-]?\s*(?:INR|Rs\.?|USD|\$)?\s*([0-9,]+\.\d{2}|[0-9,]+)/i,
    ]),
    0.85
  );

  push(
    'Subtotal',
    matchFirst(text, [
      /(?:sub\s*total|subtotal)\s*[:\-]?\s*(?:INR|Rs\.?|USD|\$)?\s*([0-9,]+\.\d{2}|[0-9,]+)/i,
    ]),
    0.7
  );

  push(
    'Tax',
    matchFirst(text, [
      /(?:gst|vat|tax)\s*(?:amount)?\s*[:\-]?\s*(?:INR|Rs\.?|USD|\$)?\s*([0-9,]+\.\d{2}|[0-9,]+)/i,
    ]),
    0.7
  );

  push('Currency', matchFirst(text, [/\b(INR|USD|EUR|GBP|AED)\b/, /(Rs\.?|₹|\$)/]), 0.6);

  push('Email', matchFirst(text, [/([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i]), 0.9);

  push(
    'Phone',
    matchFirst(text, [
      /(?:tel|phone|mobile|mob)\s*[:\-]?\s*(\+?\d[\d\s\-()]{7,}\d)/i,
      /(\+?\d{1,3}[\s\-]?\(?\d{2,4}\)?[\s\-]?\d{3,4}[\s\-]?\d{3,4})/,
    ]),
    0.65
  );

  const vendorLine = lines.find(
    (l) =>
      l.length > 3 &&
      l.length < 80 &&
      !/^(invoice|receipt|tax|date|total|bill|to|from)/i.test(l)
  );
  if (vendorLine && documentType !== DOCUMENT_TYPES.BANK_STATEMENT) {
    push('Vendor', vendorLine, 0.55);
  }

  if (documentType === DOCUMENT_TYPES.BANK_STATEMENT) {
    push(
      'Account Number',
      matchFirst(text, [
        /account\s*no\s*[:\-]?\s*([0-9]{9,18})/i,
        /(?:a\/c|account)\s*(?:no|number|#)?\s*[:\-]?\s*([0-9\- ]{6,})/i,
      ]),
      0.85
    );
    push(
      'Account Holder',
      matchFirst(text, [/^\s*((?:MR|MRS|MS|SMT)\s+[A-Z][A-Z\s\.]+)$/m]),
      0.7
    );
    push(
      'Statement Period',
      matchFirst(text, [
        /statement\s*from\s*[:\-]?\s*([0-3]?\d[\/\-.][01]?\d[\/\-.]\d{2,4}\s*to\s*[0-3]?\d[\/\-.][01]?\d[\/\-.]\d{2,4})/i,
      ]),
      0.8
    );
    push(
      'IFSC',
      matchFirst(text, [/(?:RTGS\/NEFT\s*)?IFSC\s*[:\-]?\s*([A-Z]{4}0[A-Z0-9]{6})/i]),
      0.85
    );
    push(
      'Opening Balance',
      matchFirst(text, [/opening\s*balance\s*[:\-]?\s*([0-9,]+\.?\d*)/i]),
      0.75
    );
    push(
      'Closing Balance',
      matchFirst(text, [/closing\s*balance\s*[:\-]?\s*([0-9,]+\.?\d*)/i]),
      0.75
    );
    const txnCount = extractBankTxnTable(text)?.rows?.length || 0;
    if (txnCount) push('Transaction Count', String(txnCount), 0.9);
  }

  if (documentType === DOCUMENT_TYPES.BUSINESS_CARD) {
    push('Name', lines[0] || '', 0.5);
    push('Company', lines[1] || '', 0.45);
  }

  if (
    documentType === DOCUMENT_TYPES.PASSPORT ||
    documentType === DOCUMENT_TYPES.IDENTITY_CARD
  ) {
    const mrz = parseMrz(text);
    push(
      'Full Name',
      mrz.fullName ||
        matchFirst(text, [
          /(?:surname|name)\s*[:\-]?\s*([A-Za-z ]{2,})/i,
          /given\s*names?\s*[:\-]?\s*([A-Za-z ]{2,})/i,
        ]),
      mrz.fullName ? 0.9 : 0.7
    );
    push(
      'Document Number',
      mrz.documentNumber ||
        matchFirst(text, [
          /(?:passport\s*no\.?|passport\s*number|document\s*no\.?)\s*[:\-]?\s*([A-Z0-9]+)/i,
        ]),
      mrz.documentNumber ? 0.92 : 0.8
    );
    push(
      'Nationality',
      mrz.nationality || matchFirst(text, [/nationality\s*[:\-]?\s*([A-Za-z ]+)/i]),
      mrz.nationality ? 0.9 : 0.7
    );
    push(
      'Date of Birth',
      mrz.dateOfBirth ||
        matchFirst(text, [
          /date\s*of\s*birth\s*[:\-]?\s*([0-3]?\d[\/\-.][01]?\d[\/\-.](?:\d{2}|\d{4}))/i,
        ]),
      mrz.dateOfBirth ? 0.9 : 0.7
    );
    push(
      'Expiry Date',
      mrz.expiryDate ||
        matchFirst(text, [
          /(?:date\s*of\s*)?expiry\s*[:\-]?\s*([0-3]?\d[\/\-.][01]?\d[\/\-.](?:\d{2}|\d{4}))/i,
        ]),
      mrz.expiryDate ? 0.9 : 0.7
    );
    push(
      'Sex',
      mrz.sex || matchFirst(text, [/\b(?:sex|gender)\s*[:\-]?\s*([MFX])/i]),
      mrz.sex ? 0.85 : 0.6
    );
  }

  /** @type {Map<string, import('../core/documentModel.js').ScanField>} */
  const byKey = new Map();
  for (const f of fields) {
    const prev = byKey.get(f.key);
    if (!prev || f.confidence > prev.confidence) byKey.set(f.key, f);
  }
  return [...byKey.values()];
}

/**
 * @param {string} rawText
 * @param {string} documentType
 * @returns {import('../core/documentModel.js').ScanTable[]}
 */
export function extractTables(rawText, documentType) {
  if (documentType === DOCUMENT_TYPES.BANK_STATEMENT) {
    const table = extractBankTxnTable(rawText);
    return table ? [table] : [];
  }
  return [];
}

/**
 * Parse Indian bank statement transaction lines (HDFC-style and similar).
 * @param {string} text
 * @returns {import('../core/documentModel.js').ScanTable|null}
 */
export function extractBankTxnTable(text) {
  const rawLines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const skipRe =
    /^(date\s+narration|page\s*no|statement of account|joint holders|nomination|statement from|account branch|address\s*:|city\s*:|state\s*:|phone\s*no|od limit|email\s*:|cust\s*id|account\s*no|a\/c\s*open|account\s*status|rtgs\/neft|branch\s*code|account\s*type|hdfc\s*bank|closing balance includes|contents of this|\*closing|this is a computer|generated on|^(mr|mrs|ms|smt)\s+)/i;

  /** @type {string[]} */
  const merged = [];
  for (const line of rawLines) {
    if (skipRe.test(line)) continue;
    if (/^\d{2}\/\d{2}\/\d{2}\b/.test(line)) {
      merged.push(line);
    } else if (merged.length && !/^(page\s*no|statement)/i.test(line) && line.length < 120) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${line}`;
    }
  }

  const headers = ['Date', 'Narration', 'Ref No', 'Value Date', 'Withdrawal', 'Deposit', 'Balance'];
  /** @type {string[][]} */
  const rows = [];
  for (const line of merged) {
    const parsed = parseBankTxnLine(line);
    if (parsed) rows.push(parsed);
  }

  if (!rows.length) return null;
  return { id: uuid(), headers, rows };
}

/**
 * @param {string} line
 * @returns {string[]|null}
 */
function parseBankTxnLine(line) {
  const m = line.match(
    /^(\d{2}\/\d{2}\/\d{2})\s+(.+?)\s+(\d{2}\/\d{2}\/\d{2})\s+((?:[\d,]+\.\d{2}\s*)+)$/
  );
  if (!m) return null;

  const date = m[1];
  let mid = m[2].trim();
  const valueDate = m[3];
  const amounts = m[4].match(/[\d,]+\.\d{2}/g) || [];
  if (amounts.length < 2) return null;

  const balance = amounts[amounts.length - 1];
  let withdrawal = '';
  let deposit = '';

  if (amounts.length >= 3) {
    withdrawal = amounts[0];
    deposit = amounts[1];
  } else {
    const amt = amounts[0];
    if (isCreditNarration(mid)) deposit = amt;
    else withdrawal = amt;
  }

  let ref = '';
  const refMatch = mid.match(/\s([A-Z0-9]{10,}|[A-Z]{2,}\d[A-Z0-9]{8,})\s*$/i);
  if (refMatch) {
    ref = refMatch[1];
    mid = mid.slice(0, /** @type {number} */ (refMatch.index)).trim();
  }

  return [date, mid, ref, valueDate, withdrawal, deposit, balance];
}

/**
 * @param {string} narration
 */
function isCreditNarration(narration) {
  const n = String(narration || '');
  if (/\bNEFT\s*CR\b|\bACH\s*C-|CREDIT|DEPOSIT|\bCR-/i.test(n)) return true;
  if (/\bNEFT\s*DR\b|\bFUNDS\s*TRANSFER\s*DR\b|\bWITHDRAWAL\b|\bAUTOPAY\b|\bDR-/i.test(n)) {
    return false;
  }
  // UPI and card spends are usually debits
  if (/^UPI-|^CC\s|PAYU|PAYTM/i.test(n)) return false;
  return false;
}

/**
 * @param {string} text
 * @param {RegExp[]} patterns
 */
function matchFirst(text, patterns) {
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return '';
}

/**
 * Best-effort TD3 passport MRZ parse (two lines of 44 chars).
 * @param {string} text
 */
function parseMrz(text) {
  const compact = String(text || '')
    .toUpperCase()
    .replace(/[^\x20-\x7E\n]/g, '');
  const lines = compact
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, '').replace(/«/g, '<'))
    .filter((l) => /[A-Z0-9<]{20,}/.test(l))
    .map((l) => {
      const m = l.match(/[A-Z0-9<]{30,44}/);
      return m ? m[0].padEnd(44, '<').slice(0, 44) : '';
    })
    .filter(Boolean);

  let line1 = lines.find((l) => /^P[A-Z<]/.test(l)) || lines[0] || '';
  let line2 = '';
  if (line1) {
    const idx = lines.indexOf(line1);
    line2 = lines[idx + 1] || lines.find((l) => l !== line1 && /[0-9]/.test(l)) || '';
  }

  if (!line2) {
    const runs = compact.replace(/\s+/g, '').match(/[A-Z0-9<]{40,}/g) || [];
    if (runs[0]?.length >= 88) {
      line1 = runs[0].slice(0, 44);
      line2 = runs[0].slice(44, 88);
    } else if (runs.length >= 2) {
      line1 = runs[0].padEnd(44, '<').slice(0, 44);
      line2 = runs[1].padEnd(44, '<').slice(0, 44);
    }
  }

  if (!line1 || !line2) {
    return {
      fullName: '',
      documentNumber: '',
      nationality: '',
      dateOfBirth: '',
      expiryDate: '',
      sex: '',
    };
  }

  const namesPart = line1.slice(5);
  const [surnameRaw, givenRaw = ''] = namesPart.split('<<');
  const surname = surnameRaw.replace(/</g, ' ').trim();
  const given = givenRaw.replace(/</g, ' ').replace(/\s+/g, ' ').trim();
  const fullName = [given, surname].filter(Boolean).join(' ').trim();

  const documentNumber = line2.slice(0, 9).replace(/</g, '').trim();
  const nationality = line2.slice(10, 13).replace(/</g, '').trim();
  const dobRaw = line2.slice(13, 19);
  const sex = line2.slice(20, 21).replace(/</g, '').trim();
  const expRaw = line2.slice(21, 27);

  return {
    fullName,
    documentNumber,
    nationality,
    dateOfBirth: formatMrzDate(dobRaw),
    expiryDate: formatMrzDate(expRaw),
    sex: /[MFX]/.test(sex) ? sex : '',
  };
}

/**
 * @param {string} yymmdd
 */
function formatMrzDate(yymmdd) {
  if (!/^\d{6}$/.test(yymmdd)) return '';
  const yy = Number(yymmdd.slice(0, 2));
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);
  const year = yy >= 50 ? 1900 + yy : 2000 + yy;
  return `${dd}/${mm}/${year}`;
}
