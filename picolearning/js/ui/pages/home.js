/**
 * Home — continue learning, library preview, weak topics, privacy banner.
 */

import { DOC_STATUS, SETTINGS_KEYS } from '../../core/constants.js';
import { escapeHtml } from '../../utils/html.js';
import { listDocuments } from '../../services/documentService.js';
import { getSetting } from '../../services/settingsService.js';
import { progressRepository, flashcardRepository } from '../../repositories/index.js';
import { getOutlet, statusBadge, masteryBar, formatWhen, withResolvedTopicLabels } from './helpers.js';

/**
 * @param {import('../../core/router.js').RouteContext} _ctx
 */
export async function renderHome(_ctx) {
  const outlet = getOutlet();
  const docs = await listDocuments();
  const lastId = /** @type {string|undefined} */ (await getSetting(SETTINGS_KEYS.LAST_DOCUMENT_ID));
  const lastDoc = docs.find((d) => d.id === lastId) || docs.find((d) => d.status === DOC_STATUS.READY) || docs[0];

  const progress = await withResolvedTopicLabels((await progressRepository.getAll()) || []);
  const weak = [...progress]
    .filter((p) => (p.masteryScore ?? 0) < 60)
    .sort((a, b) => (a.masteryScore ?? 0) - (b.masteryScore ?? 0))
    .slice(0, 5);

  const cards = (await flashcardRepository.getAll()) || [];
  const now = Date.now();
  const upcoming = [...cards]
    .filter((c) => c.nextReviewAt)
    .sort((a, b) => String(a.nextReviewAt).localeCompare(String(b.nextReviewAt)))
    .slice(0, 5);
  const dueSoon = upcoming.filter((c) => new Date(c.nextReviewAt).getTime() <= now + 86400000);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const preview = docs.slice(0, 4);

  outlet.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <p class="brand-mark">PicoLearning</p>
          <h1>${greeting}</h1>
          <p class="lede">Open a textbook, study locally, and track mastery — without sending your notes to a server.</p>
        </div>
      </div>

      <div class="banner banner--ok">Your learning data stays on this device.</div>

      ${
        lastDoc
          ? `
        <section class="panel">
          <h2>Continue learning</h2>
          <div class="card-list">
            <article class="list-card">
              <div>
                <h3>${escapeHtml(lastDoc.title || 'Untitled')}</h3>
                <p class="muted">${statusBadge(lastDoc.status)} · ${lastDoc.pageCount || 0} pages</p>
              </div>
              <div class="stack">
                ${
                  lastDoc.status === DOC_STATUS.READY
                    ? `
                  <a class="btn btn--primary" href="#/learn?documentId=${encodeURIComponent(lastDoc.id)}">Resume study</a>
                  <a class="btn btn--secondary" href="#/document/${encodeURIComponent(lastDoc.id)}">Open viewer</a>`
                    : `<a class="btn btn--secondary" href="#/library">Finish import</a>`
                }
              </div>
            </article>
          </div>
        </section>`
          : `
        <section class="panel">
          <h2>Get started</h2>
          <p class="muted">Import a PDF textbook or load the built-in demo document.</p>
          <div class="stack" style="flex-direction:row;flex-wrap:wrap;gap:0.75rem">
            <a class="btn btn--primary" href="#/library">Open library</a>
            <a class="btn btn--secondary" href="#/setup">Setup &amp; AI profile</a>
          </div>
        </section>`
      }

      <section class="panel">
        <div class="page-head">
          <h2>Library</h2>
          <a class="btn btn--ghost btn--sm" href="#/library">View all</a>
        </div>
        ${
          preview.length
            ? `<ul class="card-list">
            ${preview
              .map(
                (d) => `
              <li class="list-card list-card--row">
                <a href="#/document/${encodeURIComponent(d.id)}">${escapeHtml(d.title || d.fileName)}</a>
                ${statusBadge(d.status)}
              </li>`
              )
              .join('')}
          </ul>`
            : `<p class="muted">No documents yet.</p>`
        }
      </section>

      <div class="stat-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
        <section class="panel">
          <h2>Weak topics</h2>
          ${
            weak.length
              ? `<ul class="card-list">
              ${weak
                .map(
                  (p) => `
                <li class="list-card">
                  <strong>${escapeHtml(p.topicLabel || p.topicKey)}</strong>
                  ${masteryBar(p.masteryScore)}
                </li>`
                )
                .join('')}
            </ul>
            <a class="btn btn--secondary btn--sm" href="#/quiz">Practice weak areas</a>`
              : `<p class="muted">Take a quiz to build mastery signals.</p>`
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
                  <span>${escapeHtml(String(c.front || '').slice(0, 60))}${String(c.front || '').length > 60 ? '…' : ''}</span>
                  <span class="muted">${formatWhen(c.nextReviewAt)}</span>
                </li>`
                )
                .join('')}
            </ul>
            <p class="muted">${dueSoon.length} due within 24h</p>
            <a class="btn btn--secondary btn--sm" href="#/learn?mode=revision">Start revision</a>`
              : `<p class="muted">Flashcard reviews will appear here after you study.</p>`
          }
        </section>
      </div>

      <section class="panel">
        <h2>Quick actions</h2>
        <div class="stack" style="flex-direction:row;flex-wrap:wrap;gap:0.5rem">
          <a class="btn btn--primary" href="#/library">Import PDF</a>
          <a class="btn btn--secondary" href="#/ask">Ask your textbook</a>
          <a class="btn btn--secondary" href="#/quiz">Start quiz</a>
          <a class="btn btn--ghost" href="#/progress">View progress</a>
        </div>
      </section>
    </div>
  `;
}
