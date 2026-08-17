/**
 * Quiz — pick count, run MCQs, score, record attempt + mastery.
 */

import { DOC_STATUS, LEARNING_MODES, SETTINGS_KEYS } from '../../core/constants.js';
import { escapeHtml } from '../../utils/html.js';
import { uuid } from '../../core/uuid.js';
import { nowIso } from '../../utils/date.js';
import { listDocuments } from '../../services/documentService.js';
import { setSetting } from '../../services/settingsService.js';
import { ensureQuestionsForDoc } from '../../services/generationService.js';
import { pickQuestions, scoreAttempt } from '../../learning/quizEngine.js';
import { createProgress, updateMastery } from '../../learning/mastery.js';
import {
  progressRepository,
  quizAttemptRepository,
} from '../../repositories/index.js';
import { showToast } from '../toast.js';
import {
  getOutlet,
  resolveActiveDocument,
  documentSelectHtml,
  isUuidLike,
} from './helpers.js';

/**
 * @param {import('../../core/router.js').RouteContext} ctx
 */
export async function renderQuiz(ctx) {
  const outlet = getOutlet();
  const docs = await listDocuments();
  const active = await resolveActiveDocument(ctx.query);

  outlet.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Quiz</h1>
          <p class="lede">Practice with questions grounded in your imported textbook.</p>
        </div>
      </div>
      ${documentSelectHtml(docs, active?.id)}
      <div data-quiz-root></div>
    </div>
  `;

  const select = /** @type {HTMLSelectElement|null} */ (outlet.querySelector('[data-doc-select]'));
  const root = /** @type {HTMLElement} */ (outlet.querySelector('[data-quiz-root]'));

  select?.addEventListener('change', async () => {
    await setSetting(SETTINGS_KEYS.LAST_DOCUMENT_ID, select.value);
    location.hash = `#/quiz?documentId=${encodeURIComponent(select.value)}`;
  });

  if (!active) {
    root.innerHTML = `<p class="muted">Import a document to start a quiz.</p>`;
    return;
  }
  if (active.status !== DOC_STATUS.READY) {
    root.innerHTML = `<div class="banner">Document is ${escapeHtml(active.status)}. Finish processing first.</div>`;
    return;
  }

  showSetup(root, active.id);
}

/**
 * @param {HTMLElement} root
 * @param {string} documentId
 */
function showSetup(root, documentId) {
  root.innerHTML = `
    <section class="panel">
      <h2>Start a quiz</h2>
      <label class="field">
        <span class="field__label">Number of questions</span>
        <select class="input" data-count>
          <option value="5">5</option>
          <option value="10" selected>10</option>
          <option value="20">20</option>
        </select>
      </label>
      <button type="button" class="btn btn--primary" data-action="start">Start quiz</button>
    </section>
  `;

  root.querySelector('[data-action="start"]')?.addEventListener('click', async () => {
    const count = Number(/** @type {HTMLSelectElement} */ (root.querySelector('[data-count]')).value) || 10;
    await beginQuiz(root, documentId, count);
  });
}

/**
 * @param {HTMLElement} root
 * @param {string} documentId
 * @param {number} count
 */
async function beginQuiz(root, documentId, count) {
  root.innerHTML = `<p class="muted">Preparing questions…</p>`;
  try {
    const { questions: pool } = await ensureQuestionsForDoc(documentId, { minCount: count });
    const progress = (await progressRepository.getAllByIndex('documentId', documentId)) || [];
    const weakTopics = progress
      .filter((p) => (p.masteryScore ?? 0) < 55)
      .map((p) => p.topicKey);

    const picked = pickQuestions({
      pool,
      weakTopics,
      count,
      mode: LEARNING_MODES.QUICK,
    });

    if (!picked.length) {
      root.innerHTML = `
        <div class="banner">No questions available for this document.</div>
        <button type="button" class="btn btn--secondary" data-back>Back</button>`;
      root.querySelector('[data-back]')?.addEventListener('click', () => showSetup(root, documentId));
      return;
    }

    runQuiz(root, documentId, picked);
  } catch (err) {
    root.innerHTML = `<div class="banner">${escapeHtml(err instanceof Error ? err.message : String(err))}</div>`;
    showToast('Could not start quiz', 'error');
  }
}

/**
 * @param {HTMLElement} root
 * @param {string} documentId
 * @param {object[]} questions
 */
function runQuiz(root, documentId, questions) {
  /** @type {Record<string, string>} */
  const answers = {};
  let index = 0;
  const startedAt = Date.now();

  const paint = () => {
    const q = questions[index];
    root.innerHTML = `
      <section class="panel quiz-run">
        <p class="muted">Question ${index + 1} of ${questions.length}</p>
        <div class="progress-bar" aria-hidden="true">
          <div class="progress-bar__fill" style="width:${Math.round((index / questions.length) * 100)}%"></div>
        </div>
        <h2 style="font-size:1.15rem;white-space:pre-wrap">${escapeHtml(q.question)}</h2>
        <div class="stack" style="width:100%;align-items:stretch;gap:0.4rem;margin:1rem 0">
          ${(q.options || [])
            .map(
              (opt) => `
            <label class="field field--check list-card" style="cursor:pointer">
              <input type="radio" name="answer" value="${escapeHtml(opt)}" ${answers[q.id] === opt ? 'checked' : ''} />
              ${escapeHtml(opt)}
            </label>`
            )
            .join('')}
        </div>
        <div class="stack" style="flex-direction:row;gap:0.5rem">
          <button type="button" class="btn btn--ghost" data-action="prev" ${index === 0 ? 'disabled' : ''}>Back</button>
          ${
            index < questions.length - 1
              ? `<button type="button" class="btn btn--primary" data-action="next">Next</button>`
              : `<button type="button" class="btn btn--primary" data-action="submit">Submit</button>`
          }
        </div>
      </section>
    `;

    const saveCurrent = () => {
      const checked = /** @type {HTMLInputElement|null} */ (root.querySelector('input[name="answer"]:checked'));
      if (checked) answers[q.id] = checked.value;
    };

    root.querySelector('[data-action="prev"]')?.addEventListener('click', () => {
      saveCurrent();
      index -= 1;
      paint();
    });
    root.querySelector('[data-action="next"]')?.addEventListener('click', () => {
      saveCurrent();
      if (!answers[q.id]) {
        showToast('Select an answer', 'warn');
        return;
      }
      index += 1;
      paint();
    });
    root.querySelector('[data-action="submit"]')?.addEventListener('click', async () => {
      saveCurrent();
      if (!answers[q.id]) {
        showToast('Select an answer', 'warn');
        return;
      }
      await finishQuiz(root, documentId, questions, answers, Date.now() - startedAt);
    });
  };

  paint();
}

/**
 * @param {HTMLElement} root
 * @param {string} documentId
 * @param {object[]} questions
 * @param {Record<string, string>} answers
 * @param {number} durationMs
 */
async function finishQuiz(root, documentId, questions, answers, durationMs) {
  const scored = scoreAttempt(questions, answers);

  for (const q of questions) {
    const topicKey = q.topicKey || q.chapterId || 'general';
    const topicLabel =
      q.topicLabel ||
      q.chapterTitle ||
      (topicKey === 'general' ? 'General' : null);
    let rows = (await progressRepository.getAllByIndex('documentId', documentId)) || [];
    let rec = rows.find((p) => p.topicKey === topicKey);
    if (!rec) {
      rec = createProgress({
        documentId,
        topicKey,
        topicLabel: topicLabel || topicKey,
      });
    } else if (topicLabel && (!rec.topicLabel || isUuidLike(rec.topicLabel))) {
      rec = { ...rec, topicLabel };
    }
    const correct = scored.correctIds.includes(q.id);
    rec = updateMastery(rec, {
      correct,
      difficulty: q.difficulty || 'intermediate',
      timeMs: Math.round(durationMs / Math.max(1, questions.length)),
    });
    await progressRepository.put(rec);
  }

  const attempt = {
    id: uuid(),
    documentId,
    questionIds: questions.map((q) => q.id),
    answers,
    score: scored.score,
    correct: scored.correct,
    total: scored.total,
    byTopic: scored.byTopic,
    durationMs,
    createdAt: nowIso(),
  };
  await quizAttemptRepository.put(attempt);

  root.innerHTML = `
    <section class="panel">
      <h2>Results</h2>
      <p class="lede">${scored.correct} / ${scored.total} correct · <strong>${scored.score}%</strong></p>
      <ul class="card-list">
        ${questions
          .map((q) => {
            const ok = scored.correctIds.includes(q.id);
            return `
            <li class="list-card">
              <p>${ok ? '✓' : '✗'} ${escapeHtml(q.question)}</p>
              <p class="muted">Your answer: ${escapeHtml(answers[q.id] || '—')}</p>
              ${ok ? '' : `<p class="muted">Correct: ${escapeHtml(q.correctAnswer)}</p>`}
              ${q.explanation ? `<p class="muted">${escapeHtml(q.explanation)}</p>` : ''}
            </li>`;
          })
          .join('')}
      </ul>
      <div class="stack" style="flex-direction:row;gap:0.5rem">
        <button type="button" class="btn btn--primary" data-again>Try again</button>
        <a class="btn btn--secondary" href="#/progress">View progress</a>
      </div>
    </section>
  `;

  showToast(`Quiz scored ${scored.score}%`, 'success');
  root.querySelector('[data-again]')?.addEventListener('click', () => showSetup(root, documentId));
}
