/**
 * Application settings façade over settingsRepository.
 */

import { EVENTS } from '../core/constants.js';
import { emit } from '../core/eventBus.js';
import { settingsRepository } from '../repositories/index.js';

/**
 * @param {string} key
 * @returns {Promise<unknown>}
 */
export async function getSetting(key) {
  const rec = await settingsRepository.getById(key);
  return rec ? rec.value : undefined;
}

/**
 * @param {string} key
 * @param {unknown} value
 */
export async function setSetting(key, value) {
  await settingsRepository.put({ key, value });
  emit(EVENTS.DATA_CHANGED, { store: 'settings', key, value });
  return value;
}

/**
 * @returns {Promise<Record<string, unknown>>}
 */
export async function getSettingsMap() {
  const rows = await settingsRepository.getAll();
  /** @type {Record<string, unknown>} */
  const map = {};
  for (const r of rows || []) {
    if (r && r.key != null) map[r.key] = r.value;
  }
  return map;
}
