/**
 * Reusable CSV import panel — template download + label-mapped upload.
 */

import {
  downloadTemplate,
  parseCsvByLabels,
  readFileAsText,
} from '../utils/csv.js';
import { showToast } from './toast.js';
import { escapeHtml } from './modal.js';

/**
 * Markup for the CSV import panel. Place after page header / toolbar.
 * @param {{ title?: string, hint?: string }} [opts]
 */
export function csvImportPanelHtml(opts = {}) {
  const title = opts.title || 'CSV import';
  const hint =
    opts.hint ||
    'Download the template, keep the column labels exactly as shown, fill rows, then upload. Columns are matched by label (not position). Dates use DD-MMM-YYYY (e.g. 01-JUL-2026).';

  return `
    <div class="panel csv-import" data-csv-import>
      <h2 class="panel__title">${escapeHtml(title)}</h2>
      <p class="panel__desc">${escapeHtml(hint)}</p>
      <div class="csv-import__actions">
        <button type="button" class="btn btn--secondary btn--sm" data-csv-template>Download template</button>
        <button type="button" class="btn btn--secondary btn--sm" data-csv-upload>Upload CSV</button>
        <input type="file" accept=".csv,text/csv" hidden data-csv-file />
      </div>
      <div class="csv-import__result muted" data-csv-result hidden></div>
    </div>
  `;
}

/**
 * @typedef {object} CsvImportResult
 * @property {number} created
 * @property {number} failed
 * @property {string[]} errors
 */

/**
 * Wire template download + upload on a panel (or any container with data-csv-import).
 *
 * @param {ParentNode} root
 * @param {{
 *   labels: string[],
 *   fileName: string,
 *   sampleRows?: Record<string, unknown>[],
 *   requireAllLabels?: boolean,
 *   onRows: (rows: Record<string, string>[]) => Promise<CsvImportResult>,
 *   onDone?: (result: CsvImportResult) => void | Promise<void>,
 * }} opts
 */
export function wireCsvImport(root, opts) {
  const panel =
    root instanceof Element && root.matches?.('[data-csv-import]')
      ? root
      : root.querySelector('[data-csv-import]');
  if (!panel) return;

  const btnTemplate = panel.querySelector('[data-csv-template]');
  const btnUpload = panel.querySelector('[data-csv-upload]');
  const fileInput = /** @type {HTMLInputElement|null} */ (panel.querySelector('[data-csv-file]'));
  const resultEl = /** @type {HTMLElement|null} */ (panel.querySelector('[data-csv-result]'));

  btnTemplate?.addEventListener('click', () => {
    downloadTemplate({
      labels: opts.labels,
      fileName: opts.fileName,
      sampleRows: opts.sampleRows || [],
    });
    showToast('Template downloaded', 'success');
  });

  btnUpload?.addEventListener('click', () => fileInput?.click());

  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;

    try {
      const text = await readFileAsText(file);
      const { rows, missingLabels } = parseCsvByLabels(text, opts.labels);

      if (opts.requireAllLabels !== false && missingLabels.length) {
        showToast(`Missing columns: ${missingLabels.join(', ')}`, 'error');
        if (resultEl) {
          resultEl.hidden = false;
          resultEl.innerHTML = `<span class="text-danger">Missing required labels: ${escapeHtml(
            missingLabels.join(', ')
          )}</span>`;
        }
        return;
      }

      if (rows.length === 0) {
        showToast('CSV has no data rows', 'error');
        return;
      }

      const result = await opts.onRows(rows);
      const created = result.created || 0;
      const failed = result.failed || 0;
      const errors = result.errors || [];

      if (resultEl) {
        resultEl.hidden = false;
        const errHtml =
          errors.length > 0
            ? `<ul class="csv-import__errors">${errors
                .slice(0, 12)
                .map((e) => `<li>${escapeHtml(e)}</li>`)
                .join('')}${
                errors.length > 12
                  ? `<li>…and ${errors.length - 12} more</li>`
                  : ''
              }</ul>`
            : '';
        resultEl.innerHTML = `
          <p><strong>${created}</strong> created${failed ? `, <strong>${failed}</strong> failed` : ''}.</p>
          ${errHtml}
        `;
      }

      if (created > 0 && failed === 0) {
        showToast(`Imported ${created} row${created === 1 ? '' : 's'}`, 'success');
      } else if (created > 0) {
        showToast(`Imported ${created}, ${failed} failed`, 'info');
      } else {
        showToast(errors[0] || 'Import failed', 'error');
      }

      if (opts.onDone) await opts.onDone(result);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Import failed', 'error');
      if (resultEl) {
        resultEl.hidden = false;
        resultEl.innerHTML = `<span class="text-danger">${escapeHtml(
          err instanceof Error ? err.message : 'Import failed'
        )}</span>`;
      }
    }
  });
}
