/**
 * Settings — app info, backup/restore, PWA, danger zone.
 */

import * as settingsService from '../../services/settingsService.js';
import * as bookService from '../../services/bookService.js';
import * as backupService from '../../services/backupService.js';
import * as driveSyncService from '../../services/driveSyncService.js';
import * as backupActions from '../backupActions.js';
import { escapeHtml, confirmModal } from '../modal.js';
import { showToast } from '../toast.js';
import { deleteDatabase } from '../../db/database.js';
import { formatDisplayDate } from '../../utils/date.js';
import {
  DRIVE_SYNC_INTERVAL_HOURS,
} from '../../data/googleDriveConfig.js';
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
      <h2 class="panel__title">Google Drive sync</h2>
      <div id="gdrive-sync-panel">
        <p class="panel__desc">Loading…</p>
      </div>
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

  await refreshDriveSyncPanel(outlet);
}

/**
 * @param {HTMLElement} outlet
 */
async function refreshDriveSyncPanel(outlet) {
  const host = outlet.querySelector('#gdrive-sync-panel');
  if (!host) return;

  const configured = await driveSyncService.isDriveApiConfigured();
  const state = await driveSyncService.getSyncState();
  const localAt = await driveSyncService.getLocalDataUpdatedAt();

  if (!configured) {
    host.innerHTML = `
      <p class="panel__desc">
        Automatic folder sync needs a Google Cloud Client ID and API key in
        <span class="mono">js/data/googleDriveConfig.js</span>. Until then, the Drive button uses
        download + open Drive (manual upload).
      </p>`;
    return;
  }

  if (!state.enabled || !state.folderId) {
    host.innerHTML = `
      <p class="panel__desc">
        Choose a Google Drive folder once. PicoERP looks for (or creates)
        <span class="mono">PicoERPBackup</span> inside it, keeps
        <span class="mono">PicoERP_sync.erp.zip</span> there, and checks it on launch.
      </p>
      <div class="form-actions" style="justify-content:flex-start;border:0;padding:0;margin-top:0.75rem;flex-wrap:wrap">
        <button type="button" class="btn btn--primary" id="btn-drive-connect">Connect Drive folder</button>
      </div>`;
    host.querySelector('#btn-drive-connect')?.addEventListener('click', async () => {
      const btn = /** @type {HTMLButtonElement} */ (host.querySelector('#btn-drive-connect'));
      btn.disabled = true;
      try {
        await backupActions.reconnectDriveSyncFolder();
        await refreshDriveSyncPanel(outlet);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Could not connect Drive', 'error');
      } finally {
        btn.disabled = false;
      }
    });
    return;
  }

  const intervalHours = driveSyncService.normalizeIntervalHours(state.autoSyncIntervalHours);
  const dailyTime = driveSyncService.normalizeDailyTime(state.autoSyncDailyTime);
  const scheduleValue = !state.autoSyncEnabled
    ? 'off'
    : state.autoSyncMode === 'daily'
      ? 'daily'
      : String(intervalHours);

  host.innerHTML = `
    <p class="panel__desc">
      Syncing to <strong>${escapeHtml(
        state.parentFolderName
          ? `${state.parentFolderName} / ${state.folderName}`
          : state.folderName || 'Drive'
      )}</strong>
      · file <span class="mono">${escapeHtml(state.fileName || 'PicoERP_sync.erp.zip')}</span>
    </p>
    <table style="font-size:var(--text-sm);margin-top:0.5rem">
      <tbody>
        <tr><td class="muted" style="padding:0.35rem 1rem 0.35rem 0;width:11rem">Last upload</td>
          <td>${state.lastUploadedAt ? escapeHtml(formatIso(state.lastUploadedAt)) : '—'}</td></tr>
        <tr><td class="muted" style="padding:0.35rem 1rem 0.35rem 0">Drive modified</td>
          <td>${state.lastDriveModifiedAt ? escapeHtml(formatIso(state.lastDriveModifiedAt)) : '—'}</td></tr>
        <tr><td class="muted" style="padding:0.35rem 1rem 0.35rem 0">Local data changed</td>
          <td>${localAt ? escapeHtml(formatIso(localAt)) : '—'}</td></tr>
        <tr><td class="muted" style="padding:0.35rem 1rem 0.35rem 0">Last checked</td>
          <td>${state.lastCheckedAt ? escapeHtml(formatIso(state.lastCheckedAt)) : '—'}</td></tr>
        ${
          state.lastError
            ? `<tr><td class="muted" style="padding:0.35rem 1rem 0.35rem 0">Last error</td>
                 <td class="badge badge--danger">${escapeHtml(state.lastError)}</td></tr>`
            : ''
        }
      </tbody>
    </table>

    <div class="panel" style="margin-top:1rem;padding:0.85rem 1rem;box-shadow:none">
      <h3 class="panel__title" style="font-size:var(--text-base);margin:0 0 0.5rem">Auto sync / backup</h3>
      <div class="form-grid">
        <label class="field">
          <span class="field__label">Schedule</span>
          <select class="select" id="drive-auto-schedule">
            <option value="off" ${scheduleValue === 'off' ? 'selected' : ''}>No Auto Backup</option>
            <option value="daily" ${scheduleValue === 'daily' ? 'selected' : ''}>Once a day</option>
            ${DRIVE_SYNC_INTERVAL_HOURS.map(
              (h) =>
                `<option value="${h}" ${scheduleValue === String(h) ? 'selected' : ''}>Every ${h} hours</option>`
            ).join('')}
          </select>
        </label>
        <label class="field" id="wrap-drive-daily" ${scheduleValue === 'daily' ? '' : 'hidden'}>
          <span class="field__label">Daily at (local time)</span>
          <input class="input" type="time" id="drive-auto-daily" value="${escapeHtml(dailyTime)}" />
        </label>
      </div>
      <p class="muted" style="margin:0.75rem 0 0;font-size:var(--text-sm)">
        Runs while this tab is open. On launch: if Drive is newer you can replace local data; if local is newer you can upload to Drive.
      </p>
      <p style="margin:0.75rem 0 0">
        <a href="#/settings/drive-activity">Compare activity logs (local vs Drive)</a>
      </p>
    </div>

    <div class="form-actions" style="justify-content:flex-start;border:0;padding:0;margin-top:0.75rem;flex-wrap:wrap">
      <button type="button" class="btn btn--primary" id="btn-drive-sync-now">Sync now</button>
      <button type="button" class="btn btn--secondary" id="btn-drive-change-folder">Change folder</button>
      <button type="button" class="btn btn--ghost" id="btn-drive-disconnect">Disconnect</button>
    </div>
  `;

  const syncModeUi = () => {
    const scheduleEl = /** @type {HTMLSelectElement} */ (host.querySelector('#drive-auto-schedule'));
    host.querySelector('#wrap-drive-daily')?.toggleAttribute('hidden', scheduleEl.value !== 'daily');
  };

  const persistSchedule = async () => {
    const schedule = /** @type {HTMLSelectElement} */ (host.querySelector('#drive-auto-schedule')).value;
    const time = /** @type {HTMLInputElement} */ (host.querySelector('#drive-auto-daily')).value;
    /** @type {{ autoSyncEnabled: boolean, autoSyncMode: 'interval'|'daily', autoSyncIntervalHours?: number, autoSyncDailyTime?: string }} */
    let patch;
    if (schedule === 'off') {
      patch = { autoSyncEnabled: false, autoSyncMode: 'interval', autoSyncDailyTime: time };
    } else if (schedule === 'daily') {
      patch = {
        autoSyncEnabled: true,
        autoSyncMode: 'daily',
        autoSyncDailyTime: time,
      };
    } else {
      patch = {
        autoSyncEnabled: true,
        autoSyncMode: 'interval',
        autoSyncIntervalHours: Number(schedule),
        autoSyncDailyTime: time,
      };
    }
    try {
      await driveSyncService.updateAutoSyncSchedule(patch);
      showToast('Auto sync settings saved', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save schedule', 'error');
    }
  };

  host.querySelector('#drive-auto-schedule')?.addEventListener('change', async () => {
    syncModeUi();
    await persistSchedule();
  });
  host.querySelector('#drive-auto-daily')?.addEventListener('change', () => persistSchedule());

  host.querySelector('#btn-drive-sync-now')?.addEventListener('click', async () => {
    const btn = /** @type {HTMLButtonElement} */ (host.querySelector('#btn-drive-sync-now'));
    btn.disabled = true;
    try {
      await backupActions.uploadFullBackupToGoogleDrive();
      await refreshDriveSyncPanel(outlet);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Sync failed', 'error');
    } finally {
      btn.disabled = false;
    }
  });

  host.querySelector('#btn-drive-change-folder')?.addEventListener('click', async () => {
    try {
      await backupActions.reconnectDriveSyncFolder();
      await refreshDriveSyncPanel(outlet);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not change folder', 'error');
    }
  });

  host.querySelector('#btn-drive-disconnect')?.addEventListener('click', async () => {
    const ok = await confirmModal({
      title: 'Disconnect Drive sync?',
      confirmLabel: 'Disconnect',
      bodyHtml: `<p>Stops automatic uploads. The file on Google Drive is kept.</p>`,
    });
    if (!ok) return;
    await driveSyncService.disconnectSync();
    showToast('Google Drive sync disconnected', 'info');
    await refreshDriveSyncPanel(outlet);
  });
}

/** @param {string} iso */
function formatIso(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return `${formatDisplayDate(d.toISOString().slice(0, 10))} ${d.toLocaleTimeString()}`;
  } catch {
    return iso;
  }
}
