/**
 * GNUCash Import / Export — accounts + transactions CSV (round-trip compatible).
 */

import * as bookService from '../../services/bookService.js';
import {
  previewAccounts,
  previewTransactions,
  importGnuCashAccounts,
  importGnuCashTransactions,
  exportGnuCashAccounts,
  exportGnuCashTransactions,
} from '../../services/gnuCashImportService.js';
import { readFileAsText, downloadCsv } from '../../utils/csv.js';
import { escapeHtml } from '../modal.js';
import { showToast } from '../toast.js';

/**
 * @param {import('../../core/router.js').RouteContext} _ctx
 * @param {HTMLElement} outlet
 */
export async function renderGnuCashImport(_ctx, outlet) {
  const { book } = await bookService.getSessionContext();
  if (!book) {
    outlet.innerHTML = `<p class="muted">No active book. Select a book first.</p>`;
    return;
  }

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/masters">Masters</a> / GNUCash Import/Export</p>
        <h1 class="page-header__title">GNUCash Import/Export</h1>
        <p class="page-header__desc">
          Import or export <strong>accounts</strong> and <strong>transactions</strong> CSV for
          <strong>${escapeHtml(book.name)}</strong> using the same GNUCash column labels
          (round-trip safe between PicoERP instances).
        </p>
      </div>
    </div>

    <div class="panel">
      <h2 class="panel__title">Export to GNUCash CSV</h2>
      <p class="panel__desc">
        Downloads use the same headers as import. After an import, export then re-import
        elsewhere to move the book. Prefer exporting accounts before transactions.
      </p>
      <div class="csv-import__actions">
        <button type="button" class="btn btn--primary" id="btn-export-accounts">
          Download accounts.csv
        </button>
        <button type="button" class="btn btn--primary" id="btn-export-txns">
          Download transactions.csv
        </button>
      </div>
      <div id="export-result" class="csv-import__result muted" hidden></div>
    </div>

    <div class="panel">
      <h2 class="panel__title">How to export from GNUCash (desktop)</h2>
      <ol class="gnu-steps">
        <li>
          <strong>Accounts:</strong> File → Export → Export Accounts → CSV
          (Account Type, Full Account Name, Placeholder, …).
        </li>
        <li>
          <strong>Transactions:</strong> Reports → Transaction Report → Export → CSV
          (Date, Transaction ID, Full Account Name, Amount Num., …).
        </li>
        <li>Import <strong>accounts first</strong>, then transactions.</li>
      </ol>
      <p class="panel__desc" style="margin-top:0.75rem;margin-bottom:0">
        Amounts use GNUCash signs (positive = debit, negative = credit).
        Dates use <span class="mono">MM/DD/YYYY</span>.
      </p>
    </div>

    <div class="panel">
      <h2 class="panel__title">1. Import chart of accounts</h2>
      <p class="panel__desc">
        Placeholder accounts become groups; leaf (and posting parent) accounts become ledgers.
        Hierarchy follows Full Account Name (<span class="mono">Assets:Current Assets:…</span>).
      </p>
      <div class="csv-import__actions">
        <button type="button" class="btn btn--secondary" id="btn-accounts">Choose accounts.csv</button>
        <input type="file" id="file-accounts" accept=".csv,text/csv" hidden />
      </div>
      <div id="accounts-preview" class="gnu-preview muted" hidden></div>
      <div class="csv-import__actions" style="margin-top:0.75rem">
        <button type="button" class="btn btn--secondary" id="btn-import-accounts" disabled>
          Import accounts
        </button>
      </div>
      <div id="accounts-result" class="csv-import__result muted" hidden></div>
    </div>

    <div class="panel">
      <h2 class="panel__title">2. Import transactions</h2>
      <p class="panel__desc">
        Splits with the same Transaction ID become one journal voucher (Opening Balance → Opening voucher).
        Voided rows and <strong>zero-amount</strong> transactions are skipped.
      </p>
      <div class="csv-import__actions">
        <button type="button" class="btn btn--secondary" id="btn-txns">Choose transactions.csv</button>
        <input type="file" id="file-txns" accept=".csv,text/csv" hidden />
      </div>
      <div id="txns-preview" class="gnu-preview muted" hidden></div>
      <div class="csv-import__actions" style="margin-top:0.75rem">
        <button type="button" class="btn btn--secondary" id="btn-import-txns" disabled>
          Import transactions
        </button>
      </div>
      <div id="txns-progress" class="gnu-progress muted" hidden></div>
      <div id="txns-result" class="csv-import__result muted" hidden></div>
    </div>
  `;

  /** @type {string|null} */
  let accountsText = null;
  /** @type {string|null} */
  let txnsText = null;

  const fileAccounts = /** @type {HTMLInputElement} */ (outlet.querySelector('#file-accounts'));
  const fileTxns = /** @type {HTMLInputElement} */ (outlet.querySelector('#file-txns'));
  const btnImportAccounts = /** @type {HTMLButtonElement} */ (
    outlet.querySelector('#btn-import-accounts')
  );
  const btnImportTxns = /** @type {HTMLButtonElement} */ (outlet.querySelector('#btn-import-txns'));
  const accountsPreview = /** @type {HTMLElement} */ (outlet.querySelector('#accounts-preview'));
  const txnsPreview = /** @type {HTMLElement} */ (outlet.querySelector('#txns-preview'));
  const accountsResult = /** @type {HTMLElement} */ (outlet.querySelector('#accounts-result'));
  const txnsResult = /** @type {HTMLElement} */ (outlet.querySelector('#txns-result'));
  const txnsProgress = /** @type {HTMLElement} */ (outlet.querySelector('#txns-progress'));
  const exportResult = /** @type {HTMLElement} */ (outlet.querySelector('#export-result'));

  outlet.querySelector('#btn-export-accounts')?.addEventListener('click', async () => {
    try {
      exportResult.hidden = false;
      exportResult.textContent = 'Building accounts.csv…';
      const { csvText, fileName, rowCount } = await exportGnuCashAccounts(book.id);
      downloadCsv(fileName, csvText);
      exportResult.textContent = `Downloaded ${fileName} (${rowCount} accounts).`;
      showToast('Accounts CSV downloaded', 'success');
    } catch (err) {
      exportResult.hidden = false;
      exportResult.innerHTML = `<span class="text-danger">${escapeHtml(
        err instanceof Error ? err.message : 'Export failed'
      )}</span>`;
      showToast(err instanceof Error ? err.message : 'Export failed', 'error');
    }
  });

  outlet.querySelector('#btn-export-txns')?.addEventListener('click', async () => {
    try {
      exportResult.hidden = false;
      exportResult.textContent = 'Building transactions.csv…';
      const { csvText, fileName, rowCount, voucherCount } = await exportGnuCashTransactions(
        book.id
      );
      downloadCsv(fileName, csvText);
      exportResult.textContent = `Downloaded ${fileName} (${rowCount} splits · ${voucherCount} vouchers).`;
      showToast('Transactions CSV downloaded', 'success');
    } catch (err) {
      exportResult.hidden = false;
      exportResult.innerHTML = `<span class="text-danger">${escapeHtml(
        err instanceof Error ? err.message : 'Export failed'
      )}</span>`;
      showToast(err instanceof Error ? err.message : 'Export failed', 'error');
    }
  });

  outlet.querySelector('#btn-accounts')?.addEventListener('click', () => fileAccounts.click());
  outlet.querySelector('#btn-txns')?.addEventListener('click', () => fileTxns.click());

  fileAccounts.addEventListener('change', async () => {
    const file = fileAccounts.files?.[0];
    fileAccounts.value = '';
    accountsText = null;
    btnImportAccounts.disabled = true;
    accountsPreview.hidden = true;
    accountsResult.hidden = true;
    if (!file) return;
    try {
      accountsText = await readFileAsText(file);
      const preview = previewAccounts(accountsText);
      const types = Object.entries(preview.byType)
        .map(([k, v]) => `${escapeHtml(k)} ${v}`)
        .join(' · ');
      accountsPreview.hidden = false;
      accountsPreview.innerHTML = `
        <p><strong>${escapeHtml(file.name)}</strong></p>
        <p>
          ${preview.totalRows} accounts →
          ~${preview.groups} groups,
          ~${preview.ledgers} ledgers
        </p>
        <p class="mono" style="font-size:0.8rem">${types}</p>
      `;
      btnImportAccounts.disabled = false;
      showToast('Accounts file ready', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Invalid accounts CSV', 'error');
    }
  });

  fileTxns.addEventListener('change', async () => {
    const file = fileTxns.files?.[0];
    fileTxns.value = '';
    txnsText = null;
    btnImportTxns.disabled = true;
    txnsPreview.hidden = true;
    txnsResult.hidden = true;
    txnsProgress.hidden = true;
    if (!file) return;
    try {
      txnsText = await readFileAsText(file);
      const preview = previewTransactions(txnsText);
      txnsPreview.hidden = false;
      txnsPreview.innerHTML = `
        <p><strong>${escapeHtml(file.name)}</strong></p>
        <p>
          ${preview.vouchers} transactions ·
          ${preview.splitLines} splits
          ${preview.minDate ? ` · ${escapeHtml(preview.minDate)} → ${escapeHtml(preview.maxDate)}` : ''}
        </p>
        ${
          preview.badDates
            ? `<p class="text-danger">${preview.badDates} row(s) with unreadable dates will be skipped.</p>`
            : ''
        }
      `;
      btnImportTxns.disabled = false;
      showToast('Transactions file ready', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Invalid transactions CSV', 'error');
    }
  });

  btnImportAccounts.addEventListener('click', async () => {
    if (!accountsText) return;
    btnImportAccounts.disabled = true;
    accountsResult.hidden = false;
    accountsResult.textContent = 'Importing accounts…';
    try {
      const result = await importGnuCashAccounts(book.id, accountsText, {
        onProgress: (msg) => {
          accountsResult.textContent = msg;
        },
      });
      const errHtml =
        result.errors.length > 0
          ? `<ul class="csv-import__errors">${result.errors
              .slice(0, 10)
              .map((e) => `<li>${escapeHtml(e)}</li>`)
              .join('')}</ul>`
          : '';
      accountsResult.innerHTML = `
        <p>
          Created <strong>${result.createdGroups}</strong> groups,
          <strong>${result.createdLedgers}</strong> ledgers
          ${
            result.reusedGroups || result.reusedLedgers
              ? ` · reused ${result.reusedGroups} groups / ${result.reusedLedgers} ledgers`
              : ''
          }
          ${result.failed ? ` · <strong>${result.failed}</strong> failed` : ''}
        </p>
        ${errHtml}
        <p><a href="#/masters/chart">Open Chart of Accounts</a></p>
      `;
      if (result.createdGroups + result.createdLedgers > 0) {
        showToast('GNUCash accounts imported', 'success');
      } else if (result.failed) {
        showToast('Accounts import had errors', 'error');
      } else {
        showToast('No new accounts created (already imported?)', 'info');
      }
    } catch (err) {
      accountsResult.innerHTML = `<span class="text-danger">${escapeHtml(
        err instanceof Error ? err.message : 'Import failed'
      )}</span>`;
      showToast(err instanceof Error ? err.message : 'Import failed', 'error');
    } finally {
      btnImportAccounts.disabled = !accountsText;
    }
  });

  btnImportTxns.addEventListener('click', async () => {
    if (!txnsText) return;
    btnImportTxns.disabled = true;
    txnsResult.hidden = true;
    txnsProgress.hidden = false;
    txnsProgress.textContent = 'Starting transaction import…';
    try {
      const result = await importGnuCashTransactions(book.id, txnsText, {
        onProgress: (msg) => {
          txnsProgress.textContent = msg;
        },
      });
      txnsProgress.hidden = true;
      txnsResult.hidden = false;
      const errHtml =
        result.errors.length > 0
          ? `<ul class="csv-import__errors">${result.errors
              .map((e) => `<li>${escapeHtml(e)}</li>`)
              .join('')}${
              result.failed > result.errors.length
                ? `<li>…and more (showing first ${result.errors.length})</li>`
                : ''
            }</ul>`
          : '';
      txnsResult.innerHTML = `
        <p>
          Created <strong>${result.created}</strong> vouchers
          ${result.failed ? ` · <strong>${result.failed}</strong> failed` : ''}
          ${result.skipped ? ` · ${result.skipped} skipped` : ''}
        </p>
        ${errHtml}
        <p><a href="#/transactions/list">View vouchers</a></p>
      `;
      if (result.created > 0) {
        showToast(`Imported ${result.created} vouchers from GNUCash`, 'success');
      } else {
        showToast(result.errors[0] || 'No vouchers imported', 'error');
      }
    } catch (err) {
      txnsProgress.hidden = true;
      txnsResult.hidden = false;
      txnsResult.innerHTML = `<span class="text-danger">${escapeHtml(
        err instanceof Error ? err.message : 'Import failed'
      )}</span>`;
      showToast(err instanceof Error ? err.message : 'Import failed', 'error');
    } finally {
      btnImportTxns.disabled = !txnsText;
    }
  });
}
