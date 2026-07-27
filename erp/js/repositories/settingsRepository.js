/**
 * App settings repository (global key-value in SETTINGS store).
 */

import { STORES } from '../core/constants.js';
import { BaseRepository } from './baseRepository.js';
import { uuid } from '../core/uuid.js';

export class SettingsRepository extends BaseRepository {
  constructor() {
    super(STORES.SETTINGS);
  }

  /**
   * @param {string} key
   * @returns {Promise<unknown>}
   */
  async getValue(key) {
    const row = await this.findOneByIndex('key', key);
    return row ? row.value : undefined;
  }

  /**
   * @param {string} key
   * @param {unknown} value
   */
  async setValue(key, value) {
    const existing = await this.findOneByIndex('key', key);
    const row = {
      id: existing?.id ?? uuid(),
      key,
      value,
      updatedAt: new Date().toISOString(),
    };
    return this.save(row);
  }

  /**
   * @param {string} key
   */
  async removeValue(key) {
    const existing = await this.findOneByIndex('key', key);
    if (existing) await this.delete(existing.id);
  }
}

export const settingsRepository = new SettingsRepository();
