/**
 * Learn — modes, summaries/concepts/flashcards, SRS practice.
 */

import { DOC_STATUS, LEARNING_MODES, SETTINGS_KEYS } from '../../core/constants.js';
import { escapeHtml } from '../../utils/html.js';
import { listDocuments } from '../../services/documentService.js';
import { setSetting } from '../../services/settingsService.js';
import { ensureFlashcardsForDoc } from '../../services/generationService.js';
import { modelManager } from '../../ai/modelManager.js';
import { getLlm } from '../../services/askService.js';
import { buildSummaryPrompt } from '../../ai/prompts.js';
import { answerFromContext } from '../../ai/providers.js';
import { scheduleNext } from '../../learning/spacedRepetition.js';
import { createProgress, updateMastery } from '../../learning/mastery.js';
import {
  chunkRepository,
  flashcardRepository,
  progressRepository,
} from '../../repositories/index.js';
import { nowIso } from '../../utils/date.js';
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
export async function renderLearn(ctx) {
  const outlet = getOutlet();
  const docs = await listDocuments();
  const active = await resolveActiveDocument(ctx.query);
  const mode = (ctx.query.mode || LEARNING_MODES.QUICK).toLowerCase();

  outlet.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Learn</h1>
          <p class="lede">Study summaries, key concepts, and flashcards from your textbook.</p>
        </div>
      </div>
      ${documentSelectHtml(docs, active?.id)}
      <div class="mode-tabs" role="tablist">
        ${Object.values(LEARNING_MODES)
          .map(
            (m) => `
          <button type="button" class="btn ${m === mode ? 'btn--primary' : 'btn--ghost'} btn--sm" data-mode="${m}">
            ${escapeHtml(labelMode(m))}
          </button>`
          )
          .join('')}
      </div>
      <div data-learn-body>
        ${!active ? `<p class="muted">Select or import a document to begin.</p>` : `<p class="muted">Loading…</p>`}
      </div>
    </div>
  `;

  const body = /** @type {HTMLElement} */ (outlet.querySelector('[data-learn-body]'));
  const select = /** @type {HTMLSelectElement|null} */ (outlet.querySelector('[data-doc-select]'));

  select?.addEventListener('change', async () => {
    await setSetting(SETTINGS_KEYS.LAST_DOCUMENT_ID, select.value);
    location.hash = `#/learn?documentId=${encodeURIComponent(select.value)}&mode=${mode}`;
  });

  outlet.querySelectorAll('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const m = btn.getAttribute('data-mode');
      const id = select?.value || active?.id || '';
      location.hash = `#/learn?documentId=${encodeURIComponent(id)}&mode=${m}`;
    });
  });

  if (!active) return;
  if (active.status !== DOC_STATUS.READY) {
    body.innerHTML = `<div class="banner">Document status: ${escapeHtml(active.status)}. Finish processing in the <a href="#/library">library</a>.</div>`;
    return;
  }

  await renderLearnBody(body, active, mode);
}

/**
 * @param {HTMLElement} body
 * @param {object} doc
 * @param {string} mode
 */
async function renderLearnBody(body, doc, mode) {
  const chunks = (await chunkRepository.getAllByIndex('documentId', doc.id)) || [];
  const profile = await modelManager.getActiveProfile();
  const llmReady = await modelManager.isProfileReady(profile);

  body.innerHTML = `
    <section class="panel">
      <h2>${escapeHtml(doc.title)} · ${escapeHtml(labelMode(mode))}</h2>
      <p class="muted">${llmReady ? 'On-device model available for richer generation.' : 'Using local heuristics (download an AI profile in Settings for LLM summaries).'}</p>
      <div class="stack" style="flex-direction:row;flex-wrap:wrap;gap:0.5rem">
        <button type="button" class="btn btn--primary" data-action="summary">Generate summary</button>
        <button type="button" class="btn btn--secondary" data-action="concepts">Key concepts</button>
        <button type="button" class="btn btn--secondary" data-action="flashcards">Prepare flashcards</button>
      </div>
      <div data-study-output class="study-output" style="margin-top:1rem"></div>
    </section>
    <section class="panel" data-flash-panel>
      <h2>Flashcards</h2>
      <p class="muted">Flip a card, then mark Got it or Need practice to update spaced repetition.</p>
      <div data-flash-list><p class="muted">Loading…</p></div>
    </section>
  `;

  const output = /** @type {HTMLElement} */ (body.querySelector('[data-study-output]'));
  const flashList = /** @type {HTMLElement} */ (body.querySelector('[data-flash-list]'));

  const takeChunks = () => {
    if (mode === LEARNING_MODES.QUICK) return chunks.slice(0, 4);
    if (mode === LEARNING_MODES.DEEP || mode === LEARNING_MODES.EXAM) return chunks.slice(0, 12);
    return chunks.slice(0, 8);
  };

  body.querySelector('[data-action="summary"]')?.addEventListener('click', async () => {
    output.innerHTML = `<p class="muted">Generating summary…</p>`;
    try {
      const text = await makeSummary(takeChunks(), llmReady);
      output.innerHTML = `<div class="study-block"><h3>Summary</h3><div class="document-text" style="white-space:pre-wrap">${escapeHtml(text)}</div></div>`;
    } catch (err) {
      output.innerHTML = `<p class="muted">${escapeHtml(err instanceof Error ? err.message : String(err))}</p>`;
    }
  });

  body.querySelector('[data-action="concepts"]')?.addEventListener('click', async () => {
    output.innerHTML = `<p class="muted">Extracting concepts…</p>`;
    const concepts = extractKeyConcepts(takeChunks());
    output.innerHTML = `
      <div class="study-block">
        <h3>Key concepts</h3>
        <ul class="card-list">
          ${concepts.map((c) => `<li class="list-card"><strong>${escapeHtml(c.term)}</strong><p class="muted">${escapeHtml(c.detail)}</p></li>`).join('') || '<li class="muted">No concepts found in selected passages.</li>'}
        </ul>
      </div>`;
  });

  body.querySelector('[data-action="flashcards"]')?.addEventListener('click', async () => {
    try {
      showToast('Preparing flashcards…', 'info');
      const res = await ensureFlashcardsForDoc(doc.id, { minCount: mode === LEARNING_MODES.EXAM ? 16 : 8, force: false });
      showToast(`Flashcards ready (${res.flashcards.length})`, 'success');
      await paintFlashcards(flashList, doc.id);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    }
  });

  await paintFlashcards(flashList, doc.id, mode === LEARNING_MODES.REVISION);
}

/**
 * @param {HTMLElement} host
 * @param {string} documentId
 * @param {boolean} [dueOnly]
 */
async function paintFlashcards(host, documentId, dueOnly = false) {
  let cards = (await flashcardRepository.getAllByIndex('documentId', documentId)) || [];
  if (dueOnly) {
    const now = Date.now();
    cards = cards.filter((c) => !c.nextReviewAt || new Date(c.nextReviewAt).getTime() <= now);
  }
  cards = [...cards].sort((a, b) => String(a.nextReviewAt || '').localeCompare(String(b.nextReviewAt || '')));

  if (!cards.length) {
    host.innerHTML = `<p class="muted">No flashcards yet. Click “Prepare flashcards”.</p>`;
    return;
  }

  host.innerHTML = `
    <ul class="card-list flash-list">
      ${cards
        .slice(0, 40)
        .map(
          (c) => `
        <li class="list-card flash-card" data-card-id="${escapeHtml(c.id)}">
          <button type="button" class="flash-card__face btn btn--ghost" data-action="flip">
            <span data-side="front">${escapeHtml(c.front)}</span>
            <span data-side="back" hidden>${escapeHtml(c.back)}</span>
          </button>
          <div class="stack" style="flex-direction:row;gap:0.35rem;margin-top:0.5rem">
            <button type="button" class="btn btn--primary btn--sm" data-action="got-it">Got it</button>
            <button type="button" class="btn btn--secondary btn--sm" data-action="need-practice">Need practice</button>
          </div>
        </li>`
        )
        .join('')}
    </ul>`;

  host.querySelectorAll('.flash-card').forEach((el) => {
    const id = el.getAttribute('data-card-id');
    el.querySelector('[data-action="flip"]')?.addEventListener('click', () => {
      const front = el.querySelector('[data-side="front"]');
      const back = el.querySelector('[data-side="back"]');
      if (!front || !back) return;
      const showingBack = !back.hasAttribute('hidden');
      if (showingBack) {
        back.setAttribute('hidden', '');
        front.removeAttribute('hidden');
      } else {
        front.setAttribute('hidden', '');
        back.removeAttribute('hidden');
      }
    });
    el.querySelector('[data-action="got-it"]')?.addEventListener('click', () =>
      reviewCard(id, true).then(() => paintFlashcards(host, documentId, dueOnly))
    );
    el.querySelector('[data-action="need-practice"]')?.addEventListener('click', () =>
      reviewCard(id, false).then(() => paintFlashcards(host, documentId, dueOnly))
    );
  });
}

/**
 * @param {string|null} cardId
 * @param {boolean} correct
 */
async function reviewCard(cardId, correct) {
  if (!cardId) return;
  const card = await flashcardRepository.getById(cardId);
  if (!card) return;
  const streak = correct ? (card.streak || 0) + 1 : 0;
  const nextReviewAt = scheduleNext({
    correct,
    streak,
    difficulty: card.difficulty || 'intermediate',
  });
  await flashcardRepository.put({
    ...card,
    streak,
    nextReviewAt,
    lastReviewedAt: nowIso(),
    updatedAt: nowIso(),
  });

  const topicKey = card.chapterId || card.topicKey || 'flashcards';
  const topicLabel =
    card.topicLabel ||
    card.chapterTitle ||
    (topicKey === 'flashcards' ? 'Flashcards' : null);
  let progressRows = (await progressRepository.getAllByIndex('documentId', card.documentId)) || [];
  let rec = progressRows.find((p) => p.topicKey === topicKey);
  if (!rec) {
    rec = createProgress({
      documentId: card.documentId,
      topicKey,
      topicLabel: topicLabel || topicKey,
    });
  } else if (topicLabel && (!rec.topicLabel || isUuidLike(rec.topicLabel))) {
    rec = { ...rec, topicLabel };
  }
  rec = updateMastery(rec, { correct, difficulty: card.difficulty || 'intermediate' });
  await progressRepository.put(rec);
  showToast(correct ? 'Scheduled next review' : 'Will revisit sooner', correct ? 'success' : 'info');
}

/**
 * @param {object[]} chunks
 * @param {boolean} llmReady
 */
async function makeSummary(chunks, llmReady) {
  const contexts = chunks.map((c) => ({
    text: c.text,
    pageStart: c.pageStart,
    pageEnd: c.pageEnd,
    chapter: c.chapterTitle || c.chapter || null,
  }));
  if (llmReady) {
    try {
      const llm = await getLlm();
      if (!llm.isDemo) {
        const { system, prompt } = buildSummaryPrompt({ contexts, maxSentences: 8 });
        return await llm.generate({ prompt, system, context: contexts.map((c) => c.text).join('\n\n') });
      }
    } catch {
      /* heuristic */
    }
  }
  // Heuristic: first sentences from chunks
  const blob = contexts.map((c) => c.text).join('\n');
  return answerFromContext('Summarize the main ideas', blob);
}

/**
 * @param {object[]} chunks
 */
function extractKeyConcepts(chunks) {
  /** @type {{ term: string, detail: string }[]} */
  const out = [];
  const re = /\b([A-Z][A-Za-z0-9][\w\s\-']{1,40}?)\s+(?:is|are)\s+([^.]{8,120})\./g;
  const seen = new Set();
  for (const chunk of chunks) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(String(chunk.text || ''))) !== null) {
      const term = m[1].trim();
      if (seen.has(term.toLowerCase())) continue;
      seen.add(term.toLowerCase());
      out.push({ term, detail: m[2].trim() });
      if (out.length >= 12) return out;
    }
  }
  return out;
}

/** @param {string} m */
function labelMode(m) {
  return String(m || '').charAt(0).toUpperCase() + String(m || '').slice(1);
}
