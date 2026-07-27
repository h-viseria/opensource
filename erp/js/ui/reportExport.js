/**
 * Shared CSV / PDF download for report screens.
 * CSV downloads from on-screen tables.
 * PDF opens a printer-friendly preview popup; use Print → Save as PDF.
 */

import { downloadCsv, escapeCsvCell } from '../utils/csv.js';
import { showToast } from './toast.js';

/**
 * Ensure Download CSV / PDF buttons exist on the page header, then bind them.
 * @param {HTMLElement} outlet
 * @param {{
 *   fileBase?: string,
 *   title?: string,
 *   subtitle?: string,
 * }} [opts]
 */
export function wireReportDownloads(outlet, opts = {}) {
  ensureExportButtons(outlet);

  const title =
    opts.title ||
    outlet.querySelector('.page-header__title')?.textContent?.trim() ||
    'Report';
  const subtitle =
    opts.subtitle ||
    outlet.querySelector('.page-header__desc')?.textContent?.replace(/\s+/g, ' ').trim() ||
    '';
  const fileBase = opts.fileBase || slugify(title) || 'report';

  outlet.querySelectorAll('[data-report-export="csv"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      try {
        const csv = buildReportCsv(outlet, { title, subtitle });
        if (!csv.trim()) {
          showToast('Nothing to export', 'info');
          return;
        }
        downloadCsv(`${fileBase}.csv`, csv);
        showToast('CSV downloaded', 'success');
      } catch (err) {
        console.error(err);
        showToast(err instanceof Error ? err.message : 'CSV export failed', 'error');
      }
    });
  });

  outlet.querySelectorAll('[data-report-export="pdf"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      try {
        openPrintPreview(outlet, { title, subtitle });
      } catch (err) {
        console.error(err);
        showToast(err instanceof Error ? err.message : 'Could not open print preview', 'error');
      }
    });
  });
}

/**
 * @param {HTMLElement} outlet
 */
function ensureExportButtons(outlet) {
  const header = outlet.querySelector('.page-header');
  if (!header) return;

  let actions = header.querySelector('.page-header__actions');
  if (!actions) {
    actions = document.createElement('div');
    actions.className = 'page-header__actions';
    header.appendChild(actions);
  }

  if (actions.querySelector('[data-report-export="csv"]')) return;

  actions.insertAdjacentHTML(
    'beforeend',
    `
    <button type="button" class="btn btn--secondary" data-report-export="csv" title="Download CSV">CSV</button>
    <button type="button" class="btn btn--secondary" data-report-export="pdf" title="Open print preview">PDF</button>`
  );
}

/**
 * @param {HTMLElement} outlet
 * @param {{ title: string, subtitle: string }} meta
 */
function buildReportCsv(outlet, meta) {
  /** @type {string[][]} */
  const matrix = [];
  matrix.push([meta.title]);
  if (meta.subtitle) matrix.push([meta.subtitle]);
  matrix.push([]);

  const tiles = outlet.querySelectorAll('.stat-tile, .stat-card, .pnl-result, .bs-check, .bs-financing');
  if (tiles.length) {
    for (const tile of tiles) {
      const label =
        tile.querySelector('.stat-tile__label, .stat-card__label, .pnl-result__label, .bs-check__label')
          ?.textContent?.replace(/\s+/g, ' ')
          .trim() ||
        tile.querySelector('span')?.textContent?.replace(/\s+/g, ' ').trim() ||
        '';
      const value =
        tile.querySelector(
          '.stat-tile__value, .stat-card__value, .pnl-result__value, .bs-check__eq, strong.mono, .mono'
        )?.textContent?.replace(/\s+/g, ' ').trim() ||
        tile.textContent?.replace(/\s+/g, ' ').trim() ||
        '';
      if (label || value) matrix.push([label || 'Summary', value]);
    }
    matrix.push([]);
  }

  const vouchers = outlet.querySelectorAll('.daybook-voucher');
  if (vouchers.length) {
    for (const block of vouchers) {
      const head = block.querySelector('.daybook-voucher__head')?.textContent?.replace(/\s+/g, ' ').trim() || '';
      const narr = block.querySelector('.daybook-voucher__narration')?.textContent?.replace(/\s+/g, ' ').trim() || '';
      if (head) matrix.push([head]);
      if (narr) matrix.push(['Narration', narr]);
      const table = block.querySelector('table');
      if (table) appendTableMatrix(matrix, table);
      matrix.push([]);
    }
    return matrixToCsv(matrix);
  }

  const panels = outlet.querySelectorAll('.panel');
  let anyTable = false;
  for (const panel of panels) {
    const tables = panel.querySelectorAll('table.data-table, table');
    if (!tables.length) continue;
    const sectionTitle = panel.querySelector('.panel__title')?.textContent?.replace(/\s+/g, ' ').trim();
    if (sectionTitle) {
      matrix.push([sectionTitle]);
    }
    for (const table of tables) {
      appendTableMatrix(matrix, table);
      anyTable = true;
    }
    matrix.push([]);
  }

  if (!anyTable) {
    for (const table of outlet.querySelectorAll('table')) {
      appendTableMatrix(matrix, table);
      matrix.push([]);
    }
  }

  return matrixToCsv(matrix);
}

/**
 * @param {string[][]} matrix
 * @param {HTMLTableElement} table
 */
function appendTableMatrix(matrix, table) {
  const rows = table.querySelectorAll('thead tr, tbody tr, tfoot tr');
  for (const tr of rows) {
    /** @type {string[]} */
    const cells = [];
    for (const cell of tr.querySelectorAll('th, td')) {
      const text = cell.textContent?.replace(/\s+/g, ' ').trim() || '';
      const colspan = Number(cell.getAttribute('colspan') || 1);
      cells.push(text);
      for (let i = 1; i < colspan; i++) cells.push('');
    }
    if (cells.some((c) => c)) matrix.push(cells);
  }
}

/**
 * @param {string[][]} matrix
 */
function matrixToCsv(matrix) {
  const width = matrix.reduce((m, row) => Math.max(m, row.length), 0);
  return (
    matrix
      .map((row) => {
        const padded = row.slice();
        while (padded.length < width) padded.push('');
        return padded.map((c) => escapeCsvCell(c)).join(',');
      })
      .join('\r\n') + '\r\n'
  );
}

/**
 * Open an in-app printer-friendly preview. User clicks Print / Save as PDF when ready.
 * (Avoids blank popup tabs from window.open + noopener / popup blockers.)
 * @param {HTMLElement} outlet
 * @param {{ title: string, subtitle: string }} meta
 */
function openPrintPreview(outlet, meta) {
  // Close any existing preview
  document.getElementById('report-print-overlay')?.remove();
  document.body.classList.remove('has-report-print-preview');

  const clone = /** @type {HTMLElement} */ (outlet.cloneNode(true));
  clone
    .querySelectorAll(
      'form, .page-header, .page-header__actions, .page-eyebrow, button, input, select, textarea, .toolbar, .filter-bar'
    )
    .forEach((el) => el.remove());

  const bodyHtml = clone.innerHTML.trim();
  if (!bodyHtml) {
    showToast('Nothing to preview on this report', 'info');
    return;
  }

  const generatedAt = new Date().toLocaleString();
  const overlay = document.createElement('div');
  overlay.id = 'report-print-overlay';
  overlay.className = 'report-print-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Print preview');

  overlay.innerHTML = `
    <div class="report-print-chrome">
      <div class="report-print-chrome__copy">
        <strong>Printer-friendly preview</strong>
        <span>Review the report, then click <em>Print / Save as PDF</em> and choose “Save as PDF”.</span>
      </div>
      <div class="report-print-chrome__actions">
        <button type="button" class="btn btn--ghost" data-print-close>Close</button>
        <button type="button" class="btn btn--primary" data-print-go>Print / Save as PDF</button>
      </div>
    </div>
    <div class="report-print-scroll">
      <article class="report-print-sheet">
        <div class="report-print-sheet__brand">PicoERP</div>
        <h1 class="report-print-sheet__title">${escapeHtml(meta.title)}</h1>
        ${meta.subtitle ? `<p class="report-print-sheet__meta">${escapeHtml(meta.subtitle)}</p>` : ''}
        <div class="report-print-sheet__body">${bodyHtml}</div>
        <p class="report-print-sheet__stamp">Generated ${escapeHtml(generatedAt)}</p>
      </article>
    </div>
  `;

  const close = () => {
    overlay.remove();
    document.body.classList.remove('has-report-print-preview');
    document.removeEventListener('keydown', onKey);
  };

  /** @param {KeyboardEvent} e */
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };

  overlay.querySelector('[data-print-close]')?.addEventListener('click', close);
  overlay.querySelector('[data-print-go]')?.addEventListener('click', () => {
    window.print();
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  document.body.appendChild(overlay);
  document.body.classList.add('has-report-print-preview');
  document.addEventListener('keydown', onKey);
  overlay.querySelector('[data-print-go]')?.focus();
}

/**
 * @param {string} text
 */
function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

/**
 * @param {string} s
 */
function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
