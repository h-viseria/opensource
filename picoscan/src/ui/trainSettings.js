/**
 * Train + Settings modals for knowledge base.
 */

import * as knowledgeService from '../services/knowledgeService.js';
import * as backupService from '../services/backupService.js';
import { askPdfPassword } from './modal.js';
import { isPasswordException } from '../engine/preprocess.js';

/**
 * @param {{ onStatus?: (m: string) => void, onDone?: () => void }} [hooks]
 */
export async function openTrainModal(hooks = {}) {
  const categories = await knowledgeService.listAllCategories();
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal modal--wide" role="dialog" aria-modal="true" aria-labelledby="train-title">
      <div class="modal__header">
        <h2 class="modal__title" id="train-title">Train knowledge</h2>
      </div>
      <div class="modal__body">
        <p class="muted" style="font-size:var(--text-sm);margin-bottom:0.85rem">
          Pair a sample document with its mapped CSV. Next time you select this category on Scan,
          PicoScan will reuse that column/field mapping from IndexedDB.
        </p>
        <label class="field-label" for="train-category">Category</label>
        <div class="train-cat-row">
          <select id="train-category" class="select">
            ${categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
          </select>
          <input id="train-category-new" class="input" placeholder="Or type a new category" />
        </div>
        <label class="field-label" for="train-doc">Sample document (image / PDF)</label>
        <input id="train-doc" class="input" type="file" accept="image/*,application/pdf,.pdf" />
        <label class="field-label" for="train-csv">Mapped CSV</label>
        <input id="train-csv" class="input" type="file" accept=".csv,text/csv" />
        <p id="train-status" class="modal__hint muted"></p>
      </div>
      <div class="modal__footer">
        <button type="button" class="btn btn--ghost" data-modal="cancel">Cancel</button>
        <button type="button" class="btn btn--primary" data-modal="ok">Train</button>
      </div>
    </div>
  `;

  const setMsg = (t) => {
    const el = backdrop.querySelector('#train-status');
    if (el) el.textContent = t;
    hooks.onStatus?.(t);
  };

  const close = () => backdrop.remove();

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  backdrop.querySelector('[data-modal="cancel"]')?.addEventListener('click', close);

  backdrop.querySelector('[data-modal="ok"]')?.addEventListener('click', async () => {
    const catSelect = /** @type {HTMLSelectElement} */ (backdrop.querySelector('#train-category'));
    const catNew = /** @type {HTMLInputElement} */ (backdrop.querySelector('#train-category-new'));
    const docInput = /** @type {HTMLInputElement} */ (backdrop.querySelector('#train-doc'));
    const csvInput = /** @type {HTMLInputElement} */ (backdrop.querySelector('#train-csv'));
    const category = (catNew.value || catSelect.value || '').trim();
    const documentFile = docInput.files?.[0];
    const csvFile = csvInput.files?.[0];
    if (!category) {
      setMsg('Choose or enter a category.');
      return;
    }
    if (!documentFile || !csvFile) {
      setMsg('Provide both a sample document and a mapped CSV.');
      return;
    }

    const okBtn = /** @type {HTMLButtonElement} */ (backdrop.querySelector('[data-modal="ok"]'));
    okBtn.disabled = true;
    try {
      let password = '';
      const isPdf = documentFile.type === 'application/pdf' || /\.pdf$/i.test(documentFile.name);
      if (isPdf) {
        try {
          await knowledgeService.trainFromFiles({
            category,
            documentFile,
            csvFile,
            password: '',
            onStatus: setMsg,
          });
        } catch (err) {
          if (!isPasswordException(err)) throw err;
          const pw = await askPdfPassword({ incorrect: false });
          if (pw == null || pw === '') throw new Error('PDF unlock cancelled');
          password = pw;
          await knowledgeService.trainFromFiles({
            category,
            documentFile,
            csvFile,
            password,
            onStatus: setMsg,
          });
        }
      } else {
        await knowledgeService.trainFromFiles({
          category,
          documentFile,
          csvFile,
          onStatus: setMsg,
        });
      }
      setMsg('Training saved to IndexedDB.');
      hooks.onDone?.();
      setTimeout(close, 500);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Training failed');
      okBtn.disabled = false;
    }
  });

  document.body.appendChild(backdrop);
}

/**
 * @param {{ onDone?: () => void }} [hooks]
 */
export async function openSettingsModal(hooks = {}) {
  const entries = await knowledgeService.listKnowledgeEntries();
  const categories = await knowledgeService.listAllCategories();
  const backup = await backupService.buildFullBackup();
  const docCount = backup.stores.documents?.length || 0;
  const kbCount = backup.stores.knowledge?.length || 0;
  const catCount = backup.stores.categories?.length || 0;

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal modal--wide" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div class="modal__header">
        <h2 class="modal__title" id="settings-title">Settings</h2>
      </div>
      <div class="modal__body">
        <h3 class="settings-section-title">Full backup</h3>
        <p class="muted" style="font-size:var(--text-sm);margin-bottom:0.75rem">
          Backup / restore the entire IndexedDB (<code>${escapeHtml(backup.dbName)}</code>):
          documents, knowledge, categories, settings.
          Currently ${docCount} document(s), ${kbCount} knowledge sample(s), ${catCount} custom categor${catCount === 1 ? 'y' : 'ies'}.
        </p>
        <div class="settings-actions">
          <button type="button" class="btn btn--secondary" data-backup="download">Download full backup</button>
          <button type="button" class="btn btn--secondary" data-backup="restore">Restore full backup</button>
          <input id="backup-upload-input" class="sr-only" type="file" accept="application/json,.json" />
        </div>
        <label class="field-label">Restore mode</label>
        <select id="backup-import-mode" class="select">
          <option value="replace">Replace all IndexedDB data</option>
          <option value="merge">Merge (keep existing, overwrite same ids)</option>
        </select>

        <h3 class="settings-section-title" style="margin-top:1.25rem">Knowledge base</h3>
        <p class="muted" style="font-size:var(--text-sm);margin-bottom:0.75rem">
          Trained mappings only (<code>knowledge</code> + <code>categories</code>).
          ${entries.length} trained sample(s) · ${categories.length} categories in dropdown.
        </p>
        <div class="settings-actions">
          <button type="button" class="btn btn--secondary" data-kb="download">Download KnowledgeBase</button>
          <button type="button" class="btn btn--secondary" data-kb="upload">Upload KnowledgeBase</button>
          <input id="kb-upload-input" class="sr-only" type="file" accept="application/json,.json" />
        </div>
        <label class="field-label">Knowledge import mode</label>
        <select id="kb-import-mode" class="select">
          <option value="merge">Merge with existing</option>
          <option value="replace">Replace knowledge only</option>
        </select>
        <div class="kb-list">
          ${
            entries.length
              ? entries
                  .map(
                    (e) => `
              <div class="kb-item" data-kb-id="${escapeHtml(e.id)}">
                <div>
                  <div class="kb-item__title">${escapeHtml(e.category)}</div>
                  <div class="muted" style="font-size:var(--text-xs)">${escapeHtml(e.name)} · ${escapeHtml(e.mapping?.kind || '')}</div>
                </div>
                <button type="button" class="btn btn--ghost btn--sm" data-kb-del="${escapeHtml(e.id)}">Delete</button>
              </div>`
                  )
                  .join('')
              : `<p class="muted" style="font-size:var(--text-sm)">No trained samples yet. Use Train to add one.</p>`
          }
        </div>
        <p id="settings-status" class="modal__hint muted"></p>
      </div>
      <div class="modal__footer">
        <button type="button" class="btn btn--primary" data-modal="close">Close</button>
      </div>
    </div>
  `;

  const setMsg = (t) => {
    const el = backdrop.querySelector('#settings-status');
    if (el) el.textContent = t;
  };

  const close = () => {
    backdrop.remove();
    hooks.onDone?.();
  };

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  backdrop.querySelector('[data-modal="close"]')?.addEventListener('click', close);

  backdrop.querySelector('[data-backup="download"]')?.addEventListener('click', async () => {
    try {
      setMsg('Building backup…');
      await backupService.downloadFullBackup();
      setMsg('Full backup downloaded.');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Backup failed');
    }
  });

  const backupInput = /** @type {HTMLInputElement} */ (backdrop.querySelector('#backup-upload-input'));
  backdrop.querySelector('[data-backup="restore"]')?.addEventListener('click', () => backupInput.click());
  backupInput.addEventListener('change', async () => {
    const file = backupInput.files?.[0];
    backupInput.value = '';
    if (!file) return;
    const modeSel = /** @type {HTMLSelectElement} */ (backdrop.querySelector('#backup-import-mode'));
    const mode = modeSel.value === 'merge' ? 'merge' : 'replace';
    if (mode === 'replace') {
      const ok = window.confirm(
        'Replace ALL IndexedDB data (documents, knowledge, categories, settings) with this backup?'
      );
      if (!ok) return;
    }
    try {
      setMsg('Restoring…');
      const result = await backupService.restoreFullBackup(file, { mode });
      setMsg(`Restored (${result.mode}): ${JSON.stringify(result.counts)}`);
      close();
      hooks.onDone?.();
      await openSettingsModal(hooks);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Restore failed');
    }
  });

  backdrop.querySelector('[data-kb="download"]')?.addEventListener('click', async () => {
    try {
      await knowledgeService.downloadKnowledgeBase();
      setMsg('Knowledge base downloaded.');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Download failed');
    }
  });

  const uploadInput = /** @type {HTMLInputElement} */ (backdrop.querySelector('#kb-upload-input'));
  backdrop.querySelector('[data-kb="upload"]')?.addEventListener('click', () => uploadInput.click());
  uploadInput.addEventListener('change', async () => {
    const file = uploadInput.files?.[0];
    uploadInput.value = '';
    if (!file) return;
    const mode = /** @type {HTMLSelectElement} */ (backdrop.querySelector('#kb-import-mode')).value;
    try {
      const result = await knowledgeService.uploadKnowledgeBase(file, {
        mode: mode === 'replace' ? 'replace' : 'merge',
      });
      setMsg(`Imported ${result.saved} knowledge entries (${result.mode}).`);
      close();
      await openSettingsModal(hooks);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Import failed');
    }
  });

  backdrop.querySelectorAll('[data-kb-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-kb-del');
      if (!id) return;
      await knowledgeService.removeKnowledgeEntry(id);
      setMsg('Entry deleted.');
      close();
      await openSettingsModal(hooks);
    });
  });

  document.body.appendChild(backdrop);
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
