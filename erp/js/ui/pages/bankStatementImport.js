/**
 * Bulk Load → Bank Statement CSV import UI.
 * CSV grid loads on upload; each column header has a field-mapping dropdown.
 */

import * as bookService from '../../services/bookService.js';
import * as bankStmt from '../../services/bankStatementImportService.js';
import { readFileAsText } from '../../utils/csv.js';
import { formatMoney } from '../../utils/money.js';
import { escapeHtml, confirmModal } from '../modal.js';
import { showToast } from '../toast.js';

/**
 * @param {import('../../core/router.js').RouteContext} _ctx
 * @param {HTMLElement} outlet
 */
export async function renderBankStatementImport(_ctx, outlet) {
  const { book } = await bookService.getSessionContext();
  if (!book) {
    outlet.innerHTML = `<p class="muted">No active book. Select a book first.</p>`;
    return;
  }

  const prefs = await bankStmt.getBookPrefs(book.id);
  const bankLedgers = await bankStmt.listBankLikeLedgers(book.id);

  /** @type {string|null} */
  let csvText = null;
  /** @type {string[]} */
  let headers = [];
  /** @type {string[][]} */
  let matrix = [];
  /** @type {Record<string, string>} */
  let headerRoles = {};
  /** @type {Awaited<ReturnType<typeof bankStmt.buildPreview>>|null} */
  let previewData = null;

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/bulk-load">Bulk Load</a> / Bank Statement</p>
        <h1 class="page-header__title">Bank Statement</h1>
        <p class="page-header__desc">
          Import a bank CSV into <strong>${escapeHtml(book.name)}</strong>.
          Upload the file to see rows, map each column from its header, then validate and import.
        </p>
      </div>
    </div>

    <div class="panel">
      <h2 class="panel__title">1. File &amp; options</h2>
      <div class="form-grid">
        <label class="field">
          <span class="field__label">Bank / cash ledger</span>
          <select class="select" id="bs-bank">
            <option value="">Select ledger…</option>
            ${bankLedgers
              .map(
                (l) =>
                  `<option value="${escapeHtml(l.id)}" ${
                    prefs.bankLedgerId === l.id ? 'selected' : ''
                  }>${escapeHtml(l.name)}${l.code ? ` (${escapeHtml(l.code)})` : ''}</option>`
              )
              .join('')}
          </select>
        </label>
        <label class="field">
          <span class="field__label">Lines to skip from top</span>
          <input class="input" type="number" id="bs-skip" min="0" step="1"
                 value="${escapeHtml(String(prefs.skipTopLines || 0))}" />
          <span class="field__hint">Drop this many lines from the top of the file (blank lines count). Everything after that is shown as data for you to map — no header is required.</span>
        </label>
        <label class="field">
          <span class="field__label">Date format</span>
          <select class="select" id="bs-date-format">
            ${bankStmt.DATE_FORMATS.map(
              (f) =>
                `<option value="${escapeHtml(f.id)}" ${
                  prefs.dateFormat === f.id ? 'selected' : ''
                }>${escapeHtml(f.label)}</option>`
            ).join('')}
          </select>
        </label>
        <label class="field">
          <span class="field__label">Amount columns</span>
          <select class="select" id="bs-amount-mode">
            <option value="single" ${prefs.amountMode === 'single' ? 'selected' : ''}>
              Single Amount (+ deposit / − withdrawal)
            </option>
            <option value="split" ${prefs.amountMode === 'split' ? 'selected' : ''}>
              Separate Deposit + Withdrawal
            </option>
          </select>
        </label>
      </div>
      <div class="csv-import__actions" style="margin-top:0.75rem">
        <button type="button" class="btn btn--secondary" id="bs-choose">Choose CSV file</button>
        <input type="file" id="bs-file" accept=".csv,text/csv" hidden />
        <span class="muted" id="bs-file-label" style="font-size:var(--text-sm)"></span>
      </div>
    </div>

    <div class="panel" id="bs-grid-panel" hidden>
      <h2 class="panel__title">2. Statement data</h2>
      <p class="panel__desc">
        Each column is labeled Column 1, Column 2, … Map a column to Date, Amount (or Deposit / Withdrawal),
        Target, or Details using the dropdown under that column. Unmapped columns are ignored.
      </p>
      <div id="bs-grid-wrap" style="overflow:auto;max-height:22rem;margin-bottom:0.75rem"></div>
      <div class="csv-import__actions" style="flex-wrap:wrap;gap:0.5rem">
        <button type="button" class="btn btn--primary" id="bs-preview">Validate &amp; prepare import</button>
      </div>
    </div>

    <div class="panel" id="bs-preview-panel" hidden>
      <h2 class="panel__title">3. Confirm import</h2>
      <div id="bs-dup-warn" class="csv-import__result" hidden style="margin-bottom:0.75rem"></div>
      <div id="bs-preview-summary" class="muted" style="margin-bottom:0.75rem;font-size:var(--text-sm)"></div>
      <div style="overflow:auto;max-height:28rem">
        <table class="data-table" id="bs-preview-table">
          <thead>
            <tr>
              <th></th>
              <th>#</th>
              <th>Date</th>
              <th>Dir</th>
              <th class="num">Amount</th>
              <th>Narration</th>
              <th>Target ledger</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>

      <div id="bs-ignored-wrap" hidden style="margin-top:1.25rem">
        <h3 class="panel__title" style="font-size:var(--text-base);margin:0 0 0.5rem">Ignored rows</h3>
        <p class="panel__desc" style="margin-top:0">
          Rows with a blank or invalid date are not imported. Fix the date format or mapping and validate again if needed.
          Target values with <span class="mono">:</span> are matched as full account paths
          (e.g. <span class="mono">Expenses:Travel</span>); without a colon they match the ledger name.
        </p>
        <div style="overflow:auto;max-height:16rem">
          <table class="data-table" id="bs-ignored-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Date (raw)</th>
                <th>Amount</th>
                <th>Narration</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>

      <div class="csv-import__actions" style="margin-top:0.75rem;flex-wrap:wrap;gap:0.5rem">
        <label class="field" style="flex-direction:row;align-items:center;gap:0.4rem;margin:0">
          <input type="checkbox" id="bs-skip-dups" checked />
          <span class="field__label" style="margin:0">Skip rows that look like duplicates</span>
        </label>
        <button type="button" class="btn btn--primary" id="bs-import" disabled>Import vouchers</button>
      </div>
      <div id="bs-result" class="csv-import__result muted" hidden></div>
    </div>
  `;

  const fileInput = /** @type {HTMLInputElement} */ (outlet.querySelector('#bs-file'));
  const gridPanel = /** @type {HTMLElement} */ (outlet.querySelector('#bs-grid-panel'));
  const gridWrap = /** @type {HTMLElement} */ (outlet.querySelector('#bs-grid-wrap'));
  const previewPanel = /** @type {HTMLElement} */ (outlet.querySelector('#bs-preview-panel'));
  const previewBody = /** @type {HTMLElement} */ (outlet.querySelector('#bs-preview-table tbody'));
  const ignoredWrap = /** @type {HTMLElement} */ (outlet.querySelector('#bs-ignored-wrap'));
  const ignoredBody = /** @type {HTMLElement} */ (outlet.querySelector('#bs-ignored-table tbody'));
  const btnPreview = /** @type {HTMLButtonElement} */ (outlet.querySelector('#bs-preview'));
  const btnImport = /** @type {HTMLButtonElement} */ (outlet.querySelector('#bs-import'));
  const dupWarn = /** @type {HTMLElement} */ (outlet.querySelector('#bs-dup-warn'));
  const previewSummary = /** @type {HTMLElement} */ (outlet.querySelector('#bs-preview-summary'));
  const resultEl = /** @type {HTMLElement} */ (outlet.querySelector('#bs-result'));

  /**
   * @returns {'single'|'split'}
   */
  const amountMode = () => {
    const el = /** @type {HTMLSelectElement} */ (outlet.querySelector('#bs-amount-mode'));
    return el.value === 'split' ? 'split' : 'single';
  };

  /**
   * Role options allowed for the current amount mode.
   */
  const roleOptionsHtml = (selectedRole) => {
    const mode = amountMode();
    return bankStmt.COLUMN_ROLES.filter((r) => {
      if (mode === 'single' && (r.id === 'deposit' || r.id === 'withdrawal')) return false;
      if (mode === 'split' && r.id === 'amount') return false;
      return true;
    })
      .map(
        (r) =>
          `<option value="${escapeHtml(r.id)}" ${r.id === selectedRole ? 'selected' : ''}>${escapeHtml(
            r.label
          )}</option>`
      )
      .join('');
  };

  /**
   * Read header→role from the grid dropdowns.
   * @returns {Record<string, string>}
   */
  const readHeaderRoles = () => {
    /** @type {Record<string, string>} */
    const roles = {};
    gridWrap.querySelectorAll('select[data-header-role]').forEach((sel) => {
      const el = /** @type {HTMLSelectElement} */ (sel);
      const header = el.dataset.headerRole || '';
      const role = el.value;
      if (!header) return;
      if (role) {
        // One role → one column: clear if already claimed
        for (const [h, r] of Object.entries(roles)) {
          if (r === role) delete roles[h];
        }
        roles[header] = role;
      }
    });
    return roles;
  };

  /**
   * Sync exclusive roles when user changes a header dropdown.
   * @param {HTMLSelectElement} changed
   */
  const enforceExclusiveRoles = (changed) => {
    const role = changed.value;
    if (!role) return;
    gridWrap.querySelectorAll('select[data-header-role]').forEach((sel) => {
      const other = /** @type {HTMLSelectElement} */ (sel);
      if (other !== changed && other.value === role) other.value = '';
    });
  };

  const paintCsvGrid = () => {
    if (!headers.length) {
      gridWrap.innerHTML = '';
      return;
    }

    const maxRows = 200;
    const shown = matrix.slice(0, maxRows);
    const theadMaps = headers
      .map((h) => {
        const role = headerRoles[h] || '';
        return `<th style="vertical-align:bottom;min-width:8rem">
          <div style="font-size:var(--text-xs);margin-bottom:0.35rem;white-space:nowrap">${escapeHtml(
            h || '(blank)'
          )}</div>
          <select class="select" data-header-role="${escapeHtml(h)}" style="font-size:var(--text-sm);min-width:7.5rem">
            ${roleOptionsHtml(role)}
          </select>
        </th>`;
      })
      .join('');

    const body = shown
      .map(
        (cells, i) => `<tr>
        <td class="muted">${i + 1}</td>
        ${headers
          .map((_, c) => {
            const val = cells[c] || '';
            return `<td style="max-width:12rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(
              val
            )}">${escapeHtml(val)}</td>`;
          })
          .join('')}
      </tr>`
      )
      .join('');

    gridWrap.innerHTML = `
      <table class="data-table" id="bs-csv-table">
        <thead>
          <tr>
            <th style="vertical-align:bottom">#</th>
            ${theadMaps}
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
      ${
        matrix.length > maxRows
          ? `<p class="muted" style="font-size:var(--text-sm);margin:0.5rem 0 0">
              Showing first ${maxRows} of ${matrix.length} rows (all rows import after validate).
            </p>`
          : ''
      }
    `;

    gridWrap.querySelectorAll('select[data-header-role]').forEach((sel) => {
      sel.addEventListener('change', () => {
        enforceExclusiveRoles(/** @type {HTMLSelectElement} */ (sel));
        headerRoles = readHeaderRoles();
        previewPanel.hidden = true;
        previewData = null;
        btnImport.disabled = true;
      });
    });
  };

  const reloadCsvFromOptions = () => {
    if (!csvText) return;
    const skip = Number(
      /** @type {HTMLInputElement} */ (outlet.querySelector('#bs-skip')).value
    );
    const loaded = bankStmt.loadStatementCsv(csvText, skip);
    headers = loaded.headers;
    matrix = loaded.matrix;

    // Prefer split mode when two numeric columns look like withdrawal/deposit
    const modeEl = /** @type {HTMLSelectElement} */ (outlet.querySelector('#bs-amount-mode'));
    const contentGuess = bankStmt.guessColumnMapFromMatrix(matrix, 'split', prefs.columnMap);
    if (contentGuess.withdrawal && contentGuess.deposit && modeEl) {
      modeEl.value = 'split';
    }

    // Prefer DD/MM/YY when sample dates look like 18/04/26
    const dateEl = /** @type {HTMLSelectElement} */ (outlet.querySelector('#bs-date-format'));
    const dateColIdx = contentGuess.date
      ? Number(String(contentGuess.date).replace('Column ', '')) - 1
      : 0;
    const sampleDate = matrix[0]?.[dateColIdx] || matrix[0]?.[0] || '';
    if (dateEl && /^\d{1,2}\/\d{1,2}\/\d{2}$/.test(String(sampleDate).trim())) {
      dateEl.value = 'DD/MM/YY';
    }

    const guessed = bankStmt.guessColumnMapFromMatrix(matrix, amountMode(), prefs.columnMap);
    headerRoles = bankStmt.headerRolesFromColumnMap(guessed);
    for (const [h, role] of Object.entries(headerRoles)) {
      if (amountMode() === 'single' && (role === 'deposit' || role === 'withdrawal')) {
        delete headerRoles[h];
      }
      if (amountMode() === 'split' && role === 'amount') delete headerRoles[h];
    }
    paintCsvGrid();
    previewPanel.hidden = true;
    previewData = null;
    btnImport.disabled = true;
    const label = /** @type {HTMLElement} */ (outlet.querySelector('#bs-file-label'));
    if (label.dataset.fileName) {
      label.textContent = `${label.dataset.fileName} · from line ${loaded.firstDataLineNumber} · ${matrix.length} rows · ${headers.length} columns`;
    }
  };

  const paintPreviewTable = () => {
    if (!previewData) return;
    const currency = book.currency || 'INR';
    const ledgerOpts = (selectedId) => {
      const options = previewData.ledgerOptions?.length
        ? previewData.ledgerOptions
        : previewData.ledgers
            .filter((l) => l.id !== previewData.bankLedgerId)
            .map((l) => ({ id: l.id, label: l.name }));
      return (
        `<option value="">Select…</option>` +
        options
          .map(
            (l) =>
              `<option value="${escapeHtml(l.id)}" ${l.id === selectedId ? 'selected' : ''} title="${escapeHtml(
                l.label
              )}">${escapeHtml(l.label)}</option>`
          )
          .join('')
      );
    };

    previewBody.innerHTML = previewData.preview
      .map((row) => {
        const statusParts = [];
        if (row.duplicate) statusParts.push('<span class="badge badge--warning">duplicate?</span>');
        if (row.errors.length) {
          statusParts.push(
            `<span class="text-danger" title="${escapeHtml(row.errors.join('; '))}">${escapeHtml(
              row.errors[0]
            )}</span>`
          );
        } else {
          statusParts.push('<span class="badge badge--info">ok</span>');
        }
        const dir = row.direction === 'in' ? 'In' : row.direction === 'out' ? 'Out' : '—';
        return `
          <tr data-row="${row.rowIndex}">
            <td><input type="checkbox" data-skip ${row.skip ? '' : 'checked'} title="Include" /></td>
            <td>${row.rowIndex + 1}</td>
            <td class="mono">${escapeHtml(row.dateIso || '—')}</td>
            <td>${dir}</td>
            <td class="num">${escapeHtml(formatMoney(row.amount || 0, currency))}</td>
            <td style="max-width:14rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                title="${escapeHtml(row.narration)}">${escapeHtml(row.narration || '—')}</td>
            <td>
              <select class="select" data-target style="min-width:14rem;max-width:22rem;font-size:var(--text-sm)">
                ${ledgerOpts(row.targetLedgerId || '')}
              </select>
              ${
                row.targetLabel
                  ? `<div class="muted" style="font-size:var(--text-xs)">${escapeHtml(
                      row.targetLabel
                    )}</div>`
                  : ''
              }
            </td>
            <td>${statusParts.join(' ')}</td>
          </tr>`;
      })
      .join('');

    const ready = previewData.preview.filter((r) => !r.skip && !r.errors.length).length;
    const withErr = previewData.preview.filter((r) => r.errors.length).length;
    const ignoredCount = previewData.ignored?.length || 0;
    previewSummary.innerHTML = `
      ${previewData.rowCount} CSV rows ·
      ${previewData.preview.length} with valid dates ·
      ${ready} ready to import ·
      ${withErr} need attention ·
      ${ignoredCount} ignored (bad/blank date) ·
      ${previewData.duplicateCount} possible duplicate${previewData.duplicateCount === 1 ? '' : 's'}
    `;

    if (ignoredCount > 0) {
      ignoredWrap.hidden = false;
      ignoredBody.innerHTML = previewData.ignored
        .map(
          (row) => `<tr>
            <td>${row.rowIndex + 1}</td>
            <td class="mono">${escapeHtml(row.dateRaw || '—')}</td>
            <td>${escapeHtml(row.amountText || '—')}</td>
            <td style="max-width:14rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                title="${escapeHtml(row.narration)}">${escapeHtml(row.narration || '—')}</td>
            <td class="text-danger">${escapeHtml(row.reason)}</td>
          </tr>`
        )
        .join('');
    } else {
      ignoredWrap.hidden = true;
      ignoredBody.innerHTML = '';
    }

    if (previewData.duplicateWarning) {
      dupWarn.hidden = false;
      dupWarn.innerHTML = `<span class="text-danger">
        Warning: ${previewData.duplicateCount} rows already look posted on this bank ledger
        (same date, direction, and amount). This statement may have been imported before.
      </span>`;
    } else {
      dupWarn.hidden = true;
      dupWarn.innerHTML = '';
    }

    btnImport.disabled = ready === 0;

    previewBody.querySelectorAll('[data-target]').forEach((sel) => {
      sel.addEventListener('change', () => {
        const tr = /** @type {HTMLElement} */ (sel).closest('tr');
        const idx = Number(tr?.dataset.row);
        const row = previewData?.preview.find((r) => r.rowIndex === idx);
        if (!row || !previewData) return;
        const ledgerId = /** @type {HTMLSelectElement} */ (sel).value || null;
        row.targetLedgerId = ledgerId;
        row.errors = row.errors.filter((e) => !/target|Target|Unknown target/i.test(e));
        if (!ledgerId) row.errors.push('Target account required');
        else if (ledgerId === previewData.bankLedgerId) {
          row.errors.push('Target cannot be the same as the bank ledger');
          row.targetLedgerId = null;
        }
        paintPreviewTable();
      });
    });

    previewBody.querySelectorAll('[data-skip]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const tr = /** @type {HTMLElement} */ (cb).closest('tr');
        const idx = Number(tr?.dataset.row);
        const row = previewData?.preview.find((r) => r.rowIndex === idx);
        if (!row || !previewData) return;
        row.skip = !/** @type {HTMLInputElement} */ (cb).checked;
        const readyNow = previewData.preview.filter((r) => !r.skip && !r.errors.length).length;
        btnImport.disabled = readyNow === 0;
      });
    });
  };

  outlet.querySelector('#bs-choose')?.addEventListener('click', () => fileInput.click());

  outlet.querySelector('#bs-amount-mode')?.addEventListener('change', () => {
    if (!headers.length) return;
    headerRoles = readHeaderRoles();
    for (const [h, role] of Object.entries(headerRoles)) {
      if (amountMode() === 'single' && (role === 'deposit' || role === 'withdrawal')) {
        delete headerRoles[h];
      }
      if (amountMode() === 'split' && role === 'amount') delete headerRoles[h];
    }
    paintCsvGrid();
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    csvText = null;
    headers = [];
    matrix = [];
    headerRoles = {};
    previewData = null;
    gridPanel.hidden = true;
    previewPanel.hidden = true;
    btnImport.disabled = true;
    const label = /** @type {HTMLElement} */ (outlet.querySelector('#bs-file-label'));
    label.textContent = '';
    delete label.dataset.fileName;
    if (!file) return;

    try {
      csvText = await readFileAsText(file);
      label.dataset.fileName = file.name;
      reloadCsvFromOptions();
      gridPanel.hidden = false;
      showToast('CSV loaded — map columns in the grid headers', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not read CSV', 'error');
    }
  });

  outlet.querySelector('#bs-skip')?.addEventListener('change', () => {
    if (!csvText) return;
    try {
      reloadCsvFromOptions();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Invalid skip / CSV', 'error');
    }
  });

  btnPreview.addEventListener('click', async () => {
    if (!csvText) return;
    const bankLedgerId = /** @type {HTMLSelectElement} */ (outlet.querySelector('#bs-bank')).value;
    if (!bankLedgerId) {
      showToast('Select a bank / cash ledger', 'error');
      return;
    }

    headerRoles = readHeaderRoles();
    const columnMap = bankStmt.columnMapFromHeaderRoles(headers, headerRoles);

    if (!columnMap.date) {
      showToast('Map a column to Date', 'error');
      return;
    }
    if (amountMode() === 'single' && !columnMap.amount) {
      showToast('Map a column to Amount', 'error');
      return;
    }
    if (amountMode() === 'split' && !columnMap.deposit && !columnMap.withdrawal) {
      showToast('Map Deposit and/or Withdrawal columns', 'error');
      return;
    }

    btnPreview.disabled = true;
    try {
      const dateFormat = /** @type {HTMLSelectElement} */ (
        outlet.querySelector('#bs-date-format')
      ).value;
      const skipTopLines = Number(
        /** @type {HTMLInputElement} */ (outlet.querySelector('#bs-skip')).value
      );

      await bankStmt.saveBookPrefs(book.id, {
        bankLedgerId,
        skipTopLines,
        dateFormat,
        amountMode: amountMode(),
        columnMap,
      });
      prefs.columnMap = columnMap;

      previewData = await bankStmt.buildPreview({
        bookId: book.id,
        csvText,
        bankLedgerId,
        skipTopLines,
        dateFormat,
        amountMode: amountMode(),
        columnMap,
      });
      previewPanel.hidden = false;
      paintPreviewTable();
      previewPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (previewData.duplicateWarning) {
        showToast(
          `${previewData.duplicateCount} rows may already exist — check the warning`,
          'info'
        );
      } else {
        showToast('Validated — review targets then import', 'success');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Preview failed', 'error');
    } finally {
      btnPreview.disabled = false;
    }
  });

  btnImport.addEventListener('click', async () => {
    if (!previewData) return;
    const rows = previewData.preview;
    const skipDups = /** @type {HTMLInputElement} */ (outlet.querySelector('#bs-skip-dups'))
      .checked;
    const toPost = rows.filter(
      (r) => !r.skip && !r.errors.length && !(skipDups && r.duplicate)
    );
    if (!toPost.length) {
      showToast('No rows ready to import', 'info');
      return;
    }

    if (previewData.duplicateWarning && !skipDups) {
      const ok = await confirmModal({
        title: 'Possible duplicate import',
        danger: true,
        confirmLabel: 'Import anyway',
        bodyHtml: `<p>${previewData.duplicateCount} rows look like they may already be posted.
          Continue and create vouchers for all included rows?</p>`,
      });
      if (!ok) return;
    }

    const ok = await confirmModal({
      title: 'Import bank statement?',
      confirmLabel: `Post ${toPost.length} voucher${toPost.length === 1 ? '' : 's'}`,
      bodyHtml: `<p>Create <strong>${toPost.length}</strong> Payment / Receipt voucher(s)
        against the selected bank ledger?</p>`,
    });
    if (!ok) return;

    btnImport.disabled = true;
    resultEl.hidden = false;
    resultEl.textContent = 'Importing…';
    try {
      const result = await bankStmt.importPreviewRows({
        bookId: book.id,
        bankLedgerId: previewData.bankLedgerId,
        rows,
        skipDuplicates: skipDups,
        onProgress: (msg) => {
          resultEl.textContent = msg;
        },
      });
      const errHtml = result.errors.length
        ? `<ul class="csv-import__errors">${result.errors
            .slice(0, 12)
            .map((e) => `<li>${escapeHtml(e)}</li>`)
            .join('')}</ul>`
        : '';
      resultEl.innerHTML = `
        <p>
          Created <strong>${result.created}</strong> vouchers
          ${result.skipped ? ` · skipped ${result.skipped}` : ''}
          ${result.failed ? ` · <strong>${result.failed}</strong> failed` : ''}
        </p>
        ${errHtml}
        <p><a href="#/transactions/list">Open all vouchers</a></p>
      `;
      if (result.created > 0) showToast(`Imported ${result.created} vouchers`, 'success');
      else if (result.failed) showToast('Import finished with errors', 'error');
      else showToast('Nothing imported', 'info');

      if (csvText && result.created > 0) {
        const columnMap = bankStmt.columnMapFromHeaderRoles(headers, readHeaderRoles());
        previewData = await bankStmt.buildPreview({
          bookId: book.id,
          csvText,
          bankLedgerId: previewData.bankLedgerId,
          skipTopLines: Number(
            /** @type {HTMLInputElement} */ (outlet.querySelector('#bs-skip')).value
          ),
          dateFormat: /** @type {HTMLSelectElement} */ (
            outlet.querySelector('#bs-date-format')
          ).value,
          amountMode: amountMode(),
          columnMap,
        });
        paintPreviewTable();
      }
    } catch (err) {
      resultEl.innerHTML = `<span class="text-danger">${escapeHtml(
        err instanceof Error ? err.message : 'Import failed'
      )}</span>`;
      showToast(err instanceof Error ? err.message : 'Import failed', 'error');
    } finally {
      btnImport.disabled = false;
    }
  });
}
