/**
 * Lightweight SM-2-lite spaced repetition scheduler — pure JS, no AI.
 */

/**
 * @param {string} [difficulty]
 */
function difficultyFactor(difficulty) {
  switch (String(difficulty || 'intermediate').toLowerCase()) {
    case 'beginner':
      return 1.1;
    case 'advanced':
      return 1.5;
    default:
      return 1.3;
  }
}

/**
 * Schedule the next review instant (ISO datetime).
 *
 * SM-2-lite:
 * - Incorrect → review in ~1 day (sooner for advanced)
 * - Correct → interval grows exponentially with streak and ease
 *
 * @param {{ correct: boolean, streak?: number, difficulty?: string, now?: Date }} input
 * @returns {string} ISO date-time
 */
export function scheduleNext({ correct, streak = 0, difficulty = 'intermediate', now = new Date() }) {
  const base = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  const ease = difficultyFactor(difficulty);
  let days;

  if (!correct) {
    days = difficulty === 'advanced' ? 0.5 : 1;
  } else {
    const s = Math.max(0, Number(streak) || 0);
    if (s <= 0) days = 1;
    else if (s === 1) days = 3 * (ease / 1.3);
    else if (s === 2) days = 7 * (ease / 1.3);
    else days = Math.min(60, Math.round(7 * Math.pow(ease, s - 1)));
  }

  const ms = Math.max(1, days) * 24 * 60 * 60 * 1000;
  // Half-day incorrect reviews: use hours
  const deltaMs = !correct && days < 1 ? days * 24 * 60 * 60 * 1000 : ms;
  const next = new Date(base.getTime() + deltaMs);
  return next.toISOString();
}

/**
 * Compute interval days without applying (handy for UI).
 * @param {{ correct: boolean, streak?: number, difficulty?: string }} input
 */
export function intervalDays({ correct, streak = 0, difficulty = 'intermediate' }) {
  const iso = scheduleNext({ correct, streak, difficulty, now: new Date(0) });
  return Math.round((new Date(iso).getTime() - 0) / (24 * 60 * 60 * 1000) * 10) / 10;
}
