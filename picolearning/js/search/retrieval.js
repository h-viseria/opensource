/**
 * Hybrid retrieval: keyword + vector, merge / dedupe by chunkId.
 */

import { searchKeywords } from './keywordIndex.js';
import { searchVectors } from './vectorIndex.js';
import { HashEmbeddingProvider, embedText } from '../ai/embeddings.js';

/**
 * @typedef {{
 *   chunk: object|null,
 *   score: number,
 *   pageStart: number|null,
 *   pageEnd: number|null,
 *   chapter: string|null,
 *   section: string|null,
 *   chunkId: string,
 *   text?: string,
 * }} RetrievalHit
 */

/**
 * Retrieve relevant chunks for a query within a document.
 *
 * @param {string} query
 * @param {{
 *   documentId: string,
 *   topK?: number,
 *   embedFn?: ((text: string) => Promise<Float32Array|number[]>)|null,
 *   keywordWeight?: number,
 *   vectorWeight?: number,
 * }} opts
 * @returns {Promise<RetrievalHit[]>}
 */
export async function retrieve(query, opts = {}) {
  const {
    documentId,
    topK = 8,
    embedFn = null,
    keywordWeight = 0.45,
    vectorWeight = 0.55,
  } = opts;

  if (!documentId || !String(query || '').trim()) return [];

  const fetchK = Math.max(topK * 2, topK);

  const keywordHits = await searchKeywords(query, documentId, { topK: fetchK });

  /** @type {Awaited<ReturnType<typeof searchVectors>>} */
  let vectorHits = [];
  try {
    const vec = embedFn
      ? await embedFn(query)
      : await embedText(query, new HashEmbeddingProvider());
    if (vec?.length) {
      vectorHits = await searchVectors(vec, documentId, fetchK);
    }
  } catch {
    vectorHits = [];
  }

  const kwNorm = normalizeScores(keywordHits);
  const vecNorm = normalizeScores(vectorHits);

  /** @type {Map<string, RetrievalHit & { _kw: number, _vec: number }>} */
  const merged = new Map();

  for (const h of kwNorm) {
    merged.set(h.chunkId, {
      chunkId: h.chunkId,
      chunk: h.chunk,
      pageStart: h.pageStart,
      pageEnd: h.pageEnd,
      chapter: h.chapter,
      section: h.section,
      score: h.norm * keywordWeight,
      text: h.chunk?.text || '',
      _kw: h.norm,
      _vec: 0,
    });
  }

  for (const h of vecNorm) {
    const existing = merged.get(h.chunkId);
    if (existing) {
      existing._vec = h.norm;
      existing.score = existing._kw * keywordWeight + h.norm * vectorWeight;
      if (!existing.chunk && h.chunk) existing.chunk = h.chunk;
      if (!existing.text) existing.text = h.chunk?.text || '';
      existing.pageStart ??= h.pageStart;
      existing.pageEnd ??= h.pageEnd;
      existing.chapter ??= h.chapter;
      existing.section ??= h.section;
    } else {
      merged.set(h.chunkId, {
        chunkId: h.chunkId,
        chunk: h.chunk,
        pageStart: h.pageStart,
        pageEnd: h.pageEnd,
        chapter: h.chapter,
        section: h.section,
        score: h.norm * vectorWeight,
        text: h.chunk?.text || '',
        _kw: 0,
        _vec: h.norm,
      });
    }
  }

  return [...merged.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, topK))
    .map(({ _kw, _vec, ...rest }) => rest);
}

/**
 * Min-max normalize hit scores to [0,1].
 * @param {Array<{ chunkId: string, score: number, chunk: any, pageStart: any, pageEnd: any, chapter: any, section: any }>} hits
 */
function normalizeScores(hits) {
  if (!hits?.length) return [];
  let min = Infinity;
  let max = -Infinity;
  for (const h of hits) {
    if (h.score < min) min = h.score;
    if (h.score > max) max = h.score;
  }
  const span = max - min || 1;
  return hits.map((h) => ({
    ...h,
    norm: (h.score - min) / span,
  }));
}
