/**
 * Isolated PicoScan boundary. Inspected integration:
 * - Embed ../picoscan/widget.html in an iframe (same origin)
 * - Widget posts { source: 'picoscan', type: 'picoscan:ready' | 'picoscan:close' | 'picoscan:result' }
 * - Same-origin window.PicoScan.scan(file) / getJSON() when the iframe has loaded
 * PicoExpense never imports PicoScan engine modules.
 */

import { getPicoScanWidgetUrl } from '../data/picoscanConfig.js';

const FRAME_ID = 'picoscan-embed-frame';

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
 * Scan a local File via PicoScan's public widget API (same origin).
 * @param {File|Blob} file
 */
export async function extract(file) {
  const available = await isAvailable();
  if (!available) return null;
  const frame = await ensureFrame();
  const api = frame.contentWindow?.PicoScan;
  if (api?.scan) {
    const doc = await api.scan(file, { documentType: 'Receipt' });
    if (api.getJSON) return api.getJSON();
    return doc;
  }
  return waitResult(20000);
}

/**
 * @param {(doc: object) => void} handler
 */
export function onScanResult(handler) {
  bindMessageListener();
  window.addEventListener('picoscan-result', (ev) => handler(/** @type {CustomEvent} */ (ev).detail));
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
      resolve();
      return;
    }
    const t = setTimeout(() => reject(new Error('PicoScan did not become ready')), ms);
    const onReady = () => {
      clearTimeout(t);
      window.removeEventListener('picoscan-ready', onReady);
      resolve();
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
