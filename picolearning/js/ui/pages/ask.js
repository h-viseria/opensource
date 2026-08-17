/**
 * Ask Your Textbook — grounded Q&A with sources and follow-up actions.
 */

import { DOC_STATUS, SETTINGS_KEYS, QUESTION_TYPES, DIFFICULTY } from '../../core/constants.js';
import { escapeHtml } from '../../utils/html.js';
import { uuid } from '../../core/uuid.js';
import { nowIso } from '../../utils/date.js';
import { listDocuments } from '../../services/documentService.js';
import { setSetting } from '../../services/settingsService.js';
import { askTextbook, getLlm } from '../../services/askService.js';
import { generateMcqsHeuristic } from '../../learning/learningEngine.js';
import { answerFromContext } from '../../ai/providers.js';
import { chunkRepository, questionRepository } from '../../repositories/index.js';
import { showToast } from '../toast.js';
import {
  getOutlet,
  resolveActiveDocument,
  documentSelectHtml,
} from './helpers.js';

/**
 * @param {import('../../core/router.js').RouteContext} ctx
 */
export async function renderAsk(ctx) {
  const outlet = getOutlet();
  const docs = await listDocuments();
  const active = await resolveActiveDocument(ctx.query);

  outlet.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Ask your textbook</h1>
          <p class="lede">Questions are answered from retrieved passages in your imported document — not from the open web.</p>
        </div>
      </div>
      ${documentSelectHtml(docs, active?.id)}
      <form class="panel ask-form" data-ask-form>
        <label class="field">
          <span class="field__label">Question</span>
          <textarea class="input" name="question" rows="3" placeholder="e.g. What is the difference between speed and velocity?" required></textarea>
        </label>
        <button type="submit" class="btn btn--primary" ${!active || active.status !== DOC_STATUS.READY ? 'disabled' : ''}>Ask</button>
      </form>
      ${!active ? `<p class="muted">Import a document first.</p>` : ''}
      ${active && active.status !== DOC_STATUS.READY ? `<div class="banner">Document is ${escapeHtml(active.status)}. Finish processing before asking.</div>` : ''}
      <div data-ask-result></div>
    </div>
  `;

  const select = /** @type {HTMLSelectElement|null} */ (outlet.querySelector('[data-doc-select]'));
  select?.addEventListener('change', async () => {
    await setSetting(SETTINGS_KEYS.LAST_DOCUMENT_ID, select.value);
    location.hash = `#/ask?documentId=${encodeURIComponent(select.value)}`;
  });

  const form = /** @type {HTMLFormElement|null} */ (outlet.querySelector('[data-ask-form]'));
  const resultHost = /** @type {HTMLElement} */ (outlet.querySelector('[data-ask-result]'));

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const docId = select?.value || active?.id;
    if (!docId) return;
    const fd = new FormData(form);
    const question = String(fd.get('question') || '').trim();
    if (!question) return;

    resultHost.innerHTML = `<p class="muted">Searching your textbook…</p>`;
    const submitBtn = /** @type {HTMLButtonElement|null} */ (form.querySelector('[type="submit"]'));
    if (submitBtn) submitBtn.disabled = true;

    try {
      const result = await askTextbook(docId, question);
      renderResult(resultHost, docId, question, result);
    } catch (err) {
      resultHost.innerHTML = `<div class="banner">${escapeHtml(err instanceof Error ? err.message : String(err))}</div>`;
      showToast('Ask failed', 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

/**
 * @param {HTMLElement} host
 * @param {string} documentId
 * @param {string} question
 * @param {{ answer: string, sources: object[], grounded: boolean, provider?: string, isDemo?: boolean }} result
 */
function renderResult(host, documentId, question, result) {
  host.innerHTML = `
    <section class="panel">
      <p class="muted">Answered with ${escapeHtml(result.provider || 'LLM')}${result.isDemo ? ' (demo / heuristic)' : ''}</p>
      <div class="study-block document-text" style="white-space:pre-wrap">${escapeHtml(result.answer)}</div>
      <div class="stack" style="flex-direction:row;flex-wrap:wrap;gap:0.5rem;margin-top:1rem">
        <button type="button" class="btn btn--secondary btn--sm" data-action="simpler">Explain simpler</button>
        <button type="button" class="btn btn--secondary btn--sm" data-action="test-me">Test me</button>
        <button type="button" class="btn btn--secondary btn--sm" data-action="mcq">Create MCQ</button>
      </div>
      <div data-followup></div>
    </section>
    <section class="panel">
      <h2>Sources</h2>
      ${
        result.sources?.length
          ? `<ul class="card-list">
          ${result.sources
            .map((s) => {
              const page = s.pageStart ?? s.pageEnd;
              const href =
                page != null
                  ? `#/document/${encodeURIComponent(documentId)}?page=${encodeURIComponent(String(page))}`
                  : `#/document/${encodeURIComponent(documentId)}`;
              return `
              <li class="list-card">
                <a href="${href}">${escapeHtml(s.chapter || 'Passage')}${page != null ? ` · p.${page}` : ''}</a>
                <p class="muted">${escapeHtml(s.excerpt || '')}</p>
              </li>`;
            })
            .join('')}
        </ul>`
          : `<p class="muted">No source passages.</p>`
      }
    </section>
  `;

  const follow = /** @type {HTMLElement} */ (host.querySelector('[data-followup]'));
  const contextBlob = (result.sources || []).map((s) => s.excerpt || '').join('\n');

  host.querySelector('[data-action="simpler"]')?.addEventListener('click', async () => {
    follow.innerHTML = `<p class="muted">Rewriting…</p>`;
    try {
      const llm = await getLlm();
      let text;
      if (!llm.isDemo) {
        text = await llm.generate({
          system: 'Rewrite the answer in simpler language for a student. Stay faithful to the facts. Do not invent.',
          prompt: `Original question: ${question}\n\nAnswer to simplify:\n${result.answer}`,
          context: contextBlob,
        });
      } else {
        text = `Simpler version:\n\n${answerFromContext(question, result.answer + '\n' + contextBlob)}`;
      }
      follow.innerHTML = `<div class="study-block" style="white-space:pre-wrap">${escapeHtml(text)}</div>`;
    } catch (err) {
      follow.innerHTML = `<p class="muted">${escapeHtml(err instanceof Error ? err.message : String(err))}</p>`;
    }
  });

  host.querySelector('[data-action="test-me"]')?.addEventListener('click', () => {
    follow.innerHTML = `
      <div class="study-block">
        <p><strong>Quick check:</strong> In your own words, answer: ${escapeHtml(question)}</p>
        <label class="field">
          <span class="field__label">Your answer</span>
          <textarea class="input" rows="3" data-self-answer></textarea>
        </label>
        <button type="button" class="btn btn--primary btn--sm" data-action="reveal">Reveal model answer</button>
        <div data-reveal hidden class="document-text" style="margin-top:0.75rem;white-space:pre-wrap">${escapeHtml(result.answer)}</div>
      </div>`;
    follow.querySelector('[data-action="reveal"]')?.addEventListener('click', () => {
      follow.querySelector('[data-reveal]')?.removeAttribute('hidden');
    });
  });

  host.querySelector('[data-action="mcq"]')?.addEventListener('click', async () => {
    follow.innerHTML = `<p class="muted">Creating MCQ…</p>`;
    try {
      const chunks = (await chunkRepository.getAllByIndex('documentId', documentId)) || [];
      const related = chunks.filter((c) =>
        (result.sources || []).some((s) => s.chunkId && s.chunkId === c.id)
      );
      const pool = related.length ? related : chunks.slice(0, 6);
      const mcqs = generateMcqsHeuristic(pool, { limit: 1, maxPerChunk: 1 });
      if (!mcqs.length) {
        follow.innerHTML = `<p class="muted">Could not build an MCQ from these passages.</p>`;
        return;
      }
      const q = {
        ...mcqs[0],
        id: uuid(),
        documentId,
        questionType: QUESTION_TYPES.MCQ,
        difficulty: DIFFICULTY.INTERMEDIATE,
        createdAt: nowIso(),
      };
      await questionRepository.put(q);
      follow.innerHTML = `
        <div class="study-block">
          <p><strong>${escapeHtml(q.question)}</strong></p>
          <ul>
            ${q.options.map((o) => `<li>${escapeHtml(o)}</li>`).join('')}
          </ul>
          <p class="muted">Correct: ${escapeHtml(q.correctAnswer)}</p>
          <p class="muted">Saved to this document’s quiz pool. <a href="#/quiz?documentId=${encodeURIComponent(documentId)}">Open quiz</a></p>
        </div>`;
      showToast('MCQ saved to quiz pool', 'success');
    } catch (err) {
      follow.innerHTML = `<p class="muted">${escapeHtml(err instanceof Error ? err.message : String(err))}</p>`;
    }
  });
}
