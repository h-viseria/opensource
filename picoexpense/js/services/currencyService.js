import { STORES } from '../core/constants.js';
import { uuid } from '../core/uuid.js';
import { nowIso } from '../utils/date.js';
import { assertCurrency } from '../utils/validation.js';
import { DEFAULT_CURRENCIES } from '../data/defaults.js';
import { currencyRepository, exchangeRateRepository } from '../repositories/index.js';
import { markLocalDataChanged, getSetting, setSetting } from './settingsService.js';
import { SETTINGS_KEYS } from '../core/constants.js';

export async function seedCurrencies() {
  const n = await currencyRepository.count();
  if (n) return;
  await currencyRepository.putMany([...DEFAULT_CURRENCIES]);
}

export async function listCurrencies() {
  await seedCurrencies();
  const rows = await currencyRepository.getAll();
  return rows.filter((c) => c.active !== false);
}

export async function getBaseCurrency() {
  return String((await getSetting(SETTINGS_KEYS.BASE_CURRENCY)) || 'AED').toUpperCase();
}

export async function setBaseCurrency(code) {
  assertCurrency(code);
  await setSetting(SETTINGS_KEYS.BASE_CURRENCY, String(code).toUpperCase());
}

/**
 * Manual FX: how many `to` major units per 1 `from` major unit.
 * @param {string} fromCurrency
 * @param {string} toCurrency
 * @param {string} date YYYY-MM-DD
 * @param {number} rate
 */
export async function saveRate(fromCurrency, toCurrency, date, rate) {
  assertCurrency(fromCurrency);
  assertCurrency(toCurrency);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('Exchange rate must be positive');
  const rec = {
    id: uuid(),
    fromCurrency: fromCurrency.toUpperCase(),
    toCurrency: toCurrency.toUpperCase(),
    date,
    rate,
    createdAt: nowIso(),
  };
  await exchangeRateRepository.put(rec);
  await markLocalDataChanged();
  return rec;
}

export async function listRates() {
  const rows = await exchangeRateRepository.getAll();
  rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return rows;
}

/**
 * @param {string} fromCurrency
 * @param {string} toCurrency
 * @param {string} date
 * @returns {Promise<number|null>}
 */
export async function getRate(fromCurrency, toCurrency, date) {
  const from = String(fromCurrency || '').toUpperCase();
  const to = String(toCurrency || '').toUpperCase();
  if (from === to) return 1;
  const rows = await exchangeRateRepository.getAll();
  const matches = rows
    .filter((r) => r.fromCurrency === from && r.toCurrency === to && r.date <= date)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  if (matches[0]) return Number(matches[0].rate);
  const inverse = rows
    .filter((r) => r.fromCurrency === to && r.toCurrency === from && r.date <= date)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  if (inverse[0] && Number(inverse[0].rate) > 0) return 1 / Number(inverse[0].rate);
  return null;
}

export { STORES };
