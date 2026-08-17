import { STORES } from '../core/constants.js';

/**
 * @param {IDBDatabase} db
 * @param {number} oldVersion
 * @param {number|null} _newVersion
 * @param {IDBTransaction} _tx
 */
export function migrate(db, oldVersion, _newVersion, _tx) {
  if (oldVersion < 1) createV1Stores(db);
}

/** @param {IDBDatabase} db */
function createV1Stores(db) {
  if (!db.objectStoreNames.contains(STORES.DOCUMENTS)) {
    const s = db.createObjectStore(STORES.DOCUMENTS, { keyPath: 'id' });
    s.createIndex('status', 'status', { unique: false });
    s.createIndex('updatedAt', 'updatedAt', { unique: false });
  }
  if (!db.objectStoreNames.contains(STORES.PAGES)) {
    const s = db.createObjectStore(STORES.PAGES, { keyPath: 'id' });
    s.createIndex('documentId', 'documentId', { unique: false });
    s.createIndex('pageNumber', 'pageNumber', { unique: false });
  }
  if (!db.objectStoreNames.contains(STORES.CHAPTERS)) {
    const s = db.createObjectStore(STORES.CHAPTERS, { keyPath: 'id' });
    s.createIndex('documentId', 'documentId', { unique: false });
    s.createIndex('sortOrder', 'sortOrder', { unique: false });
  }
  if (!db.objectStoreNames.contains(STORES.CHUNKS)) {
    const s = db.createObjectStore(STORES.CHUNKS, { keyPath: 'id' });
    s.createIndex('documentId', 'documentId', { unique: false });
    s.createIndex('chapterId', 'chapterId', { unique: false });
    s.createIndex('pageStart', 'pageStart', { unique: false });
  }
  if (!db.objectStoreNames.contains(STORES.EMBEDDINGS)) {
    const s = db.createObjectStore(STORES.EMBEDDINGS, { keyPath: 'id' });
    s.createIndex('documentId', 'documentId', { unique: false });
    s.createIndex('chunkId', 'chunkId', { unique: true });
  }
  if (!db.objectStoreNames.contains(STORES.QUESTIONS)) {
    const s = db.createObjectStore(STORES.QUESTIONS, { keyPath: 'id' });
    s.createIndex('documentId', 'documentId', { unique: false });
    s.createIndex('chapterId', 'chapterId', { unique: false });
    s.createIndex('questionType', 'questionType', { unique: false });
  }
  if (!db.objectStoreNames.contains(STORES.FLASHCARDS)) {
    const s = db.createObjectStore(STORES.FLASHCARDS, { keyPath: 'id' });
    s.createIndex('documentId', 'documentId', { unique: false });
    s.createIndex('chapterId', 'chapterId', { unique: false });
    s.createIndex('nextReviewAt', 'nextReviewAt', { unique: false });
  }
  if (!db.objectStoreNames.contains(STORES.LEARNING_PROGRESS)) {
    const s = db.createObjectStore(STORES.LEARNING_PROGRESS, { keyPath: 'id' });
    s.createIndex('documentId', 'documentId', { unique: false });
    s.createIndex('topicKey', 'topicKey', { unique: false });
  }
  if (!db.objectStoreNames.contains(STORES.QUIZ_ATTEMPTS)) {
    const s = db.createObjectStore(STORES.QUIZ_ATTEMPTS, { keyPath: 'id' });
    s.createIndex('documentId', 'documentId', { unique: false });
    s.createIndex('createdAt', 'createdAt', { unique: false });
  }
  if (!db.objectStoreNames.contains(STORES.MODELS)) {
    db.createObjectStore(STORES.MODELS, { keyPath: 'id' });
  }
  if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
    db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
  }
  if (!db.objectStoreNames.contains(STORES.JOBS)) {
    const s = db.createObjectStore(STORES.JOBS, { keyPath: 'id' });
    s.createIndex('status', 'status', { unique: false });
    s.createIndex('documentId', 'documentId', { unique: false });
  }
  if (!db.objectStoreNames.contains(STORES.KEYWORD_INDEX)) {
    const s = db.createObjectStore(STORES.KEYWORD_INDEX, { keyPath: 'id' });
    s.createIndex('documentId', 'documentId', { unique: false });
    s.createIndex('term', 'term', { unique: false });
  }
}
