/**
 * Retrieval-augmented answering over local textbook chunks.
 */

import { buildRagPrompt } from './prompts.js';
import { DemoLLMProvider } from './providers.js';

/**
 * @typedef {{
 *   chunk?: object,
 *   text?: string,
 *   score?: number,
 *   pageStart?: number|null,
 *   pageEnd?: number|null,
 *   chapter?: string|null,
 *   section?: string|null,
 *   chunkId?: string,
 * }} RetrievedHit
 */

/**
 * Answer a question using retrieved document chunks + an LLM (or DemoLLM).
 *
 * @param {{
 *   question: string,
 *   documentId: string,
 *   retrieveFn: (query: string, opts: { documentId: string }) => Promise<RetrievedHit[]|{ hits?: RetrievedHit[] }>,
 *   llm?: { generate: (opts: { prompt: string, system?: string, context?: string }) => Promise<string> }|null,
 *   topK?: number,
 * }} opts
 * @returns {Promise<{ answer: string, sources: object[], grounded: boolean }>}
 */
export async function answerQuestion({
  question,
  documentId,
  retrieveFn,
  llm = null,
  topK = 6,
} = {}) {
  const q = String(question || '').trim();
  if (!q) {
    return {
      answer: 'Please enter a question.',
      sources: [],
      grounded: false,
    };
  }
  if (!documentId) {
    return {
      answer: 'No document selected.',
      sources: [],
      grounded: false,
    };
  }
  if (typeof retrieveFn !== 'function') {
    throw new Error('answerQuestion requires retrieveFn');
  }

  const raw = await retrieveFn(q, { documentId, topK });
  const hits = normalizeHits(raw);

  if (!hits.length) {
    return {
      answer:
        'No relevant passages were found in this document. I will not invent an answer. Try different keywords or another chapter.',
      sources: [],
      grounded: false,
    };
  }

  const contexts = hits.map((h) => ({
    text: h.text || h.chunk?.text || '',
    pageStart: h.pageStart ?? h.chunk?.pageStart ?? null,
    pageEnd: h.pageEnd ?? h.chunk?.pageEnd ?? null,
    chapter: h.chapter ?? h.chunk?.chapterTitle ?? h.chunk?.chapter ?? null,
    section: h.section ?? h.chunk?.sectionTitle ?? h.chunk?.section ?? null,
    score: h.score,
  }));

  const { system, prompt } = buildRagPrompt({ question: q, contexts });
  const provider = llm || new DemoLLMProvider();
  const contextBlob = contexts.map((c) => c.text).join('\n\n');

  let answer = '';
  try {
    answer = await provider.generate({
      prompt,
      system,
      context: contextBlob,
    });
  } catch (err) {
    // Fall back to demo extraction if the real LLM fails
    const demo = new DemoLLMProvider();
    answer = await demo.generate({ prompt, system, context: contextBlob });
    if (!answer) {
      const detail = err instanceof Error ? err.message : String(err);
      answer = `Could not generate an answer (${detail}).`;
    }
  }

  const sources = hits.map((h) => ({
    chunkId: h.chunkId || h.chunk?.id || null,
    pageStart: h.pageStart ?? h.chunk?.pageStart ?? null,
    pageEnd: h.pageEnd ?? h.chunk?.pageEnd ?? null,
    chapter: h.chapter ?? h.chunk?.chapterTitle ?? h.chunk?.chapter ?? null,
    section: h.section ?? h.chunk?.sectionTitle ?? h.chunk?.section ?? null,
    score: h.score ?? 0,
    excerpt: truncate(h.text || h.chunk?.text || '', 240),
  }));

  const grounded = contexts.some((c) => (c.text || '').trim().length > 0) && String(answer || '').trim().length > 0;

  return {
    answer: String(answer || '').trim(),
    sources,
    grounded,
  };
}

/**
 * @param {any} raw
 * @returns {RetrievedHit[]}
 */
function normalizeHits(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (Array.isArray(raw.hits)) return raw.hits.filter(Boolean);
  if (Array.isArray(raw.results)) return raw.results.filter(Boolean);
  return [];
}

/**
 * @param {string} text
 * @param {number} max
 */
function truncate(text, max) {
  const s = String(text || '');
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}
