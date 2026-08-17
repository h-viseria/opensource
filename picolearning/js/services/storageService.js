/**
 * Storage estimates and full local wipe.
 */

import { EVENTS, SETTINGS_KEYS, STORES } from '../core/constants.js';
import { emit } from '../core/eventBus.js';
import { getDb } from '../db/database.js';
import {
  documentRepository,
  pageRepository,
  chapterRepository,
  chunkRepository,
  embeddingRepository,
  questionRepository,
  flashcardRepository,
  progressRepository,
  quizAttemptRepository,
  modelRepository,
  settingsRepository,
  jobRepository,
  keywordIndexRepository,
} from '../repositories/index.js';

const ALL_REPOS = [
  documentRepository,
  pageRepository,
  chapterRepository,
  chunkRepository,
  embeddingRepository,
  questionRepository,
  flashcardRepository,
  progressRepository,
  quizAttemptRepository,
  modelRepository,
  settingsRepository,
  jobRepository,
  keywordIndexRepository,
];

/**
 * Rough byte size of a JSON-serializable value.
 * @param {unknown} value
 */
function approxBytes(value) {
  try {
    return new Blob([JSON.stringify(value)]).size;
  } catch {
    return JSON.stringify(value || '').length;
  }
}

/**
 * @param {Awaited<ReturnType<typeof import('../repositories/storeRepository.js').createRepository>>} repo
 */
async function measureRepo(repo) {
  const rows = (await repo.getAll()) || [];
  let bytes = 0;
  for (const row of rows) bytes += approxBytes(row);
  return { count: rows.length, bytes };
}

/**
 * Breakdown of local IndexedDB usage (approximate) plus browser quota.
 */
export async function estimateStorage() {
  const [
    documents,
    pages,
    chapters,
    chunks,
    embeddings,
    questions,
    flashcards,
    progress,
    quizAttempts,
    models,
    jobs,
    keywords,
    settings,
  ] = await Promise.all([
    measureRepo(documentRepository),
    measureRepo(pageRepository),
    measureRepo(chapterRepository),
    measureRepo(chunkRepository),
    measureRepo(embeddingRepository),
    measureRepo(questionRepository),
    measureRepo(flashcardRepository),
    measureRepo(progressRepository),
    measureRepo(quizAttemptRepository),
    measureRepo(modelRepository),
    measureRepo(jobRepository),
    measureRepo(keywordIndexRepository),
    measureRepo(settingsRepository),
  ]);

  const generated = {
    count: questions.count + flashcards.count + quizAttempts.count + progress.count,
    bytes: questions.bytes + flashcards.bytes + quizAttempts.bytes + progress.bytes,
  };

  const documentBundle = {
    count: documents.count,
    bytes:
      documents.bytes +
      pages.bytes +
      chapters.bytes +
      chunks.bytes +
      keywords.bytes +
      jobs.bytes,
  };

  let browser = { usage: null, quota: null };
  try {
    if (navigator?.storage?.estimate) {
      const est = await navigator.storage.estimate();
      browser = {
        usage: typeof est.usage === 'number' ? est.usage : null,
        quota: typeof est.quota === 'number' ? est.quota : null,
      };
    }
  } catch {
    /* ignore */
  }

  const totalBytes =
    documentBundle.bytes + embeddings.bytes + generated.bytes + models.bytes + settings.bytes;

  return {
    documents: documentBundle,
    pages,
    chapters,
    chunks,
    embeddings,
    generated,
    questions,
    flashcards,
    models,
    settings,
    jobs,
    keywords,
    browser,
    totalBytes,
    stores: Object.values(STORES),
  };
}

/**
 * Clear all IndexedDB application data. Optionally preserve setup flags.
 * @param {{ keepSetup?: boolean }} [opts]
 */
export async function clearAllData(opts = {}) {
  const keepSetup = !!opts.keepSetup;
  let setupComplete;
  let theme;
  let activeProfile;
  if (keepSetup) {
    setupComplete = await settingsRepository.getById(SETTINGS_KEYS.SETUP_COMPLETE);
    theme = await settingsRepository.getById(SETTINGS_KEYS.THEME);
    activeProfile = await settingsRepository.getById(SETTINGS_KEYS.ACTIVE_PROFILE);
  }

  for (const repo of ALL_REPOS) {
    await repo.clear();
  }

  // Ensure DB still opens cleanly
  await getDb();

  if (keepSetup) {
    if (setupComplete) await settingsRepository.put(setupComplete);
    if (theme) await settingsRepository.put(theme);
    if (activeProfile) await settingsRepository.put(activeProfile);
  }

  emit(EVENTS.DATA_CHANGED, { store: '*', action: 'clear' });
  return { ok: true };
}

/**
 * Format bytes for UI.
 * @param {number|null|undefined} n
 */
export function formatBytes(n) {
  if (n == null || Number.isNaN(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
