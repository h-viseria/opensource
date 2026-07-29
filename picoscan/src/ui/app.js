/**
 * Phase 1 standalone PicoScan application shell.
 */

import { APP_NAME, APP_VERSION, DOCUMENT_TYPE_LIST, EVENTS } from '../core/constants.js';
import { on, emit } from '../core/eventBus.js';
import {
  addField,
  deleteField,
  updateField,
} from '../core/documentModel.js';
import { scanFile } from '../engine/scanEngine.js';
import { loadImageFromFile, isPasswordException } from '../engine/preprocess.js';
import { validateDocument } from '../engine/validate.js';
import * as historyDb from '../db/history.js';
import * as exportService from '../services/exportService.js';
import { showToast } from './toast.js';
import { askPdfPassword } from './modal.js';
import { openTrainModal, openSettingsModal } from './trainSettings.js';
import * as knowledgeService from '../services/knowledgeService.js';

/** @type {import('../core/documentModel.js').ScanDocument|null} */
let current = null;
/** @type {import('../core/documentModel.js').ScanDocument[]} */
let history = [];
/** @type {string} */
let activeTab = 'fields';
/** @type {{ level: string, message: string, at: string }[]} */
let logs = [];
/** @type {string[]} */
let categoryOptions = DOCUMENT_TYPE_LIST.filter((t) => t !== 'Unknown');

const ACCEPT = 'image/png,image/jpeg,image/webp,image/tiff,application/pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff,.pdf';

/**
 * @param {HTMLElement} root
 */
export async function mountApp(root) {
  root.innerHTML = shellHtml();
  bindChrome(root);
  await refreshHistory(root);
  await refreshCategoryOptions(root);
  renderAll(root);

  on(EVENTS.LOG, (payload) => {
    logs.unshift({
      level: payload?.level || 'info',
      message: String(payload?.message || ''),
      at: new Date().toLocaleTimeString(),
    });
    logs = logs.slice(0, 200);
    renderLogs(root);
  });

  on(EVENTS.DOCUMENT_CHANGED, (doc) => {
    current = doc;
    renderAll(root);
  });

  on(EVENTS.HISTORY_CHANGED, async () => {
    await refreshHistory(root);
    renderHistory(root);
  });

  on(EVENTS.KNOWLEDGE_CHANGED, async () => {
    await refreshCategoryOptions(root);
  });
}

function shellHtml() {
  return `
    <div class="app-shell">
      <header class="toolbar">
        <div class="toolbar__brand">
          <img class="toolbar__logo" src="./favicon.svg" alt="" width="28" height="28" />
          <div>
            <div class="toolbar__title">${APP_NAME}</div>
            <div class="toolbar__subtitle">Offline OCR · v${APP_VERSION}</div>
          </div>
        </div>
        <div class="toolbar__actions">
          <button type="button" class="btn btn--secondary" data-action="upload-image">Upload Image</button>
          <button type="button" class="btn btn--secondary" data-action="upload-pdf">Upload PDF</button>
          <button type="button" class="btn btn--secondary" data-action="camera">Camera</button>
          <label class="toolbar__type" id="pending-type-wrap" hidden>
            <span class="toolbar__type-label">Type</span>
            <select id="pending-doc-type" class="select select--toolbar" title="Document type for better OCR">
              <option value="">Auto-detect</option>
              ${DOCUMENT_TYPE_LIST.filter((t) => t !== 'Unknown')
                .map((t) => `<option value="${t}">${t}</option>`)
                .join('')}
            </select>
          </label>
          <button type="button" class="btn btn--primary" data-action="scan" disabled>Scan</button>
          <button type="button" class="btn btn--secondary" data-action="export-csv" disabled>Export CSV</button>
          <button type="button" class="btn btn--secondary" data-action="export-excel" disabled>Export Excel</button>
          <button type="button" class="btn btn--secondary" data-action="copy-json" disabled>Copy JSON</button>
          <button type="button" class="btn btn--secondary" data-action="train">Train</button>
        </div>
        <input type="file" id="file-image" class="sr-only" accept="image/png,image/jpeg,image/webp,image/tiff,.png,.jpg,.jpeg,.webp,.tif,.tiff" />
        <input type="file" id="file-pdf" class="sr-only" accept="application/pdf,.pdf" />
        <input type="file" id="file-camera" class="sr-only" accept="image/*" capture="environment" />
      </header>

      <div class="status-bar">
        <div class="status-chip" id="status-chip" role="status" aria-live="polite">Ready</div>
        <button type="button" class="btn btn--ghost btn--sm" data-action="settings">Settings</button>
      </div>

      <div class="workspace drop-target" id="workspace">
        <aside class="panel" id="panel-history">
          <div class="panel__header">
            <h2 class="panel__title">History</h2>
            <button type="button" class="btn btn--ghost btn--sm" data-action="clear-selection">New</button>
          </div>
          <div class="panel__body" id="history-body"></div>
        </aside>

        <section class="panel panel--preview" id="panel-preview">
          <div class="panel__header">
            <h2 class="panel__title">Document Preview</h2>
            <span class="muted" id="preview-meta" style="font-size:var(--text-xs)"></span>
          </div>
          <div class="panel__body preview-stage" id="preview-body">
            <div class="preview-empty">
              <p><strong>Drop a document here</strong></p>
              <p class="muted" style="margin-top:0.5rem">PNG, JPG, WEBP, TIFF, or PDF · or paste from clipboard · or use Camera</p>
            </div>
          </div>
        </section>

        <aside class="panel panel--fields" id="panel-fields">
          <div class="panel__header">
            <h2 class="panel__title">Extracted Fields</h2>
            <button type="button" class="btn btn--ghost btn--sm" data-action="add-field" disabled>Add field</button>
          </div>
          <div class="panel__body" id="fields-body"></div>
        </aside>

        <section class="panel panel--bottom">
          <div class="tabs" role="tablist">
            ${['fields', 'ocr', 'json', 'csv', 'logs']
              .map((id) => {
                const labels = {
                  fields: 'Structured Fields',
                  ocr: 'OCR Text',
                  json: 'JSON',
                  csv: 'CSV Preview',
                  logs: 'Logs',
                };
                return `<button type="button" class="tab ${activeTab === id ? 'is-active' : ''}" data-tab="${id}">${labels[id]}</button>`;
              })
              .join('')}
          </div>
          <div class="panel__body" id="bottom-body"></div>
        </section>
      </div>
    </div>
  `;
}

/**
 * @param {HTMLElement} root
 */
function bindChrome(root) {
  const workspace = root.querySelector('#workspace');
  const fileImage = /** @type {HTMLInputElement} */ (root.querySelector('#file-image'));
  const filePdf = /** @type {HTMLInputElement} */ (root.querySelector('#file-pdf'));
  const fileCamera = /** @type {HTMLInputElement} */ (root.querySelector('#file-camera'));

  /** @type {File|null} */
  let pendingFile = null;
  /** @type {string} */
  let pendingObjectUrl = '';
  /** @type {string} */
  let pendingPassword = '';
  /** @type {number} */
  let pendingSeq = 0;

  const typeWrap = root.querySelector('#pending-type-wrap');
  const typeSelect = /** @type {HTMLSelectElement|null} */ (root.querySelector('#pending-doc-type'));

  const clearPending = () => {
    if (pendingObjectUrl) {
      URL.revokeObjectURL(pendingObjectUrl);
      pendingObjectUrl = '';
    }
    pendingFile = null;
    pendingPassword = '';
    if (typeWrap) typeWrap.hidden = true;
    if (typeSelect) typeSelect.value = '';
    root.querySelectorAll('[data-action="scan"]').forEach((b) => {
      /** @type {HTMLButtonElement} */ (b).disabled = true;
    });
  };

  /**
   * Unlock a PDF (prompt as needed). Sets pendingPassword when a password works.
   * @param {File} file
   * @param {string} [password]
   * @param {boolean} [incorrect]
   */
  const unlockPdf = async (file, password = '', incorrect = false) => {
    try {
      const loaded = await loadImageFromFile(file, { password });
      if (password) pendingPassword = password;
      return loaded;
    } catch (err) {
      if (!isPasswordException(err)) throw err;
      const code = Number(/** @type {any} */ (err).code) || 1;
      const pw = await askPdfPassword({ incorrect: incorrect || code === 2 });
      if (pw == null || pw === '') {
        const cancel = new Error('PDF unlock cancelled');
        cancel.name = 'AbortError';
        throw cancel;
      }
      return unlockPdf(file, pw, false);
    }
  };

  const setPending = async (file) => {
    if (!file) {
      clearPending();
      return;
    }
    const seq = ++pendingSeq;
    if (pendingObjectUrl) {
      URL.revokeObjectURL(pendingObjectUrl);
      pendingObjectUrl = '';
    }
    pendingFile = file;
    pendingPassword = '';
    root.querySelectorAll('[data-action="scan"]').forEach((btn) => {
      /** @type {HTMLButtonElement} */ (btn).disabled = true;
    });
    if (typeWrap) typeWrap.hidden = false;
    if (typeSelect) typeSelect.value = guessTypeFromName(file.name);

    const preview = root.querySelector('#preview-body');
    const meta = root.querySelector('#preview-meta');
    if (meta) meta.textContent = file.name;

    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!isPdf) {
      const url = URL.createObjectURL(file);
      pendingObjectUrl = url;
      if (preview) preview.innerHTML = `<img src="${url}" alt="Pending document" />`;
      root.querySelectorAll('[data-action="scan"]').forEach((btn) => {
        /** @type {HTMLButtonElement} */ (btn).disabled = false;
      });
      setStatus(root, `Ready to scan · ${file.name}`);
      return;
    }

    if (preview) {
      preview.innerHTML = `<p class="muted" style="font-size:var(--text-sm)">Unlocking PDF preview…</p>`;
    }
    setStatus(root, `Checking PDF · ${file.name}`);

    try {
      const loaded = await unlockPdf(file, '');
      if (seq !== pendingSeq) return;
      if (preview) {
        preview.innerHTML = `<img src="${loaded.dataUrl}" alt="Pending PDF page" />`;
      }
      root.querySelectorAll('[data-action="scan"]').forEach((btn) => {
        /** @type {HTMLButtonElement} */ (btn).disabled = false;
      });
      setStatus(
        root,
        pendingPassword
          ? `Ready to scan · ${file.name} (unlocked)`
          : `Ready to scan · ${file.name}`
      );
    } catch (err) {
      if (seq !== pendingSeq) return;
      if (/** @type {any} */ (err)?.name === 'AbortError') {
        clearPending();
        if (preview) {
          preview.innerHTML = `<div class="preview-empty"><p class="muted">PDF unlock cancelled</p></div>`;
        }
        setStatus(root, 'Ready');
        return;
      }
      clearPending();
      const msg = err instanceof Error ? err.message : 'Could not open PDF';
      showToast(msg, 'error');
      setStatus(root, 'PDF open failed');
      if (preview) {
        preview.innerHTML = `<div class="preview-empty"><p class="muted">${escapeHtml(msg)}</p></div>`;
      }
    }
  };

  root.querySelector('[data-action="upload-image"]')?.addEventListener('click', () => fileImage.click());
  root.querySelector('[data-action="upload-pdf"]')?.addEventListener('click', () => filePdf.click());
  root.querySelector('[data-action="camera"]')?.addEventListener('click', () => fileCamera.click());

  fileImage.addEventListener('change', () => {
    const f = fileImage.files?.[0];
    fileImage.value = '';
    if (f) setPending(f);
  });
  filePdf.addEventListener('change', () => {
    const f = filePdf.files?.[0];
    filePdf.value = '';
    if (f) setPending(f);
  });
  fileCamera.addEventListener('change', () => {
    const f = fileCamera.files?.[0];
    fileCamera.value = '';
    if (f) setPending(f);
  });

  workspace?.addEventListener('dragover', (e) => {
    e.preventDefault();
    workspace.classList.add('is-dragover');
  });
  workspace?.addEventListener('dragleave', () => workspace.classList.remove('is-dragover'));
  workspace?.addEventListener('drop', (e) => {
    e.preventDefault();
    workspace.classList.remove('is-dragover');
    const f = e.dataTransfer?.files?.[0];
    if (f) setPending(f);
  });

  window.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        if (blob) setPending(new File([blob], 'clipboard.png', { type: blob.type || 'image/png' }));
        break;
      }
    }
  });

  root.querySelector('[data-action="scan"]')?.addEventListener('click', async () => {
    if (!pendingFile) return;
    const btn = /** @type {HTMLButtonElement} */ (root.querySelector('[data-action="scan"]'));
    btn.disabled = true;
    const documentType = typeSelect?.value || '';
    try {
      current = await scanFile(pendingFile, {
        documentType: documentType || undefined,
        password: pendingPassword || undefined,
        onStatus: (msg) => setStatus(root, msg),
      });
      pendingFile = null;
      clearPending();
      showToast('Scan complete — review and edit fields', 'success');
      setStatus(root, `Scanned · ${current.documentType}`);
      renderAll(root);
    } catch (err) {
      if (isPasswordException(err) && pendingFile) {
        try {
          await unlockPdf(pendingFile, '', true);
          current = await scanFile(pendingFile, {
            documentType: documentType || undefined,
            password: pendingPassword || undefined,
            onStatus: (msg) => setStatus(root, msg),
          });
          clearPending();
          showToast('Scan complete — review and edit fields', 'success');
          setStatus(root, `Scanned · ${current.documentType}`);
          renderAll(root);
          return;
        } catch (e2) {
          if (/** @type {any} */ (e2)?.name !== 'AbortError') {
            showToast(e2 instanceof Error ? e2.message : 'Scan failed', 'error');
          }
          setStatus(root, 'Scan failed');
          return;
        }
      }
      showToast(err instanceof Error ? err.message : 'Scan failed', 'error');
      setStatus(root, 'Scan failed');
    } finally {
      btn.disabled = !pendingFile;
    }
  });

  root.querySelector('[data-action="export-csv"]')?.addEventListener('click', () => {
    if (!current) return;
    exportService.exportCsv(current);
    showToast('CSV downloaded', 'success');
  });
  root.querySelector('[data-action="export-excel"]')?.addEventListener('click', () => {
    if (!current) return;
    exportService.exportExcel(current);
    showToast('Excel downloaded', 'success');
  });
  root.querySelector('[data-action="copy-json"]')?.addEventListener('click', async () => {
    if (!current) return;
    await exportService.copyJson(current);
    showToast('JSON copied', 'success');
  });
  root.querySelector('[data-action="train"]')?.addEventListener('click', async () => {
    await openTrainModal({
      onStatus: (msg) => setStatus(root, msg),
      onDone: async () => {
        await refreshCategoryOptions(root);
        showToast('Knowledge saved — select that category on Scan to use it', 'success');
        setStatus(root, 'Knowledge updated');
      },
    });
  });
  root.querySelector('[data-action="settings"]')?.addEventListener('click', async () => {
    await openSettingsModal({
      onDone: async () => {
        await refreshHistory(root);
        await refreshCategoryOptions(root);
        current = null;
        renderAll(root);
      },
    });
  });
  root.querySelector('[data-action="clear-selection"]')?.addEventListener('click', () => {
    current = null;
    clearPending();
    renderAll(root);
    setStatus(root, 'Ready');
  });
  root.querySelector('[data-action="add-field"]')?.addEventListener('click', async () => {
    if (!current) return;
    current = addField(current, { label: 'New Field', value: '', confidence: 1 });
    await historyDb.saveDocument(current);
    emit(EVENTS.FIELD_EDITED, { action: 'add' });
    renderAll(root);
  });

  root.querySelectorAll('[data-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      activeTab = tab.getAttribute('data-tab') || 'fields';
      root.querySelectorAll('[data-tab]').forEach((t) => {
        t.classList.toggle('is-active', t.getAttribute('data-tab') === activeTab);
      });
      renderBottom(root);
    });
  });

  // Event delegation for field edits / history
  root.addEventListener('click', async (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const histBtn = t.closest('[data-history-id]');
    if (histBtn) {
      const id = histBtn.getAttribute('data-history-id');
      if (!id) return;
      const doc = await historyDb.getDocument(id);
      if (doc) {
        current = doc;
        renderAll(root);
      }
      return;
    }
    const del = t.closest('[data-del-field]');
    if (del && current) {
      const id = del.getAttribute('data-del-field');
      if (!id) return;
      current = deleteField(current, id);
      await historyDb.saveDocument(current);
      emit(EVENTS.FIELD_EDITED, { action: 'delete', id });
      renderAll(root);
    }
  });

  root.addEventListener('change', async (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (!(t instanceof HTMLInputElement || t instanceof HTMLSelectElement)) return;
    if (!current) return;

    if (t.dataset.docType === '1') {
      current = { ...current, documentType: t.value, updatedAt: new Date().toISOString() };
      await historyDb.saveDocument(current);
      renderAll(root);
      return;
    }

    const fieldId = t.dataset.fieldId;
    if (!fieldId) return;
    const patch =
      t.dataset.fieldProp === 'label'
        ? { label: t.value }
        : t.dataset.fieldProp === 'value'
          ? { value: t.value }
          : null;
    if (!patch) return;
    current = updateField(current, fieldId, patch);
    await historyDb.saveDocument(current);
    emit(EVENTS.FIELD_EDITED, { fieldId, patch });
    renderValidation(root);
    renderBottom(root);
    enableExports(root, true);
  });
}

/**
 * @param {HTMLElement} root
 */
async function refreshHistory(root) {
  history = await historyDb.listDocuments();
  renderHistory(root);
}

/**
 * Refresh Type dropdown from built-in + trained categories.
 * @param {HTMLElement} root
 */
async function refreshCategoryOptions(root) {
  const select = /** @type {HTMLSelectElement|null} */ (root.querySelector('#pending-doc-type'));
  const prev = select?.value || '';
  categoryOptions = await knowledgeService.listAllCategories();
  if (!select) return;
  select.innerHTML =
    `<option value="">Auto-detect</option>` +
    categoryOptions.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
  if (prev && [...select.options].some((o) => o.value === prev)) select.value = prev;
}

/**
 * @param {HTMLElement} root
 */
function renderAll(root) {
  enableExports(root, Boolean(current));
  root.querySelector('[data-action="add-field"]')?.toggleAttribute('disabled', !current);
  renderHistory(root);
  renderPreview(root);
  renderFields(root);
  renderBottom(root);
}

/**
 * @param {HTMLElement} root
 * @param {boolean} on
 */
function enableExports(root, on) {
  for (const action of ['export-csv', 'export-excel', 'copy-json']) {
    const btn = /** @type {HTMLButtonElement|null} */ (root.querySelector(`[data-action="${action}"]`));
    if (btn) btn.disabled = !on;
  }
}

/**
 * @param {HTMLElement} root
 */
function renderHistory(root) {
  const body = root.querySelector('#history-body');
  if (!body) return;
  if (!history.length) {
    body.innerHTML = `<p class="muted" style="font-size:var(--text-sm)">No scans yet. Upload a document to begin.</p>`;
    return;
  }
  body.innerHTML = `<div class="history-list">${history
    .map((doc) => {
      const active = current?.id === doc.id ? 'is-active' : '';
      const when = new Date(doc.updatedAt).toLocaleString();
      return `
        <button type="button" class="history-item ${active}" data-history-id="${doc.id}">
          <div class="history-item__title">${escapeHtml(doc.documentType)}</div>
          <div class="history-item__meta">${escapeHtml(String(doc.metadata?.sourceName || 'document'))} · ${escapeHtml(when)}</div>
        </button>`;
    })
    .join('')}</div>`;
}

/**
 * @param {HTMLElement} root
 */
function renderPreview(root) {
  const body = root.querySelector('#preview-body');
  const meta = root.querySelector('#preview-meta');
  if (!body) return;
  if (!current?.previewDataUrl) {
    if (!body.querySelector('img')) {
      body.innerHTML = `
        <div class="preview-empty">
          <p><strong>Drop a document here</strong></p>
          <p class="muted" style="margin-top:0.5rem">PNG, JPG, WEBP, TIFF, or PDF · or paste from clipboard · or use Camera</p>
        </div>`;
    }
    if (meta) meta.textContent = '';
    return;
  }
  body.innerHTML = `<img src="${current.previewDataUrl}" alt="Scanned document" />`;
  if (meta) {
    meta.textContent = `${current.documentType} · ${Math.round((current.confidence || 0) * 100)}%`;
  }
}

/**
 * @param {HTMLElement} root
 */
function renderFields(root) {
  const body = root.querySelector('#fields-body');
  if (!body) return;
  if (!current) {
    body.innerHTML = `<p class="muted" style="font-size:var(--text-sm)">Extracted fields appear here after Scan. Every value is editable.</p>`;
    return;
  }

  const typeOpts = [...new Set([...categoryOptions, current.documentType].filter(Boolean))]
    .map(
      (t) =>
        `<option value="${escapeHtml(t)}" ${t === current.documentType ? 'selected' : ''}>${escapeHtml(t)}</option>`
    )
    .join('');

  const issues = validateDocument(current, history);
  const validationHtml = issues.length
    ? `<div class="validation-list">${issues
        .map(
          (i) =>
            `<div class="validation-item validation-item--${i.level === 'error' ? 'error' : 'warn'}">${escapeHtml(i.message)}</div>`
        )
        .join('')}</div>`
    : `<p class="muted" style="font-size:var(--text-xs);margin-bottom:0.75rem">No validation issues.</p>`;

  const txnTable = Array.isArray(current.tables)
    ? current.tables.find((t) => t?.rows?.length)
    : null;
  const txnHtml = txnTable
    ? `<div class="txn-block">
        <div class="txn-block__head">
          <strong>Transactions</strong>
          <span class="muted">${txnTable.rows.length} row(s) · included in CSV / Excel</span>
        </div>
        <div class="txn-scroll">
          <table class="field-table txn-table">
            <thead><tr>${txnTable.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
            <tbody>
              ${txnTable.rows
                .slice(0, 200)
                .map(
                  (row) =>
                    `<tr>${row.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>`
    : '';

  body.innerHTML = `
    <label class="muted" style="font-size:var(--text-xs);display:block;margin-bottom:0.35rem">Document type</label>
    <select class="select" data-doc-type="1" style="margin-bottom:0.75rem">${typeOpts}</select>
    ${validationHtml}
    ${txnHtml}
    <table class="field-table">
      <thead>
        <tr><th>Field</th><th>Value</th><th>Conf.</th><th></th></tr>
      </thead>
      <tbody>
        ${current.fields
          .map(
            (f) => `
          <tr>
            <td><input class="input" data-field-id="${f.id}" data-field-prop="label" value="${escapeHtml(f.label)}" /></td>
            <td><input class="input" data-field-id="${f.id}" data-field-prop="value" value="${escapeHtml(f.value)}" /></td>
            <td class="field-table__conf">${Math.round(f.confidence * 100)}%</td>
            <td><button type="button" class="btn btn--ghost btn--sm" data-del-field="${f.id}" title="Delete field">✕</button></td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>
  `;
}

/**
 * @param {HTMLElement} root
 */
function renderValidation(root) {
  // re-render fields panel header area cheaply
  renderFields(root);
}

/**
 * @param {HTMLElement} root
 */
function renderBottom(root) {
  const body = root.querySelector('#bottom-body');
  if (!body) return;

  if (activeTab === 'logs') {
    renderLogs(root);
    return;
  }

  if (!current) {
    body.innerHTML = `<p class="muted" style="font-size:var(--text-sm)">Scan a document to populate this panel.</p>`;
    return;
  }

  if (activeTab === 'fields') {
    body.innerHTML = `<pre class="textarea" style="white-space:pre-wrap;border:0;background:transparent;padding:0">${escapeHtml(
      current.fields.map((f) => `${f.label}: ${f.value}`).join('\n') || '(no fields)'
    )}</pre>`;
  } else if (activeTab === 'ocr') {
    body.innerHTML = `<textarea class="textarea" readonly>${escapeHtml(current.rawText || '')}</textarea>`;
  } else if (activeTab === 'json') {
    body.innerHTML = `<textarea class="textarea" readonly>${escapeHtml(
      JSON.stringify(exportService.documentToJson(current), null, 2)
    )}</textarea>`;
  } else if (activeTab === 'csv') {
    body.innerHTML = `<textarea class="textarea" readonly>${escapeHtml(exportService.documentToCsv(current))}</textarea>`;
  }
}

/**
 * @param {HTMLElement} root
 */
function renderLogs(root) {
  if (activeTab !== 'logs') return;
  const body = root.querySelector('#bottom-body');
  if (!body) return;
  if (!logs.length) {
    body.innerHTML = `<p class="muted" style="font-size:var(--text-sm)">Logs appear as you scan.</p>`;
    return;
  }
  body.innerHTML = logs
    .map((l) => {
      const cls = l.level === 'error' ? 'log-line--error' : l.level === 'ok' ? 'log-line--ok' : '';
      return `<div class="log-line ${cls}">[${escapeHtml(l.at)}] ${escapeHtml(l.message)}</div>`;
    })
    .join('');
}

/**
 * @param {HTMLElement} root
 * @param {string} text
 */
function setStatus(root, text) {
  const el = root.querySelector('#status-chip');
  if (el) el.textContent = text;
}

/**
 * @param {string} str
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Soft filename hint so passport/invoice uploads pre-select a type.
 * @param {string} name
 */
function guessTypeFromName(name) {
  const n = String(name || '').toLowerCase();
  if (/passport/.test(n)) return 'Passport';
  if (/aadhaar|aadhar|pan[\s_-]?card|national[\s_-]?id|identity/.test(n)) return 'Identity Card';
  if (/invoice|tax[\s_-]?inv/.test(n)) return 'Invoice';
  if (/receipt/.test(n)) return 'Receipt';
  if (/bank|statement/.test(n)) return 'Bank Statement';
  if (/\bpo\b|purchase[\s_-]?order/.test(n)) return 'Purchase Order';
  if (/delivery|packing[\s_-]?list/.test(n)) return 'Delivery Note';
  if (/business[\s_-]?card|visiting[\s_-]?card/.test(n)) return 'Business Card';
  return '';
}
