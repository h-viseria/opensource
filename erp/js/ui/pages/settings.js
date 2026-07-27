/**
 * Settings — app info, backup/restore, PWA, danger zone.
 */

import * as settingsService from '../../services/settingsService.js';
import * as bookService from '../../services/bookService.js';
import * as backupService from '../../services/backupService.js';
import * as backupActions from '../backupActions.js';
import { escapeHtml, confirmModal } from '../modal.js';
import { showToast } from '../toast.js';
import { deleteDatabase } from '../../db/database.js';

/**
 * @param {import('../../core/router.js').RouteContext} ctx
 * @param {HTMLElement} outlet
 * @param {{ onReset?: () => void }} [opts]
 */
export async function renderSettings(ctx, outlet, opts = {}) {
  const info = await settingsService.getAppInfo();
  const session = await bookService.getSessionContext();
  const books = await bookService.listBooks();
  const swReg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
  const pwaInstalled =
    window.matchMedia('(display-mode: standalone)').matches ||
    /** @type {any} */ (navigator).standalone === true;

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-header__title">Settings</h1>
        <p class="page-header__desc">Backup, restore, install, and local storage controls.</p>
      </div>
    </div>

    <div class="panel">
      <h2 class="panel__title">Application</h2>
      <p class="panel__desc">Offline-first accounting ERP (Tally + GnuCash inspired).</p>
      <table style="font-size:var(--text-sm)">
        <tbody>
          <tr><td class="muted" style="padding:0.4rem 1rem 0.4rem 0;width:9rem">Name</td><td>${escapeHtml(info.name)}</td></tr>
          <tr><td class="muted" style="padding:0.4rem 1rem 0.4rem 0">Version</td><td class="mono">${escapeHtml(info.version)}</td></tr>
          <tr><td class="muted" style="padding:0.4rem 1rem 0.4rem 0">Storage</td><td>${escapeHtml(info.storage)}</td></tr>
          <tr><td class="muted" style="padding:0.4rem 1rem 0.4rem 0">Object stores</td><td class="mono">${info.storeCount}</td></tr>
          <tr><td class="muted" style="padding:0.4rem 1rem 0.4rem 0">Active book</td><td>${session.book ? escapeHtml(session.book.name) : '—'}</td></tr>
          <tr><td class="muted" style="padding:0.4rem 1rem 0.4rem 0">Financial year</td><td>${session.financialYear ? escapeHtml(session.financialYear.name) : '—'}</td></tr>
          <tr><td class="muted" style="padding:0.4rem 1rem 0.4rem 0">PWA</td><td>${pwaInstalled ? 'Installed' : swReg ? 'Service worker ready — use browser Install' : 'Not registered'}</td></tr>
        </tbody>
      </table>
    </div>

    <div class="panel">
      <h2 class="panel__title">Backup</h2>
      <p class="panel__desc">
        Export to <span class="mono">*.erp.json</span> (masters, vouchers, inventory, tax, budgets, goals, settings).
        Google Drive uploads use a compressed <span class="mono">*.erp.zip</span>.
        Keep a copy outside this browser. Top-bar icons also run full backup.
      </p>
      <div class="form-actions" style="justify-content:flex-start;border:0;padding:0;margin-top:0.75rem;flex-wrap:wrap">
        <button type="button" class="btn btn--primary" id="btn-backup-full">Download full backup</button>
        <button type="button" class="btn btn--secondary" id="btn-backup-book" ${session.book ? '' : 'disabled'}>
          Download active book
        </button>
        <button type="button" class="btn btn--secondary" id="btn-backup-gdrive">Save full backup to Google Drive</button>
      </div>
      ${
        books.length > 1
          ? `<p class="muted" style="margin-top:0.75rem;font-size:var(--text-sm)">Active book: <strong>${escapeHtml(session.book?.name || '—')}</strong>. Switch books from the top bar to back up another.</p>`
          : ''
      }
    </div>

    <div class="panel">
      <h2 class="panel__title">Restore</h2>
      <p class="panel__desc">
        Full backups replace <strong>all</strong> local data. Book backups replace that book only.
        Accepts <span class="mono">.erp.json</span> / <span class="mono">.json</span> or compressed <span class="mono">.erp.zip</span> / <span class="mono">.zip</span>.
        Schema is validated before import.
      </p>
      <div class="form-actions" style="justify-content:flex-start;border:0;padding:0;margin-top:0.75rem;flex-wrap:wrap">
        <label class="btn btn--secondary" style="cursor:pointer">
          Choose .json / .zip file
          <input type="file" id="file-restore" accept=".json,.erp.json,.zip,.erp.zip,application/json,application/zip" hidden />
        </label>
        <button type="button" class="btn btn--secondary" id="btn-restore-gdrive">Restore from Google Drive</button>
      </div>
      <div id="restore-preview" class="restore-preview" hidden></div>
    </div>

    <div class="panel">
      <h2 class="panel__title">Google Drive</h2>
      <p class="panel__desc">
        Use the Drive icon in the top bar (or the buttons above). PicoERP downloads a compressed backup and opens Google Drive
        so you can upload it with <strong>+ New → File upload</strong>. Restore: download the file from Drive, then choose it here.
        No technical setup is required for everyday use.
      </p>
    </div>

    <div class="panel">
      <h2 class="panel__title">Install app (PWA)</h2>
      <p class="panel__desc">
        Install PicoERP for offline use from your browser menu
        (Chrome: Install app · Edge: Apps · Safari: Add to Home Screen).
      </p>
      <p class="muted" style="font-size:var(--text-sm)">
        Service worker: ${swReg ? `<span class="badge badge--success">Active</span>` : `<span class="badge badge--warning">Inactive</span>`}
        ${pwaInstalled ? ' · Running as installed app' : ''}
      </p>
      <button type="button" class="btn btn--secondary" id="btn-sw-update" ${swReg ? '' : 'disabled'}>Check for updates</button>
    </div>

    <div class="panel">
      <h2 class="panel__title">IndexedDB stores</h2>
      <p class="panel__desc">Full schema from the master specification.</p>
      <p class="mono" style="font-size:var(--text-xs);line-height:1.7;color:var(--color-text-muted)">
        ${info.stores.map((s) => escapeHtml(s)).join(' · ')}
      </p>
    </div>

    <div class="panel">
      <h2 class="panel__title">Danger zone</h2>
      <p class="panel__desc">Erase all local data in this browser. Export a backup first.</p>
      <button type="button" class="btn btn--danger" id="btn-factory-reset">Delete all local data</button>
    </div>
  `;

  const onRestored = () => {
    if (opts.onReset) opts.onReset();
    else location.reload();
  };

  const preview = /** @type {HTMLElement} */ (outlet.querySelector('#restore-preview'));

  outlet.querySelector('#btn-backup-full')?.addEventListener('click', async () => {
    try {
      await backupActions.downloadFullBackupLocal();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Backup failed', 'error');
    }
  });

  outlet.querySelector('#btn-backup-book')?.addEventListener('click', async () => {
    if (!session.book) return;
    try {
      const { payload, fileName, summary } = await backupService.exportBookBackup(session.book.id);
      backupService.downloadBackup(payload, fileName);
      showToast(`Downloaded ${summary.bookName} (${summary.totalRecords} records)`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Backup failed', 'error');
    }
  });

  outlet.querySelector('#btn-backup-gdrive')?.addEventListener('click', async () => {
    const btn = /** @type {HTMLButtonElement} */ (outlet.querySelector('#btn-backup-gdrive'));
    btn.disabled = true;
    try {
      await backupActions.uploadFullBackupToGoogleDrive();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Google Drive upload failed', 'error');
    } finally {
      btn.disabled = false;
    }
  });

  const fileInput = /** @type {HTMLInputElement} */ (outlet.querySelector('#file-restore'));
  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const parsed = await backupService.parseBackupFile(file);
      if (!parsed.ok || !parsed.raw) {
        showToast(parsed.errors?.[0] || 'Invalid backup', 'error');
        preview.hidden = true;
        preview.innerHTML = '';
        return;
      }
      backupActions.showRestorePreview(preview, parsed, { onRestored });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not read file', 'error');
    }
  });

  outlet.querySelector('#btn-restore-gdrive')?.addEventListener('click', async () => {
    const btn = /** @type {HTMLButtonElement} */ (outlet.querySelector('#btn-restore-gdrive'));
    btn.disabled = true;
    try {
      const parsed = await backupActions.pickAndParseGoogleDriveBackup();
      if (!parsed) return;
      if (!parsed.ok || !parsed.raw) {
        showToast(parsed.errors?.[0] || 'Invalid backup', 'error');
        return;
      }
      backupActions.showRestorePreview(preview, parsed, { onRestored });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Google Drive restore failed', 'error');
    } finally {
      btn.disabled = false;
    }
  });

  outlet.querySelector('#btn-sw-update')?.addEventListener('click', async () => {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        showToast('Service worker not registered', 'info');
        return;
      }
      await reg.update();
      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        showToast('Update ready — reloading…', 'success');
        setTimeout(() => location.reload(), 600);
      } else {
        showToast('Already up to date', 'success');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Update check failed', 'error');
    }
  });

  outlet.querySelector('#btn-factory-reset')?.addEventListener('click', async () => {
    const ok = await confirmModal({
      title: 'Delete all data?',
      danger: true,
      confirmLabel: 'Delete everything',
      bodyHtml: `<p>This permanently removes all books, settings, and vouchers stored in IndexedDB for PicoERP on this browser. Export a backup first if you need it.</p>`,
    });
    if (!ok) return;
    try {
      await deleteDatabase();
      showToast('Local database deleted', 'success');
      if (opts.onReset) opts.onReset();
      else location.reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Reset failed', 'error');
    }
  });
}
