/**
 * Quiz selection and scoring — deterministic, no LLM.
 */

import { LEARNING_MODES, QUESTION_TYPES } from '../core/constants.js';

/**
 * Reject malformed MCQs. Returns true if valid; throws Error with reason if not.
 * @param {object} q
 */
export function validateMcq(q) {
  if (!q || typeof q !== 'object') throw new Error('MCQ must be an object');
  if (typeof q.question !== 'string' || !q.question.trim()) {
    throw new Error('MCQ missing question text');
  }
  if (!Array.isArray(q.options) || q.options.length !== 4) {
    throw new Error('MCQ must have exactly 4 options');
  }
  if (q.options.some((o) => typeof o !== 'string' || !String(o).trim())) {
    throw new Error('MCQ options must be non-empty strings');
  }
  const unique = new Set(q.options.map((o) => String(o).trim().toLowerCase()));
  if (unique.size < 4) throw new Error('MCQ options must be distinct');

  const answer = q.correctAnswer ?? q.answer;
  if (typeof answer !== 'string' || !answer.trim()) {
    throw new Error('MCQ missing correctAnswer');
  }
  const match = q.options.find(
    (o) => String(o).trim().toLowerCase() === String(answer).trim().toLowerCase()
  );
  if (!match) throw new Error('correctAnswer must match one of the options');

  return true;
}

/**
 * @param {object[]} questions
 * @param {Record<string, string>|Array<{ questionId: string, answer: string }>} answers
 */
export function scoreAttempt(questions, answers) {
  const map = normalizeAnswers(answers);
  let correct = 0;
  /** @type {string[]} */
  const correctIds = [];
  /** @type {string[]} */
  const incorrectIds = [];
  /** @type {Record<string, { correct: number, total: number }>} */
  const byTopic = {};

  for (const q of questions || []) {
    const id = q.id || q.questionId;
    const expected = String(q.correctAnswer ?? q.answer ?? '')
      .trim()
      .toLowerCase();
    const given = String(map[id] ?? '')
      .trim()
      .toLowerCase();
    const ok = Boolean(expected) && given === expected;
    if (ok) {
      correct += 1;
      if (id) correctIds.push(id);
    } else if (id) {
      incorrectIds.push(id);
    }

    const topic = q.topicKey || q.chapterId || q.topic || 'general';
    if (!byTopic[topic]) byTopic[topic] = { correct: 0, total: 0 };
    byTopic[topic].total += 1;
    if (ok) byTopic[topic].correct += 1;
  }

  const total = (questions || []).length;
  return {
    correct,
    total,
    score: total ? Math.round((correct / total) * 100) : 0,
    correctIds,
    incorrectIds,
    byTopic,
  };
}

/**
 * Prefer weak topics, then fill from the rest of the pool.
 *
 * @param {{
 *   pool: object[],
 *   weakTopics?: string[],
 *   count?: number,
 *   mode?: string
 * }} opts
 */
export function pickQuestions({ pool, weakTopics = [], count = 10, mode = LEARNING_MODES.QUICK }) {
  const all = [...(pool || [])].filter(Boolean);
  if (!all.length || count <= 0) return [];

  const weakSet = new Set((weakTopics || []).map(String));
  const weak = [];
  const rest = [];

  for (const q of all) {
    const topic = String(q.topicKey || q.chapterId || q.topic || '');
    if (weakSet.size && weakSet.has(topic)) weak.push(q);
    else rest.push(q);
  }

  shuffleInPlace(weak);
  shuffleInPlace(rest);

  let ordered = [...weak, ...rest];

  if (mode === LEARNING_MODES.EXAM || mode === LEARNING_MODES.DEEP) {
    ordered.sort((a, b) => difficultyRank(b) - difficultyRank(a));
  } else if (mode === LEARNING_MODES.REVISION) {
    ordered = [...weak, ...rest.filter((q) => q.needsReview || q.incorrectBefore)];
    if (ordered.length < count) {
      const ids = new Set(ordered.map((q) => q.id));
      for (const q of rest) {
        if (!ids.has(q.id)) ordered.push(q);
      }
    }
  }

  // De-dupe by id while preserving order
  const seen = new Set();
  const picked = [];
  for (const q of ordered) {
    const id = q.id || JSON.stringify(q.question);
    if (seen.has(id)) continue;
    seen.add(id);
    picked.push(q);
    if (picked.length >= count) break;
  }

  return picked;
}

/**
 * @param {Record<string, string>|Array<{ questionId?: string, id?: string, answer: string }>} answers
 */
function normalizeAnswers(answers) {
  /** @type {Record<string, string>} */
  const map = {};
  if (!answers) return map;
  if (Array.isArray(answers)) {
    for (const a of answers) {
      const id = a.questionId || a.id;
      if (id != null) map[id] = a.answer;
    }
    return map;
  }
  return { ...answers };
}

/** @param {object} q */
function difficultyRank(q) {
  const d = String(q.difficulty || '').toLowerCase();
  if (d === 'advanced') return 3;
  if (d === 'intermediate') return 2;
  if (d === 'beginner') return 1;
  return 0;
}

/** @param {any[]} arr */
function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export { QUESTION_TYPES };
