/**
 * Inverted keyword index over document chunks (IndexedDB-backed).
 */

import { uuid } from '../core/uuid.js';
import { nowIso } from '../utils/date.js';
import { keywordIndexRepository, chunkRepository } from '../repositories/index.js';

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'if',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'as',
  'by',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'it',
  'its',
  'this',
  'that',
  'these',
  'those',
  'with',
  'from',
  'into',
  'about',
  'than',
  'then',
  'so',
  'not',
  'no',
  'do',
  'does',
  'did',
  'can',
  'could',
  'would',
  'should',
  'will',
  'just',
  'also',
  'such',
  'any',
  'all',
  'each',
  'other',
  'more',
  'most',
  'some',
  'may',
  'might',
  'must',
  'have',
  'has',
  'had',
  'you',
  'your',
  'we',
  'our',
  'they',
  'their',
  'he',
  'she',
  'his',
  'her',
]);

/**
 * Lowercase alphanumeric tokenization with stopword / short-token filter.
 * @param {string} text
 * @returns {string[]}
 */
export function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

/**
 * Build / replace inverted index postings for a document's chunks.
 *
 * @param {Array<{
 *   id: string,
 *   documentId: string,
 *   text?: string,
 *   pageStart?: number,
 *   pageEnd?: number,
 *   chapterTitle?: string,
 *   sectionTitle?: string,
 * }>} chunks
 * @returns {Promise<{ terms: number, postings: number }>}
 */
export async function buildIndexForChunks(chunks) {
  if (!chunks?.length) return { terms: 0, postings: 0 };

  const documentId = chunks[0].documentId;
  if (!documentId) throw new Error('buildIndexForChunks: chunks require documentId');

  // Clear prior index rows for this document
  try {
    await keywordIndexRepository.deleteByIndex('documentId', documentId);
  } catch {
    const existing = await keywordIndexRepository.getAllByIndex('documentId', documentId);
    for (const row of existing || []) {
      await keywordIndexRepository.delete(row.id);
    }
  }

  /** @type {Map<string, Map<string, number>>} term -> chunkId -> tf */
  const inverted = new Map();

  for (const chunk of chunks) {
    const tokens = tokenize(chunk.text || '');
    /** @type {Map<string, number>} */
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    for (const [term, count] of tf) {
      if (!inverted.has(term)) inverted.set(term, new Map());
      inverted.get(term).set(chunk.id, count);
    }
  }

  const now = nowIso();
  /** @type {object[]} */
  const rows = [];
  for (const [term, postingMap] of inverted) {
    const postings = [...postingMap.entries()].map(([chunkId, tf]) => ({ chunkId, tf }));
    rows.push({
      id: uuid(),
      documentId,
      term,
      postings,
      df: postings.length,
      updatedAt: now,
    });
  }

  await keywordIndexRepository.putMany(rows);
  return { terms: rows.length, postings: rows.reduce((n, r) => n + r.postings.length, 0) };
}

/**
 * Keyword search for a document.
 *
 * @param {string} query
 * @param {string} documentId
 * @param {{ topK?: number }} [opts]
 * @returns {Promise<Array<{
 *   chunkId: string,
 *   score: number,
 *   chunk: object|null,
 *   pageStart: number|null,
 *   pageEnd: number|null,
 *   chapter: string|null,
 *   section: string|null,
 * }>>}
 */
export async function searchKeywords(query, documentId, { topK = 10 } = {}) {
  const terms = tokenize(query);
  if (!terms.length || !documentId) return [];

  /** @type {Map<string, number>} chunkId -> score */
  const scores = new Map();
  const indexRows = await keywordIndexRepository.getAllByIndex('documentId', documentId);
  const byTerm = new Map((indexRows || []).map((r) => [r.term, r]));

  const N = Math.max(
    1,
    new Set(
      (indexRows || []).flatMap((r) => {
        if (r.postings?.length) return r.postings.map((p) => p.chunkId);
        if (Array.isArray(r.chunkIds)) return r.chunkIds;
        return [];
      }),
    ).size,
  );

  for (const term of terms) {
    const row = byTerm.get(term);
    // Prefer postings[{chunkId,tf}]; also accept demo/legacy {chunkIds,frequency}
    const postings =
      row?.postings?.length
        ? row.postings
        : Array.isArray(row?.chunkIds)
          ? row.chunkIds.map((chunkId) => ({ chunkId, tf: 1 }))
          : null;
    if (!postings?.length) continue;
    const df = row.df || postings.length;
    const idf = Math.log(1 + N / (1 + df));
    for (const { chunkId, tf } of postings) {
      const w = (tf || 1) * idf;
      scores.set(chunkId, (scores.get(chunkId) || 0) + w);
    }
  }

  const ranked = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(1, topK));

  /** @type {Array<{
   *   chunkId: string,
   *   score: number,
   *   chunk: object|null,
   *   pageStart: number|null,
   *   pageEnd: number|null,
   *   chapter: string|null,
   *   section: string|null,
   * }>} */
  const results = [];
  for (const [chunkId, score] of ranked) {
    const chunk = (await chunkRepository.getById(chunkId)) || null;
    results.push({
      chunkId,
      score,
      chunk,
      pageStart: chunk?.pageStart ?? null,
      pageEnd: chunk?.pageEnd ?? null,
      chapter: chunk?.chapterTitle ?? chunk?.chapter ?? null,
      section: chunk?.sectionTitle ?? chunk?.section ?? null,
    });
  }
  return results;
}
