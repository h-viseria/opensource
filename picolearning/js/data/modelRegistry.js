/**
 * Configurable model catalog for PicoLearning.
 * Model IDs are WebLLM / MLC catalog names — not permanent product contracts.
 * Prefer getProfileModels / getDefaultProfile / listProfiles over hard-coding IDs.
 */

import { AI_PROFILES } from '../core/constants.js';

/**
 * @typedef {'llm'|'embedding'} ModelType
 * @typedef {{
 *   profile: string,
 *   modelId: string,
 *   modelType: ModelType,
 *   sizeLabel: string,
 *   quantization: string,
 *   approxDownloadMB: number,
 *   minRamGB: number,
 *   recommendedRamGB: number,
 *   webgpuRecommended: boolean,
 *   fallbackId: string|null,
 *   capabilities: string[],
 * }} ModelRegistryEntry
 */

/** @type {readonly ModelRegistryEntry[]} */
export const MODEL_REGISTRY = Object.freeze([
  // —— LITE ——
  // Prefer q4f32: works without WebGPU shader-f16 (common failure on older GPUs / some drivers).
  Object.freeze({
    profile: AI_PROFILES.LITE,
    modelId: 'Llama-3.2-1B-Instruct-q4f32_1-MLC',
    modelType: 'llm',
    sizeLabel: '~1.1 GB',
    quantization: 'q4f32_1',
    approxDownloadMB: 1100,
    minRamGB: 4,
    recommendedRamGB: 6,
    webgpuRecommended: true,
    fallbackId: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    capabilities: ['chat', 'rag', 'summarize', 'flashcards', 'mcq'],
  }),
  Object.freeze({
    profile: AI_PROFILES.LITE,
    modelId: 'local-hash-embedding',
    modelType: 'embedding',
    sizeLabel: '0 MB (built-in)',
    quantization: 'hash-256',
    approxDownloadMB: 0,
    minRamGB: 1,
    recommendedRamGB: 2,
    webgpuRecommended: false,
    fallbackId: null,
    capabilities: ['keyword-hybrid', 'hash-embed'],
  }),

  // —— STANDARD ——
  Object.freeze({
    profile: AI_PROFILES.STANDARD,
    modelId: 'Llama-3.2-3B-Instruct-q4f32_1-MLC',
    modelType: 'llm',
    sizeLabel: '~2.9 GB',
    quantization: 'q4f32_1',
    approxDownloadMB: 2900,
    minRamGB: 8,
    recommendedRamGB: 12,
    webgpuRecommended: true,
    fallbackId: 'Llama-3.2-1B-Instruct-q4f32_1-MLC',
    capabilities: ['chat', 'rag', 'summarize', 'flashcards', 'mcq', 'deeper-reasoning'],
  }),
  Object.freeze({
    profile: AI_PROFILES.STANDARD,
    modelId: 'Xenova/all-MiniLM-L6-v2',
    modelType: 'embedding',
    sizeLabel: '~23 MB (optional)',
    quantization: 'fp32',
    approxDownloadMB: 23,
    minRamGB: 2,
    recommendedRamGB: 4,
    webgpuRecommended: false,
    fallbackId: 'local-hash-embedding',
    capabilities: ['semantic-search', 'hybrid-retrieval'],
  }),

  // —— ADVANCED ——
  Object.freeze({
    profile: AI_PROFILES.ADVANCED,
    modelId: 'Llama-3.1-8B-Instruct-q4f32_1-MLC',
    modelType: 'llm',
    sizeLabel: '~5.0 GB',
    quantization: 'q4f32_1',
    approxDownloadMB: 5000,
    minRamGB: 16,
    recommendedRamGB: 24,
    webgpuRecommended: true,
    fallbackId: 'Llama-3.2-3B-Instruct-q4f32_1-MLC',
    capabilities: ['chat', 'rag', 'summarize', 'flashcards', 'mcq', 'deeper-reasoning', 'long-context'],
  }),
  Object.freeze({
    profile: AI_PROFILES.ADVANCED,
    modelId: 'Xenova/all-MiniLM-L6-v2',
    modelType: 'embedding',
    sizeLabel: '~23 MB (optional)',
    quantization: 'fp32',
    approxDownloadMB: 23,
    minRamGB: 2,
    recommendedRamGB: 4,
    webgpuRecommended: false,
    fallbackId: 'local-hash-embedding',
    capabilities: ['semantic-search', 'hybrid-retrieval'],
  }),
]);

/** Local hashing embeddings are always available (no download). */
export const LOCAL_HASH_EMBEDDING_ID = 'local-hash-embedding';

/**
 * @param {string} profile
 * @returns {ModelRegistryEntry[]}
 */
export function getProfileModels(profile) {
  const key = String(profile || '').toUpperCase();
  return MODEL_REGISTRY.filter((m) => m.profile === key);
}

/**
 * Softest profile that still works on low-end hardware / demo mode.
 * @returns {string}
 */
export function getDefaultProfile() {
  return AI_PROFILES.LITE;
}

/**
 * @returns {string[]}
 */
export function listProfiles() {
  return Object.values(AI_PROFILES);
}

/**
 * @param {string} modelId
 * @returns {ModelRegistryEntry|undefined}
 */
export function getModelById(modelId) {
  return MODEL_REGISTRY.find((m) => m.modelId === modelId);
}

/**
 * Primary LLM entry for a profile (first llm-typed row).
 * @param {string} profile
 * @returns {ModelRegistryEntry|undefined}
 */
export function getProfileLlm(profile) {
  return getProfileModels(profile).find((m) => m.modelType === 'llm');
}

/**
 * Embedding entry for a profile (first embedding-typed row).
 * @param {string} profile
 * @returns {ModelRegistryEntry|undefined}
 */
export function getProfileEmbedding(profile) {
  return getProfileModels(profile).find((m) => m.modelType === 'embedding');
}
