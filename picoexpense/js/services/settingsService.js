import { EVENTS, SETTINGS_KEYS } from '../core/constants.js';
import { emit } from '../core/eventBus.js';
import { settingsRepository } from '../repositories/index.js';
import { nowIso } from '../utils/date.js';

/**
 * @param {string} key
 */
export async function getSetting(key) {
  return settingsRepository.getValue(key);
}

/**
 * @param {string} key
 * @param {unknown} value
 */
export async function setSetting(key, value) {
  await settingsRepository.setValue(key, value);
  emit(EVENTS.SETTINGS_CHANGED, { key, value });
  return value;
}

export async function getSettingsMap() {
  const rows = await settingsRepository.getAll();
  /** @type {Record<string, unknown>} */
  const map = {};
  for (const r of rows) map[r.key] = r.value;
  return map;
}

export async function markLocalDataChanged() {
  const at = nowIso();
  await settingsRepository.setValue(SETTINGS_KEYS.LOCAL_DATA_UPDATED_AT, at);
  emit(EVENTS.DATA_CHANGED, { at });
  return at;
}

export async function getLocalDataUpdatedAt() {
  const v = await settingsRepository.getValue(SETTINGS_KEYS.LOCAL_DATA_UPDATED_AT);
  return v ? String(v) : null;
}
