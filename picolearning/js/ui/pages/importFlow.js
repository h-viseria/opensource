/**
 * Import options + processing progress UI (used by Library).
 */

import { OBJECTIVES, DIFFICULTY, SETTINGS_KEYS } from '../../core/constants.js';
import { escapeHtml } from '../../utils/html.js';
import { processDocument } from '../../services/processingService.js';
import { setSetting } from '../../services/settingsService.js';
import { ensureQuestionsForDoc, ensureFlashcardsForDoc } from '../../services/generationService.js';
import { showToast } from '../toast.js';
import { importOptionsHtml } from './helpers.js';

/** @type {Map<string, ArrayBuffer>} */
const pendingBuffers = new Map();

/**
 * @param {string} documentId
 * @param {ArrayBuffer} buffer
 */
export function stashFileBuffer(documentId, buffer) {
  pendingBuffers.set(documentId, buffer);
}

/**
 * @param {string} documentId
 */
export function takeFileBuffer(documentId) {
  const buf = pendingBuffers.get(documentId);
  pendingBuffers.delete(documentId);
  return buf || null;
}

/**
 * Render import options into a host element and wire Start Processing.
 *
 * @param {HTMLElement} host
 * @param {{
 *   documentId: string,
 *   title: string,
 *   fileBuffer: ArrayBuffer,
 *   onDone?: (result: object) => void,
 * }} opts
 */
export function showImportOptions(host, opts) {
  const { documentId, title, fileBuffer, onDone } = opts;
  stashFileBuffer(documentId, fileBuffer);

  host.innerHTML = `
    <section class="panel import-flow" data-import-flow>
      <h2>Process “${escapeHtml(title)}”</h2>
      <p class="muted">Choose study preferences, then start local processing. Text never leaves this device.</p>
      ${importOptionsHtml()}
      <div class="stack" style="flex-direction:row;flex-wrap:wrap;gap:0.5rem;margin-top:1rem">
        <button type="button" class="btn btn--primary" data-action="start-process">Start processing</button>
        <button type="button" class="btn btn--ghost" data-action="cancel-import">Cancel</button>
      </div>
      <div class="import-progress" data-progress hidden>
        <p class="muted" data-progress-msg>Starting…</p>
        <div class="progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100">
          <div class="progress-bar__fill" data-progress-fill style="width:0%"></div>
        </div>
        <p class="mono muted" data-progress-pct>0%</p>
      </div>
    </section>
  `;

  host.querySelector('[data-action="cancel-import"]')?.addEventListener('click', () => {
    takeFileBuffer(documentId);
    host.innerHTML = '';
  });

  host.querySelector('[data-action="start-process"]')?.addEventListener('click', async () => {
    const objective =
      /** @type {HTMLSelectElement|null} */ (host.querySelector('[data-objective]'))?.value ||
      OBJECTIVES.GENERAL;
    const difficulty =
      /** @type {HTMLSelectElement|null} */ (host.querySelector('[data-difficulty]'))?.value ||
      DIFFICULTY.INTERMEDIATE;
    const genQuestions = /** @type {HTMLInputElement|null} */ (host.querySelector('[data-gen-questions]'))
      ?.checked;
    const genFlashcards = /** @type {HTMLInputElement|null} */ (host.querySelector('[data-gen-flashcards]'))
      ?.checked;

    await setSetting(SETTINGS_KEYS.LEARNING_OBJECTIVE, objective);
    await setSetting(SETTINGS_KEYS.DEFAULT_DIFFICULTY, difficulty);
    await setSetting(SETTINGS_KEYS.LAST_DOCUMENT_ID, documentId);

    const buffer = takeFileBuffer(documentId) || fileBuffer;
    const startBtn = /** @type {HTMLButtonElement|null} */ (host.querySelector('[data-action="start-process"]'));
    if (startBtn) startBtn.disabled = true;

    const progressEl = host.querySelector('[data-progress]');
    const msgEl = host.querySelector('[data-progress-msg]');
    const fillEl = /** @type {HTMLElement|null} */ (host.querySelector('[data-progress-fill]'));
    const pctEl = host.querySelector('[data-progress-pct]');
    if (progressEl) progressEl.hidden = false;

    const setProgress = (pct, message) => {
      const n = Math.max(0, Math.min(100, Math.round(pct)));
      if (fillEl) fillEl.style.width = `${n}%`;
      if (pctEl) pctEl.textContent = `${n}%`;
      if (msgEl) msgEl.textContent = message || '';
    };

    try {
      showToast('Processing document…', 'info');
      const result = await processDocument(documentId, {
        fileArrayBuffer: buffer,
        onProgress: (p) => setProgress(p.progress ?? 0, p.message),
      });

      if (result?.ok) {
        setProgress(100, 'Document ready');
        if (genQuestions) {
          setProgress(100, 'Generating quiz questions…');
          await ensureQuestionsForDoc(documentId, { minCount: 10 });
        }
        if (genFlashcards) {
          setProgress(100, 'Generating flashcards…');
          await ensureFlashcardsForDoc(documentId, { minCount: 8 });
        }
        showToast('Document ready', 'success');
        onDone?.(result);
      } else if (result?.needsOcr) {
        showToast(result.message || 'OCR required for scanned PDF', 'warn');
        onDone?.(result);
      } else {
        showToast('Processing finished with issues', 'warn');
        onDone?.(result || {});
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setProgress(0, msg);
      showToast(msg, 'error');
      if (startBtn) startBtn.disabled = false;
    }
  });
}
