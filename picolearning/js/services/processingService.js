/**
 * End-to-end document processing pipeline:
 * inspect → extract (or OCR note) → structure → chunk → store → keyword index → embed → READY
 */

import { DOC_STATUS, EVENTS, JOB_STATUS } from '../core/constants.js';
import { emit } from '../core/eventBus.js';
import { uuid } from '../core/uuid.js';
import { nowIso } from '../utils/date.js';
import { HashEmbeddingProvider } from '../ai/embeddings.js';
import { inspectPdf, extractNativeText } from '../pdf/pdfParser.js';
import { detectStructure } from '../pdf/documentStructure.js';
import { chunkDocument } from '../pdf/chunker.js';
import { buildIndexForChunks } from '../search/keywordIndex.js';
import { UNAVAILABLE_MSG } from '../ocr/picoScanAdapter.js';
import {
  documentRepository,
  pageRepository,
  chapterRepository,
  chunkRepository,
  embeddingRepository,
  jobRepository,
} from '../repositories/index.js';
import { updateDocument } from './documentService.js';

const TOTAL_STEPS = 6;

/**
 * @param {AbortSignal} [signal]
 */
function throwIfAborted(signal) {
  if (signal?.aborted) {
    const err = new Error('Processing cancelled');
    err.name = 'AbortError';
    throw err;
  }
}

/**
 * @param {object} job
 * @param {number} step
 * @param {string} message
 * @param {number} [fractionWithinStep]
 */
async function report(job, step, message, fractionWithinStep = 0) {
  const base = ((step - 1) / TOTAL_STEPS) * 100;
  const span = 100 / TOTAL_STEPS;
  job.step = step;
  job.totalSteps = TOTAL_STEPS;
  job.progress = Math.min(99, Math.round(base + span * Math.max(0, Math.min(1, fractionWithinStep))));
  job.message = message;
  job.updatedAt = nowIso();
  await jobRepository.put(job);
  emit(EVENTS.DOC_PROGRESS, {
    documentId: job.documentId,
    jobId: job.id,
    step,
    totalSteps: TOTAL_STEPS,
    progress: job.progress,
    message,
    status: job.status,
  });
  emit(EVENTS.JOB_PROGRESS, { ...job });
}

/**
 * Process an imported document into pages, chapters, chunks, keywords, and embeddings.
 *
 * @param {string} documentId
 * @param {{
 *   fileArrayBuffer: ArrayBuffer,
 *   onProgress?: (p: object) => void,
 *   signal?: AbortSignal,
 *   ocrFallback?: boolean
 * }} options
 */
export async function processDocument(documentId, options) {
  const { fileArrayBuffer, onProgress, signal, ocrFallback = true } = options || {};
  if (!documentId) throw new Error('documentId is required');
  if (!fileArrayBuffer) throw new Error('fileArrayBuffer is required');

  const doc = await documentRepository.getById(documentId);
  if (!doc) throw new Error(`Document not found: ${documentId}`);

  const at = nowIso();
  const job = {
    id: uuid(),
    type: 'processDocument',
    documentId,
    label: `Process ${doc.title || documentId}`,
    status: JOB_STATUS.RUNNING,
    progress: 0,
    step: 0,
    totalSteps: TOTAL_STEPS,
    message: 'Starting',
    error: null,
    createdAt: at,
    updatedAt: at,
  };
  await jobRepository.put(job);
  await updateDocument(documentId, {
    status: DOC_STATUS.PROCESSING,
    errorMessage: null,
  });

  const notify = async (step, message, frac) => {
    await report(job, step, message, frac);
    onProgress?.({
      documentId,
      jobId: job.id,
      step,
      totalSteps: TOTAL_STEPS,
      progress: job.progress,
      message,
    });
  };

  try {
    throwIfAborted(signal);

    // Step 1 — inspect
    await notify(1, 'Reading PDF', 0);
    const inspection = await inspectPdf(fileArrayBuffer);
    throwIfAborted(signal);
    await updateDocument(documentId, {
      pageCount: inspection.pageCount,
      hasNativeText: inspection.hasNativeText,
      title: doc.title || inspection.title || doc.title,
    });
    await notify(1, 'Reading PDF', 1);

    // Step 2 — extract text
    await notify(2, 'Extracting text', 0);
    /** @type {Array<{ pageNumber: number, text: string }>} */
    let pages;

    if (inspection.hasNativeText) {
      pages = await extractNativeText(fileArrayBuffer, {
        signal,
        onProgress: ({ page, total }) => {
          onProgress?.({
            documentId,
            jobId: job.id,
            step: 2,
            totalSteps: TOTAL_STEPS,
            progress: Math.round(((1 + page / Math.max(1, total)) / TOTAL_STEPS) * 100),
            message: `Extracting text (page ${page}/${total})`,
          });
          emit(EVENTS.DOC_PROGRESS, {
            documentId,
            jobId: job.id,
            step: 2,
            totalSteps: TOTAL_STEPS,
            progress: Math.round(((1 + page / Math.max(1, total)) / TOTAL_STEPS) * 100),
            message: `Extracting text (page ${page}/${total})`,
          });
        },
      });
    } else if (ocrFallback) {
      // Native text missing — OCR requires PicoScan; do not invent text.
      const message =
        'No native PDF text detected. OCR via PicoScan is required for scanned pages. ' +
        UNAVAILABLE_MSG;
      await updateDocument(documentId, {
        status: DOC_STATUS.ERROR,
        errorMessage: message,
        hasNativeText: false,
      });
      job.status = JOB_STATUS.FAILED;
      job.error = message;
      job.message = message;
      job.updatedAt = nowIso();
      await jobRepository.put(job);
      emit(EVENTS.DOC_PROGRESS, {
        documentId,
        jobId: job.id,
        step: 2,
        totalSteps: TOTAL_STEPS,
        progress: job.progress,
        message,
        status: DOC_STATUS.ERROR,
      });
      emit(EVENTS.JOB_PROGRESS, { ...job });
      return {
        ok: false,
        documentId,
        jobId: job.id,
        needsOcr: true,
        message,
      };
    } else {
      const message =
        'No native PDF text detected and OCR fallback is disabled. Enable OCR or provide a text-based PDF.';
      throw Object.assign(new Error(message), { code: 'NO_NATIVE_TEXT' });
    }

    throwIfAborted(signal);
    await notify(2, 'Extracting text', 1);

    // Persist pages (replace prior)
    await pageRepository.deleteByIndex('documentId', documentId);
    const pageRecords = pages.map((p) => ({
      id: uuid(),
      documentId,
      pageNumber: p.pageNumber,
      text: p.text || '',
    }));
    await pageRepository.putMany(pageRecords);

    // Step 3 — structure
    await notify(3, 'Detecting chapters', 0);
    const chapters = detectStructure(pages).map((ch) => ({
      ...ch,
      documentId,
    }));
    throwIfAborted(signal);
    await chapterRepository.deleteByIndex('documentId', documentId);
    await chapterRepository.putMany(chapters);
    await notify(3, 'Detecting chapters', 1);

    // Step 4 — chunk
    await notify(4, 'Creating knowledge chunks', 0);
    const chunks = chunkDocument({ documentId, pages, chapters });
    throwIfAborted(signal);
    await chunkRepository.deleteByIndex('documentId', documentId);
    await chunkRepository.putMany(chunks);
    await notify(4, 'Creating knowledge chunks', 1);

    // Step 5 — keyword + semantic index
    await notify(5, 'Creating semantic index', 0);
    await buildIndexForChunks(chunks);

    await embeddingRepository.deleteByIndex('documentId', documentId);
    const embedder = new HashEmbeddingProvider();
    /** @type {object[]} */
    const embeddingRows = [];
    for (let i = 0; i < chunks.length; i++) {
      throwIfAborted(signal);
      const chunk = chunks[i];
      const raw = await embedder.embed(chunk.text);
      const vector = Array.from(raw);
      embeddingRows.push({
        id: uuid(),
        documentId,
        chunkId: chunk.id,
        dims: vector.length,
        vector,
        provider: embedder.modelId || 'local-hash-embedding',
        createdAt: nowIso(),
      });
      if (i % 5 === 0 || i === chunks.length - 1) {
        await notify(5, `Creating semantic index (${i + 1}/${chunks.length})`, (i + 1) / Math.max(1, chunks.length));
      }
    }
    await embeddingRepository.putMany(embeddingRows);
    await notify(5, 'Creating semantic index', 1);

    // Step 6 — finalize
    await notify(6, 'Preparing learning material', 0.5);
    throwIfAborted(signal);
    await updateDocument(documentId, {
      status: DOC_STATUS.READY,
      pageCount: pages.length,
      hasNativeText: true,
      chapterCount: chapters.length,
      chunkCount: chunks.length,
      errorMessage: null,
    });

    job.status = JOB_STATUS.DONE;
    job.progress = 100;
    job.step = TOTAL_STEPS;
    job.message = 'Document ready';
    job.updatedAt = nowIso();
    await jobRepository.put(job);
    emit(EVENTS.DOC_PROGRESS, {
      documentId,
      jobId: job.id,
      step: TOTAL_STEPS,
      totalSteps: TOTAL_STEPS,
      progress: 100,
      message: 'Document ready',
      status: DOC_STATUS.READY,
    });
    emit(EVENTS.JOB_PROGRESS, { ...job });
    emit(EVENTS.DATA_CHANGED, { store: 'documents', action: 'ready', id: documentId });

    return {
      ok: true,
      documentId,
      jobId: job.id,
      pageCount: pages.length,
      chapterCount: chapters.length,
      chunkCount: chunks.length,
      embeddingCount: embeddingRows.length,
    };
  } catch (err) {
    const cancelled = err?.name === 'AbortError';
    const message = err?.message || String(err);
    await updateDocument(documentId, {
      status: cancelled ? DOC_STATUS.CANCELLED : DOC_STATUS.ERROR,
      errorMessage: message,
    });
    job.status = cancelled ? JOB_STATUS.CANCELLED : JOB_STATUS.FAILED;
    job.error = message;
    job.message = message;
    job.updatedAt = nowIso();
    await jobRepository.put(job);
    emit(EVENTS.DOC_PROGRESS, {
      documentId,
      jobId: job.id,
      step: job.step,
      totalSteps: TOTAL_STEPS,
      progress: job.progress,
      message,
      status: cancelled ? DOC_STATUS.CANCELLED : DOC_STATUS.ERROR,
    });
    emit(EVENTS.JOB_PROGRESS, { ...job });
    throw err;
  }
}
