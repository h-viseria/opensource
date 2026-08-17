/**
 * Bank statement CSV import — parse, map columns, preview, duplicate check, post vouchers.
 * Self-contained; persists column prefs + target-label → ledger mappings per book.
 */

import { SETTINGS_KEYS, VOUCHER_TYPES } from '../core/constants.js';
import { parseCsvGrid, normalizeLabel } from '../utils/csv.js';
import { roundMoney } from '../utils/money.js';
import { settingsRepository } from '../repositories/settingsRepository.js';
import { voucherLineRepository } from '../repositories/voucherLineRepository.js';
import * as bookService from './bookService.js';
import * as coaService from './coaService.js';
import * as voucherService from './voucherService.js';
import { ensureFyForDate } from './gnuCashImportService.js';

/** Warn when this many (or more) CSV rows already look posted. */
export const DUPLICATE_WARN_THRESHOLD = 5;

export const DATE_FORMATS = Object.freeze([
  { id: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
  { id: 'DD/MM/YY', label: 'DD/MM/YY' },
  { id: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
  { id: 'MM/DD/YY', label: 'MM/DD/YY' },
  { id: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
  { id: 'YY-MM-DD', label: 'YY-MM-DD' },
  { id: 'DD-MM-YYYY', label: 'DD-MM-YYYY' },
  { id: 'DD-MM-YY', label: 'DD-MM-YY' },
  { id: 'DD-MMM-YYYY', label: 'DD-MMM-YYYY' },
  { id: 'DD-MMM-YY', label: 'DD-MMM-YY' },
]);

/** Roles a CSV column can be mapped to in the grid header. */
export const COLUMN_ROLES = Object.freeze([
  { id: '', label: '— ignore —' },
  { id: 'date', label: 'Date' },
  { id: 'amount', label: 'Amount (±)' },
  { id: 'deposit', label: 'Deposit' },
  { id: 'withdrawal', label: 'Withdrawal' },
  { id: 'target', label: 'Target account' },
  { id: 'details', label: 'Details / Narration' },
]);

/**
 * Expand a 2-digit year: 00–69 → 2000–2069, 70–99 → 1970–1999.
 * @param {number} yy
 */
export function expandTwoDigitYear(yy) {
  const n = Number(yy);
  if (!Number.isFinite(n) || n < 0 || n > 99) return null;
  return n <= 69 ? 2000 + n : 1900 + n;
}

export const AMOUNT_MODES = Object.freeze({
  SINGLE: 'single',
  SPLIT: 'split',
});

/** @typedef {'date'|'amount'|'deposit'|'withdrawal'|'target'|'details'} MapField */

/**
 * @typedef {{
 *   date: string,
 *   amount: string,
 *   deposit: string,
 *   withdrawal: string,
 *   target: string,
 *   details: string,
 * }} ColumnMap
 *
 * @typedef {{
 *   skipTopLines: number,
 *   dateFormat: string,
 *   amountMode: 'single'|'split',
 *   bankLedgerId: string|null,
 *   columnMap: ColumnMap,
 *   targetMaps: Record<string, string>,
 * }} BookImportPrefs
 *
 * @typedef {{
 *   rowIndex: number,
 *   dateIso: string|null,
 *   amount: number,
 *   direction: 'in'|'out'|null,
 *   narration: string,
 *   targetLabel: string,
 *   targetLedgerId: string|null,
 *   duplicate: boolean,
 *   errors: string[],
 *   skip: boolean,
 * }} PreviewRow
 *
 * @typedef {{
 *   rowIndex: number,
 *   dateRaw: string,
 *   narration: string,
 *   amountText: string,
 *   reason: string,
 * }} IgnoredRow
 */

const EMPTY_COLUMN_MAP = () => ({
  date: '',
  amount: '',
  deposit: '',
  withdrawal: '',
  target: '',
  details: '',
});

/**
 * @returns {BookImportPrefs}
 */
function emptyPrefs() {
  return {
    skipTopLines: 0,
    dateFormat: 'DD/MM/YYYY',
    amountMode: AMOUNT_MODES.SINGLE,
    bankLedgerId: null,
    columnMap: EMPTY_COLUMN_MAP(),
    targetMaps: {},
  };
}

/**
 * @param {string} bookId
 * @returns {Promise<BookImportPrefs>}
 */
export async function getBookPrefs(bookId) {
  const raw = await settingsRepository.getValue(SETTINGS_KEYS.BANK_STATEMENT_IMPORT);
  const byBook =
    raw && typeof raw === 'object' && raw.byBook && typeof raw.byBook === 'object'
      ? raw.byBook
      : {};
  const saved = byBook[bookId];
  if (!saved || typeof saved !== 'object') return emptyPrefs();
  const base = emptyPrefs();
  return {
    ...base,
    ...saved,
    skipTopLines: Math.max(0, Number(saved.skipTopLines) || 0),
    dateFormat: String(saved.dateFormat || base.dateFormat),
    amountMode: saved.amountMode === AMOUNT_MODES.SPLIT ? AMOUNT_MODES.SPLIT : AMOUNT_MODES.SINGLE,
    bankLedgerId: saved.bankLedgerId ? String(saved.bankLedgerId) : null,
    columnMap: { ...EMPTY_COLUMN_MAP(), ...(saved.columnMap || {}) },
    targetMaps:
      saved.targetMaps && typeof saved.targetMaps === 'object'
        ? { ...saved.targetMaps }
        : {},
  };
}

/**
 * @param {string} bookId
 * @param {Partial<BookImportPrefs>} patch
 */
export async function saveBookPrefs(bookId, patch) {
  const raw = await settingsRepository.getValue(SETTINGS_KEYS.BANK_STATEMENT_IMPORT);
  const root =
    raw && typeof raw === 'object' ? { ...raw } : { byBook: {} };
  const byBook =
    root.byBook && typeof root.byBook === 'object' ? { ...root.byBook } : {};
  const current = await getBookPrefs(bookId);
  byBook[bookId] = {
    ...current,
    ...patch,
    columnMap: { ...current.columnMap, ...(patch.columnMap || {}) },
    targetMaps: { ...current.targetMaps, ...(patch.targetMaps || {}) },
  };
  root.byBook = byBook;
  await settingsRepository.setValue(SETTINGS_KEYS.BANK_STATEMENT_IMPORT, root);
  return byBook[bookId];
}

/**
 * @param {string} bookId
 * @param {string} label
 * @param {string} ledgerId
 */
export async function rememberTargetMapping(bookId, label, ledgerId) {
  const key = normalizeLabel(label);
  if (!key || !ledgerId) return;
  const prefs = await getBookPrefs(bookId);
  await saveBookPrefs(bookId, {
    targetMaps: { ...prefs.targetMaps, [key]: ledgerId },
  });
}

/**
 * Parse date text with the selected format → YYYY-MM-DD.
 * @param {string} text
 * @param {string} formatId
 * @returns {string|null}
 */
export function parseStatementDate(text, formatId) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  const monthNames = {
    JAN: 1,
    FEB: 2,
    MAR: 3,
    APR: 4,
    MAY: 5,
    JUN: 6,
    JUL: 7,
    AUG: 8,
    SEP: 9,
    OCT: 10,
    NOV: 11,
    DEC: 12,
  };

  /**
   * @param {number} y
   * @param {number} m
   * @param {number} d
   */
  const build = (y, m, d) => {
    if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  };

  if (formatId === 'DD-MMM-YYYY' || formatId === 'DD-MMM-YY') {
    const m = raw.match(/^(\d{1,2})[-\/\s]([A-Za-z]{3})[-\/\s](\d{2}|\d{4})$/);
    if (!m) return null;
    const mon = monthNames[m[2].toUpperCase()];
    if (!mon) return null;
    let year = Number(m[3]);
    if (m[3].length === 2) {
      const expanded = expandTwoDigitYear(year);
      if (expanded == null) return null;
      year = expanded;
    }
    return build(year, mon, Number(m[1]));
  }

  if (formatId === 'YYYY-MM-DD') {
    const m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!m) return null;
    return build(Number(m[1]), Number(m[2]), Number(m[3]));
  }

  if (formatId === 'YY-MM-DD') {
    const m = raw.match(/^(\d{2})-(\d{1,2})-(\d{1,2})$/);
    if (!m) return null;
    const year = expandTwoDigitYear(Number(m[1]));
    if (year == null) return null;
    return build(year, Number(m[2]), Number(m[3]));
  }

  const m4 = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m4) {
    const a = Number(m4[1]);
    const b = Number(m4[2]);
    const y = Number(m4[3]);
    if (formatId === 'MM/DD/YYYY') return build(y, a, b);
    if (
      formatId === 'DD/MM/YYYY' ||
      formatId === 'DD-MM-YYYY' ||
      formatId === 'DD/MM/YY' ||
      formatId === 'DD-MM-YY' ||
      formatId === 'MM/DD/YY'
    ) {
      // 4-digit year with a DD/MM or MM/DD format id
      if (formatId.startsWith('MM/')) return build(y, a, b);
      return build(y, b, a);
    }
  }

  const m2 = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2})$/);
  if (m2) {
    const a = Number(m2[1]);
    const b = Number(m2[2]);
    const year = expandTwoDigitYear(Number(m2[3]));
    if (year == null) return null;
    if (formatId === 'MM/DD/YY' || formatId === 'MM/DD/YYYY') return build(year, a, b);
    if (
      formatId === 'DD/MM/YY' ||
      formatId === 'DD-MM-YY' ||
      formatId === 'DD/MM/YYYY' ||
      formatId === 'DD-MM-YYYY'
    ) {
      return build(year, b, a);
    }
  }

  return null;
}

/**
 * Invert header→role selections into a ColumnMap (header names as values).
 * @param {string[]} headers
 * @param {Record<string, string>} headerToRole  header → role id
 * @returns {ColumnMap}
 */
export function columnMapFromHeaderRoles(headers, headerToRole) {
  const map = EMPTY_COLUMN_MAP();
  for (const h of headers) {
    const role = headerToRole[h] || '';
    if (role && role in map && !map[/** @type {keyof ColumnMap} */ (role)]) {
      map[/** @type {keyof ColumnMap} */ (role)] = h;
    }
  }
  return map;
}

/**
 * Build header→role map from a ColumnMap (for pre-selecting grid dropdowns).
 * @param {ColumnMap} columnMap
 * @returns {Record<string, string>}
 */
export function headerRolesFromColumnMap(columnMap) {
  /** @type {Record<string, string>} */
  const roles = {};
  for (const [role, header] of Object.entries(columnMap || {})) {
    if (header) roles[header] = role;
  }
  return roles;
}

/**
 * Parse an amount cell: strip currency noise; honor (), leading -, DR/CR.
 * @param {string} text
 * @returns {number} signed amount (negative for outflow-style markers)
 */
export function parseMoneyCell(text) {
  let s = String(text || '').trim();
  if (!s) return 0;

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1).trim();
  } else if (s.startsWith('+')) {
    s = s.slice(1).trim();
  }
  if (/\bDR\b/i.test(s)) {
    negative = true;
    s = s.replace(/\bDR\b/gi, '').trim();
  } else if (/\bCR\b/i.test(s)) {
    negative = false;
    s = s.replace(/\bCR\b/gi, '').trim();
  }

  s = s.replace(/[^0-9.]/g, '');
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return roundMoney(negative ? -Math.abs(n) : Math.abs(n));
}

/**
 * Guess column mapping from header names.
 * @param {string[]} headers
 * @param {'single'|'split'} amountMode
 * @param {ColumnMap} [previous]
 * @returns {ColumnMap}
 */
export function guessColumnMap(headers, amountMode, previous) {
  const map = EMPTY_COLUMN_MAP();
  const prev = previous || EMPTY_COLUMN_MAP();

  /** @param {string[]} needles @param {string} [fallback] */
  const find = (needles, fallback = '') => {
    for (const h of headers) {
      const n = normalizeLabel(h);
      if (needles.some((x) => n === x || n.includes(x))) return h;
    }
    if (fallback && headers.includes(fallback)) return fallback;
    return '';
  };

  map.date =
    (prev.date && headers.includes(prev.date) ? prev.date : '') ||
    find(['date', 'txn date', 'transaction date', 'value date', 'posting date']);

  map.details =
    (prev.details && headers.includes(prev.details) ? prev.details : '') ||
    find(['narration', 'description', 'details', 'particulars', 'memo', 'remarks', 'narrative']);

  map.target =
    (prev.target && headers.includes(prev.target) ? prev.target : '') ||
    find(['target account', 'account', 'category', 'ledger', 'contra', 'payee']);

  if (amountMode === AMOUNT_MODES.SPLIT) {
    map.deposit =
      (prev.deposit && headers.includes(prev.deposit) ? prev.deposit : '') ||
      find(['deposit', 'deposit amt', 'deposit amt.', 'credit', 'cr', 'money in', 'inflow']);
    map.withdrawal =
      (prev.withdrawal && headers.includes(prev.withdrawal) ? prev.withdrawal : '') ||
      find(['withdrawal', 'withdrawal amt', 'withdrawal amt.', 'debit', 'dr', 'money out', 'outflow', 'payment']);
  } else {
    map.amount =
      (prev.amount && headers.includes(prev.amount) ? prev.amount : '') ||
      find(['amount', 'txn amount', 'transaction amount', 'value']);
  }

  return map;
}

/**
 * Stable display keys for headers (handles blanks / duplicates without scrambling cells).
 * @param {string[]} headers
 * @returns {string[]}
 */
export function uniqueHeaderKeys(headers) {
  /** @type {Map<string, number>} */
  const seen = new Map();
  return headers.map((h, i) => {
    const base = String(h || '').trim() || `Column ${i + 1}`;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
}

/**
 * Load CSV after skipping top lines. No header is required or detected —
 * every remaining non-empty row is data; columns are Column 1…N for mapping.
 * Preserves file order (never sorts). Skip counts physical lines including blanks.
 *
 * @param {string} csvText
 * @param {number} skipTopLines
 * @returns {{
 *   headers: string[],
 *   headerKeys: string[],
 *   matrix: string[][],
 *   rows: Record<string, string>[],
 *   skipped: number,
 *   firstDataLineNumber: number,
 * }}
 */
export function loadStatementCsv(csvText, skipTopLines = 0) {
  const grid = parseCsvGrid(csvText, { keepEmptyRows: true });
  const skip = Math.max(0, Math.floor(Number(skipTopLines) || 0));
  if (grid.length <= skip) {
    throw new Error('CSV has no data after skipping top lines');
  }

  const sliced = grid.slice(skip);
  let width = 0;
  for (const r of sliced) {
    if (r.length > width) width = r.length;
  }
  if (!width) {
    throw new Error('CSV has no columns after skipping top lines');
  }

  const headerKeys = Array.from({ length: width }, (_, i) => `Column ${i + 1}`);

  /** @type {string[][]} */
  const matrix = [];
  /** @type {Record<string, string>[]} */
  const rows = [];
  let firstDataLineNumber = skip + 1;

  for (let i = 0; i < sliced.length; i++) {
    const raw = sliced[i];
    /** @type {string[]} */
    const cells = [];
    let empty = true;
    for (let c = 0; c < width; c++) {
      const val = String(raw[c] ?? '').trim();
      cells.push(val);
      if (val) empty = false;
    }
    // Blank lines only — no header detection, no forced drops
    if (empty) continue;
    if (matrix.length === 0) firstDataLineNumber = skip + i + 1;

    matrix.push(cells);
    /** @type {Record<string, string>} */
    const obj = {};
    for (let c = 0; c < width; c++) {
      obj[headerKeys[c]] = cells[c];
    }
    rows.push(obj);
  }

  if (!matrix.length) {
    throw new Error('No data rows after skipping top lines');
  }

  return {
    headers: headerKeys,
    headerKeys,
    matrix,
    rows,
    skipped: skip,
    firstDataLineNumber,
  };
}

/**
 * Guess mappings from cell contents (no reliance on a header row).
 * @param {string[][]} matrix
 * @param {'single'|'split'} amountMode
 * @param {ColumnMap} [previous]
 * @returns {ColumnMap}
 */
export function guessColumnMapFromMatrix(matrix, amountMode, previous) {
  const map = EMPTY_COLUMN_MAP();
  const prev = previous || EMPTY_COLUMN_MAP();
  const width = matrix.reduce((w, row) => Math.max(w, row.length), 0);
  if (!width) return map;

  const sample = matrix.slice(0, 25);
  /** @type {{ idx: number, dateHits: number, numHits: number, textHits: number, nonEmpty: number }[]} */
  const stats = [];
  for (let c = 0; c < width; c++) {
    let dateHits = 0;
    let numHits = 0;
    let textHits = 0;
    let nonEmpty = 0;
    for (const row of sample) {
      const v = String(row[c] ?? '').trim();
      if (!v) continue;
      nonEmpty += 1;
      if (/^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}$/.test(v) || /^\d{4}-\d{1,2}-\d{1,2}$/.test(v)) {
        dateHits += 1;
      } else if (/^[\d,.()+-]+$/.test(v.replace(/\s/g, '')) || /^\(.*\)$/.test(v)) {
        numHits += 1;
      } else {
        textHits += 1;
      }
    }
    stats.push({ idx: c, dateHits, numHits, textHits, nonEmpty });
  }

  const key = (i) => `Column ${i + 1}`;

  // Restore previous Column-N mappings when still valid
  for (const role of /** @type {(keyof ColumnMap)[]} */ ([
    'date',
    'amount',
    'deposit',
    'withdrawal',
    'target',
    'details',
  ])) {
    const prevKey = prev[role];
    if (prevKey && /^Column \d+$/.test(prevKey)) {
      const n = Number(prevKey.replace('Column ', ''));
      if (n >= 1 && n <= width) map[role] = prevKey;
    }
  }

  if (!map.date) {
    const bestDate = [...stats].sort((a, b) => b.dateHits - a.dateHits)[0];
    if (bestDate && bestDate.dateHits >= 2) map.date = key(bestDate.idx);
  }

  const used = new Set(Object.values(map).filter(Boolean));

  if (amountMode === AMOUNT_MODES.SPLIT) {
    const numCols = stats
      .filter((s) => s.numHits >= 2 && !used.has(key(s.idx)))
      .sort((a, b) => b.numHits - a.numHits);
    if (!map.withdrawal && numCols[0]) {
      map.withdrawal = key(numCols[0].idx);
      used.add(map.withdrawal);
    }
    if (!map.deposit && numCols[1]) {
      map.deposit = key(numCols[1].idx);
      used.add(map.deposit);
    } else if (!map.deposit && numCols[0] && !map.withdrawal) {
      map.deposit = key(numCols[0].idx);
      used.add(map.deposit);
    }
  } else if (!map.amount) {
    const bestAmt = stats
      .filter((s) => s.numHits >= 2 && !used.has(key(s.idx)))
      .sort((a, b) => b.numHits - a.numHits)[0];
    if (bestAmt) {
      map.amount = key(bestAmt.idx);
      used.add(map.amount);
    }
  }

  if (!map.details) {
    const bestText = stats
      .filter((s) => s.textHits >= 2 && !used.has(key(s.idx)))
      .sort((a, b) => b.textHits - a.textHits)[0];
    if (bestText) map.details = key(bestText.idx);
  }

  return map;
}

/**
 * Normalize a colon-separated account path for comparison.
 * @param {string} path
 */
export function normalizeAccountPath(path) {
  return String(path || '')
    .split(':')
    .map((p) => normalizeLabel(p))
    .filter(Boolean)
    .join(':');
}

/**
 * Match a CSV target label to a ledger id.
 * - If the label contains ":", treat it as a full account path (Group:Sub:Ledger).
 * - Otherwise match by ledger name (then code, then partial name).
 * Saved targetMaps always win when present.
 *
 * @param {string} label
 * @param {import('../models/types.js').Ledger[]} ledgers
 * @param {Record<string, string>} targetMaps
 * @param {Map<string, string>} [pathByLedgerId] ledgerId → "Group:Sub:Ledger"
 */
export function resolveTargetLedgerId(label, ledgers, targetMaps, pathByLedgerId) {
  const raw = String(label || '').trim();
  if (!raw) return null;
  const key = normalizeLabel(raw);
  if (targetMaps[key] && ledgers.some((l) => l.id === targetMaps[key])) {
    return targetMaps[key];
  }

  if (raw.includes(':')) {
    const want = normalizeAccountPath(raw);
    if (!want) return null;

    if (pathByLedgerId && pathByLedgerId.size) {
      for (const led of ledgers) {
        const path = pathByLedgerId.get(led.id) || '';
        if (path && normalizeAccountPath(path) === want) return led.id;
      }
      // Suffix match: "Expenses:Travel" matches path ending with those segments
      for (const led of ledgers) {
        const path = normalizeAccountPath(pathByLedgerId.get(led.id) || '');
        if (path === want || path.endsWith(`:${want}`)) return led.id;
      }
    }

    // Fallback without path map: last segment = ledger name, require unique match
    const leaf = want.split(':').pop() || '';
    const leafHits = ledgers.filter((l) => normalizeLabel(l.name) === leaf);
    if (leafHits.length === 1) return leafHits[0].id;
    return null;
  }

  // No colon → match ledger name / code
  const byName = ledgers.find((l) => normalizeLabel(l.name) === key);
  if (byName) return byName.id;
  const byCode = ledgers.find((l) => l.code && normalizeLabel(l.code) === key);
  if (byCode) return byCode.id;
  const partial = ledgers.find(
    (l) =>
      normalizeLabel(l.name).includes(key) ||
      key.includes(normalizeLabel(l.name))
  );
  return partial ? partial.id : null;
}

/**
 * @param {Record<string, string>} row
 * @param {ColumnMap} columnMap
 * @param {'single'|'split'} amountMode
 * @param {string} dateFormat
 */
function extractSignedAmount(row, columnMap, amountMode, dateFormat) {
  void dateFormat;
  if (amountMode === AMOUNT_MODES.SPLIT) {
    const dep = Math.abs(parseMoneyCell(row[columnMap.deposit] || ''));
    const wit = Math.abs(parseMoneyCell(row[columnMap.withdrawal] || ''));
    if (dep > 0 && wit > 0) {
      return { amount: 0, direction: /** @type {null} */ (null), error: 'Both deposit and withdrawal filled' };
    }
    if (dep > 0) return { amount: dep, direction: /** @type {'in'} */ ('in'), error: null };
    if (wit > 0) return { amount: wit, direction: /** @type {'out'} */ ('out'), error: null };
    return { amount: 0, direction: null, error: 'No deposit or withdrawal amount' };
  }
  const signed = parseMoneyCell(row[columnMap.amount] || '');
  if (signed === 0) return { amount: 0, direction: null, error: 'Amount is zero or missing' };
  if (signed > 0) return { amount: signed, direction: /** @type {'in'} */ ('in'), error: null };
  return { amount: Math.abs(signed), direction: /** @type {'out'} */ ('out'), error: null };
}

/**
 * @param {{
 *   bookId: string,
 *   csvText: string,
 *   bankLedgerId: string,
 *   skipTopLines: number,
 *   dateFormat: string,
 *   amountMode: 'single'|'split',
 *   columnMap: ColumnMap,
 * }} opts
 */
export async function buildPreview(opts) {
  const { headers, rows } = loadStatementCsv(opts.csvText, opts.skipTopLines);
  const [ledgers, groups] = await Promise.all([
    coaService.listLedgers(opts.bookId),
    coaService.listGroups(opts.bookId),
  ]);
  const pathByLedgerId = coaService.buildLedgerPathMap(ledgers, groups);
  const prefs = await getBookPrefs(opts.bookId);
  const targetMaps = prefs.targetMaps || {};

  const bank = ledgers.find((l) => l.id === opts.bankLedgerId);
  if (!bank) throw new Error('Select a valid bank / cash ledger');

  /** @type {Set<string>} */
  const existingKeys = new Set();
  const lines = await voucherLineRepository.findByBook(opts.bookId);
  for (const line of lines) {
    if (line.ledgerId !== opts.bankLedgerId) continue;
    const debit = roundMoney(line.debit || 0);
    const credit = roundMoney(line.credit || 0);
    if (debit > 0) existingKeys.add(`${line.date}|in|${debit.toFixed(2)}`);
    if (credit > 0) existingKeys.add(`${line.date}|out|${credit.toFixed(2)}`);
  }

  /** @type {PreviewRow[]} */
  const preview = [];
  /** @type {IgnoredRow[]} */
  const ignored = [];
  let duplicateCount = 0;

  rows.forEach((row, idx) => {
    const dateRaw = opts.columnMap.date ? String(row[opts.columnMap.date] || '').trim() : '';
    const dateIso = opts.columnMap.date ? parseStatementDate(dateRaw, opts.dateFormat) : null;
    const narration = opts.columnMap.details
      ? String(row[opts.columnMap.details] || '').trim()
      : '';

    let amountText = '';
    if (opts.amountMode === AMOUNT_MODES.SPLIT) {
      const dep = opts.columnMap.deposit ? row[opts.columnMap.deposit] || '' : '';
      const wit = opts.columnMap.withdrawal ? row[opts.columnMap.withdrawal] || '' : '';
      amountText = [dep && `+${dep}`, wit && `-${wit}`].filter(Boolean).join(' / ');
    } else if (opts.columnMap.amount) {
      amountText = String(row[opts.columnMap.amount] || '').trim();
    }

    // Blank or unparseable dates → ignored (not importable)
    if (!opts.columnMap.date) {
      ignored.push({
        rowIndex: idx,
        dateRaw,
        narration,
        amountText,
        reason: 'Date column not mapped',
      });
      return;
    }
    if (!dateRaw) {
      ignored.push({
        rowIndex: idx,
        dateRaw: '',
        narration,
        amountText,
        reason: 'Blank date',
      });
      return;
    }
    if (!dateIso) {
      ignored.push({
        rowIndex: idx,
        dateRaw,
        narration,
        amountText,
        reason: `Invalid date "${dateRaw}"`,
      });
      return;
    }

    /** @type {string[]} */
    const errors = [];
    const { amount, direction, error: amtErr } = extractSignedAmount(
      row,
      opts.columnMap,
      opts.amountMode,
      opts.dateFormat
    );
    if (amtErr) errors.push(amtErr);

    const targetLabel = opts.columnMap.target
      ? String(row[opts.columnMap.target] || '').trim()
      : '';
    let targetLedgerId = targetLabel
      ? resolveTargetLedgerId(targetLabel, ledgers, targetMaps, pathByLedgerId)
      : null;

    if (targetLedgerId === opts.bankLedgerId) {
      errors.push('Target cannot be the same as the bank ledger');
      targetLedgerId = null;
    }
    if (!targetLedgerId) {
      errors.push(targetLabel ? `Unknown target "${targetLabel}"` : 'Target account required');
    }

    const dupKey = `${dateIso}|${direction}|${amount.toFixed(2)}`;
    const duplicate = Boolean(direction && amount && existingKeys.has(dupKey));
    if (duplicate) duplicateCount += 1;

    preview.push({
      rowIndex: idx,
      dateIso,
      amount,
      direction,
      narration,
      targetLabel,
      targetLedgerId,
      duplicate,
      errors,
      skip: false,
    });
  });

  const ledgerOptions = ledgers
    .filter((l) => l.id !== opts.bankLedgerId)
    .map((l) => {
      const path = pathByLedgerId.get(l.id) || l.name;
      const label =
        path && normalizeLabel(path) !== normalizeLabel(l.name)
          ? `${l.name} (${path})`
          : path.includes(':')
            ? `${l.name} (${path})`
            : l.name;
      return { id: l.id, name: l.name, path, label };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  return {
    headers,
    rowCount: rows.length,
    preview,
    ignored,
    duplicateCount,
    duplicateWarning: duplicateCount >= DUPLICATE_WARN_THRESHOLD,
    ledgers,
    ledgerOptions,
    bankLedgerId: opts.bankLedgerId,
  };
}

/**
 * Import confirmed preview rows as Payment / Receipt vouchers.
 * @param {{
 *   bookId: string,
 *   bankLedgerId: string,
 *   rows: PreviewRow[],
 *   skipDuplicates?: boolean,
 *   onProgress?: (msg: string, done?: number, total?: number) => void,
 * }} opts
 */
export async function importPreviewRows(opts) {
  const book = await bookService.getBook(opts.bookId);
  if (!book) throw new Error('Book not found');
  const ledgers = await coaService.listLedgers(opts.bookId);
  const ledgerIds = new Set(ledgers.map((l) => l.id));
  if (!ledgerIds.has(opts.bankLedgerId)) throw new Error('Bank ledger not found');

  const result = {
    created: 0,
    skipped: 0,
    failed: 0,
    errors: /** @type {string[]} */ ([]),
  };

  const toImport = opts.rows.filter((r) => {
    if (r.skip) {
      result.skipped += 1;
      return false;
    }
    if (opts.skipDuplicates && r.duplicate) {
      result.skipped += 1;
      return false;
    }
    if (r.errors?.length) {
      result.skipped += 1;
      return false;
    }
    return true;
  });

  const total = toImport.length;
  let done = 0;

  for (const row of toImport) {
    done += 1;
    opts.onProgress?.(
      `Posting ${done} of ${total}…`,
      done,
      total
    );

    try {
      if (!row.dateIso) throw new Error('Missing date');
      if (!row.direction || !row.amount || row.amount <= 0) throw new Error('Invalid amount');
      if (!row.targetLedgerId || !ledgerIds.has(row.targetLedgerId)) {
        throw new Error('Target ledger required');
      }
      if (row.targetLedgerId === opts.bankLedgerId) {
        throw new Error('Target cannot equal bank ledger');
      }

      const fy = await ensureFyForDate(opts.bookId, row.dateIso, book.fyStartMonth || 4);
      const amt = roundMoney(row.amount);
      const narration = row.narration || 'Bank statement import';

      /** @type {import('../engine/accountingEngine.js').LineInput[]} */
      let lines;
      let voucherType;
      if (row.direction === 'in') {
        voucherType = VOUCHER_TYPES.RECEIPT;
        lines = [
          { ledgerId: opts.bankLedgerId, debit: amt, credit: 0, narration },
          { ledgerId: row.targetLedgerId, debit: 0, credit: amt, narration },
        ];
      } else {
        voucherType = VOUCHER_TYPES.PAYMENT;
        lines = [
          { ledgerId: row.targetLedgerId, debit: amt, credit: 0, narration },
          { ledgerId: opts.bankLedgerId, debit: 0, credit: amt, narration },
        ];
      }

      await voucherService.createVoucher({
        bookId: opts.bookId,
        financialYearId: fy.id,
        voucherType,
        date: row.dateIso,
        narration,
        lines,
      });

      if (row.targetLabel) {
        await rememberTargetMapping(opts.bookId, row.targetLabel, row.targetLedgerId);
      }

      result.created += 1;
    } catch (err) {
      result.failed += 1;
      result.errors.push(
        `Row ${row.rowIndex + 1}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return result;
}

/**
 * Asset-like ledgers suitable as bank / cash statement accounts.
 * @param {string} bookId
 */
export async function listBankLikeLedgers(bookId) {
  const [ledgers, groups] = await Promise.all([
    coaService.listLedgers(bookId),
    coaService.listGroups(bookId),
  ]);
  const groupById = new Map(groups.map((g) => [g.id, g]));
  return ledgers
    .filter((l) => {
      if (l.isActive === false) return false;
      const g = groupById.get(l.groupId);
      const nature = g?.nature || '';
      return nature === 'Asset';
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
