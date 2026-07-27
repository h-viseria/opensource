/**
 * Money helpers — amounts stored as numbers rounded to 2 decimal places.
 */

const EPSILON = 0.005;

/**
 * @param {unknown} value
 * @returns {number}
 */
export function roundMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * @param {number} a
 * @param {number} b
 */
export function moneyEquals(a, b) {
  return Math.abs(roundMoney(a) - roundMoney(b)) < EPSILON;
}

/**
 * @param {number} n
 * @param {string} [currency]
 */
export function formatMoney(n, currency) {
  const amount = roundMoney(n);
  try {
    if (currency) {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    }
  } catch {
    /* fall through */
  }
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
