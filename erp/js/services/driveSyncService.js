/**
 * Google Drive sync — folder-linked zip backup, launch compare, periodic upload.
 * Credentials live in js/data/googleDriveConfig.js (publisher fills Client ID / API key).
 */

import { EVENTS, SETTINGS_KEYS } from '../core/constants.js';
import { emit, on } from '../core/eventBus.js';
import { nowIso } from '../utils/date.js';
import { settingsRepository } from '../repositories/settingsRepository.js';
import {
  DRIVE_SYNC_FILE_NAME,
  DRIVE_SYNC_FOLDER_NAME,
  DRIVE_SYNC_INTERVAL_MS,
  DRIVE_SYNC_MIN_GAP_MS,
} from '../data/googleDriveConfig.js';
import * as googleDriveService from './googleDriveService.js';
import * as backupService from './backupService.js';

/**
 * @typedef {{
 *   enabled: boolean,
 *   folderId: string|null,
 *   folderName: string,
 *   parentFolderId: string|null,
 *   parentFolderName: string,
 *   fileId: string|null,
 *   fileName: string,
 *   lastUploadedAt: string|null,
 *   lastDriveModifiedAt: string|null,
 *   lastDriveExportedAt: string|null,
 *   lastCheckedAt: string|null,
 *   lastError: string|null,
 * }} DriveSyncState
 */

/** @type {ReturnType<typeof setInterval>|null} */
let periodicTimer = null;
/** @type {boolean} */
let uploading = false;
/** @type {boolean} */
let changeListenerBound = false;
/** @type {number} */
let lastAutoUploadMs = 0;

/**
 * @returns {Promise<boolean>}
 */
export async function isDriveApiConfigured() {
  const creds = await googleDriveService.getDriveCredentials();
  return Boolean(creds.clientId && creds.apiKey);
}

/**
 * @returns {DriveSyncState}
 */
function emptySyncState() {
  return {
    enabled: false,
    folderId: null,
    folderName: '',
    parentFolderId: null,
    parentFolderName: '',
    fileId: null,
    fileName: DRIVE_SYNC_FILE_NAME,
    lastUploadedAt: null,
    lastDriveModifiedAt: null,
    lastDriveExportedAt: null,
    lastCheckedAt: null,
    lastError: null,
  };
}

/**
 * @returns {Promise<DriveSyncState>}
 */
export async function getSyncState() {
  const raw = await settingsRepository.getValue(SETTINGS_KEYS.GOOGLE_DRIVE_SYNC);
  if (!raw || typeof raw !== 'object') return emptySyncState();
  const base = emptySyncState();
  return {
    ...base,
    ...raw,
    enabled: Boolean(raw.enabled && raw.folderId),
    folderId: raw.folderId || null,
    parentFolderId: raw.parentFolderId || null,
    parentFolderName: String(raw.parentFolderName || ''),
    fileId: raw.fileId || null,
    fileName: String(raw.fileName || DRIVE_SYNC_FILE_NAME),
  };
}

/**
 * @param {Partial<DriveSyncState>} patch
 * @returns {Promise<DriveSyncState>}
 */
export async function saveSyncState(patch) {
  const current = await getSyncState();
  const next = { ...current, ...patch };
  await settingsRepository.setValue(SETTINGS_KEYS.GOOGLE_DRIVE_SYNC, next);
  emit(EVENTS.DRIVE_SYNC_CHANGED, next);
  return next;
}

/**
 * @returns {Promise<string|null>}
 */
export async function getLocalDataUpdatedAt() {
  const v = await settingsRepository.getValue(SETTINGS_KEYS.LOCAL_DATA_UPDATED_AT);
  return v ? String(v) : null;
}

/**
 * @param {string} [iso]
 */
export async function markLocalDataChanged(iso) {
  const at = iso || nowIso();
  await settingsRepository.setValue(SETTINGS_KEYS.LOCAL_DATA_UPDATED_AT, at);
  return at;
}

/**
 * Bind domain events so local freshness advances after edits.
 */
export function bindLocalChangeTracking() {
  if (changeListenerBound) return;
  changeListenerBound = true;
  const bump = () => {
    markLocalDataChanged().catch(() => {});
  };
  on(EVENTS.BOOK_CHANGED, bump);
  on(EVENTS.BOOK_CREATED, bump);
  on(EVENTS.BOOK_DELETED, bump);
  on(EVENTS.COA_CHANGED, bump);
  on(EVENTS.VOUCHER_CHANGED, bump);
  on(EVENTS.INVENTORY_CHANGED, bump);
  on(EVENTS.INVOICE_CHANGED, bump);
  on(EVENTS.TAX_CHANGED, bump);
  on(EVENTS.FINANCE_CHANGED, bump);
}

/**
 * Pick a Drive parent folder, ensure PicoERPBackup inside it, then enable sync.
 * @returns {Promise<DriveSyncState>}
 */
export async function connectSyncFolder() {
  if (!(await isDriveApiConfigured())) {
    throw new Error(
      'Google Drive API is not configured. Fill clientId and apiKey in js/data/googleDriveConfig.js'
    );
  }
  await googleDriveService.getAccessToken();
  const parent = await googleDriveService.pickDriveFolder();
  if (!parent) {
    throw new Error('Folder selection cancelled');
  }

  const backupFolder = await googleDriveService.ensureChildFolder(
    parent.id,
    DRIVE_SYNC_FOLDER_NAME
  );

  await saveSyncState({
    enabled: true,
    folderId: backupFolder.id,
    folderName: backupFolder.name || DRIVE_SYNC_FOLDER_NAME,
    parentFolderId: parent.id,
    parentFolderName: parent.name,
    fileId: null,
    fileName: DRIVE_SYNC_FILE_NAME,
    lastError: null,
  });

  const result = await uploadNow({ reason: 'connect' });
  startPeriodicSync();
  return result.state;
}

/**
 * Disable automatic sync (keeps Drive file; clears local link).
 */
export async function disconnectSync() {
  stopPeriodicSync();
  const cleared = emptySyncState();
  await settingsRepository.setValue(SETTINGS_KEYS.GOOGLE_DRIVE_SYNC, cleared);
  emit(EVENTS.DRIVE_SYNC_CHANGED, cleared);
  return cleared;
}

/**
 * Export full backup zip and upload/update the synced Drive file.
 * @param {{ quiet?: boolean, reason?: string, force?: boolean }} [opts]
 */
export async function uploadNow(opts = {}) {
  if (uploading) {
    return { skipped: true, reason: 'busy', state: await getSyncState() };
  }

  const state = await getSyncState();
  if (!state.enabled || !state.folderId) {
    throw new Error('Google Drive sync folder is not connected');
  }
  if (!(await isDriveApiConfigured())) {
    throw new Error('Google Drive API is not configured');
  }

  if (!opts.force) {
    const localAt = await getLocalDataUpdatedAt();
    if (
      localAt &&
      state.lastUploadedAt &&
      Date.parse(localAt) <= Date.parse(state.lastUploadedAt) + 1000
    ) {
      return { skipped: true, reason: 'up-to-date', state };
    }
    const now = Date.now();
    if (now - lastAutoUploadMs < DRIVE_SYNC_MIN_GAP_MS && opts.reason === 'periodic') {
      return { skipped: true, reason: 'min-gap', state };
    }
  }

  uploading = true;
  try {
    const { payload, fileName, summary } = await backupService.exportFullBackup();
    const { blob } = await backupService.buildBackupZip(payload, fileName);
    const exportedAt = String(payload.exportedAt || nowIso());
    const fileNameOnDrive = state.fileName || DRIVE_SYNC_FILE_NAME;

    const uploaded = await googleDriveService.uploadOrUpdateBackupFile(
      blob,
      fileNameOnDrive,
      state.folderId,
      { existingFileId: state.fileId, exportedAt }
    );

    lastAutoUploadMs = Date.now();
    await markLocalDataChanged(exportedAt);
    const next = await saveSyncState({
      enabled: true,
      folderId: state.folderId,
      folderName: state.folderName,
      parentFolderId: state.parentFolderId,
      parentFolderName: state.parentFolderName,
      fileId: uploaded.id,
      fileName: uploaded.name || fileNameOnDrive,
      lastUploadedAt: exportedAt,
      lastDriveModifiedAt: uploaded.modifiedTime || exportedAt,
      lastDriveExportedAt: exportedAt,
      lastCheckedAt: nowIso(),
      lastError: null,
    });

    return { skipped: false, uploaded, summary, exportedAt, state: next };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await saveSyncState({ lastError: message, lastCheckedAt: nowIso() });
    throw err;
  } finally {
    uploading = false;
  }
}

/**
 * Compare Drive backup freshness vs local data.
 * @returns {Promise<{
 *   status: 'no-sync'|'offline'|'no-token'|'no-remote'|'local-newer'|'remote-newer'|'same'|'error',
 *   localAt: string|null,
 *   remoteAt: string|null,
 *   remoteModifiedAt: string|null,
 *   fileId: string|null,
 *   fileName: string|null,
 *   message?: string,
 *   state: DriveSyncState,
 * }>}
 */
export async function compareWithDrive() {
  const state = await getSyncState();
  if (!state.enabled || !state.folderId) {
    return {
      status: 'no-sync',
      localAt: await getLocalDataUpdatedAt(),
      remoteAt: null,
      remoteModifiedAt: null,
      fileId: null,
      fileName: null,
      state,
    };
  }

  if (!navigator.onLine) {
    return {
      status: 'offline',
      localAt: await getLocalDataUpdatedAt(),
      remoteAt: state.lastDriveExportedAt,
      remoteModifiedAt: state.lastDriveModifiedAt,
      fileId: state.fileId,
      fileName: state.fileName,
      state,
    };
  }

  try {
    if (!googleDriveService.getCachedAccessToken()) {
      // Soft sign-in — may show a brief consent if needed
      await googleDriveService.getAccessToken();
    }

    let meta = null;
    if (state.fileId) {
      try {
        meta = await googleDriveService.getFileMetadata(state.fileId);
      } catch {
        meta = null;
      }
    }
    if (!meta) {
      meta = await googleDriveService.findFileInFolder(
        state.folderId,
        state.fileName || DRIVE_SYNC_FILE_NAME
      );
    }

    await saveSyncState({
      lastCheckedAt: nowIso(),
      fileId: meta?.id || state.fileId,
      lastDriveModifiedAt: meta?.modifiedTime || state.lastDriveModifiedAt,
      lastDriveExportedAt:
        meta?.appProperties?.picoerpExportedAt || state.lastDriveExportedAt,
      lastError: null,
    });

    const refreshed = await getSyncState();
    const localAt = await getLocalDataUpdatedAt();

    if (!meta?.id) {
      return {
        status: 'no-remote',
        localAt,
        remoteAt: null,
        remoteModifiedAt: null,
        fileId: null,
        fileName: refreshed.fileName,
        state: refreshed,
      };
    }

    const remoteAt =
      meta.appProperties?.picoerpExportedAt || meta.modifiedTime || null;
    const remoteMs = remoteAt ? Date.parse(remoteAt) : 0;
    const localMs = localAt ? Date.parse(localAt) : 0;
    // Prefer lastUploadedAt as "what we know we have" when localAt missing
    const baselineMs = localMs || (refreshed.lastUploadedAt ? Date.parse(refreshed.lastUploadedAt) : 0);

    let status = 'same';
    if (!baselineMs && remoteMs) status = 'remote-newer';
    else if (remoteMs > baselineMs + 2000) status = 'remote-newer';
    else if (baselineMs > remoteMs + 2000) status = 'local-newer';

    return {
      status,
      localAt,
      remoteAt,
      remoteModifiedAt: meta.modifiedTime || null,
      fileId: meta.id,
      fileName: meta.name || refreshed.fileName,
      state: refreshed,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const refreshed = await saveSyncState({ lastError: message, lastCheckedAt: nowIso() });
    if (/not connected|Client ID|apiKey|sign-in|token|cancelled/i.test(message)) {
      return {
        status: 'no-token',
        localAt: await getLocalDataUpdatedAt(),
        remoteAt: refreshed.lastDriveExportedAt,
        remoteModifiedAt: refreshed.lastDriveModifiedAt,
        fileId: refreshed.fileId,
        fileName: refreshed.fileName,
        message,
        state: refreshed,
      };
    }
    return {
      status: 'error',
      localAt: await getLocalDataUpdatedAt(),
      remoteAt: refreshed.lastDriveExportedAt,
      remoteModifiedAt: refreshed.lastDriveModifiedAt,
      fileId: refreshed.fileId,
      fileName: refreshed.fileName,
      message,
      state: refreshed,
    };
  }
}

/**
 * Download synced Drive backup and parse it.
 * @param {string} [fileId]
 */
export async function downloadSyncedBackup(fileId) {
  const state = await getSyncState();
  const id = fileId || state.fileId;
  if (!id) {
    const found = state.folderId
      ? await googleDriveService.findFileInFolder(
          state.folderId,
          state.fileName || DRIVE_SYNC_FILE_NAME
        )
      : null;
    if (!found?.id) throw new Error('No synced backup file found on Google Drive');
    const blob = await googleDriveService.downloadDriveFile(found.id);
    return backupService.parseBackupFile(blob, found.name || DRIVE_SYNC_FILE_NAME);
  }
  const blob = await googleDriveService.downloadDriveFile(id);
  return backupService.parseBackupFile(blob, state.fileName || DRIVE_SYNC_FILE_NAME);
}

/**
 * After restoring from Drive, align local timestamps so we do not loop prompts.
 * @param {string} [exportedAt]
 */
export async function markRestoredFromDrive(exportedAt) {
  const at = exportedAt || nowIso();
  await markLocalDataChanged(at);
  await saveSyncState({
    lastUploadedAt: at,
    lastDriveExportedAt: at,
    lastCheckedAt: nowIso(),
    lastError: null,
  });
}

export function startPeriodicSync() {
  stopPeriodicSync();
  periodicTimer = setInterval(() => {
    runPeriodicUpload().catch((err) => console.warn('[Drive sync]', err));
  }, DRIVE_SYNC_INTERVAL_MS);
}

export function stopPeriodicSync() {
  if (periodicTimer) {
    clearInterval(periodicTimer);
    periodicTimer = null;
  }
}

async function runPeriodicUpload() {
  const state = await getSyncState();
  if (!state.enabled || !state.folderId) return;
  if (!navigator.onLine) return;
  if (!googleDriveService.getCachedAccessToken()) return;
  await uploadNow({ reason: 'periodic' });
}

/**
 * Call once after app boot: track changes, start timer, return launch compare result.
 */
export async function initDriveSync() {
  bindLocalChangeTracking();
  const state = await getSyncState();
  if (state.enabled && state.folderId) {
    startPeriodicSync();
  }
  return state;
}
