/**
 * Date helpers that avoid UTC calendar-day shifts.
 * Transaction dates are calendar dates (YYYY-MM-DD), not timestamps.
 */

/**
 * Today's calendar date in local timezone.
 * @returns {string} YYYY-MM-DD
 */
export function todayIsoDate() {
  return toDateInput(new Date());
}

/**
 * Format Date/ISO to YYYY-MM-DD using local calendar parts.
 * For strings already YYYY-MM-DD, return as-is (no TZ parse).
 * @param {string|Date|number} value
 */
export function toDateInput(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Parse YYYY-MM-DD as a local Date at noon (avoids DST edge).
 * @param {string} isoDate
 */
export function parseLocalDate(isoDate) {
  const s = String(isoDate || '').slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * @param {string} isoDate YYYY-MM-DD
 * @param {'YYYY-MM-DD'|'DD/MM/YYYY'|'MM/DD/YYYY'|'D MMM YYYY'} [fmt]
 */
export function formatDisplayDate(isoDate, fmt = 'D MMM YYYY') {
  const d = parseLocalDate(isoDate) || (isoDate ? new Date(isoDate) : null);
  if (!d || Number.isNaN(d.getTime())) return '—';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  if (fmt === 'YYYY-MM-DD') return `${y}-${m}-${day}`;
  if (fmt === 'DD/MM/YYYY') return `${day}/${m}/${y}`;
  if (fmt === 'MM/DD/YYYY') return `${m}/${day}/${y}`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function nowIso() {
  return new Date().toISOString();
}

/**
 * First/last calendar day of the month containing isoDate.
 * @param {string} isoDate
 */
export function monthBounds(isoDate) {
  const d = parseLocalDate(isoDate) || new Date();
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { start: toDateInput(start), end: toDateInput(end), year: d.getFullYear(), month: d.getMonth() + 1 };
}

/**
 * @param {string} isoDate
 * @param {number} deltaMonths
 */
export function addMonths(isoDate, deltaMonths) {
  const d = parseLocalDate(isoDate) || new Date();
  const next = new Date(d.getFullYear(), d.getMonth() + deltaMonths, 1);
  return toDateInput(next);
}

/**
 * @param {number} year
 */
export function yearBounds(year) {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

/**
 * Parse many CSV date formats into YYYY-MM-DD without UTC shift.
 * @param {string} raw
 */
export function parseFlexibleDate(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const dmy = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/.exec(s);
  if (dmy) {
    let d = Number(dmy[1]);
    let m = Number(dmy[2]);
    let y = Number(dmy[3]);
    if (y < 100) y = y <= 69 ? 2000 + y : 1900 + y;
    if (m > 12 && d <= 12) {
      const t = d;
      d = m;
      m = t;
    }
    if (m < 1 || m > 12 || d < 1 || d > 31) return '';
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) return toDateInput(new Date(parsed));
  return '';
}

/**
 * Inclusive date range check on YYYY-MM-DD strings.
 * @param {string} date
 * @param {string} start
 * @param {string} end
 */
export function inRange(date, start, end) {
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}
