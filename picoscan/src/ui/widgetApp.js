/**
 * Compact PicoScan UI for iframe embedding (PicoERP floating panel).
 */

import { APP_NAME, APP_VERSION, EVENTS } from '../core/constants.js';
import { on } from '../core/eventBus.js';
import { scanFile } from '../engine/scanEngine.js';
import { loadImageFromFile, isPasswordException } from '../engine/preprocess.js';
import * as knowledgeService from '../services/knowledgeService.js';
import * as exportService from '../services/exportService.js';
import { showToast } from './toast.js';
import { askPdfPassword } from './modal.js';

/** @type {import('../core/documentModel.js').ScanDocument|null} */
let current = null;
/** @type {string} */
let activeTab = 'fields';

/**
 * @param {HTMLElement} root
 */
export async function mountWidgetApp(root) {
  const categories = await knowledgeService.listAllCategories();
  root.innerHTML = shellHtml(categories);
  bind(root);

  on(EVENTS.LOG, () => {
    /* status driven via onStatus during scan */
  });
}

/**
 * @param {string[]} categories
 */
function shellHtml(categories) {
  return `
    <div class="widget-shell">
      <header class="widget-header">
        <div class="widget-header__brand">
          <img src="./favicon.svg" alt="" width="22" height="22" />
          <div>
            <div class="widget-header__title">${APP_NAME}</div>
            <div class="widget-header__sub">v${APP_VERSION} · embed</div>
          </div>
        </div>
        <button type="button" class="btn btn--ghost btn--sm" data-action="close" title="Close">✕</button>
      </header>

      <div class="widget-toolbar">
        <select id="w-type" class="select" title="Document type">
          <option value="">Auto-detect</option>
          ${categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
        </select>
        <button type="button" class="btn btn--secondary btn--sm" data-action="pick">Upload</button>
        <button type="button" class="btn btn--primary btn--sm" data-action="scan" disabled>Scan</button>
        <input id="w-file" class="sr-only" type="file" accept="image/*,application/pdf,.pdf" />
      </div>

      <div class="widget-status" id="w-status">Upload a document to scan</div>

      <div class="widget-preview" id="w-preview">
        <p class="muted" style="font-size:var(--text-xs);text-align:center">Preview appears here</p>
      </div>

      <div class="widget-tabs" role="tablist">
        ${['fields', 'table', 'ocr', 'json']
          .map(
            (id) =>
              `<button type="button" class="widget-tab ${id === 'fields' ? 'is-active' : ''}" data-tab="${id}">${
                id === 'fields' ? 'Fields' : id === 'table' ? 'Table' : id === 'ocr' ? 'OCR Text' : 'JSON'
              }</button>`
          )
          .join('')}
      </div>

      <div class="widget-panel" id="w-panel">
        <p class="muted" style="font-size:var(--text-sm)">Extracted content appears after Scan. Use Copy to paste into PicoERP.</p>
      </div>

      <div class="widget-footer">
        <button type="button" class="btn btn--secondary btn--sm" data-action="copy" disabled>Copy tab</button>
        <button type="button" class="btn btn--secondary btn--sm" data-action="copy-fields" disabled>Copy fields</button>
        <a class="widget-link" href="./index.html" target="_blank" rel="noopener">Open full PicoScan</a>
      </div>
    </div>
  `;
}

/**
 * @param {HTMLElement} root
 */
function bind(root) {
  /** @type {File|null} */
  let pending = null;
  /** @type {string} */
  let pendingPassword = '';
  /** @type {string} */
  let pendingUrl = '';

  const fileInput = /** @type {HTMLInputElement} */ (root.querySelector('#w-file'));
  const typeSelect = /** @type {HTMLSelectElement} */ (root.querySelector('#w-type'));
  const scanBtn = /** @type {HTMLButtonElement} */ (root.querySelector('[data-action="scan"]'));
  const copyBtn = /** @type {HTMLButtonElement} */ (root.querySelector('[data-action="copy"]'));
  const copyFieldsBtn = /** @type {HTMLButtonElement} */ (root.querySelector('[data-action="copy-fields"]'));

  const setStatus = (t) => {
    const el = root.querySelector('#w-status');
    if (el) el.textContent = t;
  };

  root.querySelector('[data-action="close"]')?.addEventListener('click', () => {
    try {
      window.parent?.postMessage({ source: 'picoscan', type: 'picoscan:close' }, window.location.origin);
    } catch {
      /* ignore */
    }
  });

  root.querySelector('[data-action="pick"]')?.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    fileInput.value = '';
    if (!f) return;
    if (pendingUrl) URL.revokeObjectURL(pendingUrl);
    pendingUrl = '';
    pending = f;
    pendingPassword = '';
    scanBtn.disabled = true;
    typeSelect.value = guessTypeFromName(f.name) || typeSelect.value;
    setStatus(`Loading ${f.name}…`);

    const preview = root.querySelector('#w-preview');
    try {
      const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
      if (!isPdf) {
        pendingUrl = URL.createObjectURL(f);
        if (preview) preview.innerHTML = `<img src="${pendingUrl}" alt="Pending" />`;
        scanBtn.disabled = false;
        setStatus(`Ready · ${f.name}`);
        return;
      }
      if (preview) preview.innerHTML = `<p class="muted" style="font-size:var(--text-xs)">Unlocking PDF…</p>`;
      let loaded;
      try {
        loaded = await loadImageFromFile(f, { password: '' });
      } catch (err) {
        if (!isPasswordException(err)) throw err;
        const pw = await askPdfPassword({});
        if (pw == null || pw === '') {
          pending = null;
          setStatus('PDF unlock cancelled');
          if (preview) preview.innerHTML = `<p class="muted" style="font-size:var(--text-xs)">Cancelled</p>`;
          return;
        }
        pendingPassword = pw;
        loaded = await loadImageFromFile(f, { password: pw });
      }
      if (preview) preview.innerHTML = `<img src="${loaded.dataUrl}" alt="PDF page" />`;
      scanBtn.disabled = false;
      setStatus(`Ready · ${f.name}`);
    } catch (err) {
      pending = null;
      setStatus(err instanceof Error ? err.message : 'Could not load file');
      showToast(err instanceof Error ? err.message : 'Load failed', 'error');
    }
  });

  scanBtn.addEventListener('click', async () => {
    if (!pending) return;
    scanBtn.disabled = true;
    try {
      current = await scanFile(pending, {
        documentType: typeSelect.value || undefined,
        password: pendingPassword || undefined,
        onStatus: setStatus,
      });
      setStatus(`Scanned · ${current.documentType}`);
      copyBtn.disabled = false;
      copyFieldsBtn.disabled = false;
      renderPanel(root);
      showToast('Scan complete — copy into PicoERP', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Scan failed', 'error');
      setStatus('Scan failed');
    } finally {
      scanBtn.disabled = !pending;
    }
  });

  root.querySelectorAll('[data-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      activeTab = tab.getAttribute('data-tab') || 'fields';
      root.querySelectorAll('[data-tab]').forEach((t) => {
        t.classList.toggle('is-active', t.getAttribute('data-tab') === activeTab);
      });
      renderPanel(root);
    });
  });

  copyBtn.addEventListener('click', async () => {
    if (!current) return;
    try {
      await navigator.clipboard.writeText(tabPlainText(current, activeTab));
      showToast('Copied', 'success');
    } catch {
      showToast('Clipboard failed', 'error');
    }
  });

  copyFieldsBtn.addEventListener('click', async () => {
    if (!current) return;
    try {
      const text = current.fields.map((f) => `${f.label}: ${f.value}`).join('\n');
      await navigator.clipboard.writeText(text);
      showToast('Fields copied', 'success');
    } catch {
      showToast('Clipboard failed', 'error');
    }
  });
}

/**
 * @param {HTMLElement} root
 */
function renderPanel(root) {
  const panel = root.querySelector('#w-panel');
  if (!panel) return;
  if (!current) {
    panel.innerHTML = `<p class="muted" style="font-size:var(--text-sm)">Extracted content appears after Scan.</p>`;
    return;
  }

  if (activeTab === 'fields') {
    panel.innerHTML = `<div class="widget-fields">${current.fields
      .map(
        (f) => `
      <div class="widget-field">
        <div class="widget-field__label">${escapeHtml(f.label)}</div>
        <div class="widget-field__value">${escapeHtml(f.value || '—')}</div>
        <button type="button" class="btn btn--ghost btn--sm" data-copy-one="${escapeHtml(f.value)}">Copy</button>
      </div>`
      )
      .join('')}</div>`;
    panel.querySelectorAll('[data-copy-one]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(btn.getAttribute('data-copy-one') || '');
          showToast('Copied', 'success');
        } catch {
          showToast('Clipboard failed', 'error');
        }
      });
    });
    return;
  }

  if (activeTab === 'table') {
    const table = current.tables?.find((t) => t.rows?.length);
    if (!table) {
      panel.innerHTML = `<p class="muted" style="font-size:var(--text-sm)">No table rows extracted.</p>`;
      return;
    }
    panel.innerHTML = `<div class="widget-table-wrap"><table class="field-table txn-table">
      <thead><tr>${table.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
      <tbody>${table.rows
        .slice(0, 300)
        .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`)
        .join('')}</tbody>
    </table></div>`;
    return;
  }

  if (activeTab === 'ocr') {
    panel.innerHTML = `<pre class="widget-pre">${escapeHtml(current.rawText || '')}</pre>`;
    return;
  }

  panel.innerHTML = `<pre class="widget-pre">${escapeHtml(
    JSON.stringify(exportService.documentToJson(current), null, 2)
  )}</pre>`;
}

/**
 * @param {import('../core/documentModel.js').ScanDocument} doc
 * @param {string} tab
 */
function tabPlainText(doc, tab) {
  if (tab === 'fields') return doc.fields.map((f) => `${f.label}: ${f.value}`).join('\n');
  if (tab === 'ocr') return doc.rawText || '';
  if (tab === 'json') return JSON.stringify(exportService.documentToJson(doc), null, 2);
  const table = doc.tables?.find((t) => t.rows?.length);
  if (!table) return '';
  const lines = [table.headers.join('\t')];
  for (const row of table.rows) lines.push(row.join('\t'));
  return lines.join('\n');
}

/**
 * @param {string} name
 */
function guessTypeFromName(name) {
  const n = String(name || '').toLowerCase();
  if (/passport/.test(n)) return 'Passport';
  if (/invoice/.test(n)) return 'Invoice';
  if (/receipt/.test(n)) return 'Receipt';
  if (/bank|statement|acct_statement/.test(n)) return 'Bank Statement';
  return '';
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
