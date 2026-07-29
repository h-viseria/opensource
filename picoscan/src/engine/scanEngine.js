/**
 * PicoScan Core Engine — shared by standalone app and embedded widget.
 */

import { EVENTS, DOCUMENT_TYPES } from '../core/constants.js';
import { emit } from '../core/eventBus.js';
import { createEmptyDocument } from '../core/documentModel.js';
import { loadImageFromFile, preprocessImage } from './preprocess.js';
import { detectOrientation, runOcr, scoreOcrResult } from './ocr.js';
import { getDocTypeProfile } from './docTypeProfile.js';
import { classifyDocument } from './classify.js';
import { extractDocument, extractFields } from './extract.js';
import { validateDocument } from './validate.js';
import * as historyDb from '../db/history.js';
import * as knowledgeService from '../services/knowledgeService.js';

/**
 * @typedef {Object} ScanOptions
 * @property {boolean} [grayscale]
 * @property {number} [contrast]
 * @property {number} [rotate] Manual clockwise degrees added on top of auto-orient
 * @property {boolean} [autoOrient=true] Detect upright orientation (OSD + multi-angle verify)
 * @property {boolean} [sharpen]
 * @property {string} [documentType] User-selected type (skips auto-classify when set)
 * @property {string} [password] PDF user/owner password when encrypted
 * @property {(msg: string) => void} [onStatus]
 */

const EMBEDDED_TEXT_MIN = 40;

/**
 * Full pipeline: ingest → (PDF text | auto-orient + OCR) → classify → extract → persist.
 * @param {File|Blob} file
 * @param {ScanOptions} [opts]
 */
export async function scanFile(file, opts = {}) {
  const onStatus = opts.onStatus || (() => {});
  emit(EVENTS.SCAN_STARTED, { name: file instanceof File ? file.name : 'blob' });
  emit(EVENTS.LOG, { level: 'info', message: 'Scan started' });

  try {
    onStatus('Loading document…');
    const loaded = await loadImageFromFile(file, { password: opts.password || '' });

    const embedded = String(loaded.embeddedText || '').trim();
    const typeHint = normalizeDocType(opts.documentType);
    const embeddedScore = scoreOcrResult({ text: embedded, confidence: 0.9 }, typeHint);

    /** @type {{ text: string, confidence: number, words: { text: string, confidence: number }[] }} */
    let ocr;
    /** @type {string} */
    let processed = loaded.dataUrl;
    /** @type {{ rotate: number, detectedDegrees: number, confidence: number, script: string|null, method: string }} */
    let orientMeta = {
      rotate: 0,
      detectedDegrees: 0,
      confidence: 0,
      script: null,
      method: 'none',
    };

    if (embedded.length >= EMBEDDED_TEXT_MIN && embeddedScore >= 0.45) {
      onStatus('Using PDF text layer…');
      emit(EVENTS.LOG, { level: 'ok', message: 'Using embedded PDF text (skipped OCR)' });
      ocr = { text: embedded, confidence: Math.min(0.95, 0.7 + embeddedScore * 0.2), words: [] };
      orientMeta.method = 'pdf-text';
      // Still build a readable preview (mild cleanup, no forced grayscale)
      processed = await preprocessImage(loaded.dataUrl, {
        grayscale: false,
        contrast: opts.contrast ?? 0,
        rotate: Number(opts.rotate) || 0,
        sharpen: false,
      });
    } else {
      if (typeHint) {
        emit(EVENTS.LOG, { level: 'info', message: `Document type hint: ${typeHint}` });
        onStatus(`Scanning as ${typeHint}…`);
      }
      const chosen = await resolveOrientationAndOcr(loaded.dataUrl, opts, onStatus, typeHint);
      ocr = chosen.ocr;
      processed = chosen.processed;
      orientMeta = chosen.orientMeta;
    }

    emit(EVENTS.OCR_COMPLETED, { textLength: ocr.text.length, confidence: ocr.confidence });
    emit(EVENTS.LOG, { level: 'ok', message: `OCR complete (${Math.round(ocr.confidence * 100)}%)` });

    /** @type {{ documentType: string, confidence: number, scores?: Record<string, number> }} */
    let classified;
    if (typeHint) {
      classified = { documentType: typeHint, confidence: 0.98, scores: { [typeHint]: 1 } };
      emit(EVENTS.LOG, { level: 'ok', message: `Using selected type: ${typeHint}` });
    } else {
      classified = classifyDocument(ocr.text);
      emit(EVENTS.LOG, {
        level: 'ok',
        message: `Classified as ${classified.documentType} (${Math.round(classified.confidence * 100)}%)`,
      });
    }
    emit(EVENTS.CLASSIFICATION_COMPLETED, classified);

    const knowledge = classified.documentType
      ? await knowledgeService.getMappingForCategory(classified.documentType)
      : null;
    if (knowledge) {
      emit(EVENTS.LOG, {
        level: 'info',
        message: `Applying knowledge base for “${classified.documentType}” (${knowledge.kind})`,
      });
    }

    const { fields, tables } = extractDocument(ocr.text, classified.documentType, { knowledge });
    emit(EVENTS.FIELDS_EXTRACTED, {
      count: fields.length,
      tableRows: tables.reduce((n, t) => n + (t.rows?.length || 0), 0),
    });
    if (tables[0]?.rows?.length) {
      emit(EVENTS.LOG, {
        level: 'ok',
        message: `Extracted ${tables[0].rows.length} transaction row(s)`,
      });
    }

    const orientedDims = await probeProcessedSize(processed, loaded);

    const doc = createEmptyDocument({
      documentType: classified.documentType,
      confidence: classified.confidence,
      fields,
      tables,
      rawText: ocr.text,
      previewDataUrl: processed,
      metadata: {
        sourceName: loaded.sourceName,
        ocrConfidence: ocr.confidence,
        width: orientedDims.width,
        height: orientedDims.height,
        engine: orientMeta.method === 'pdf-text' ? 'pdf.js text layer' : 'tesseract.js + local heuristics',
        documentTypeSource: typeHint ? 'user' : 'auto',
        knowledgeApplied: Boolean(knowledge),
        orientation: {
          autoOrient: opts.autoOrient !== false,
          detectedDegrees: orientMeta.detectedDegrees,
          appliedRotate: orientMeta.rotate,
          confidence: orientMeta.confidence,
          script: orientMeta.script,
          method: orientMeta.method,
        },
      },
    });

    const history = await historyDb.listDocuments();
    const issues = validateDocument(doc, history);
    doc.metadata.validation = issues;

    await historyDb.saveDocument(doc);
    emit(EVENTS.DOCUMENT_CHANGED, doc);
    emit(EVENTS.HISTORY_CHANGED);
    emit(EVENTS.LOG, { level: 'ok', message: 'Document saved to local history' });
    return doc;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emit(EVENTS.ERROR, { message });
    emit(EVENTS.LOG, { level: 'error', message });
    throw err;
  }
}

/**
 * OSD hint + multi-angle OCR scoring (picks upright rotation that yields real text).
 * @param {string} dataUrl
 * @param {ScanOptions} opts
 * @param {(msg: string) => void} onStatus
 * @param {string} [typeHint]
 */
async function resolveOrientationAndOcr(dataUrl, opts, onStatus, typeHint) {
  const manualRotate = Number(opts.rotate) || 0;
  const profile = getDocTypeProfile(typeHint || '');
  const preprocessBase = {
    grayscale: opts.grayscale != null ? opts.grayscale === true : profile.grayscale,
    contrast: opts.contrast ?? profile.contrast,
    sharpen: opts.sharpen != null ? opts.sharpen !== false : profile.sharpen,
  };

  if (opts.autoOrient === false) {
    const rotate = normalizeDegrees(manualRotate);
    onStatus(rotate ? `Preprocessing (rotate ${rotate}°)…` : 'Preprocessing…');
    const processed = await preprocessImage(dataUrl, { ...preprocessBase, rotate });
    const ocr = await runOcr(processed, onStatus, typeHint);
    return {
      processed,
      ocr,
      orientMeta: {
        rotate,
        detectedDegrees: 0,
        confidence: 0,
        script: null,
        method: 'manual',
      },
    };
  }

  let osd = { rotate: 0, detectedDegrees: 0, confidence: 0, script: null };
  try {
    osd = await detectOrientation(dataUrl, onStatus);
  } catch {
    /* already handled inside */
  }

  const angles = orderAngles(osd.rotate, manualRotate);
  /** @type {{ rotate: number, score: number, ocr: Awaited<ReturnType<typeof runOcr>>, processed: string }|null} */
  let best = null;

  for (const angle of angles) {
    onStatus(`Trying orientation ${angle}°…`);
    const probe = await preprocessImage(dataUrl, {
      ...preprocessBase,
      rotate: angle,
      maxWidth: 1400,
    });
    const ocr = await runOcr(probe, onStatus, typeHint);
    const score = scoreOcrResult(ocr, typeHint);
    emit(EVENTS.LOG, {
      level: 'info',
      message: `Orient ${angle}° score=${score.toFixed(2)} conf=${Math.round(ocr.confidence * 100)}% chars=${ocr.text.length}`,
    });

    if (!best || score > best.score) {
      best = { rotate: angle, score, ocr, processed: probe };
    }
    if (score >= 0.72 && ocr.confidence >= 0.55 && ocr.text.length > 80) break;
  }

  if (!best) {
    throw new Error('Orientation search produced no OCR result');
  }

  onStatus(`Preprocessing best orientation (${best.rotate}°)…`);
  const full = await preprocessImage(dataUrl, { ...preprocessBase, rotate: best.rotate });
  onStatus('Recognizing text (full resolution)…');
  const fullOcr = await runOcr(full, onStatus, typeHint);
  const fullScore = scoreOcrResult(fullOcr, typeHint);
  const useFull = fullScore >= best.score * 0.85;
  const finalOcr = useFull ? fullOcr : best.ocr;
  const finalProcessed = useFull ? full : best.processed;

  emit(EVENTS.LOG, {
    level: 'ok',
    message: `Auto-orient chose ${best.rotate}° (score ${best.score.toFixed(2)})`,
  });

  return {
    processed: finalProcessed,
    ocr: finalOcr,
    orientMeta: {
      rotate: best.rotate,
      detectedDegrees: osd.detectedDegrees,
      confidence: osd.confidence,
      script: osd.script,
      method: 'osd+multi-angle',
    },
  };
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeDocType(value) {
  const v = String(value || '').trim();
  if (!v || v === DOCUMENT_TYPES.UNKNOWN) return '';
  return v;
}

/**
 * Prefer OSD suggestion (plus manual offset), then remaining quarter-turns.
 * @param {number} osdRotate
 * @param {number} manualRotate
 */
function orderAngles(osdRotate, manualRotate) {
  const preferred = normalizeDegrees(osdRotate + manualRotate);
  const rest = [0, 90, 180, 270].filter((a) => a !== preferred);
  return [preferred, ...rest];
}

/**
 * @param {number} deg
 */
function normalizeDegrees(deg) {
  return ((Math.round(Number(deg) || 0) % 360) + 360) % 360;
}

/**
 * @param {string} processedDataUrl
 * @param {{ width: number, height: number }} fallback
 */
function probeProcessedSize(processedDataUrl, fallback) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: fallback.width, height: fallback.height });
    img.src = processedDataUrl;
  });
}

export {
  validateDocument,
  classifyDocument,
  extractFields,
  extractDocument,
  runOcr,
  preprocessImage,
  detectOrientation,
  scoreOcrResult,
};
