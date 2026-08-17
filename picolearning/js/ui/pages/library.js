/**
 * Library — list documents, drag-drop import, demo sample, delete.
 */

import { DOC_STATUS } from '../../core/constants.js';
import { escapeHtml } from '../../utils/html.js';
import {
  listDocuments,
  createDocumentFromFile,
  deleteDocument,
} from '../../services/documentService.js';
import { installSampleDocument } from '../../data/sampleDocument.js';
import { setSetting } from '../../services/settingsService.js';
import { SETTINGS_KEYS } from '../../core/constants.js';
import { navigate } from '../../core/router.js';
import { confirmModal } from '../modal.js';
import { showToast } from '../toast.js';
import { getOutlet, statusBadge, formatWhen } from './helpers.js';
import { showImportOptions } from './importFlow.js';

/**
 * @param {import('../../core/router.js').RouteContext} _ctx
 */
export async function renderLibrary(_ctx) {
  const outlet = getOutlet();
  await paint(outlet);
}

/**
 * @param {HTMLElement} outlet
 */
async function paint(outlet) {
  const docs = await listDocuments();

  outlet.innerHTML = `
    <div class="page page--wide">
      <div class="page-head">
        <div>
          <h1>Library</h1>
          <p class="lede">Import PDF textbooks. Processing and study materials stay on this device.</p>
        </div>
        <div class="stack" style="flex-direction:row;flex-wrap:wrap;gap:0.5rem">
          <label class="btn btn--primary">
            Import PDF
            <input type="file" accept="application/pdf,.pdf" hidden data-file-input />
          </label>
          <button type="button" class="btn btn--secondary" data-action="demo">Load demo document</button>
        </div>
      </div>

      <div class="drop-zone panel" data-drop-zone tabindex="0">
        <p><strong>Drop a PDF here</strong></p>
        <p class="muted">Or use Import PDF. Native-text PDFs process fully offline; scanned pages need PicoScan OCR.</p>
      </div>

      <div data-import-host></div>

      <section class="panel">
        <h2>Documents (${docs.length})</h2>
        ${
          docs.length
            ? `<ul class="card-list" data-doc-list>
            ${docs
              .map(
                (d) => `
              <li class="list-card" data-doc-id="${escapeHtml(d.id)}">
                <div>
                  <h3><a href="#/document/${encodeURIComponent(d.id)}">${escapeHtml(d.title || d.fileName || 'Untitled')}</a></h3>
                  <p class="muted">
                    ${statusBadge(d.status)}
                    · ${d.pageCount || 0} pages
                    · ${formatWhen(d.updatedAt)}
                    ${d.isDemo || d.source === 'demo' ? ' · <span class="badge badge--muted">DEMO</span>' : ''}
                  </p>
                  ${d.errorMessage ? `<p class="muted" style="color:var(--danger)">${escapeHtml(d.errorMessage)}</p>` : ''}
                </div>
                <div class="stack" style="flex-direction:row;flex-wrap:wrap;gap:0.35rem">
                  ${
                    d.status === DOC_STATUS.READY
                      ? `
                    <a class="btn btn--primary btn--sm" href="#/learn?documentId=${encodeURIComponent(d.id)}">Learn</a>
                    <a class="btn btn--secondary btn--sm" href="#/ask?documentId=${encodeURIComponent(d.id)}">Ask</a>
                    <a class="btn btn--secondary btn--sm" href="#/quiz?documentId=${encodeURIComponent(d.id)}">Quiz</a>`
                      : ''
                  }
                  <button type="button" class="btn btn--ghost btn--sm" data-action="delete" data-id="${escapeHtml(d.id)}">Delete</button>
                </div>
              </li>`
              )
              .join('')}
          </ul>`
            : `<p class="muted">No documents yet. Import a PDF or load the demo.</p>`
        }
      </section>
    </div>
  `;

  wire(outlet);
}

/**
 * @param {HTMLElement} outlet
 */
function wire(outlet) {
  const fileInput = /** @type {HTMLInputElement|null} */ (outlet.querySelector('[data-file-input]'));
  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (file) await beginImport(outlet, file);
  });

  const drop = outlet.querySelector('[data-drop-zone]');
  if (drop) {
    const prevent = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, prevent));
    drop.addEventListener('dragover', () => drop.classList.add('is-dragover'));
    drop.addEventListener('dragleave', () => drop.classList.remove('is-dragover'));
    drop.addEventListener('drop', async (e) => {
      drop.classList.remove('is-dragover');
      const file = /** @type {DragEvent} */ (e).dataTransfer?.files?.[0];
      if (file) await beginImport(outlet, file);
    });
  }

  outlet.querySelector('[data-action="demo"]')?.addEventListener('click', async () => {
    try {
      const { document } = await installSampleDocument({ replaceExisting: true });
      await setSetting(SETTINGS_KEYS.LAST_DOCUMENT_ID, document.id);
      showToast('Demo document loaded', 'success');
      await paint(outlet);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    }
  });

  outlet.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      if (!id) return;
      const ok = await confirmModal({
        title: 'Delete document?',
        bodyHtml: '<p>This removes the document and all related pages, chunks, quizzes, and progress on this device.</p>',
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;
      try {
        await deleteDocument(id);
        showToast('Document deleted', 'success');
        await paint(outlet);
      } catch (err) {
        showToast(err instanceof Error ? err.message : String(err), 'error');
      }
    });
  });
}

/**
 * @param {HTMLElement} outlet
 * @param {File} file
 */
async function beginImport(outlet, file) {
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
    showToast('Please choose a PDF file', 'warn');
    return;
  }
  try {
    const doc = await createDocumentFromFile(file);
    const buffer = await file.arrayBuffer();
    const host = /** @type {HTMLElement|null} */ (outlet.querySelector('[data-import-host]'));
    if (!host) return;
    showImportOptions(host, {
      documentId: doc.id,
      title: doc.title,
      fileBuffer: buffer,
      onDone: async () => {
        await paint(outlet);
        navigate(`/document/${doc.id}`);
      },
    });
    host.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (err) {
    showToast(err instanceof Error ? err.message : String(err), 'error');
  }
}
