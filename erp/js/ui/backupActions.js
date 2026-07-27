/**
 * Shared backup / restore UI helpers (topbar + Settings).
 *
 * Google Drive for end users: guided zip download + open Drive (no Client ID).
 * Optional seamless picker only if the publisher filled js/data/googleDriveConfig.js.
 */

import * as backupService from '../services/backupService.js';
import * as googleDriveService from '../services/googleDriveService.js';
import { confirmModal, formModal, escapeHtml } from './modal.js';
import { showToast } from './toast.js';
import { formatDisplayDate } from '../utils/date.js';

const DRIVE_MY_DRIVE = 'https://drive.google.com/drive/my-drive';

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
async function hasPublisherDriveIntegration() {
  const creds = await googleDriveService.getDriveCredentials();
  return Boolean(creds.clientId && creds.apiKey);
}

/**
 * Zip full backup and send to Google Drive.
 * - Seamless (sign-in + folder picker) only if publisher configured Drive.
 * - Otherwise: download .erp.zip and open Drive with plain-language steps.
 */
export async function uploadFullBackupToGoogleDrive() {
  showToast('Preparing compressed backup…', 'info');
  const { payload, fileName, summary } = await backupService.exportFullBackup();
  const { blob, zipFileName } = await backupService.buildBackupZip(payload, fileName);

  if (await hasPublisherDriveIntegration()) {
    try {
      showToast('Opening Google sign-in…', 'info');
      await googleDriveService.getAccessToken();
      showToast('Choose a Drive folder…', 'info');
      const folder = await googleDriveService.pickDriveFolder();
      if (!folder) {
        showToast('Folder selection cancelled', 'info');
        return null;
      }
      showToast(`Uploading to “${folder.name}”…`, 'info');
      const uploaded = await googleDriveService.uploadBackupFile(blob, zipFileName, folder.id);
      showToast(
        `Saved ${zipFileName} in “${folder.name}” (${summary.totalRecords} records)`,
        'success'
      );
      return { uploaded, summary, zipFileName, folder, mode: 'api' };
    } catch (err) {
      // Fall through to guided flow if API path fails (ad blockers, misconfig, etc.)
      console.warn('[Drive API]', err);
      showToast('Opening the simple Google Drive upload steps instead…', 'info');
    }
  }

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
          Tip: keep this file safe — you can restore it later from Settings → Restore.
        </p>
      </div>`,
  });

  showToast('Follow the steps in Drive to finish uploading', 'success');
  return { summary, zipFileName, mode: 'guided' };
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
