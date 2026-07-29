/**
 * IndexedDB knowledge-base + custom categories.
 */

import { STORES } from '../core/constants.js';
import { withStore } from './idb.js';

/**
 * @typedef {Object} KnowledgeFieldHint
 * @property {string} label
 * @property {string} key
 * @property {string[]} examples
 */

/**
 * @typedef {Object} KnowledgeMapping
 * @property {'table'|'fields'|'mixed'} kind
 * @property {KnowledgeFieldHint[]} fields
 * @property {{ headers: string[], sampleRowCount: number }} [table]
 */

/**
 * @typedef {Object} KnowledgeEntry
 * @property {string} id
 * @property {string} category
 * @property {string} name
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {string} sourceDocumentName
 * @property {string} sourceCsvName
 * @property {string} textSnippet
 * @property {KnowledgeMapping} mapping
 * @property {string} rawCsv
 */

/**
 * @param {KnowledgeEntry} entry
 */
export async function saveKnowledge(entry) {
  return withStore(STORES.KNOWLEDGE, 'readwrite', (store) => store.put(entry));
}

/**
 * @param {string} id
 */
export async function getKnowledge(id) {
  return withStore(STORES.KNOWLEDGE, 'readonly', (store) => store.get(id));
}

/**
 * @returns {Promise<KnowledgeEntry[]>}
 */
export async function listKnowledge() {
  const rows = await withStore(STORES.KNOWLEDGE, 'readonly', (store) => store.getAll());
  return (rows || []).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

/**
 * @param {string} category
 * @returns {Promise<KnowledgeEntry[]>}
 */
export async function listKnowledgeByCategory(category) {
  const all = await listKnowledge();
  const cat = String(category || '').trim().toLowerCase();
  return all.filter((e) => String(e.category || '').trim().toLowerCase() === cat);
}

/**
 * @param {string} id
 */
export async function deleteKnowledge(id) {
  return withStore(STORES.KNOWLEDGE, 'readwrite', (store) => store.delete(id));
}

export async function clearKnowledge() {
  return withStore(STORES.KNOWLEDGE, 'readwrite', (store) => store.clear());
}

/**
 * @param {{ name: string, createdAt?: string }} category
 */
export async function saveCategory(category) {
  const name = String(category.name || '').trim();
  if (!name) throw new Error('Category name required');
  return withStore(STORES.CATEGORIES, 'readwrite', (store) =>
    store.put({ name, createdAt: category.createdAt || new Date().toISOString() })
  );
}

/**
 * @returns {Promise<{ name: string, createdAt?: string }[]>}
 */
export async function listCategories() {
  const rows = await withStore(STORES.CATEGORIES, 'readonly', (store) => store.getAll());
  return (rows || []).sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/**
 * @param {string} name
 */
export async function deleteCategory(name) {
  return withStore(STORES.CATEGORIES, 'readwrite', (store) => store.delete(name));
}

export async function clearCategories() {
  return withStore(STORES.CATEGORIES, 'readwrite', (store) => store.clear());
}
