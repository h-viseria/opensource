/**
 * Phase 2 embedded widget API (stub shell + core wiring).
 * Full floating UI ships in a follow-up; public methods are stable.
 */

import { EVENTS } from '../core/constants.js';
import { on, emit } from '../core/eventBus.js';
import { scanFile } from '../engine/scanEngine.js';
import * as exportService from '../services/exportService.js';
import { fieldsToObject } from '../core/documentModel.js';

/** @type {import('../core/documentModel.js').ScanDocument|null} */
let lastDoc = null;
/** @type {boolean} */
let open = false;

/**
 * @param {Record<string, unknown>} [options]
 */
export function init(options = {}) {
  emit(EVENTS.LOG, { level: 'info', message: 'PicoScan widget init' });
  return { ok: true, options };
}

export function openWidget() {
  open = true;
  emit(EVENTS.WIDGET_OPENED);
}

export function closeWidget() {
  open = false;
  emit(EVENTS.WIDGET_CLOSED);
}

/**
 * @param {File|Blob} file
 * @param {import('../engine/scanEngine.js').ScanOptions} [opts]
 */
export async function scan(file, opts) {
  lastDoc = await scanFile(file, opts);
  try {
    window.parent?.postMessage(
      {
        source: 'picoscan',
        type: 'picoscan:result',
        document: exportService.documentToJson(lastDoc),
      },
      window.location.origin
    );
  } catch {
    /* ignore */
  }
  return lastDoc;
}

export function exportCSV() {
  if (!lastDoc) throw new Error('No scanned document');
  return exportService.exportCsv(lastDoc);
}

export function exportExcel() {
  if (!lastDoc) throw new Error('No scanned document');
  return exportService.exportExcel(lastDoc);
}

export function getJSON() {
  if (!lastDoc) throw new Error('No scanned document');
  return exportService.documentToJson(lastDoc);
}

export function getFields() {
  if (!lastDoc) throw new Error('No scanned document');
  return lastDoc.fields;
}

export function getFieldMap() {
  if (!lastDoc) throw new Error('No scanned document');
  return fieldsToObject(lastDoc);
}

export function isOpen() {
  return open;
}

export const PicoScan = {
  init,
  open: openWidget,
  close: closeWidget,
  scan,
  exportCSV,
  exportExcel,
  getJSON,
  getFields,
  getFieldMap,
  on,
  EVENTS,
};

export default PicoScan;
