/**
 * Local OCR via Tesseract.js (WASM). Runs entirely in-browser.
 * Vendor: ./vendor/tesseract/
 */

import Tesseract from '../../vendor/tesseract/tesseract.esm.min.js';
import { getDocTypeProfile } from './docTypeProfile.js';

const { createWorker, PSM } = Tesseract;

const VENDOR = new URL('../../vendor/tesseract/', import.meta.url).href;

/** @type {import('tesseract.js').Worker|null} */
let worker = null;
/** @type {Promise<import('tesseract.js').Worker>|null} */
let bootPromise = null;

/**
 * @param {(msg: string) => void} [onStatus]
 */
export async function ensureOcrWorker(onStatus) {
  if (worker) return worker;
  if (bootPromise) return bootPromise;

  bootPromise = (async () => {
    onStatus?.('Loading OCR engine…');
    const w = await createWorker('eng', 1, {
      workerPath: `${VENDOR}worker.min.js`,
      corePath: VENDOR,
      langPath: VENDOR.replace(/\/$/, ''),
      // Required for worker.detect() (OSD / orientation)
      legacyCore: true,
      legacyLang: true,
      logger: (m) => {
        if (m.status === 'recognizing text' && typeof m.progress === 'number') {
          onStatus?.(`OCR ${Math.round(m.progress * 100)}%`);
        }
      },
    });
    await applyOcrParams(w, null);
    worker = w;
    onStatus?.('OCR ready');
    return w;
  })();

  try {
    return await bootPromise;
  } catch (err) {
    bootPromise = null;
    throw err;
  }
}

/**
 * @param {import('tesseract.js').Worker} w
 * @param {string|null|undefined} documentType
 */
async function applyOcrParams(w, documentType) {
  const profile = getDocTypeProfile(documentType || '');
  /** @type {Record<string, string>} */
  const params = {
    user_defined_dpi: '300',
    tessedit_pageseg_mode: String(profile.psm || PSM?.AUTO || '3'),
    preserve_interword_spaces: '1',
    tessedit_char_whitelist: '',
  };
  if (profile.whitelist) {
    params.tessedit_char_whitelist = profile.whitelist;
  }
  await w.setParameters(params);
}

/**
 * OSD: detect page orientation. Returns clockwise correction degrees.
 * @param {string} imageSource data URL or blob URL
 * @param {(msg: string) => void} [onStatus]
 * @returns {Promise<{ rotate: number, detectedDegrees: number, confidence: number, script: string|null }>}
 */
export async function detectOrientation(imageSource, onStatus) {
  const w = await ensureOcrWorker(onStatus);
  onStatus?.('Detecting orientation…');

  try {
    const { data } = await w.detect(imageSource);
    const rawDegrees = Number(data?.orientation_degrees) || 0;
    const detectedDegrees = ((Math.round(rawDegrees / 90) * 90) % 360 + 360) % 360;
    const rotate = detectedDegrees === 0 ? 0 : (360 - detectedDegrees) % 360;
    const confidence = Number(data?.orientation_confidence) || 0;
    const script = data?.script ? String(data.script) : null;

    if (rotate) {
      onStatus?.(`OSD suggests rotate ${rotate}° (conf ${confidence.toFixed(0)})`);
    } else {
      onStatus?.('OSD: upright');
    }

    return { rotate, detectedDegrees, confidence, script };
  } catch (err) {
    console.warn('[OCR] Orientation detect failed; continuing without OSD', err);
    onStatus?.('Orientation detect skipped');
    return { rotate: 0, detectedDegrees: 0, confidence: 0, script: null };
  } finally {
    try {
      await w.reinitialize('eng', 1);
      await applyOcrParams(w, null);
    } catch (err) {
      console.warn('[OCR] Failed to reinitialize eng after OSD', err);
      try {
        await w.terminate();
      } catch {
        /* ignore */
      }
      worker = null;
      bootPromise = null;
    }
  }
}

/**
 * Score OCR output for "looks like real document text" (not sideways junk).
 * @param {{ text: string, confidence: number }} ocr
 * @param {string} [documentTypeHint]
 */
export function scoreOcrResult(ocr, documentTypeHint) {
  const text = String(ocr?.text || '');
  if (!text.trim()) return 0;

  const chars = text.replace(/\s+/g, '');
  if (!chars.length) return 0;

  const useful = (chars.match(/[A-Za-z0-9<]/g) || []).length;
  const usefulRatio = useful / chars.length;
  const alphaWords = (text.match(/[A-Za-z]{3,}/g) || []).length;
  const hasPassportCue =
    /passport|nationality|surname|given\s*name|date\s*of\s*birth|P</i.test(text) ||
    /[A-Z0-9<]{20,}/.test(text.replace(/\s/g, ''));
  const hasInvoiceCue = /invoice|total|amount|gstin|receipt/i.test(text);

  let score = (Number(ocr.confidence) || 0) * 0.45 + usefulRatio * 0.35;
  score += Math.min(0.15, alphaWords * 0.01);
  if (hasPassportCue || hasInvoiceCue) score += 0.12;

  const profile = getDocTypeProfile(documentTypeHint || '');
  if (documentTypeHint && profile.scoreCues?.length) {
    const hits = profile.scoreCues.filter((re) => re.test(text)).length;
    score += Math.min(0.25, hits * 0.08);
  }

  if (usefulRatio < 0.45) score *= 0.4;
  if (chars.length < 20) score *= 0.5;
  return score;
}

/**
 * @param {string} imageSource data URL or blob URL
 * @param {(msg: string) => void} [onStatus]
 * @param {string} [documentType]
 * @returns {Promise<{ text: string, confidence: number, words: { text: string, confidence: number }[] }>}
 */
export async function runOcr(imageSource, onStatus, documentType) {
  const w = await ensureOcrWorker(onStatus);
  await applyOcrParams(w, documentType || null);
  onStatus?.('Recognizing text…');
  const result = await w.recognize(imageSource);
  const raw = result?.data || {};
  const words = Array.isArray(raw.words)
    ? raw.words
        .filter((wd) => wd?.text)
        .map((wd) => ({
          text: String(wd.text),
          confidence: Number(wd.confidence || 0) / 100,
        }))
    : [];

  return {
    text: String(raw.text || '').trim(),
    confidence: Number(raw.confidence || 0) / 100,
    words,
  };
}

export async function terminateOcrWorker() {
  if (worker) {
    await worker.terminate();
    worker = null;
    bootPromise = null;
  }
}
