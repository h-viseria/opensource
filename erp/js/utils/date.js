/**
 * Small date / formatting helpers.
 */

/**
 * Format ISO date string or Date to YYYY-MM-DD.
 * @param {string|Date|number} value
 */
export function toDateInput(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Format for display: 20 Jul 2026
 * @param {string|Date|number} value
 */
export function formatDisplayDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Suggest financial year label from a start date.
 * e.g. 2026-04-01 → "FY 2026-27"
 * @param {string|Date} startDate
 * @param {number} [endMonthOffset=11] months to add for end (default 11 → 12-month FY)
 */
export function suggestFyLabel(startDate, endMonthOffset = 11) {
  const start = startDate instanceof Date ? startDate : new Date(startDate);
  const end = new Date(start);
  end.setMonth(end.getMonth() + endMonthOffset);
  const sy = start.getFullYear();
  const ey = end.getFullYear();
  if (sy === ey) return `FY ${sy}`;
  return `FY ${sy}-${String(ey).slice(-2)}`;
}

/**
 * Default FY start for a given reference date (April 1 of current/previous year).
 * @param {Date} [ref]
 * @param {number} [startMonth=4] 1-based month
 */
export function defaultFyStart(ref = new Date(), startMonth = 4) {
  const year = ref.getMonth() + 1 >= startMonth ? ref.getFullYear() : ref.getFullYear() - 1;
  return new Date(year, startMonth - 1, 1);
}

/**
 * End of FY = day before next FY start.
 * @param {Date} start
 */
export function defaultFyEnd(start) {
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + 1);
  end.setDate(end.getDate() - 1);
  return end;
}

/** Current timestamp ISO. */
export function nowIso() {
  return new Date().toISOString();
}
