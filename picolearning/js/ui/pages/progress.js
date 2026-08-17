/**
 * Progress — mastery by topic, quiz history, upcoming reviews.
 */

import { escapeHtml } from '../../utils/html.js';
import {
  progressRepository,
  quizAttemptRepository,
  flashcardRepository,
  documentRepository,
} from '../../repositories/index.js';
import { getOutlet, masteryBar, formatWhen, withResolvedTopicLabels } from './helpers.js';

/**
 * @param {import('../../core/router.js').RouteContext} _ctx
 */
export async function renderProgress(_ctx) {
  const outlet = getOutlet();
  const [progressRaw, attempts, cards, docs] = await Promise.all([
    progressRepository.getAll(),
    quizAttemptRepository.getAll(),
    flashcardRepository.getAll(),
    documentRepository.getAll(),
  ]);
  const progress = await withResolvedTopicLabels(progressRaw || []);

  const docTitle = (id) => {
    const d = (docs || []).find((x) => x.id === id);
    return d?.title || id || '—';
  };

  const byTopic = [...(progress || [])].sort(
    (a, b) => (a.masteryScore ?? 0) - (b.masteryScore ?? 0)
  );

  const history = [...(attempts || [])].sort((a, b) =>
    String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
  );

  const now = Date.now();
  const upcoming = [...(cards || [])]
    .filter((c) => c.nextReviewAt)
    .sort((a, b) => String(a.nextReviewAt).localeCompare(String(b.nextReviewAt)))
    .slice(0, 15);

  const avgMastery =
    byTopic.length > 0
      ? Math.round(byTopic.reduce((s, p) => s + (p.masteryScore || 0), 0) / byTopic.length)
      : 0;

  outlet.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Progress</h1>
          <p class="lede">Mastery, quiz history, and spaced-repetition reviews — all stored locally.</p>
        </div>
      </div>

      <dl class="stat-grid">
        <div><dt>Topics tracked</dt><dd>${byTopic.length}</dd></div>
        <div><dt>Avg mastery</dt><dd>${avgMastery}%</dd></div>
        <div><dt>Quizzes taken</dt><dd>${history.length}</dd></div>
        <div><dt>Reviews due soon</dt><dd>${upcoming.filter((c) => new Date(c.nextReviewAt).getTime() <= now + 86400000).length}</dd></div>
      </dl>

      <section class="panel">
        <h2>Mastery by topic</h2>
        ${
          byTopic.length
            ? `<ul class="card-list">
            ${byTopic
              .map(
                (p) => `
              <li class="list-card">
                <div class="page-head">
                  <div>
                    <strong>${escapeHtml(p.topicLabel || p.topicKey)}</strong>
                    <p class="muted">${escapeHtml(docTitle(p.documentId))} · ${p.attempts || 0} attempts</p>
                  </div>
                </div>
                ${masteryBar(p.masteryScore)}
              </li>`
              )
              .join('')}
          </ul>`
            : `<p class="muted">No mastery data yet. Complete a quiz or review flashcards.</p>`
        }
      </section>

      <section class="panel">
        <h2>Quiz history</h2>
        ${
          history.length
            ? `<ul class="card-list">
            ${history
              .slice(0, 20)
              .map(
                (a) => `
              <li class="list-card list-card--row">
                <div>
                  <strong>${a.score ?? 0}%</strong>
                  <span class="muted"> · ${a.correct ?? 0}/${a.total ?? 0} · ${escapeHtml(docTitle(a.documentId))}</span>
                </div>
                <span class="muted">${formatWhen(a.createdAt)}</span>
              </li>`
              )
              .join('')}
          </ul>`
            : `<p class="muted">No quizzes yet. <a href="#/quiz">Start one</a>.</p>`
        }
      </section>

      <section class="panel">
        <h2>Upcoming reviews</h2>
        ${
          upcoming.length
            ? `<ul class="card-list">
            ${upcoming
              .map(
                (c) => `
              <li class="list-card list-card--row">
                <span>${escapeHtml(String(c.front || '').slice(0, 80))}</span>
                <span class="muted">${formatWhen(c.nextReviewAt)}</span>
              </li>`
              )
              .join('')}
          </ul>
          <a class="btn btn--secondary btn--sm" href="#/learn?mode=revision">Open revision mode</a>`
            : `<p class="muted">No scheduled flashcard reviews.</p>`
        }
      </section>
    </div>
  `;
}
