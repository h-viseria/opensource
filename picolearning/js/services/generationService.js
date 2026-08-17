/**
 * Ensure quiz questions and flashcards exist for a document.
 * Heuristics first; optional LLM enrichment when a profile is ready.
 */

import { DIFFICULTY, EVENTS, QUESTION_TYPES } from '../core/constants.js';
import { emit } from '../core/eventBus.js';
import { uuid } from '../core/uuid.js';
import { nowIso } from '../utils/date.js';
import {
  generateFlashcardsFromChunks,
  generateMcqsHeuristic,
  parseMcqJson,
} from '../learning/learningEngine.js';
import { scheduleNext } from '../learning/spacedRepetition.js';
import { buildFlashcardPrompt, buildMcqPrompt } from '../ai/prompts.js';
import { modelManager } from '../ai/modelManager.js';
import { chunkRepository, flashcardRepository, questionRepository } from '../repositories/index.js';
import { getLlm } from './askService.js';

/**
 * @param {string} documentId
 * @param {{ minCount?: number, force?: boolean, useLlm?: boolean }} [opts]
 */
export async function ensureQuestionsForDoc(documentId, opts = {}) {
  const minCount = opts.minCount ?? 10;
  const existing = await questionRepository.getAllByIndex('documentId', documentId);
  const mcqs = (existing || []).filter(
    (q) => q.questionType === QUESTION_TYPES.MCQ || Array.isArray(q.options)
  );

  if (!opts.force && mcqs.length >= minCount) {
    return { questions: mcqs, created: 0, source: 'existing' };
  }

  const chunks = await chunkRepository.getAllByIndex('documentId', documentId);
  if (!chunks?.length) {
    return { questions: mcqs, created: 0, source: 'no-chunks' };
  }

  /** @type {object[]} */
  let generated = generateMcqsHeuristic(chunks, { limit: Math.max(minCount, 20) });

  const profile = await modelManager.getActiveProfile();
  const llmReady = opts.useLlm !== false && (await modelManager.isProfileReady(profile));

  if (llmReady) {
    try {
      const llm = await getLlm();
      if (!llm.isDemo) {
        const sample = chunks.slice(0, 8).map((c) => ({
          text: c.text,
          pageStart: c.pageStart,
          pageEnd: c.pageEnd,
          chapter: c.chapterTitle || c.chapter || null,
          section: c.sectionTitle || c.section || null,
        }));
        const { system, prompt } = buildMcqPrompt({
          topic: 'document overview',
          contexts: sample,
          count: Math.min(8, minCount),
          difficulty: DIFFICULTY.INTERMEDIATE,
        });
        const raw = await llm.generate({ prompt, system });
        const parsed = parseMcqJson(normalizeMcqLlmText(raw));
        if (parsed.questions?.length) {
          const enriched = parsed.questions.map((q) => ({
            ...q,
            id: q.id || uuid(),
            documentId,
            questionType: QUESTION_TYPES.MCQ,
            createdAt: nowIso(),
          }));
          generated = [...enriched, ...generated];
        }
      }
    } catch {
      /* keep heuristics */
    }
  }

  // De-dupe against existing by question text
  const seen = new Set(mcqs.map((q) => String(q.question || '').trim().toLowerCase()));
  /** @type {object[]} */
  const toSave = [];
  for (const q of generated) {
    const key = String(q.question || '').trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    toSave.push({
      ...q,
      id: q.id || uuid(),
      documentId,
      questionType: QUESTION_TYPES.MCQ,
      createdAt: q.createdAt || nowIso(),
    });
  }

  if (toSave.length) {
    await questionRepository.putMany(toSave);
    emit(EVENTS.DATA_CHANGED, { store: 'questions', documentId, action: 'ensure' });
  }

  const all = await questionRepository.getAllByIndex('documentId', documentId);
  return {
    questions: all || [],
    created: toSave.length,
    source: toSave.length ? 'generated' : 'existing',
  };
}

/**
 * @param {string} documentId
 * @param {{ minCount?: number, force?: boolean, useLlm?: boolean }} [opts]
 */
export async function ensureFlashcardsForDoc(documentId, opts = {}) {
  const minCount = opts.minCount ?? 8;
  const existing = await flashcardRepository.getAllByIndex('documentId', documentId);

  if (!opts.force && (existing || []).length >= minCount) {
    return { flashcards: existing || [], created: 0, source: 'existing' };
  }

  const chunks = await chunkRepository.getAllByIndex('documentId', documentId);
  if (!chunks?.length) {
    return { flashcards: existing || [], created: 0, source: 'no-chunks' };
  }

  /** @type {object[]} */
  let generated = generateFlashcardsFromChunks(chunks);

  const profile = await modelManager.getActiveProfile();
  const llmReady = opts.useLlm !== false && (await modelManager.isProfileReady(profile));

  if (llmReady) {
    try {
      const llm = await getLlm();
      if (!llm.isDemo) {
        const sample = chunks.slice(0, 8).map((c) => ({
          text: c.text,
          pageStart: c.pageStart,
          pageEnd: c.pageEnd,
          chapter: c.chapterTitle || c.chapter || null,
        }));
        const { system, prompt } = buildFlashcardPrompt({
          topic: 'document overview',
          contexts: sample,
          count: Math.min(12, minCount),
        });
        const raw = await llm.generate({ prompt, system });
        const cards = parseFlashcardJson(raw, documentId);
        if (cards.length) generated = [...cards, ...generated];
      }
    } catch {
      /* keep heuristics */
    }
  }

  const seen = new Set(
    (existing || []).map((c) => `${String(c.front || '').toLowerCase()}::${String(c.back || '').slice(0, 40).toLowerCase()}`)
  );
  /** @type {object[]} */
  const toSave = [];
  for (const card of generated) {
    const key = `${String(card.front || '').toLowerCase()}::${String(card.back || '').slice(0, 40).toLowerCase()}`;
    if (!card.front || !card.back || seen.has(key)) continue;
    seen.add(key);
    toSave.push({
      ...card,
      id: card.id || uuid(),
      documentId,
      streak: card.streak ?? 0,
      nextReviewAt: card.nextReviewAt || scheduleNext({ correct: true, streak: 0 }),
      createdAt: card.createdAt || nowIso(),
      updatedAt: nowIso(),
    });
  }

  if (toSave.length) {
    await flashcardRepository.putMany(toSave);
    emit(EVENTS.DATA_CHANGED, { store: 'flashcards', documentId, action: 'ensure' });
  }

  const all = await flashcardRepository.getAllByIndex('documentId', documentId);
  return {
    flashcards: all || [],
    created: toSave.length,
    source: toSave.length ? 'generated' : 'existing',
  };
}

/**
 * Map prompt schema (stem / answerIndex) into parseMcqJson shape when needed.
 * @param {string} text
 */
function normalizeMcqLlmText(text) {
  const raw = String(text || '').trim();
  if (!raw) return raw;
  let jsonStr = raw;
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) jsonStr = fence[1].trim();
  try {
    const parsed = JSON.parse(jsonStr);
    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.questions)
        ? parsed.questions
        : null;
    if (!list) return raw;
    const mapped = list.map((item) => {
      if (item?.question && item?.correctAnswer) return item;
      const options = item?.options;
      const idx = Number(item?.answerIndex);
      const correct =
        Array.isArray(options) && Number.isFinite(idx) ? options[idx] : item?.correctAnswer || item?.answer;
      return {
        ...item,
        question: item.question || item.stem,
        correctAnswer: correct,
      };
    });
    return JSON.stringify(mapped);
  } catch {
    return raw;
  }
}

/**
 * @param {string} text
 * @param {string} documentId
 */
function parseFlashcardJson(text, documentId) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  let jsonStr = raw;
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) jsonStr = fence[1].trim();
  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return [];
  }
  const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.flashcards) ? parsed.flashcards : [];
  return list
    .filter((c) => c && c.front && c.back)
    .map((c) => ({
      id: uuid(),
      documentId,
      front: String(c.front).trim(),
      back: String(c.back).trim(),
      pageStart: c.pageStart ?? null,
      pageEnd: c.pageEnd ?? null,
      difficulty: DIFFICULTY.BEGINNER,
      createdAt: nowIso(),
    }));
}
