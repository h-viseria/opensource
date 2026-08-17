/**
 * CSV parse / stringify with label-based column mapping.
 * Dates in templates and uploads use DD-MMM-YYYY (e.g. 01-JUL-2026).
 */

const MONTH_ABBR = Object.freeze([
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
]);

const MONTH_NAME_TO_NUM = Object.freeze({
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
});

/**
 * Normalize a header / label for matching (trim, collapse spaces, case-insensitive).
 * @param {string} value
 */
export function normalizeLabel(value) {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Format a date as DD-MMM-YYYY.
 * @param {string|Date|number} value
 * @returns {string}
 */
export function formatCsvDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const mon = MONTH_ABBR[d.getMonth()];
  return `${day}-${mon}-${d.getFullYear()}`;
}

/**
 * Parse DD-MMM-YYYY (also accepts D-MMM-YYYY). Returns YYYY-MM-DD or null.
 * @param {string} text
 * @returns {string|null}
 */
export function parseCsvDate(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  const m = raw.match(/^(\d{1,2})[-\/\s]([A-Za-z]{3})[-\/\s](\d{4})$/);
  if (!m) return null;

  const day = Number(m[1]);
  const mon = MONTH_ABBR.indexOf(m[2].toUpperCase());
  const year = Number(m[3]);
  if (mon < 0 || day < 1 || day > 31) return null;

  const d = new Date(year, mon, day);
  if (d.getFullYear() !== year || d.getMonth() !== mon || d.getDate() !== day) return null;

  const mm = String(mon + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/**
 * Require a CSV date field; throw a clear error if missing/invalid.
 * @param {string} text
 * @param {string} [label]
 */
export function requireCsvDate(text, label = 'Date') {
  const iso = parseCsvDate(text);
  if (!iso) {
    throw new Error(`${label} must be DD-MMM-YYYY (e.g. 01-JUL-2026)`);
  }
  return iso;
}

/**
 * Parse Yes/No style flags.
 * @param {string} text
 * @param {boolean} [defaultValue=false]
 */
export function parseYesNo(text, defaultValue = false) {
  const v = String(text || '')
    .trim()
    .toLowerCase();
  if (!v) return defaultValue;
  if (['yes', 'y', 'true', '1', 'on'].includes(v)) return true;
  if (['no', 'n', 'false', '0', 'off'].includes(v)) return false;
  throw new Error(`Expected Yes or No, got "${text}"`);
}

/**
 * Parse month name or number (1–12) for FY start month.
 * @param {string|number} text
 */
export function parseMonthValue(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const asNum = Number(raw);
  if (Number.isInteger(asNum) && asNum >= 1 && asNum <= 12) return asNum;
  const key = raw.toLowerCase();
  if (MONTH_NAME_TO_NUM[key] != null) return MONTH_NAME_TO_NUM[key];
  throw new Error(`Invalid month "${text}" (use January–December or 1–12)`);
}

/**
 * Escape a CSV cell.
 * @param {unknown} value
 */
export function escapeCsvCell(value) {
  const s = value == null ? '' : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Build CSV text from fixed labels and row objects (keys = labels).
 * @param {string[]} labels
 * @param {Record<string, unknown>[]} [rows]
 */
export function buildCsv(labels, rows = []) {
  const lines = [labels.map(escapeCsvCell).join(',')];
  for (const row of rows) {
    lines.push(labels.map((lab) => escapeCsvCell(row[lab] ?? '')).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * Trigger browser download of a CSV file.
 * @param {string} fileName
 * @param {string} csvText
 */
export function downloadCsv(fileName, csvText) {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.csv') ? fileName : `${fileName}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Download a template with fixed labels and optional sample rows.
 * @param {{ labels: string[], fileName: string, sampleRows?: Record<string, unknown>[] }} opts
 */
export function downloadTemplate(opts) {
  const csv = buildCsv(opts.labels, opts.sampleRows || []);
  downloadCsv(opts.fileName, csv);
}

/**
 * Parse a CSV string into a raw grid (no header split).
 * @param {string} text
 * @param {{ keepEmptyRows?: boolean }} [opts]
 * @returns {string[][]}
 */
export function parseCsvGrid(text, opts = {}) {
  const keepEmptyRows = opts.keepEmptyRows === true;
  const src = String(text || '').replace(/^\uFEFF/, '');
  /** @type {string[][]} */
  const grid = [];
  /** @type {string[]} */
  let row = [];
  let cell = '';
  let inQuotes = false;

  const endRow = () => {
    if (keepEmptyRows || row.some((c) => String(c).trim() !== '')) {
      grid.push(row);
    }
    row = [];
    cell = '';
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      endRow();
    } else if (ch === '\r') {
      row.push(cell);
      if (next === '\n') i++;
      endRow();
    } else {
      cell += ch;
    }
  }

  // Final row (no trailing newline)
  if (cell.length || row.length) {
    row.push(cell);
    endRow();
  }
  return grid;
}

/**
 * Parse a CSV string into header + data rows (RFC4180-ish).
 * @param {string} text
 * @returns {{ headers: string[], rows: string[][] }}
 */
export function parseCsv(text) {
  const grid = parseCsvGrid(text);

  if (grid.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = grid[0].map((h) => h.trim());
  const rows = grid.slice(1).map((r) => {
    const padded = [...r];
    while (padded.length < headers.length) padded.push('');
    return padded.slice(0, headers.length);
  });

  return { headers, rows };
}

/**
 * Map parsed CSV rows to objects keyed by the exact fixed labels.
 * Matching is by label text (case/spacing insensitive), not column position.
 * Missing labels become empty string. Extra file columns are ignored.
 *
 * @param {string} text
 * @param {string[]} labels
 * @returns {{ rows: Record<string, string>[], missingLabels: string[], matchedLabels: string[] }}
 */
export function parseCsvByLabels(text, labels) {
  const { headers, rows: rawRows } = parseCsv(text);
  if (headers.length === 0) {
    throw new Error('CSV is empty');
  }

  /** @type {Map<string, number>} */
  const indexByNorm = new Map();
  headers.forEach((h, i) => {
    const key = normalizeLabel(h);
    if (key && !indexByNorm.has(key)) indexByNorm.set(key, i);
  });

  const missingLabels = labels.filter((lab) => !indexByNorm.has(normalizeLabel(lab)));
  const matchedLabels = labels.filter((lab) => indexByNorm.has(normalizeLabel(lab)));

  if (matchedLabels.length === 0) {
    throw new Error(
      `No matching column labels found. Expected labels: ${labels.join(', ')}`
    );
  }

  const rows = rawRows.map((cells) => {
    /** @type {Record<string, string>} */
    const obj = {};
    for (const lab of labels) {
      const idx = indexByNorm.get(normalizeLabel(lab));
      obj[lab] = idx == null ? '' : String(cells[idx] ?? '').trim();
    }
    return obj;
  });

  return { rows, missingLabels, matchedLabels };
}

/**
 * Read a File as text.
 * @param {File} file
 */
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsText(file);
  });
}

/**
 * Find entity by name (case-insensitive). Optional code match.
 * @template {{ name: string, code?: string, id: string }} T
 * @param {T[]} list
 * @param {string} name
 * @param {{ byCode?: boolean }} [opts]
 * @returns {T|undefined}
 */
export function findByName(list, name, opts = {}) {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return undefined;
  const byName = list.find((x) => x.name.toLowerCase() === n);
  if (byName) return byName;
  if (opts.byCode) {
    return list.find((x) => (x.code || '').toLowerCase() === n);
  }
  return undefined;
}
