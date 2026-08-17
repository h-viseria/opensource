/**
 * Shared backup / restore UI helpers (topbar + Settings).
 * Same compare-then-choose-direction flow as PicoERP Drive sync.
 */

import * as backupService from '../services/backupService.js';
import * as googleDriveService from '../services/googleDriveService.js';
import * as driveSyncService from '../services/driveSyncService.js';
import { confirmModal, formModal, actionModal, escapeHtml } from './modal.js';
import { showToast } from './toast.js';
import { formatDisplayDate } from '../utils/date.js';
import { DRIVE_SYNC_FILE_NAME, DRIVE_SYNC_FOLDER_NAME } from '../data/googleDriveConfig.js';

const DRIVE_MY_DRIVE = 'https://drive.google.com/drive/my-drive';

function formatSyncStamp(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return formatDisplayDate(String(iso).slice(0, 10));
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function syncCompareSummaryHtml(comparison) {
  const folderLabel = comparison.state.parentFolderName
    ? `${comparison.state.parentFolderName} / ${comparison.state.folderName}`
    : comparison.state.folderName || '—';
  const statusHint =
    comparison.status === 'remote-newer'
      ? 'Drive looks newer than this browser.'
      : comparison.status === 'local-newer'
        ? 'This browser looks newer than Drive.'
        : comparison.status === 'no-remote'
          ? 'No synced backup file found on Drive yet.'
          : comparison.status === 'same'
            ? 'Local and Drive timestamps match.'
            : 'Could not fully compare copies.';

  return `
    <p>${escapeHtml(statusHint)}</p>
    <ul style="margin:0.75rem 0;padding-left:1.25rem;font-size:var(--text-sm)">
      <li>This browser: <strong>${escapeHtml(formatSyncStamp(comparison.localAt))}</strong></li>
      <li>Google Drive: <strong>${escapeHtml(
        comparison.status === 'no-remote' ? 'no backup yet' : formatSyncStamp(comparison.remoteAt)
      )}</strong>
        ${
          comparison.fileName
            ? ` (<span class="mono">${escapeHtml(comparison.fileName)}</span>)`
            : ''
        }</li>
      <li>Folder: <strong>${escapeHtml(folderLabel)}</strong></li>
    </ul>
  `;
}

async function pullSyncedBackupFromDrive(fileId, remoteAt) {
  showToast('Downloading Drive backup…', 'info');
  const parsed = await driveSyncService.downloadSyncedBackup(fileId);
  if (!parsed.ok || !parsed.raw) {
    showToast(parsed.errors?.[0] || 'Invalid Drive backup', 'error');
    return false;
  }
  await backupService.restoreFullBackup(parsed.raw);
  await driveSyncService.markRestoredFromDrive(String(parsed.exportedAt || remoteAt || ''));
  showToast('Local data replaced from Google Drive', 'success');
  setTimeout(() => location.reload(), 500);
  return true;
}

async function pushLocalBackupToDrive(reason = 'manual') {
  showToast('Uploading local backup to Google Drive…', 'info');
  const result = await driveSyncService.uploadNow({ force: true, reason });
  if (result.skipped) showToast('Drive backup already up to date', 'success');
  else {
    const syncedPath = result.state.parentFolderName
      ? `${result.state.parentFolderName} / ${result.state.folderName}`
      : result.state.folderName;
    showToast(`Uploaded to “${syncedPath}” (${result.summary?.totalRecords ?? '—'} records)`, 'success');
  }
  return result;
}

export async function syncWithGoogleDriveInteractive(opts = {}) {
  const reason = opts.reason || 'manual';
  const state = await driveSyncService.getSyncState();
  if (!state.enabled || !state.folderId) return { outcome: 'skipped' };
  if (!(await driveSyncService.isDriveApiConfigured())) {
    throw new Error('Google Drive API is not configured');
  }
  if (!navigator.onLine) {
    showToast('You are offline — cannot sync with Google Drive', 'error');
    return { outcome: 'skipped' };
  }

  showToast('Comparing with Google Drive…', 'info');
  const comparison = await driveSyncService.compareWithDrive();

  if (comparison.status === 'offline') {
    showToast('You are offline — cannot sync with Google Drive', 'error');
    return { outcome: 'skipped', comparison };
  }
  if (comparison.status === 'no-token') {
    showToast(comparison.message || 'Sign in to Google Drive to sync', 'error');
    return { outcome: 'error', comparison };
  }
  if (comparison.status === 'error') {
    showToast(comparison.message || 'Could not compare with Google Drive', 'error');
    return { outcome: 'error', comparison };
  }
  if (comparison.status === 'same') {
    if (!opts.quietSame) showToast('Local and Google Drive backups match', 'success');
    return { outcome: 'same', comparison };
  }

  /** @type {Array<{ id: string, label: string, primary?: boolean, danger?: boolean }>} */
  const actions = [];
  if (comparison.status === 'no-remote') {
    actions.push({ id: 'push', label: 'Upload to Google Drive', primary: true });
  } else {
    actions.push({
      id: 'push',
      label: 'Upload local → Drive',
      primary: comparison.status === 'local-newer',
    });
    actions.push({
      id: 'pull',
      label: 'Download Drive → local',
      primary: comparison.status === 'remote-newer',
      danger: true,
    });
  }

  const title =
    comparison.status === 'remote-newer'
      ? 'Drive backup is newer'
      : comparison.status === 'local-newer'
        ? 'Local data is newer'
        : comparison.status === 'no-remote'
          ? 'No Drive backup yet'
          : 'Local and Drive differ';

  const choice = await actionModal({
    title,
    bodyHtml: `
      ${syncCompareSummaryHtml(comparison)}
      <p style="margin:0.75rem 0 0;font-size:var(--text-sm)">
        Choose which way to move data. Downloading replaces <strong>all local data</strong>.
      </p>`,
    actions,
    cancelLabel: 'Not now',
  });

  if (!choice) return { outcome: 'cancelled', comparison };
  if (choice === 'pull') {
    if (!comparison.fileId) {
      showToast('No Drive backup file to download', 'error');
      return { outcome: 'error', comparison };
    }
    const ok = await pullSyncedBackupFromDrive(comparison.fileId, comparison.remoteAt);
    return { outcome: ok ? 'pulled' : 'error', comparison };
  }
  if (choice === 'push') {
    const result = await pushLocalBackupToDrive(reason);
    return { outcome: 'pushed', comparison, result };
  }
  return { outcome: 'cancelled', comparison };
}

export async function downloadFullBackupLocal() {
  const { payload, fileName, summary } = await backupService.exportFullBackup();
  backupService.downloadBackup(payload, fileName);
  showToast(`Downloaded ${summary.totalRecords} records`, 'success');
  return summary;
}

export async function hasPublisherDriveIntegration() {
  return driveSyncService.isDriveApiConfigured();
}

export async function uploadFullBackupToGoogleDrive() {
  if (await driveSyncService.isDriveApiConfigured()) {
    try {
      const state = await driveSyncService.getSyncState();
      if (state.enabled && state.folderId) {
        const result = await syncWithGoogleDriveInteractive({ reason: 'manual' });
        return { ...result, mode: 'sync' };
      }
      const connected = await reconnectDriveSyncFolder();
      if (!connected) return null;
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

export async function reconnectDriveSyncFolder() {
  if (!(await driveSyncService.isDriveApiConfigured())) {
    throw new Error('Fill clientId and apiKey in js/data/googleDriveConfig.js first');
  }
  const previouslyConnected = (await driveSyncService.getSyncState()).enabled;
  showToast('Opening Google sign-in…', 'info');
  await googleDriveService.getAccessToken();

  while (true) {
    showToast('Choose a Drive folder…', 'info');
    const target = await driveSyncService.inspectPickedSyncFolder();
    const pathLabel = target.backupFolder
      ? `${target.parent.name} / ${target.backupFolder.name}`
      : `${target.parent.name} / ${DRIVE_SYNC_FOLDER_NAME}`;

    if (!target.existingFile?.id) {
      const linked = await driveSyncService.linkSyncFolder(target, { mode: 'overwrite' });
      showToast(`Connected “${pathLabel}” — backups will update there automatically`, 'success');
      return linked.state;
    }

    const remoteStamp =
      target.existingFile.appProperties?.picoexpenseExportedAt || target.existingFile.modifiedTime;
    const choice = await actionModal({
      title: 'Backup already in this folder',
      bodyHtml: `
        <p>Google Drive already has a PicoExpense backup at
        <strong>${escapeHtml(pathLabel)}</strong>.</p>
        <ul style="margin:0.75rem 0;padding-left:1.25rem;font-size:var(--text-sm)">
          <li>File: <span class="mono">${escapeHtml(target.existingFile.name || DRIVE_SYNC_FILE_NAME)}</span></li>
          <li>Drive backup: <strong>${escapeHtml(formatSyncStamp(remoteStamp))}</strong></li>
        </ul>
        <p style="margin:0;font-size:var(--text-sm)">
          <strong>Use this backup</strong> replaces all local data.
          <strong>Overwrite</strong> replaces the Drive file with this browser’s data.
        </p>`,
      actions: [
        { id: 'use', label: 'Use this backup', danger: true },
        { id: 'overwrite', label: 'Overwrite Drive backup' },
        { id: 'change', label: 'Change folder', primary: true },
      ],
      cancelLabel: 'Cancel',
    });

    if (!choice) {
      showToast(previouslyConnected ? 'Kept the current Drive folder' : 'Folder selection cancelled', 'info');
      return null;
    }
    if (choice === 'change') continue;
    if (choice === 'use') {
      const linked = await driveSyncService.linkSyncFolder(target, { mode: 'use' });
      await pullSyncedBackupFromDrive(target.existingFile.id, remoteStamp);
      return linked.state;
    }
    const linked = await driveSyncService.linkSyncFolder(target, { mode: 'overwrite' });
    showToast(`Connected “${pathLabel}” — Drive backup overwritten`, 'success');
    return linked.state;
  }
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
        </ol>
      </div>`,
  });
  showToast('Follow the steps in Drive to finish uploading', 'success');
  return { summary, zipFileName, mode: 'guided' };
}

export async function checkDriveSyncOnLaunch() {
  try {
    const state = await driveSyncService.initDriveSync();
    if (!state.enabled || !state.folderId) return false;
    if (!(await driveSyncService.isDriveApiConfigured())) return false;
    if (!navigator.onLine) return false;
    const result = await syncWithGoogleDriveInteractive({ reason: 'launch', quietSame: true });
    return result.outcome === 'pushed' || result.outcome === 'pulled';
  } catch (err) {
    console.warn('[Drive sync launch]', err);
    return false;
  }
}

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
            (<span class="mono">${escapeHtml(state.fileName || DRIVE_SYNC_FILE_NAME)}</span>)?</p>`,
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
  window.open(DRIVE_MY_DRIVE, '_blank', 'noopener,noreferrer');
  const fd = await formModal({
    title: 'Restore from Google Drive',
    confirmLabel: 'Choose backup file',
    fieldsHtml: `
      <div class="form">
        <p>Google Drive opened in a new tab. Download your PicoExpense backup, then choose it here.</p>
        <div class="field">
          <label class="field__label" for="guided-restore-file">Backup file</label>
          <input class="input" id="guided-restore-file" name="file" type="file"
                 accept=".json,.exp.json,.zip,.exp.zip,application/json,application/zip" required />
        </div>
      </div>`,
  });
  if (!fd) return null;
  const file = fd.get('file');
  if (!(file instanceof File)) throw new Error('Please choose a backup file');
  return backupService.parseBackupFile(file, file.name);
}
