/**
 * Local hardware / capability probing (no network).
 */

import { AI_PROFILES } from './constants.js';
import { getDefaultProfile, getProfileLlm } from '../data/modelRegistry.js';

/**
 * @typedef {{
 *   browser: string,
 *   os: string,
 *   webgpu: boolean,
 *   webgpuAdapter: string|null,
 *   deviceMemoryGB: number|null,
 *   cpuCores: number|null,
 *   storageEstimate: { usage: number|null, quota: number|null }|null,
 *   indexedDB: boolean,
 *   opfs: boolean,
 *   wasm: boolean,
 *   recommendedProfile: string,
 *   warnings: string[],
 * }} HardwareInfo
 */

/**
 * Probe the current environment.
 * @returns {Promise<HardwareInfo>}
 */
export async function detectHardware() {
  /** @type {string[]} */
  const warnings = [];
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const browser = detectBrowser(ua);
  const os = detectOs(ua);

  const wasm = typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function';
  if (!wasm) warnings.push('WebAssembly is unavailable; on-device models cannot run.');

  const hasIndexedDb =
    typeof globalThis !== 'undefined' && typeof globalThis.indexedDB !== 'undefined';
  if (!hasIndexedDb) warnings.push('IndexedDB is unavailable; offline storage will fail.');

  let opfs = false;
  try {
    opfs = !!(navigator?.storage && typeof navigator.storage.getDirectory === 'function');
  } catch {
    opfs = false;
  }
  if (!opfs) warnings.push('Origin Private File System (OPFS) is unavailable.');

  const deviceMemoryGB =
    typeof navigator !== 'undefined' && typeof navigator.deviceMemory === 'number'
      ? navigator.deviceMemory
      : null;
  const cpuCores =
    typeof navigator !== 'undefined' && typeof navigator.hardwareConcurrency === 'number'
      ? navigator.hardwareConcurrency
      : null;

  if (deviceMemoryGB != null && deviceMemoryGB < 4) {
    warnings.push('Low device memory reported; prefer the LITE profile.');
  }

  const { webgpu, webgpuAdapter } = await probeWebGpu();
  if (!webgpu) {
    warnings.push('WebGPU is unavailable; WebLLM inference will be limited or fail.');
  }

  let storageEstimate = null;
  try {
    if (navigator?.storage?.estimate) {
      const est = await navigator.storage.estimate();
      storageEstimate = {
        usage: typeof est.usage === 'number' ? est.usage : null,
        quota: typeof est.quota === 'number' ? est.quota : null,
      };
      if (storageEstimate.quota != null && storageEstimate.quota < 2 * 1024 * 1024 * 1024) {
        warnings.push('Browser storage quota is under ~2 GB; larger models may not fit.');
      }
    }
  } catch {
    storageEstimate = null;
  }

  const recommendedProfile = recommendProfile({
    deviceMemoryGB,
    webgpu,
    cpuCores,
    storageEstimate,
  });

  return {
    browser,
    os,
    webgpu,
    webgpuAdapter,
    deviceMemoryGB,
    cpuCores,
    storageEstimate,
    indexedDB: hasIndexedDb,
    opfs,
    wasm,
    recommendedProfile,
    warnings,
  };
}

/**
 * Choose an AI profile from local capabilities.
 * @param {{
 *   deviceMemoryGB?: number|null,
 *   webgpu?: boolean,
 *   cpuCores?: number|null,
 *   storageEstimate?: { usage: number|null, quota: number|null }|null,
 * }} [info]
 * @returns {string}
 */
export function recommendProfile(info = {}) {
  const ram = info.deviceMemoryGB ?? null;
  const webgpu = !!info.webgpu;
  const quotaBytes = info.storageEstimate?.quota ?? null;
  const quotaGB = quotaBytes != null ? quotaBytes / (1024 * 1024 * 1024) : null;

  /** @type {string[]} */
  const candidates = [AI_PROFILES.ADVANCED, AI_PROFILES.STANDARD, AI_PROFILES.LITE];

  for (const profile of candidates) {
    const llm = getProfileLlm(profile);
    if (!llm) continue;
    if (llm.webgpuRecommended && !webgpu) continue;
    if (ram != null && ram < llm.minRamGB) continue;
    if (quotaGB != null && llm.approxDownloadMB / 1024 > quotaGB * 0.85) continue;
    if (ram != null && ram >= llm.recommendedRamGB) return profile;
    // Accept if min RAM is met even without recommended headroom (except ADVANCED needs headroom or unknown RAM)
    if (ram != null && ram >= llm.minRamGB) {
      if (profile === AI_PROFILES.ADVANCED && ram < llm.recommendedRamGB) continue;
      return profile;
    }
    if (ram == null) {
      // No deviceMemory API — be conservative unless WebGPU + plenty of cores suggest otherwise
      if (profile === AI_PROFILES.LITE) return profile;
      if (profile === AI_PROFILES.STANDARD && webgpu && (info.cpuCores ?? 0) >= 4) return profile;
    }
  }

  return getDefaultProfile();
}

/**
 * @param {string} ua
 */
function detectBrowser(ua) {
  if (/Edg\//i.test(ua)) return 'Edge';
  if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return 'Chrome';
  if (/Firefox\//i.test(ua)) return 'Firefox';
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return 'Safari';
  if (/OPR\//i.test(ua) || /Opera/i.test(ua)) return 'Opera';
  return 'Unknown';
}

/**
 * @param {string} ua
 */
function detectOs(ua) {
  if (/Windows NT/i.test(ua)) return 'Windows';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macOS';
  if (/Android/i.test(ua)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Linux/i.test(ua)) return 'Linux';
  if (/CrOS/i.test(ua)) return 'ChromeOS';
  return 'Unknown';
}

/**
 * @returns {Promise<{ webgpu: boolean, webgpuAdapter: string|null }>}
 */
async function probeWebGpu() {
  if (typeof navigator === 'undefined' || !navigator.gpu) {
    return { webgpu: false, webgpuAdapter: null };
  }
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return { webgpu: false, webgpuAdapter: null };
    let label = null;
    try {
      // info() is optional / newer
      if (typeof adapter.requestAdapterInfo === 'function') {
        const info = await adapter.requestAdapterInfo();
        label = [info.vendor, info.architecture, info.device].filter(Boolean).join(' ') || info.description || null;
      } else if (adapter.info) {
        const info = adapter.info;
        label = [info.vendor, info.architecture, info.device].filter(Boolean).join(' ') || null;
      }
    } catch {
      label = 'WebGPU adapter';
    }
    return { webgpu: true, webgpuAdapter: label || 'WebGPU adapter' };
  } catch {
    return { webgpu: false, webgpuAdapter: null };
  }
}
