import * as backupService from '../../services/backupService.js';
import {
  downloadFullBackupLocal,
  uploadFullBackupToGoogleDrive,
  pickAndParseGoogleDriveBackup,
  reconnectDriveSyncFolder,
} from '../backupActions.js';
import { getSyncState, disconnectSync, updateAutoSyncSchedule } from '../../services/driveSyncService.js';
import { getSetting, setSetting } from '../../services/settingsService.js';
import { SETTINGS_KEYS } from '../../core/constants.js';
import { transactionRepository, accountRepository, receiptRepository } from '../../repositories/index.js';
import { escapeHtml } from '../../utils/html.js';
import { confirmModal, formModal } from '../modal.js';
import { showToast } from '../toast.js';
import { encryptBackupJson } from '../../services/backupService.js';
import { exportTransactionsCsv } from '../../services/exportService.js';
import { nowIso } from '../../utils/date.js';

export async function renderBackup() {
  const outlet = document.getElementById('outlet');
  const [txCount, acctCount, recCount, lastBackup, lastRestore, sync] = await Promise.all([
    transactionRepository.count(),
    accountRepository.count(),
    receiptRepository.count(),
    getSetting(SETTINGS_KEYS.LAST_BACKUP_AT),
    getSetting(SETTINGS_KEYS.LAST_RESTORE_AT),
    getSyncState(),
  ]);
  let sizeLabel = '—';
  try {
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      if (est.usage != null) sizeLabel = `${Math.round(est.usage / 1024)} KB used`;
    }
  } catch {
    /* ignore */
  }
  outlet.innerHTML = `
    <section class="page">
      <h2>Backup &amp; data</h2>
      <dl class="stat-grid">
        <div><dt>Transactions</dt><dd>${txCount}</dd></div>
        <div><dt>Accounts</dt><dd>${acctCount}</dd></div>
        <div><dt>Receipts</dt><dd>${recCount}</dd></div>
        <div><dt>Last backup</dt><dd>${escapeHtml(String(lastBackup || '—'))}</dd></div>
        <div><dt>Last restore</dt><dd>${escapeHtml(String(lastRestore || '—'))}</dd></div>
        <div><dt>Storage</dt><dd>${escapeHtml(sizeLabel)}</dd></div>
      </dl>
      <div class="stack">
        <button type="button" class="btn btn--primary" id="dl">Download JSON backup</button>
        <button type="button" class="btn btn--secondary" id="enc">Encrypted backup</button>
        <button type="button" class="btn btn--secondary" id="csv">Export CSV</button>
        <button type="button" class="btn btn--secondary" id="drive">Google Drive sync</button>
        <button type="button" class="btn btn--ghost" id="folder">Change Drive folder</button>
        <button type="button" class="btn btn--ghost" id="disc">Disconnect Drive</button>
        <label class="field__label">Restore file <input class="input" type="file" id="restore-file" accept=".json,.zip,.exp.json,.exp.zip" /></label>
        <button type="button" class="btn btn--ghost" id="drive-restore">Restore from Drive</button>
        <button type="button" class="btn btn--danger" id="wipe">Delete all data</button>
      </div>
      <p class="muted">Drive folder: ${escapeHtml(sync.parentFolderName || '—')} / ${escapeHtml(sync.folderName || 'not connected')}</p>
    </section>
  `;
  outlet.querySelector('#dl')?.addEventListener('click', async () => {
    await downloadFullBackupLocal();
    await setSetting(SETTINGS_KEYS.LAST_BACKUP_AT, nowIso());
  });
  outlet.querySelector('#csv')?.addEventListener('click', () => exportTransactionsCsv());
  outlet.querySelector('#drive')?.addEventListener('click', () => uploadFullBackupToGoogleDrive());
  outlet.querySelector('#folder')?.addEventListener('click', () => reconnectDriveSyncFolder());
  outlet.querySelector('#disc')?.addEventListener('click', async () => {
    await disconnectSync();
    showToast('Drive disconnected', 'info');
    renderBackup();
  });
  outlet.querySelector('#enc')?.addEventListener('click', async () => {
    const fd = await formModal({
      title: 'Encrypted backup',
      fieldsHtml: `<div class="field"><label class="field__label" for="pw">Passphrase</label><input class="input" id="pw" name="pw" type="password" required /></div>`,
    });
    if (!fd) return;
    const { payload, fileName } = await backupService.exportFullBackup();
    const enc = await encryptBackupJson(backupService.stringifyBackup(payload), String(fd.get('pw')));
    backupService.downloadBlob(new Blob([enc], { type: 'application/json' }), fileName.replace('.json', '.enc.json'));
    showToast('Encrypted backup downloaded', 'success');
  });
  outlet.querySelector('#restore-file')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    let parsed = await backupService.parseBackupFile(file, file.name);
    if (parsed.encrypted) {
      const fd = await formModal({
        title: 'Passphrase',
        fieldsHtml: `<div class="field"><label class="field__label" for="pw">Passphrase</label><input class="input" id="pw" name="pw" type="password" required /></div>`,
      });
      if (!fd) return;
      parsed = await backupService.parseBackupFile(file, file.name, String(fd.get('pw')));
    }
    await confirmRestore(parsed);
  });
  outlet.querySelector('#drive-restore')?.addEventListener('click', async () => {
    const parsed = await pickAndParseGoogleDriveBackup();
    if (parsed) await confirmRestore(parsed);
  });
  outlet.querySelector('#wipe')?.addEventListener('click', async () => {
    const ok = await confirmModal({
      title: 'Delete all data?',
      danger: true,
      confirmLabel: 'Delete everything',
      bodyHtml: '<p>This permanently erases local PicoExpense data on this device.</p>',
    });
    if (!ok) return;
    await backupService.deleteAllData();
    showToast('All data deleted', 'success');
    location.reload();
  });
  void updateAutoSyncSchedule;
}

async function confirmRestore(parsed) {
  if (!parsed?.ok) {
    showToast(parsed?.errors?.[0] || 'Invalid backup', 'error');
    return;
  }
  const mode = await confirmModal({
    title: 'Restore backup?',
    bodyHtml: `<p>${parsed.totalRecords} records · ${parsed.attachments} attachments · schema ${parsed.schemaVersion} · exported ${escapeHtml(String(parsed.exportedAt || ''))}</p>
      <p>OK = replace all local data. Cancel if you wanted merge — use Settings merge after this dialog if you cancel…</p>`,
    confirmLabel: 'Replace all',
    danger: true,
  });
  if (mode) {
    await backupService.restoreFullBackup(parsed.raw);
    await setSetting(SETTINGS_KEYS.LAST_RESTORE_AT, nowIso());
    showToast('Restored', 'success');
    location.reload();
    return;
  }
  const merge = await confirmModal({
    title: 'Merge instead?',
    bodyHtml: '<p>Keep existing records; add missing UUIDs from the backup.</p>',
    confirmLabel: 'Merge',
  });
  if (merge) {
    await backupService.mergeBackup(parsed.raw);
    showToast('Merged', 'success');
    location.reload();
  }
}
