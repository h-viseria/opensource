/**
 * PDF.js loader + native text inspection / extraction.
 * Native text path is independent of PicoScan OCR.
 */

const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs';
const WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs';

const SAMPLE_PAGES = 5;
const NATIVE_TEXT_AVG_CHARS = 40;

/** @type {Promise<any>|null} */
let pdfjsPromise = null;

/**
 * @returns {Promise<any>}
 */
async function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import(/* @vite-ignore */ PDFJS_URL).then((mod) => {
      const pdfjs = mod.default ?? mod;
      pdfjs.GlobalWorkerOptions.workerSrc = WORKER_URL;
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

/**
 * @param {AbortSignal} [signal]
 */
function throwIfAborted(signal) {
  if (signal?.aborted) {
    const err = new Error('PDF extraction cancelled');
    err.name = 'AbortError';
    throw err;
  }
}

/**
 * @param {any} page
 * @returns {Promise<string>}
 */
async function pageToText(page) {
  const content = await page.getTextContent();
  const parts = [];
  for (const item of content.items || []) {
    if (item && typeof item.str === 'string' && item.str.length) {
      parts.push(item.str);
      if (item.hasEOL) parts.push('\n');
      else parts.push(' ');
    }
  }
  return parts.join('').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Inspect a PDF buffer for page count, title, and native-text heuristic.
 * Samples the first N pages; average extracted chars > 40 ⇒ hasNativeText.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Promise<{ pageCount: number, hasNativeText: boolean, title: string }>}
 */
export async function inspectPdf(arrayBuffer) {
  const pdfjs = await loadPdfjs();
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer.slice(0) });
  const pdf = await loadingTask.promise;
  try {
    const pageCount = pdf.numPages || 0;
    let title = '';
    try {
      const meta = await pdf.getMetadata();
      title = String(meta?.info?.Title || '').trim();
    } catch {
      title = '';
    }

    const sampleCount = Math.min(SAMPLE_PAGES, pageCount);
    let totalChars = 0;
    for (let i = 1; i <= sampleCount; i++) {
      const page = await pdf.getPage(i);
      const text = await pageToText(page);
      totalChars += text.replace(/\s+/g, '').length;
    }
    const avgChars = sampleCount > 0 ? totalChars / sampleCount : 0;
    const hasNativeText = avgChars > NATIVE_TEXT_AVG_CHARS;

    return { pageCount, hasNativeText, title };
  } finally {
    try {
      await pdf.destroy();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Extract native text from every page.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @param {{ onProgress?: (p: { page: number, total: number }) => void, signal?: AbortSignal }} [opts]
 * @returns {Promise<Array<{ pageNumber: number, text: string }>>}
 */
export async function extractNativeText(arrayBuffer, opts = {}) {
  const { onProgress, signal } = opts;
  throwIfAborted(signal);

  const pdfjs = await loadPdfjs();
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer.slice(0) });
  const pdf = await loadingTask.promise;
  const pages = [];

  try {
    const total = pdf.numPages || 0;
    for (let pageNumber = 1; pageNumber <= total; pageNumber++) {
      throwIfAborted(signal);
      const page = await pdf.getPage(pageNumber);
      const text = await pageToText(page);
      pages.push({ pageNumber, text });
      onProgress?.({ page: pageNumber, total });
    }
    return pages;
  } finally {
    try {
      await pdf.destroy();
    } catch {
      /* ignore */
    }
  }
}
