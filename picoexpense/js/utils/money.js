/**
 * Integer minor-unit money. Never use float for stored amounts.
 */

/** @type {Record<string, number>} */
export const CURRENCY_DECIMALS = {
  AED: 2,
  INR: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  SAR: 2,
  QAR: 2,
  OMR: 3,
  BHD: 3,
  KWD: 3,
  JPY: 0,
  SGD: 2,
  AUD: 2,
  CAD: 2,
  CHF: 2,
  CNY: 2,
};

/**
 * @param {string} code
 */
export function decimalsFor(code) {
  const d = CURRENCY_DECIMALS[String(code || '').toUpperCase()];
  return d == null ? 2 : d;
}

/**
 * Parse a user amount string/number into minor units.
 * @param {string|number} value
 * @param {string} currency
 * @returns {number}
 */
export function toMinor(value, currency) {
  const dec = decimalsFor(currency);
  const raw = String(value ?? '').trim().replace(/,/g, '');
  if (!raw || raw === '-' || raw === '.') throw new Error('Amount is required');
  const neg = raw.startsWith('-');
  const abs = neg ? raw.slice(1) : raw;
  if (!/^\d+(\.\d+)?$/.test(abs)) throw new Error('Amount must be a valid number');
  const [w, f = ''] = abs.split('.');
  if (f.length > dec) throw new Error(`Amount has too many decimal places for ${currency}`);
  const frac = (f + '0'.repeat(dec)).slice(0, dec);
  const whole = BigInt(w || '0');
  const fracN = BigInt(frac || '0');
  const scale = 10n ** BigInt(dec);
  const minor = whole * scale + fracN;
  const n = Number(minor);
  if (!Number.isSafeInteger(n)) throw new Error('Amount is too large');
  return neg ? -n : n;
}

/**
 * @param {number} minor
 * @param {string} currency
 */
export function fromMinor(minor, currency) {
  const dec = decimalsFor(currency);
  const sign = minor < 0 ? -1 : 1;
  const abs = Math.abs(Math.trunc(minor));
  if (dec === 0) return String(sign * abs);
  const scale = 10 ** dec;
  const w = Math.floor(abs / scale);
  const f = String(abs % scale).padStart(dec, '0');
  const body = `${w}.${f}`;
  return sign < 0 ? `-${body}` : body;
}

/**
 * Display with Intl.NumberFormat.
 * @param {number} minor
 * @param {string} currency
 * @param {string} [locale]
 */
export function formatMoney(minor, currency, locale = undefined) {
  const dec = decimalsFor(currency);
  const major = minor / 10 ** dec;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: dec,
      maximumFractionDigits: dec,
    }).format(major);
  } catch {
    return `${currency} ${fromMinor(minor, currency)}`;
  }
}

/**
 * Convert minor units between currencies using a user-supplied rate.
 * rate = how many `to` major units per 1 `from` major unit.
 * Example: 1 AED = 23 INR → rate 23 when from=AED to=INR.
 * @param {number} fromMinor
 * @param {string} fromCurrency
 * @param {string} toCurrency
 * @param {number} rate
 */
export function convertMinor(fromMinor, fromCurrency, toCurrency, rate) {
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('Exchange rate must be a positive number');
  const fromDec = decimalsFor(fromCurrency);
  const toDec = decimalsFor(toCurrency);
  const fromMajor = fromMinor / 10 ** fromDec;
  const toMajor = fromMajor * rate;
  return Math.round(toMajor * 10 ** toDec);
}

/**
 * Sum minor units (integers).
 * @param {number[]} values
 */
export function sumMinor(values) {
  let t = 0;
  for (const v of values) t += Math.trunc(v || 0);
  return t;
}
