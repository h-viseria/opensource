/**
 * Document viewer — chapters, page text, font zoom, study links.
 */

import { DOC_STATUS } from '../../core/constants.js';
import { escapeHtml } from '../../utils/html.js';
import { getDocument } from '../../services/documentService.js';
import { pageRepository, chapterRepository } from '../../repositories/index.js';
import { getOutlet, statusBadge } from './helpers.js';

/**
 * @param {import('../../core/router.js').RouteContext} ctx
 */
export async function renderDocument(ctx) {
  const outlet = getOutlet();
  const id = ctx.params.id;
  const doc = await getDocument(id);

  if (!doc) {
    outlet.innerHTML = `
      <div class="page">
        <h1>Document not found</h1>
        <p class="muted">This document may have been deleted.</p>
        <a class="btn btn--primary" href="#/library">Back to library</a>
      </div>`;
    return;
  }

  const pages = ((await pageRepository.getAllByIndex('documentId', id)) || []).sort(
    (a, b) => (a.pageNumber || 0) - (b.pageNumber || 0)
  );
  const chapters = ((await chapterRepository.getAllByIndex('documentId', id)) || []).sort(
    (a, b) => (a.sortOrder ?? a.pageStart ?? 0) - (b.sortOrder ?? b.pageStart ?? 0)
  );

  const initialPage = Number(ctx.query.page) || pages[0]?.pageNumber || 1;
  let currentPage = initialPage;
  let fontPx = 16;

  const renderBody = () => {
    const page = pages.find((p) => p.pageNumber === currentPage) || pages[0];
    const text = page?.text || (doc.status !== DOC_STATUS.READY ? 'Document is not ready yet.' : 'No text on this page.');
    const maxPage = pages.length ? Math.max(...pages.map((p) => p.pageNumber)) : 1;

    outlet.innerHTML = `
      <div class="page page--wide document-view">
        <div class="page-head">
          <div>
            <h1>${escapeHtml(doc.title || 'Document')}</h1>
            <p class="muted">${statusBadge(doc.status)} · ${doc.pageCount || pages.length} pages
              ${doc.isDemo || doc.source === 'demo' ? ' · DEMO' : ''}</p>
          </div>
          <div class="stack" style="flex-direction:row;flex-wrap:wrap;gap:0.4rem">
            <a class="btn btn--primary btn--sm" href="#/learn?documentId=${encodeURIComponent(id)}">Learn</a>
            <a class="btn btn--secondary btn--sm" href="#/ask?documentId=${encodeURIComponent(id)}">Ask</a>
            <a class="btn btn--secondary btn--sm" href="#/quiz?documentId=${encodeURIComponent(id)}">Quiz</a>
          </div>
        </div>

        <div class="document-layout">
          <aside class="document-toc panel">
            <h2>Chapters</h2>
            ${
              chapters.length
                ? `<ul class="card-list">
                ${chapters
                  .map(
                    (ch) => `
                  <li>
                    <button type="button" class="btn btn--ghost btn--sm" data-jump-page="${ch.pageStart ?? 1}">
                      ${escapeHtml(ch.title || ch.chapterTitle || 'Chapter')}
                      <span class="muted">p.${ch.pageStart ?? '?'}</span>
                    </button>
                  </li>`
                  )
                  .join('')}
              </ul>`
                : `<p class="muted">No chapters detected.</p>`
            }
            <h3>Pages</h3>
            <div class="page-jumper">
              <label class="field">
                <span class="field__label">Go to page</span>
                <input class="input" type="number" min="1" max="${maxPage}" value="${currentPage}" data-page-input />
              </label>
              <button type="button" class="btn btn--secondary btn--sm" data-action="go-page">Go</button>
            </div>
          </aside>

          <section class="panel document-reader">
            <div class="page-head">
              <div class="stack" style="flex-direction:row;gap:0.35rem;align-items:center">
                <button type="button" class="btn btn--ghost btn--sm" data-action="prev" ${currentPage <= 1 ? 'disabled' : ''}>← Prev</button>
                <span class="muted mono">Page ${currentPage} / ${maxPage}</span>
                <button type="button" class="btn btn--ghost btn--sm" data-action="next" ${currentPage >= maxPage ? 'disabled' : ''}>Next →</button>
              </div>
              <div class="stack" style="flex-direction:row;gap:0.35rem">
                <button type="button" class="btn btn--ghost btn--sm" data-action="font-down" aria-label="Smaller text">A−</button>
                <button type="button" class="btn btn--ghost btn--sm" data-action="font-up" aria-label="Larger text">A+</button>
              </div>
            </div>
            <article class="document-text" data-reader style="font-size:${fontPx}px;white-space:pre-wrap">${escapeHtml(text)}</article>
          </section>
        </div>
      </div>
    `;

    const go = (n) => {
      currentPage = Math.max(1, Math.min(maxPage, n));
      renderBody();
    };

    outlet.querySelector('[data-action="prev"]')?.addEventListener('click', () => go(currentPage - 1));
    outlet.querySelector('[data-action="next"]')?.addEventListener('click', () => go(currentPage + 1));
    outlet.querySelector('[data-action="font-up"]')?.addEventListener('click', () => {
      fontPx = Math.min(28, fontPx + 2);
      const reader = /** @type {HTMLElement|null} */ (outlet.querySelector('[data-reader]'));
      if (reader) reader.style.fontSize = `${fontPx}px`;
    });
    outlet.querySelector('[data-action="font-down"]')?.addEventListener('click', () => {
      fontPx = Math.max(12, fontPx - 2);
      const reader = /** @type {HTMLElement|null} */ (outlet.querySelector('[data-reader]'));
      if (reader) reader.style.fontSize = `${fontPx}px`;
    });
    outlet.querySelector('[data-action="go-page"]')?.addEventListener('click', () => {
      const input = /** @type {HTMLInputElement|null} */ (outlet.querySelector('[data-page-input]'));
      go(Number(input?.value) || 1);
    });
    outlet.querySelectorAll('[data-jump-page]').forEach((btn) => {
      btn.addEventListener('click', () => go(Number(btn.getAttribute('data-jump-page')) || 1));
    });
  };

  renderBody();
}
