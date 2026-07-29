/**
 * IndexedDB history for scanned documents.
 */

import { STORES } from '../core/constants.js';
import { withStore } from './idb.js';

/**
 * @param {import('../core/documentModel.js').ScanDocument} doc
 */
export async function saveDocument(doc) {
  return withStore(STORES.DOCUMENTS, 'readwrite', (store) => store.put(doc));
}

/**
 * @param {string} id
 * @returns {Promise<import('../core/documentModel.js').ScanDocument|undefined>}
 */
export async function getDocument(id) {
  return withStore(STORES.DOCUMENTS, 'readonly', (store) => store.get(id));
}

/**
 * @returns {Promise<import('../core/documentModel.js').ScanDocument[]>}
 */
export async function listDocuments() {
  const rows = await withStore(STORES.DOCUMENTS, 'readonly', (store) => store.getAll());
  return (rows || []).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

/**
 * @param {string} id
 */
export async function deleteDocument(id) {
  return withStore(STORES.DOCUMENTS, 'readwrite', (store) => store.delete(id));
}
