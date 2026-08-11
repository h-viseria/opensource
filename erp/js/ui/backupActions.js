/**
 * Shared backup / restore UI helpers (topbar + Settings).
 *
 * With credentials in js/data/googleDriveConfig.js: folder pick + sync upload.
 * Without credentials: guided zip download + open Drive.
 */

import * as backupService from '../services/backupService.js';
import * as googleDriveService from '../services/googleDriveService.js';
import * as driveSyncService from '../services/driveSyncService.js';
import { confirmModal, formModal, escapeHtml } from './modal.js';
import { showToast } from './toast.js';
import { formatDisplayDate } from '../utils/date.js';
import * as router from '../core/router.js';

const DRIVE_MY_DRIVE = 'https://drive.google.com/drive/my-drive';
const ACTIVITY_COMPARE_PATH = '/settings/drive-activity';

/**
 * Wire “compare activity” link inside a confirm modal: close dialog and navigate.
 * @param {HTMLElement} root
 */
function wireActivityCompareLink(root) {
  root.querySelector('[data-activity-compare]')?.addEventListener('click', (e) => {
    e.preventDefault();
    root.querySelector('[data-action="cancel"]')?.dispatchEvent(new Event('click', { bubbles: true }));
    router.navigate(ACTIVITY_COMPARE_PATH);
  });
}

function activityCompareLinkHtml() {
  return `<p style="margin:0.85rem 0 0;font-size:var(--text-sm)">
    <a href="#${ACTIVITY_COMPARE_PATH}" data-activity-compare>Compare recent activity (local vs Drive)</a>
  </p>`;
}

/**
 * Download full backup as .erp.json (same as Settings).
 */
export async function downloadFullBackupLocal() {
  const { payload, fileName, summary } = await backupService.exportFullBackup();
  backupService.downloadBackup(payload, fileName);
  showToast(`Downloaded ${summary.totalRecords} records (${summary.bookCount} books)`, 'success');
  return summary;
}

/**
 * True when publisher baked credentials into googleDriveConfig (or Settings advanced).
 */
export async function hasPublisherDriveIntegration() {
  return driveSyncService.isDriveApiConfigured();
}

/**
 * Top-bar / Settings Drive action:
 * - If sync folder connected → upload/update zip in that folder
 * - Else if API configured → connect folder (pick) then upload
 * - Else → guided download + open Drive
 */
export async function uploadFullBackupToGoogleDrive() {
  if (await driveSyncService.isDriveApiConfigured()) {
    try {
      const state = await driveSyncService.getSyncState();
      if (state.enabled && state.folderId) {
        const pathLabel = state.parentFolderName
          ? `${state.parentFolderName} / ${state.folderName}`
          : state.folderName || 'Drive';
        showToast(`Uploading to “${pathLabel}”…`, 'info');
        const result = await driveSyncService.uploadNow({ force: true, reason: 'manual' });
        if (result.skipped) {
          showToast('Drive backup already up to date', 'success');
        } else {
          const syncedPath = result.state.parentFolderName
            ? `${result.state.parentFolderName} / ${result.state.folderName}`
            : result.state.folderName;
          showToast(
            `Synced to “${syncedPath}” (${result.summary?.totalRecords ?? '—'} records)`,
            'success'
          );
        }
        return { ...result, mode: 'sync' };
      }

      showToast('Opening Google sign-in…', 'info');
      await googleDriveService.getAccessToken();
      showToast('Choose a Drive folder for automatic backups…', 'info');
      await driveSyncService.connectSyncFolder();
      const connected = await driveSyncService.getSyncState();
      const pathLabel = connected.parentFolderName
        ? `${connected.parentFolderName} / ${connected.folderName}`
        : connected.folderName;
      showToast(
        `Connected “${pathLabel}” — backups will update there automatically`,
        'success'
      );
      return { state: connected, mode: 'connect' };
    } catch (err) {
      if (err instanceof Error && /cancelled/i.test(err.message)) {
        showToast('Folder selection cancelled', 'info');
        return null;
      }
      console.warn('[Drive API]', err);
      showToast('Opening the simple Google Drive upload steps instead…', 'info');
    }
  }

  return guidedUploadToDrive();
}

/**
 * Force reconnect (pick a different folder).
 */
export async function reconnectDriveSyncFolder() {
  if (!(await driveSyncService.isDriveApiConfigured())) {
    throw new Error('Fill clientId and apiKey in js/data/googleDriveConfig.js first');
  }
  showToast('Opening Google sign-in…', 'info');
  await googleDriveService.getAccessToken();
  showToast('Choose a Drive folder…', 'info');
  await driveSyncService.connectSyncFolder();
  const state = await driveSyncService.getSyncState();
  const pathLabel = state.parentFolderName
    ? `${state.parentFolderName} / ${state.folderName}`
    : state.folderName;
  showToast(`Sync folder set to “${pathLabel}”`, 'success');
  return state;
}

async function guidedUploadToDrive() {
  showToast('Preparing compressed backup…', 'info');
  const { payload, fileName, summary } = await backupService.exportFullBackup();
  const { blob, zipFileName } = await backupService.buildBackupZip(payload, fileName);

  backupService.downloadBlob(blob, zipFileName);
  window.open(DRIVE_MY_DRIVE, '_blank', 'noopener,noreferrer');

  await formModal({
    title: 'Save backup to Google Drive',
    confirmLabel: 'Done',
    fieldsHtml: `
      <div class="form">
        <p style="margin:0 0 0.75rem">
          Your backup file <strong class="mono">${escapeHtml(zipFileName)}</strong> was downloaded,
          and Google Drive opened in a new tab.
        </p>
        <ol style="margin:0;padding-left:1.25rem;font-size:var(--text-sm);line-height:1.55">
          <li>Sign in to Google if asked.</li>
          <li>In Drive, click <strong>+ New</strong> → <strong>File upload</strong>.</li>
          <li>Pick <span class="mono">${escapeHtml(zipFileName)}</span> from your Downloads folder.</li>
          <li>Optional: move it into any folder you like.</li>
        </ol>
        <p class="field__hint" style="margin-top:0.75rem">
          Tip: for automatic sync, fill <span class="mono">js/data/googleDriveConfig.js</span> with your Client ID and API key, then use this button again to pick a folder.
        </p>
      </div>`,
  });

  showToast('Follow the steps in Drive to finish uploading', 'success');
  return { summary, zipFileName, mode: 'guided' };
}

/**
 * On app launch: compare Drive vs local.
 * - Drive newer → prompt to replace local
 * - Local newer → prompt to upload to Drive
 * @returns {Promise<boolean>} true if restore/upload ran
 */
export async function checkDriveSyncOnLaunch() {
  try {
    const state = await driveSyncService.initDriveSync();
    if (!state.enabled || !state.folderId) return false;
    if (!(await driveSyncService.isDriveApiConfigured())) return false;
    if (!navigator.onLine) return false;

    const comparison = await driveSyncService.compareWithDrive();
    const folderLabel = comparison.state.parentFolderName
      ? `${comparison.state.parentFolderName} / ${comparison.state.folderName}`
      : comparison.state.folderName || '—';

    const remoteLabel = comparison.remoteAt
      ? formatDisplayDate(String(comparison.remoteAt).slice(0, 10))
      : 'Drive';
    const localLabel = comparison.localAt
      ? formatDisplayDate(String(comparison.localAt).slice(0, 10))
      : 'this browser';

    if (comparison.status === 'remote-newer' && comparison.fileId) {
      const ok = await confirmModal({
        title: 'Newer backup on Google Drive',
        confirmLabel: 'Replace local data',
        danger: true,
        bodyHtml: `
          <p>Google Drive has a newer PicoERP backup than this browser.</p>
          <ul style="margin:0.75rem 0;padding-left:1.25rem;font-size:var(--text-sm)">
            <li>Drive: <strong>${escapeHtml(remoteLabel)}</strong>
              ${comparison.fileName ? ` (<span class="mono">${escapeHtml(comparison.fileName)}</span>)` : ''}</li>
            <li>This browser: <strong>${escapeHtml(localLabel)}</strong></li>
            <li>Folder: <strong>${escapeHtml(folderLabel)}</strong></li>
          </ul>
          <p>Replace <strong>all local data</strong> with the Drive backup?</p>
          ${activityCompareLinkHtml()}`,
        onReady: wireActivityCompareLink,
      });
      if (!ok) return false;

      showToast('Downloading Drive backup…', 'info');
      const parsed = await driveSyncService.downloadSyncedBackup(comparison.fileId);
      if (!parsed.ok || !parsed.raw) {
        showToast(parsed.errors?.[0] || 'Invalid Drive backup', 'error');
        return false;
      }
      if (parsed.scope !== 'full') {
        showToast('Synced Drive file must be a full backup', 'error');
        return false;
      }

      await backupService.restoreFullBackup(parsed.raw);
      await driveSyncService.markRestoredFromDrive(
        String(parsed.exportedAt || comparison.remoteAt || '')
      );
      showToast('Local data replaced from Google Drive', 'success');
      setTimeout(() => location.reload(), 500);
      return true;
    }

    if (comparison.status === 'local-newer' || comparison.status === 'no-remote') {
      const ok = await confirmModal({
        title: 'Local data is newer',
        confirmLabel: 'Upload to Google Drive',
        cancelLabel: 'Not now',
        bodyHtml: `
          <p>This browser has newer PicoERP data than the synced Google Drive backup.</p>
          <ul style="margin:0.75rem 0;padding-left:1.25rem;font-size:var(--text-sm)">
            <li>This browser: <strong>${escapeHtml(localLabel)}</strong></li>
            <li>Drive: <strong>${escapeHtml(
              comparison.status === 'no-remote' ? 'no backup yet' : remoteLabel
            )}</strong></li>
            <li>Folder: <strong>${escapeHtml(folderLabel)}</strong></li>
          </ul>
          <p>Upload the local backup to Google Drive now?</p>
          ${activityCompareLinkHtml()}`,
        onReady: wireActivityCompareLink,
      });
      if (!ok) return false;

      showToast('Uploading local backup to Google Drive…', 'info');
      const result = await driveSyncService.uploadNow({ force: true, reason: 'launch' });
      if (result.skipped) {
        showToast('Drive backup already up to date', 'success');
      } else {
        showToast('Local backup uploaded to Google Drive', 'success');
      }
      return true;
    }

    return false;
  } catch (err) {
    console.warn('[Drive sync launch]', err);
    return false;
  }
}

/**
 * Render restore preview into a host element and wire confirm/cancel.
 * @param {HTMLElement} preview
 * @param {ReturnType<typeof backupService.parseBackupText>} parsed
 * @param {{ onRestored?: () => void }} [opts]
 */
export function showRestorePreview(preview, parsed, opts = {}) {
  if (!parsed.ok || !parsed.raw) {
    preview.hidden = true;
    preview.innerHTML = '';
    return null;
  }

  /** @type {Record<string, unknown>} */
  let pendingBackup = parsed.raw;
  const exported = parsed.exportedAt ? formatDisplayDate(String(parsed.exportedAt)) : '—';
  preview.hidden = false;
  preview.innerHTML = `
    <div class="restore-preview__card">
      <p><strong>Valid backup</strong>
        <span class="badge badge--${parsed.scope === 'full' ? 'warning' : 'info'}">${escapeHtml(String(parsed.scope))}</span>
      </p>
      <p class="muted" style="font-size:var(--text-sm)">
        ${parsed.bookName ? `Book: <strong>${escapeHtml(String(parsed.bookName))}</strong> · ` : ''}
        ${parsed.totalRecords} records · App ${escapeHtml(String(parsed.appVersion || '—'))} ·
        Exported ${escapeHtml(exported)}
      </p>
      ${
        parsed.warnings?.length
          ? `<p class="muted" style="font-size:var(--text-xs)">${parsed.warnings.map((w) => escapeHtml(w)).join(' · ')}</p>`
          : ''
      }
      <div class="form-actions" style="justify-content:flex-start;border:0;padding-top:0.75rem;margin:0">
        <button type="button" class="btn btn--primary" id="btn-restore-confirm">
          ${parsed.scope === 'full' ? 'Replace all data' : 'Restore book'}
        </button>
        <button type="button" class="btn btn--ghost" id="btn-restore-cancel">Cancel</button>
      </div>
    </div>`;

  preview.querySelector('#btn-restore-cancel')?.addEventListener('click', () => {
    pendingBackup = /** @type {any} */ (null);
    preview.hidden = true;
    preview.innerHTML = '';
  });

  preview.querySelector('#btn-restore-confirm')?.addEventListener('click', async () => {
    if (!pendingBackup) return;
    const isFull = pendingBackup.scope === 'full';
    const ok = await confirmModal({
      title: isFull ? 'Replace all data?' : 'Restore book?',
      danger: true,
      confirmLabel: isFull ? 'Replace everything' : 'Restore book',
      bodyHtml: isFull
        ? `<p>This <strong>deletes all current books</strong> in this browser and loads the backup. This cannot be undone.</p>`
        : `<p>This replaces the book <strong>${escapeHtml(String(pendingBackup.bookName || ''))}</strong> if it already exists (same id), or imports it as a new book.</p>`,
    });
    if (!ok) return;
    try {
      if (isFull) {
        await backupService.restoreFullBackup(pendingBackup);
        await driveSyncService.markRestoredFromDrive(String(pendingBackup.exportedAt || ''));
        showToast('Full backup restored', 'success');
      } else {
        const result = await backupService.restoreBookBackup(pendingBackup);
        showToast(`Restored ${result.bookName || 'book'}`, 'success');
      }
      pendingBackup = /** @type {any} */ (null);
      if (opts.onRestored) opts.onRestored();
      else location.reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Restore failed', 'error');
    }
  });

  return pendingBackup;
}

/**
 * Restore from Google Drive in end-user language:
 * optional API file picker if publisher configured; otherwise guide + local file choose.
 * @returns {Promise<ReturnType<typeof backupService.parseBackupFile>|null>}
 */
export async function pickAndParseGoogleDriveBackup() {
  if (await hasPublisherDriveIntegration()) {
    try {
      const state = await driveSyncService.getSyncState();
      if (state.enabled && state.fileId) {
        const useSynced = await confirmModal({
          title: 'Restore from Google Drive',
          confirmLabel: 'Use synced backup',
          cancelLabel: 'Pick another file',
          bodyHtml: `<p>Use the synced file in <strong>${escapeHtml(state.folderName || 'Drive')}</strong>
            (<span class="mono">${escapeHtml(state.fileName || 'PicoERP_sync.erp.zip')}</span>)?</p>`,
        });
        if (useSynced) {
          showToast('Downloading synced backup…', 'info');
          return driveSyncService.downloadSyncedBackup(state.fileId);
        }
      }
      showToast('Opening Google sign-in…', 'info');
      await googleDriveService.getAccessToken();
      showToast('Choose a backup file on Drive…', 'info');
      const file = await googleDriveService.pickDriveBackupFile();
      if (!file) {
        showToast('File selection cancelled', 'info');
        return null;
      }
      showToast(`Downloading ${file.name}…`, 'info');
      const blob = await googleDriveService.downloadDriveFile(file.id);
      return backupService.parseBackupFile(blob, file.name);
    } catch (err) {
      console.warn('[Drive API]', err);
      showToast('Opening the simple restore steps instead…', 'info');
    }
  }

  return guidedRestoreFromDrive();
}

/**
 * Plain-language restore: open Drive, then choose the downloaded file.
 */
async function guidedRestoreFromDrive() {
  window.open(DRIVE_MY_DRIVE, '_blank', 'noopener,noreferrer');

  const fd = await formModal({
    title: 'Restore from Google Drive',
    confirmLabel: 'Choose backup file',
    fieldsHtml: `
      <div class="form">
        <p style="margin:0 0 0.75rem">Google Drive opened in a new tab. Get your backup onto this computer, then choose it here.</p>
        <ol style="margin:0 0 0.75rem;padding-left:1.25rem;font-size:var(--text-sm);line-height:1.55">
          <li>In Drive, find your PicoERP backup (<span class="mono">.erp.zip</span> or <span class="mono">.erp.json</span>).</li>
          <li>Download it (right‑click → Download).</li>
          <li>Click <strong>Choose backup file</strong> below and select that download.</li>
        </ol>
        <div class="field">
          <label class="field__label" for="guided-restore-file">Backup file</label>
          <input class="input" id="guided-restore-file" name="file" type="file"
                 accept=".json,.erp.json,.zip,.erp.zip,application/json,application/zip" required />
        </div>
      </div>`,
  });
  if (!fd) return null;

  const file = fd.get('file');
  if (!(file instanceof File)) {
    throw new Error('Please choose a backup file');
  }
  return backupService.parseBackupFile(file, file.name);
}
