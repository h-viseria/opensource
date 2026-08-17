/**
 * Heuristic / demo content generation + LLM MCQ JSON validation.
 * Deterministic flashcards & cloze MCQs work without an LLM.
 */

import { uuid } from '../core/uuid.js';
import { DIFFICULTY, QUESTION_TYPES } from '../core/constants.js';
import { nowIso } from '../utils/date.js';
import { validateMcq } from './quizEngine.js';

const DEF_RE =
  /\b([A-Z][A-Za-z0-9][\w\s\-']{1,60}?)\s+(?:is|are)\s+([^.]{10,180})\./g;

/**
 * Build definition-style flashcards from sentences containing "is" / "are".
 * Deterministic: same chunk text → same fronts/backs (stable ids per content hash).
 *
 * @param {Array<{ id?: string, documentId?: string, chapterId?: string, chapterTitle?: string, text: string, pageStart?: number, pageEnd?: number }>} chunks
 */
export function generateFlashcardsFromChunks(chunks) {
  /** @type {object[]} */
  const cards = [];
  const seen = new Set();

  for (const chunk of chunks || []) {
    const text = String(chunk.text || '');
    DEF_RE.lastIndex = 0;
    let m;
    while ((m = DEF_RE.exec(text)) !== null) {
      const term = clean(m[1]);
      const definition = clean(m[2]);
      if (!term || !definition || term.split(' ').length > 8) continue;
      if (/^(this|that|there|it|these|those|he|she|they)$/i.test(term)) continue;

      const key = `${term.toLowerCase()}::${definition.toLowerCase().slice(0, 80)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const topicLabel = chunk.chapterTitle || chunk.sectionTitle || null;
      cards.push({
        id: uuid(),
        documentId: chunk.documentId || null,
        chapterId: chunk.chapterId || null,
        chapterTitle: chunk.chapterTitle || null,
        topicKey: chunk.chapterId || 'flashcards',
        topicLabel: topicLabel || 'Flashcards',
        sourceChunkIds: chunk.id ? [chunk.id] : [],
        front: `What ${/\bare\b/i.test(m[0]) ? 'are' : 'is'} ${term}?`,
        back: capitalize(definition),
        pageStart: chunk.pageStart ?? null,
        pageEnd: chunk.pageEnd ?? null,
        difficulty: DIFFICULTY.BEGINNER,
        createdAt: nowIso(),
      });
    }
  }

  return cards;
}

/**
 * Cloze-style MCQs for demo mode without an LLM.
 * Picks a keyword from the chunk, blanks it, and invents simple distractors.
 *
 * @param {Array<{ id?: string, documentId?: string, chapterId?: string, chapterTitle?: string, sectionTitle?: string, text: string, keywords?: string[], pageStart?: number, pageEnd?: number }>} chunks
 * @param {{ maxPerChunk?: number, limit?: number }} [opts]
 */
export function generateMcqsHeuristic(chunks, opts = {}) {
  const maxPerChunk = opts.maxPerChunk ?? 1;
  const limit = opts.limit ?? 40;
  /** @type {object[]} */
  const out = [];

  for (const chunk of chunks || []) {
    if (out.length >= limit) break;
    const keywords = (chunk.keywords || extractSimpleKeywords(chunk.text)).slice(0, 6);
    let made = 0;
    for (const kw of keywords) {
      if (out.length >= limit || made >= maxPerChunk) break;
      const sentence = findSentenceWith(chunk.text, kw);
      if (!sentence) continue;
      const blanked = sentence.replace(new RegExp(`\\b${escapeRe(kw)}\\b`, 'i'), '____');
      if (blanked === sentence) continue;

      const distractors = keywords.filter((k) => k.toLowerCase() !== kw.toLowerCase()).slice(0, 3);
      while (distractors.length < 3) {
        distractors.push(fallbackDistractor(kw, distractors.length));
      }
      const options = shuffleStable([kw, ...distractors.slice(0, 3)], chunk.id || kw);
      const topicLabel = chunk.chapterTitle || chunk.sectionTitle || 'General';

      const q = {
        id: uuid(),
        documentId: chunk.documentId || null,
        chapterId: chunk.chapterId || null,
        chapterTitle: chunk.chapterTitle || null,
        sourceChunkIds: chunk.id ? [chunk.id] : [],
        questionType: QUESTION_TYPES.MCQ,
        question: `Fill in the blank:\n${blanked}`,
        options,
        correctAnswer: options.find((o) => o.toLowerCase() === kw.toLowerCase()) || kw,
        explanation: `From the source text: "${sentence}"`,
        difficulty: DIFFICULTY.INTERMEDIATE,
        topicKey: chunk.chapterId || 'general',
        topicLabel,
        pageStart: chunk.pageStart ?? null,
        pageEnd: chunk.pageEnd ?? null,
      };

      try {
        validateMcq(q);
        out.push(q);
        made += 1;
      } catch {
        /* skip malformed */
      }
    }
  }

  return out;
}

/**
 * Parse and validate MCQ JSON from an LLM response.
 * Accepts a raw JSON array, `{ questions: [...] }`, or fenced ```json blocks.
 *
 * @param {string} text
 * @returns {{ ok: true, questions: object[] } | { ok: false, error: string, questions: object[] }}
 */
export function parseMcqJson(text) {
  const raw = String(text || '').trim();
  if (!raw) return { ok: false, error: 'Empty MCQ JSON', questions: [] };

  let jsonStr = raw;
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) jsonStr = fence[1].trim();

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    return { ok: false, error: `Invalid JSON: ${err.message}`, questions: [] };
  }

  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.questions)
      ? parsed.questions
      : null;

  if (!list) {
    return { ok: false, error: 'Expected an array of MCQs or { questions: [] }', questions: [] };
  }

  /** @type {object[]} */
  const questions = [];
  /** @type {string[]} */
  const errors = [];

  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    const normalized = {
      id: item.id || uuid(),
      questionType: QUESTION_TYPES.MCQ,
      question: item.question,
      options: item.options,
      correctAnswer: item.correctAnswer ?? item.answer,
      explanation: item.explanation || '',
      difficulty: item.difficulty || DIFFICULTY.INTERMEDIATE,
      documentId: item.documentId ?? null,
      chapterId: item.chapterId ?? null,
      sourceChunkIds: item.sourceChunkIds || [],
      pageStart: item.pageStart ?? item.sourcePage ?? null,
      pageEnd: item.pageEnd ?? null,
      topicKey: item.topicKey || item.chapterId || 'general',
      topicLabel: item.topicLabel || item.chapterTitle || item.chapter || null,
      chapterTitle: item.chapterTitle || item.chapter || null,
    };
    try {
      validateMcq(normalized);
      questions.push(normalized);
    } catch (err) {
      errors.push(`Question ${i + 1}: ${err.message}`);
    }
  }

  if (!questions.length) {
    return {
      ok: false,
      error: errors.join('; ') || 'All MCQs rejected as malformed',
      questions: [],
    };
  }

  return {
    ok: errors.length === 0,
    error: errors.length ? errors.join('; ') : undefined,
    questions,
  };
}

/** @param {string} s */
function clean(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** @param {string} s */
function capitalize(s) {
  const t = clean(s);
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

/** @param {string} text */
function extractSimpleKeywords(text) {
  const STOP = new Set(['the', 'and', 'for', 'that', 'with', 'from', 'this', 'are', 'was']);
  const tf = new Map();
  for (const t of String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w))) {
    tf.set(t, (tf.get(t) || 0) + 1);
  }
  return [...tf.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([w]) => w);
}

/**
 * @param {string} text
 * @param {string} kw
 */
function findSentenceWith(text, kw) {
  const parts = String(text || '').split(/(?<=[.!?])\s+/);
  const re = new RegExp(`\\b${escapeRe(kw)}\\b`, 'i');
  return parts.find((s) => re.test(s) && s.length > 20 && s.length < 220) || null;
}

/** @param {string} s */
function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {string} kw
 * @param {number} i
 */
function fallbackDistractor(kw, i) {
  const pool = ['energy', 'force', 'mass', 'velocity', 'distance', 'time', 'vector', 'scalar'];
  const lower = kw.toLowerCase();
  const pick = pool.filter((p) => p !== lower);
  return pick[i % pick.length] || `option-${i + 1}`;
}

/**
 * Deterministic shuffle from a seed string (demo reproducibility).
 * @param {string[]} arr
 * @param {string} seed
 */
function shuffleStable(arr, seed) {
  const out = [...arr];
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const j = Math.abs(h) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
