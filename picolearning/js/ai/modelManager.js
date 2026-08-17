/**
 * Download / activate / remove AI profiles. Persists to IndexedDB.
 */

import { AI_PROFILES, SETTINGS_KEYS } from '../core/constants.js';
import { uuid } from '../core/uuid.js';
import { nowIso } from '../utils/date.js';
import {
  getDefaultProfile,
  getProfileEmbedding,
  getProfileLlm,
  getProfileModels,
  LOCAL_HASH_EMBEDDING_ID,
  listProfiles,
} from '../data/modelRegistry.js';
import { modelRepository, settingsRepository } from '../repositories/index.js';
import { WebLLMProvider } from './providers.js';

/** @typedef {'ready'|'downloading'|'error'|'removed'} ModelStatus */

/**
 * @typedef {{
 *   id: string,
 *   profile: string,
 *   modelId: string,
 *   installedAt: string,
 *   sizeMB: number,
 *   status: ModelStatus,
 * }} ModelRecord
 */

export class ModelManager {
  constructor() {
    /** @type {WebLLMProvider|null} */
    this._activeProvider = null;
    /** @type {string|null} */
    this._activeProfile = null;
  }

  /**
   * @returns {Promise<ModelRecord[]>}
   */
  async getInstalled() {
    const all = await modelRepository.getAll();
    return (all || []).filter((m) => m.status === 'ready');
  }

  /**
   * Download (initialize / cache) models for a profile.
   * WebLLM weights land in Cache Storage via WebLLMProvider.initialize.
   *
   * @param {string} profile
   * @param {{
   *   onProgress?: (p: { phase: string, modelId: string, progress: number, text: string }) => void,
   *   signal?: AbortSignal,
   * }} [opts]
   * @returns {Promise<ModelRecord[]>}
   */
  async downloadProfile(profile, { onProgress, signal } = {}) {
    const key = String(profile || '').toUpperCase();
    if (!listProfiles().includes(key)) {
      throw new Error(`Unknown AI profile: ${profile}`);
    }

    const entries = getProfileModels(key);
    if (!entries.length) throw new Error(`No models registered for profile ${key}`);

    /** @type {ModelRecord[]} */
    const results = [];
    const provider = new WebLLMProvider();

    try {
      for (const entry of entries) {
        throwIfAborted(signal);

        if (entry.modelType === 'embedding') {
          // Hash embeddings need no download; optional Xenova is opt-in elsewhere.
          if (entry.modelId === LOCAL_HASH_EMBEDDING_ID || entry.approxDownloadMB === 0) {
            const rec = await this._upsertModelRecord({
              profile: key,
              modelId: entry.modelId,
              sizeMB: 0,
              status: 'ready',
            });
            results.push(rec);
            onProgress?.({
              phase: 'embedding',
              modelId: entry.modelId,
              progress: 1,
              text: 'Local hash embeddings ready (no download).',
            });
            continue;
          }
          // Mark optional embedding as available-to-download but do not force-fetch here.
          const rec = await this._upsertModelRecord({
            profile: key,
            modelId: entry.modelId,
            sizeMB: entry.approxDownloadMB,
            status: 'ready',
          });
          results.push(rec);
          onProgress?.({
            phase: 'embedding',
            modelId: entry.modelId,
            progress: 1,
            text: `Embedding ${entry.modelId} registered (load on first use).`,
          });
          continue;
        }

        // LLM via WebLLM
        await this._upsertModelRecord({
          profile: key,
          modelId: entry.modelId,
          sizeMB: entry.approxDownloadMB,
          status: 'downloading',
        });

        try {
          await provider.initialize({
            modelId: entry.modelId,
            onProgress: (p) => {
              throwIfAborted(signal);
              onProgress?.({
                phase: 'llm',
                modelId: entry.modelId,
                progress: p.progress,
                text: p.text,
              });
            },
          });
        } catch (err) {
          const fallbackId = entry.fallbackId;
          if (fallbackId && fallbackId !== entry.modelId) {
            onProgress?.({
              phase: 'llm',
              modelId: entry.modelId,
              progress: 0,
              text: `Primary model failed; trying fallback ${fallbackId}…`,
            });
            await provider.initialize({
              modelId: fallbackId,
              onProgress: (p) => {
                throwIfAborted(signal);
                onProgress?.({
                  phase: 'llm',
                  modelId: fallbackId,
                  progress: p.progress,
                  text: p.text,
                });
              },
            });
            const rec = await this._upsertModelRecord({
              profile: key,
              modelId: fallbackId,
              sizeMB: entry.approxDownloadMB,
              status: 'ready',
            });
            results.push(rec);
            continue;
          }
          await this._upsertModelRecord({
            profile: key,
            modelId: entry.modelId,
            sizeMB: entry.approxDownloadMB,
            status: 'error',
          });
          throw err;
        }

        const rec = await this._upsertModelRecord({
          profile: key,
          modelId: entry.modelId,
          sizeMB: entry.approxDownloadMB,
          status: 'ready',
        });
        results.push(rec);
      }

      await this.setActiveProfile(key);
      this._activeProvider = provider;
      this._activeProfile = key;
      return results;
    } catch (err) {
      await provider.dispose().catch(() => {});
      throw err;
    }
  }

  /**
   * @param {string} profile
   */
  async setActiveProfile(profile) {
    const key = String(profile || '').toUpperCase();
    if (!listProfiles().includes(key)) {
      throw new Error(`Unknown AI profile: ${profile}`);
    }
    await settingsRepository.put({
      key: SETTINGS_KEYS.ACTIVE_PROFILE,
      value: key,
      updatedAt: nowIso(),
    });
    this._activeProfile = key;
  }

  /**
   * Remove installed model records for a profile (does not purge Cache Storage blobs).
   * @param {string} profile
   */
  async removeProfile(profile) {
    const key = String(profile || '').toUpperCase();
    const all = await modelRepository.getAll();
    const mine = (all || []).filter((m) => m.profile === key);
    for (const m of mine) {
      await modelRepository.put({
        ...m,
        status: 'removed',
        removedAt: nowIso(),
      });
      await modelRepository.delete(m.id);
    }

    const active = await this.getActiveProfile();
    if (active === key) {
      await settingsRepository.put({
        key: SETTINGS_KEYS.ACTIVE_PROFILE,
        value: getDefaultProfile(),
        updatedAt: nowIso(),
      });
      this._activeProfile = getDefaultProfile();
    }

    if (this._activeProfile === key && this._activeProvider) {
      await this._activeProvider.dispose();
      this._activeProvider = null;
    }
  }

  /**
   * @returns {Promise<string>}
   */
  async getActiveProfile() {
    if (this._activeProfile) return this._activeProfile;
    const row = await settingsRepository.getById(SETTINGS_KEYS.ACTIVE_PROFILE);
    const value = row?.value;
    if (value && listProfiles().includes(String(value).toUpperCase())) {
      this._activeProfile = String(value).toUpperCase();
      return this._activeProfile;
    }
    return getDefaultProfile();
  }

  /**
   * @param {string} profile
   * @returns {Promise<boolean>}
   */
  async isProfileReady(profile) {
    const key = String(profile || '').toUpperCase();
    const llm = getProfileLlm(key);
    if (!llm) return false;
    const installed = await this.getInstalled();
    const hasLlm = installed.some(
      (m) => m.profile === key && m.modelId === llm.modelId && m.status === 'ready',
    );
    // Also accept fallback id if primary was swapped
    const hasFallback =
      !!llm.fallbackId &&
      installed.some((m) => m.profile === key && m.modelId === llm.fallbackId && m.status === 'ready');
    return hasLlm || hasFallback;
  }

  /**
   * @returns {Promise<{ usage: number|null, quota: number|null }>}
   */
  async getStorageEstimate() {
    try {
      if (navigator?.storage?.estimate) {
        const est = await navigator.storage.estimate();
        return {
          usage: typeof est.usage === 'number' ? est.usage : null,
          quota: typeof est.quota === 'number' ? est.quota : null,
        };
      }
    } catch {
      /* ignore */
    }
    return { usage: null, quota: null };
  }

  /**
   * Lazy accessor for a warmed WebLLM provider for the active profile.
   * @returns {Promise<WebLLMProvider|null>}
   */
  async getActiveLlmProvider() {
    const profile = await this.getActiveProfile();
    if (!(await this.isProfileReady(profile))) return null;
    if (this._activeProvider && this._activeProfile === profile) return this._activeProvider;

    const installed = await this.getInstalled();
    const llmMeta = getProfileLlm(profile);
    const record =
      installed.find((m) => m.profile === profile && m.modelId === llmMeta?.modelId) ||
      installed.find((m) => m.profile === profile && m.modelId === llmMeta?.fallbackId) ||
      installed.find((m) => m.profile === profile);

    if (!record) return null;

    const provider = new WebLLMProvider();
    await provider.initialize({ modelId: record.modelId });
    this._activeProvider = provider;
    this._activeProfile = profile;
    return provider;
  }

  /**
   * @param {{ profile: string, modelId: string, sizeMB: number, status: ModelStatus }} data
   * @returns {Promise<ModelRecord>}
   */
  async _upsertModelRecord(data) {
    const all = await modelRepository.getAll();
    const existing = (all || []).find(
      (m) => m.profile === data.profile && m.modelId === data.modelId,
    );
    /** @type {ModelRecord} */
    const record = {
      id: existing?.id || uuid(),
      profile: data.profile,
      modelId: data.modelId,
      installedAt: existing?.installedAt || nowIso(),
      sizeMB: data.sizeMB,
      status: data.status,
    };
    if (data.status === 'ready') {
      record.installedAt = nowIso();
    }
    await modelRepository.put(record);
    return record;
  }
}

/**
 * @param {AbortSignal|undefined} signal
 */
function throwIfAborted(signal) {
  if (signal?.aborted) {
    const err = new Error('Model download aborted');
    err.name = 'AbortError';
    throw err;
  }
}

/** Singleton convenience */
export const modelManager = new ModelManager();

// Re-export profiles for callers that only import modelManager
export { AI_PROFILES, getProfileEmbedding, getProfileLlm, getProfileModels };
