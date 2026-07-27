/**
 * Settings / app preferences service.
 */

import { APP_NAME, APP_VERSION, SETTINGS_KEYS } from '../core/constants.js';
import { settingsRepository } from '../repositories/settingsRepository.js';
import { getStoreNames } from '../db/database.js';

const DEFAULT_UI = Object.freeze({
  sidebarCollapsed: false,
  density: 'comfortable',
});

export async function getUiPreferences() {
  const stored = await settingsRepository.getValue(SETTINGS_KEYS.UI_PREFERENCES);
  return { ...DEFAULT_UI, ...(stored && typeof stored === 'object' ? stored : {}) };
}

/**
 * @param {Partial<typeof DEFAULT_UI>} patch
 */
export async function updateUiPreferences(patch) {
  const current = await getUiPreferences();
  const next = { ...current, ...patch };
  await settingsRepository.setValue(SETTINGS_KEYS.UI_PREFERENCES, next);
  return next;
}

/**
 * Diagnostic snapshot for Settings page.
 */
export async function getAppInfo() {
  const stores = await getStoreNames();
  return {
    name: APP_NAME,
    version: APP_VERSION,
    storeCount: stores.length,
    stores,
    storage: 'IndexedDB',
    offline: true,
  };
}
