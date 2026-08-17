/**
 * Isolated PicoScan boundary for textbook/page OCR.
 * Embed ../picoscan/widget.html — never import PicoScan engine modules.
 *
 * Inspected integration (same as PicoExpense / PicoERP):
 * - Widget posts { source: 'picoscan', type: 'picoscan:ready' | 'picoscan:result' | ... }
 * - Same-origin window.PicoScan.scan(file) / getJSON() when the iframe has loaded
 */

import { getPicoScanWidgetUrl } from '../data/picoscanConfig.js';

const FRAME_ID = 'picoscan-embed-frame';
const UNAVAILABLE_MSG =
  'PicoScan is currently unavailable. Serve the sibling picoscan app on this origin (../picoscan/widget.html) or paste/extract text manually. Native PDF text extraction remains independent of PicoScan.';

/** @type {((doc: object) => void)|null} */
let resultWaiter = null;

/**
 * @returns {string}
 */
export function widgetUrl() {
  return getPicoScanWidgetUrl();
}

/**
 * @returns {Promise<boolean>}
 */
export async function isAvailable() {
  try {
    const url = widgetUrl();
    const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    return res.ok;
  } catch {
    try {
      const res = await fetch(widgetUrl(), { method: 'GET', cache: 'no-store' });
      return res.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Ensure hidden iframe exists and wait until PicoScan posts ready.
 * @returns {Promise<HTMLIFrameElement>}
 */
export async function ensureFrame() {
  bindMessageListener();
  let frame = /** @type {HTMLIFrameElement|null} */ (document.getElementById(FRAME_ID));
  if (!frame) {
    frame = document.createElement('iframe');
    frame.id = FRAME_ID;
    frame.title = 'PicoScan';
    frame.className = 'picoscan-embed';
    frame.setAttribute('referrerpolicy', 'same-origin');
    frame.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(frame);
  }
  if (!frame.src) frame.src = widgetUrl();
  await waitReady(frame, 12000);
  return frame;
}

/**
 * OCR a single page image / PDF page blob via PicoScan.
 * @param {File|Blob} file
 * @param {{ pageNumber?: number, documentType?: string }} [opts]
 * @returns {Promise<{ ok: boolean, text?: string, document?: object, message?: string, pageNumber?: number }>}
 */
export async function processPage(file, opts = {}) {
  const available = await isAvailable();
  if (!available) {
    return { ok: false, message: UNAVAILABLE_MSG, pageNumber: opts.pageNumber };
  }

  try {
    const frame = await ensureFrame();
    const api = frame.contentWindow?.PicoScan;
    let doc = null;
    if (api?.scan) {
      doc = await api.scan(file, {
        documentType: opts.documentType || 'Document',
      });
      if (api.getJSON) doc = api.getJSON() ?? doc;
    } else {
      doc = await waitResult(20000);
    }
    const text = extractTextFromScan(doc);
    return {
      ok: true,
      text,
      document: doc,
      pageNumber: opts.pageNumber,
    };
  } catch (err) {
    return {
      ok: false,
      message: err?.message || UNAVAILABLE_MSG,
      pageNumber: opts.pageNumber,
    };
  }
}

/**
 * OCR a multi-page document. Calls PicoScan when available; otherwise returns a clear message.
 * Placeholder-friendly: iterates files/blobs if provided, or a single document file.
 *
 * @param {File|Blob|Array<File|Blob>} input
 * @param {{ onProgress?: (p: { page: number, total: number }) => void, signal?: AbortSignal }} [opts]
 * @returns {Promise<{ ok: boolean, pages?: Array<{ pageNumber: number, text: string }>, message?: string }>}
 */
export async function processDocument(input, opts = {}) {
  const available = await isAvailable();
  if (!available) {
    return { ok: false, message: UNAVAILABLE_MSG };
  }

  const files = Array.isArray(input) ? input : [input];
  const pages = [];

  for (let i = 0; i < files.length; i++) {
    if (opts.signal?.aborted) {
      return { ok: false, message: 'OCR cancelled', pages };
    }
    const pageNumber = i + 1;
    const result = await processPage(files[i], { pageNumber });
    if (!result.ok) {
      return {
        ok: false,
        message: result.message || UNAVAILABLE_MSG,
        pages,
      };
    }
    pages.push({ pageNumber, text: result.text || '' });
    opts.onProgress?.({ page: pageNumber, total: files.length });
  }

  return { ok: true, pages };
}

/**
 * Optional progress hook — PicoScan may not expose fine-grained progress yet.
 * @returns {{ available: boolean, message: string }}
 */
export function getProgress() {
  return {
    available: false,
    message: 'PicoScan progress is reported per page via processDocument onProgress callbacks.',
  };
}

/**
 * @param {(doc: object) => void} handler
 */
export function onScanResult(handler) {
  bindMessageListener();
  window.addEventListener('picoscan-result', (ev) =>
    handler(/** @type {CustomEvent} */ (ev).detail)
  );
}

/**
 * @param {object|null|undefined} doc
 */
function extractTextFromScan(doc) {
  if (!doc) return '';
  if (typeof doc.text === 'string') return doc.text;
  if (typeof doc.fullText === 'string') return doc.fullText;
  if (Array.isArray(doc.pages)) {
    return doc.pages
      .map((p) => (typeof p === 'string' ? p : p?.text || ''))
      .filter(Boolean)
      .join('\n\n');
  }
  if (Array.isArray(doc.blocks)) {
    return doc.blocks.map((b) => b?.text || '').filter(Boolean).join('\n');
  }
  if (typeof doc.content === 'string') return doc.content;
  return '';
}

let bound = false;
function bindMessageListener() {
  if (bound) return;
  bound = true;
  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || data.source !== 'picoscan') return;
    if (data.type === 'picoscan:ready') {
      window.dispatchEvent(new CustomEvent('picoscan-ready', { detail: data }));
    }
    if (data.type === 'picoscan:result' && data.document) {
      window.dispatchEvent(new CustomEvent('picoscan-result', { detail: data.document }));
      if (resultWaiter) {
        resultWaiter(data.document);
        resultWaiter = null;
      }
    }
  });
}

/**
 * @param {HTMLIFrameElement} frame
 * @param {number} ms
 */
function waitReady(frame, ms) {
  return new Promise((resolve, reject) => {
    if (frame.contentWindow?.PicoScan) {
      resolve(frame);
      return;
    }
    const t = setTimeout(() => reject(new Error('PicoScan did not become ready')), ms);
    const onReady = () => {
      clearTimeout(t);
      window.removeEventListener('picoscan-ready', onReady);
      resolve(frame);
    };
    window.addEventListener('picoscan-ready', onReady);
  });
}

function waitResult(ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      resultWaiter = null;
      reject(new Error('PicoScan scan timed out'));
    }, ms);
    resultWaiter = (doc) => {
      clearTimeout(t);
      resolve(doc);
    };
  });
}

export { UNAVAILABLE_MSG };
