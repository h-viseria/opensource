/**
 * Deterministic local mastery model — no LLM.
 */

import { uuid } from '../core/uuid.js';
import { nowIso } from '../utils/date.js';

const DIFFICULTY_WEIGHT = {
  beginner: 0.85,
  intermediate: 1,
  advanced: 1.2,
};

/**
 * Clamp to [0, 100].
 * @param {number} n
 */
export function clampMastery(n) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * @param {{ documentId: string, topicKey: string, topicLabel?: string }} input
 */
export function createProgress({ documentId, topicKey, topicLabel }) {
  const at = nowIso();
  return {
    id: uuid(),
    documentId,
    topicKey,
    topicLabel: topicLabel || topicKey,
    masteryScore: 0,
    attempts: 0,
    correctCount: 0,
    incorrectCount: 0,
    streak: 0,
    totalTimeMs: 0,
    lastDifficulty: null,
    lastReviewedAt: null,
    createdAt: at,
    updatedAt: at,
  };
}

/**
 * Update a progress record from one practice attempt.
 *
 * @param {object} record
 * @param {{ correct: boolean, difficulty?: string, timeMs?: number }} outcome
 */
export function updateMastery(record, { correct, difficulty = 'intermediate', timeMs = 0 }) {
  const weight = DIFFICULTY_WEIGHT[difficulty] ?? 1;
  const attempts = (record.attempts || 0) + 1;
  const correctCount = (record.correctCount || 0) + (correct ? 1 : 0);
  const incorrectCount = (record.incorrectCount || 0) + (correct ? 0 : 1);
  const streak = correct ? (record.streak || 0) + 1 : 0;

  // Base accuracy (0–100) with Bayesian smoothing so early attempts don't swing wildly
  const accuracy = ((correctCount + 1) / (attempts + 2)) * 100;

  // Delta: correct raises score; incorrect lowers; harder items move the needle more
  let score = Number(record.masteryScore) || 0;
  if (correct) {
    const headroom = 100 - score;
    const boost = (4 + streak * 1.5) * weight;
    // Slightly discount extremely fast guesses (< 1.5s) and very slow struggles
    const timeFactor =
      timeMs > 0 && timeMs < 1500 ? 0.85 : timeMs > 90000 ? 0.9 : 1;
    score += Math.min(headroom, boost * timeFactor);
  } else {
    const penalty = (6 + Math.min(10, streak)) * weight;
    score -= penalty;
  }

  // Blend toward observed accuracy so long-run performance dominates
  score = score * 0.65 + accuracy * 0.35;

  const at = nowIso();
  return {
    ...record,
    attempts,
    correctCount,
    incorrectCount,
    streak,
    totalTimeMs: (record.totalTimeMs || 0) + Math.max(0, timeMs || 0),
    lastDifficulty: difficulty,
    masteryScore: clampMastery(score),
    lastReviewedAt: at,
    updatedAt: at,
  };
}

/**
 * Convenience accessor.
 * @param {object} record
 */
export function masteryScore(record) {
  return clampMastery(Number(record?.masteryScore) || 0);
}
