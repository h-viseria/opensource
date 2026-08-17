/**
 * Vector similarity search over stored chunk embeddings.
 */

import { embeddingRepository, chunkRepository } from '../repositories/index.js';
import { cosineSimilarity } from '../ai/embeddings.js';

/**
 * @param {ArrayLike<number>|Float32Array} queryVec
 * @param {string} documentId
 * @param {number} [topK]
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
export async function searchVectors(queryVec, documentId, topK = 10) {
  if (!queryVec?.length || !documentId) return [];

  const rows = await embeddingRepository.getAllByIndex('documentId', documentId);
  if (!rows?.length) return [];

  /** @type {{ chunkId: string, score: number, embeddingId: string }[]} */
  const scored = [];
  for (const row of rows) {
    const vec = row.vector || row.embedding;
    if (!vec?.length) continue;
    // Dim mismatch — skip (hash vs MiniLM)
    if (vec.length !== queryVec.length) continue;
    const score = cosineSimilarity(queryVec, vec);
    if (score <= 0) continue;
    scored.push({
      chunkId: row.chunkId,
      score,
      embeddingId: row.id,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, Math.max(1, topK));

  const results = [];
  for (const item of top) {
    const chunk = (await chunkRepository.getById(item.chunkId)) || null;
    results.push({
      chunkId: item.chunkId,
      score: item.score,
      chunk,
      pageStart: chunk?.pageStart ?? null,
      pageEnd: chunk?.pageEnd ?? null,
      chapter: chunk?.chapterTitle ?? chunk?.chapter ?? null,
      section: chunk?.sectionTitle ?? chunk?.section ?? null,
    });
  }
  return results;
}
