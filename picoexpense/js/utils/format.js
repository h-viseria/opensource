import { formatMoney as fmt } from './money.js';
import { formatDisplayDate } from './date.js';

/**
 * @param {number} minor
 * @param {string} currency
 * @param {string} [locale]
 */
export function money(minor, currency, locale) {
  return fmt(minor ?? 0, currency || 'AED', locale);
}

/**
 * @param {number} pct 0–1
 */
export function percent(pct) {
  if (pct == null || Number.isNaN(pct)) return '—';
  return `${Math.round(pct * 1000) / 10}%`;
}

export { formatDisplayDate };
