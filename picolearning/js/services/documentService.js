/**
 * Document CRUD — metadata import and cascading delete.
 */

import { DOC_STATUS, EVENTS, SETTINGS_KEYS } from '../core/constants.js';
import { emit } from '../core/eventBus.js';
import { uuid } from '../core/uuid.js';
import { nowIso } from '../utils/date.js';
import {
  documentRepository,
  pageRepository,
  chapterRepository,
  chunkRepository,
  embeddingRepository,
  questionRepository,
  flashcardRepository,
  progressRepository,
  jobRepository,
  keywordIndexRepository,
} from '../repositories/index.js';
import { setSetting } from './settingsService.js';

/**
 * @returns {Promise<object[]>}
 */
export async function listDocuments() {
  const docs = await documentRepository.getAll();
  return (docs || []).sort((a, b) =>
    String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
  );
}

/**
 * @param {string} id
 */
export async function getDocument(id) {
  return documentRepository.getById(id);
}

/**
 * Create a document record from a File (metadata only — bytes stay with the caller).
 *
 * @param {File} file
 * @param {{ title?: string }} [opts]
 */
export async function createDocumentFromFile(file, opts = {}) {
  const at = nowIso();
  const name = file?.name || 'document.pdf';
  const title =
    opts.title ||
    name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim() ||
    'Untitled document';

  const doc = {
    id: uuid(),
    title,
    fileName: name,
    fileSize: file?.size ?? 0,
    mimeType: file?.type || 'application/pdf',
    pageCount: 0,
    status: DOC_STATUS.IMPORTED,
    hasNativeText: null,
    source: 'upload',
    errorMessage: null,
    createdAt: at,
    updatedAt: at,
  };

  await documentRepository.put(doc);
  await setSetting(SETTINGS_KEYS.LAST_DOCUMENT_ID, doc.id);
  emit(EVENTS.DATA_CHANGED, { store: 'documents', action: 'create', id: doc.id });
  return doc;
}

/**
 * @param {string} id
 * @param {Partial<object>} patch
 */
export async function updateDocument(id, patch) {
  const existing = await documentRepository.getById(id);
  if (!existing) throw new Error(`Document not found: ${id}`);
  const updated = {
    ...existing,
    ...patch,
    id: existing.id,
    updatedAt: nowIso(),
  };
  await documentRepository.put(updated);
  emit(EVENTS.DATA_CHANGED, { store: 'documents', action: 'update', id });
  return updated;
}

/**
 * Delete a document and cascade all related IndexedDB records.
 * @param {string} documentId
 */
export async function deleteDocument(documentId) {
  if (!documentId) return;

  await Promise.all([
    pageRepository.deleteByIndex('documentId', documentId),
    chapterRepository.deleteByIndex('documentId', documentId),
    chunkRepository.deleteByIndex('documentId', documentId),
    embeddingRepository.deleteByIndex('documentId', documentId),
    questionRepository.deleteByIndex('documentId', documentId),
    flashcardRepository.deleteByIndex('documentId', documentId),
    progressRepository.deleteByIndex('documentId', documentId),
    jobRepository.deleteByIndex('documentId', documentId),
    keywordIndexRepository.deleteByIndex('documentId', documentId),
  ]);

  await documentRepository.delete(documentId);
  emit(EVENTS.DATA_CHANGED, { store: 'documents', action: 'delete', id: documentId });
}
