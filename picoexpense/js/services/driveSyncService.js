/**
 * Google Drive sync — folder-linked zip backup, launch compare, scheduled upload.
 */

import { EVENTS, SETTINGS_KEYS } from '../core/constants.js';
import { emit, on } from '../core/eventBus.js';
import { nowIso, toDateInput } from '../utils/date.js';
import { settingsRepository } from '../repositories/index.js';
import {
  DRIVE_SYNC_DEFAULT_DAILY_TIME,
  DRIVE_SYNC_DEFAULT_INTERVAL_HOURS,
  DRIVE_SYNC_FILE_NAME,
  DRIVE_SYNC_FOLDER_NAME,
  DRIVE_SYNC_INTERVAL_HOURS,
  DRIVE_SYNC_MIN_GAP_MS,
  DRIVE_SYNC_TICK_MS,
  DRIVE_EXPORTED_AT_PROP,
} from '../data/googleDriveConfig.js';
import * as googleDriveService from './googleDriveService.js';
import * as backupService from './backupService.js';

/**
 * @typedef {'interval'|'daily'} AutoSyncMode
 * @typedef {{
 *   enabled: boolean,
 *   folderId: string|null,
 *   folderName: string,
 *   parentFolderId: string|null,
 *   parentFolderName: string,
 *   fileId: string|null,
 *   fileName: string,
 *   autoSyncEnabled: boolean,
 *   autoSyncMode: AutoSyncMode,
 *   autoSyncIntervalHours: number,
 *   autoSyncDailyTime: string,
 *   lastAutoSyncDay: string|null,
 *   lastUploadedAt: string|null,
 *   lastDriveModifiedAt: string|null,
 *   lastDriveExportedAt: string|null,
 *   lastCheckedAt: string|null,
 *   lastError: string|null,
 * }} DriveSyncState
 */

let periodicTimer = null;
let uploading = false;
let changeListenerBound = false;
let lastAutoUploadMs = 0;

export async function isDriveApiConfigured() {
  const creds = await googleDriveService.getDriveCredentials();
  return Boolean(creds.clientId && creds.apiKey);
}

export function normalizeIntervalHours(hours) {
  const n = Number(hours);
  if (DRIVE_SYNC_INTERVAL_HOURS.includes(/** @type {any} */ (n))) return n;
  return DRIVE_SYNC_DEFAULT_INTERVAL_HOURS;
}

export function normalizeDailyTime(time) {
  const raw = String(time || '').trim();
  if (/^\d{2}:\d{2}$/.test(raw)) {
    const [hh, mm] = raw.split(':').map(Number);
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }
  }
  return DRIVE_SYNC_DEFAULT_DAILY_TIME;
}

function emptySyncState() {
  return {
    enabled: false,
    folderId: null,
    folderName: '',
    parentFolderId: null,
    parentFolderName: '',
    fileId: null,
    fileName: DRIVE_SYNC_FILE_NAME,
    autoSyncEnabled: true,
    autoSyncMode: 'interval',
    autoSyncIntervalHours: DRIVE_SYNC_DEFAULT_INTERVAL_HOURS,
    autoSyncDailyTime: DRIVE_SYNC_DEFAULT_DAILY_TIME,
    lastAutoSyncDay: null,
    lastUploadedAt: null,
    lastDriveModifiedAt: null,
    lastDriveExportedAt: null,
    lastCheckedAt: null,
    lastError: null,
  };
}

export async function getSyncState() {
  const raw = await settingsRepository.getValue(SETTINGS_KEYS.GOOGLE_DRIVE_SYNC);
  if (!raw || typeof raw !== 'object') return emptySyncState();
  const base = emptySyncState();
  const mode = raw.autoSyncMode === 'daily' ? 'daily' : 'interval';
  return {
    ...base,
    ...raw,
    enabled: Boolean(raw.enabled && raw.folderId),
    folderId: raw.folderId || null,
    parentFolderId: raw.parentFolderId || null,
    parentFolderName: String(raw.parentFolderName || ''),
    fileId: raw.fileId || null,
    fileName: String(raw.fileName || DRIVE_SYNC_FILE_NAME),
    autoSyncEnabled: raw.autoSyncEnabled !== false,
    autoSyncMode: mode,
    autoSyncIntervalHours: normalizeIntervalHours(raw.autoSyncIntervalHours),
    autoSyncDailyTime: normalizeDailyTime(raw.autoSyncDailyTime),
    lastAutoSyncDay: raw.lastAutoSyncDay ? String(raw.lastAutoSyncDay) : null,
  };
}

export async function saveSyncState(patch) {
  const current = await getSyncState();
  const normalized = { ...patch };
  if (patch.autoSyncIntervalHours !== undefined) {
    normalized.autoSyncIntervalHours = normalizeIntervalHours(patch.autoSyncIntervalHours);
  }
  if (patch.autoSyncDailyTime !== undefined) {
    normalized.autoSyncDailyTime = normalizeDailyTime(patch.autoSyncDailyTime);
  }
  if (patch.autoSyncMode !== undefined) {
    normalized.autoSyncMode = patch.autoSyncMode === 'daily' ? 'daily' : 'interval';
  }
  const next = { ...current, ...normalized };
  await settingsRepository.setValue(SETTINGS_KEYS.GOOGLE_DRIVE_SYNC, next);
  emit(EVENTS.DRIVE_SYNC_CHANGED, next);
  return next;
}

export async function updateAutoSyncSchedule(opts) {
  const next = await saveSyncState(opts);
  if (next.enabled && next.folderId && next.autoSyncEnabled) startPeriodicSync();
  else stopPeriodicSync();
  return next;
}

export async function getLocalDataUpdatedAt() {
  const v = await settingsRepository.getValue(SETTINGS_KEYS.LOCAL_DATA_UPDATED_AT);
  return v ? String(v) : null;
}

export async function markLocalDataChanged(iso) {
  const at = iso || nowIso();
  await settingsRepository.setValue(SETTINGS_KEYS.LOCAL_DATA_UPDATED_AT, at);
  return at;
}

export function bindLocalChangeTracking() {
  if (changeListenerBound) return;
  changeListenerBound = true;
  const bump = () => {
    markLocalDataChanged().catch(() => {});
  };
  on(EVENTS.DATA_CHANGED, bump);
  on(EVENTS.TXN_CHANGED, bump);
  on(EVENTS.ACCOUNT_CHANGED, bump);
  on(EVENTS.MASTER_CHANGED, bump);
  on(EVENTS.SETTINGS_CHANGED, bump);
}

export async function inspectPickedSyncFolder() {
  if (!(await isDriveApiConfigured())) {
    throw new Error('Google Drive API is not configured. Fill clientId and apiKey in js/data/googleDriveConfig.js');
  }
  await googleDriveService.getAccessToken();
  const parent = await googleDriveService.pickDriveFolder();
  if (!parent) throw new Error('Folder selection cancelled');
  const backupFolder = await googleDriveService.findFolderInParent(parent.id, DRIVE_SYNC_FOLDER_NAME);
  const existingFile = backupFolder
    ? await googleDriveService.findFileInFolder(backupFolder.id, DRIVE_SYNC_FILE_NAME)
    : null;
  return { parent, backupFolder, existingFile };
}

export async function linkSyncFolder(target, opts = {}) {
  const mode = opts.mode === 'use' ? 'use' : 'overwrite';
  if (mode === 'use' && !target.existingFile?.id) {
    throw new Error('No existing Drive backup to use in that folder');
  }
  let backupFolder = target.backupFolder;
  if (!backupFolder) {
    backupFolder = await googleDriveService.ensureChildFolder(target.parent.id, DRIVE_SYNC_FOLDER_NAME);
  }
  const prev = await getSyncState();
  const existing = target.existingFile;
  const exportedAt =
    existing?.appProperties?.[DRIVE_EXPORTED_AT_PROP] || existing?.modifiedTime || null;

  await saveSyncState({
    enabled: true,
    folderId: backupFolder.id,
    folderName: backupFolder.name || DRIVE_SYNC_FOLDER_NAME,
    parentFolderId: target.parent.id,
    parentFolderName: target.parent.name,
    fileId: existing?.id || null,
    fileName: existing?.name || DRIVE_SYNC_FILE_NAME,
    autoSyncEnabled: prev.autoSyncEnabled !== false,
    autoSyncMode: prev.autoSyncMode || 'interval',
    autoSyncIntervalHours: normalizeIntervalHours(prev.autoSyncIntervalHours),
    autoSyncDailyTime: normalizeDailyTime(prev.autoSyncDailyTime),
    lastDriveModifiedAt: existing?.modifiedTime || null,
    lastDriveExportedAt: exportedAt,
    lastError: null,
  });

  if (mode === 'overwrite') {
    const result = await uploadNow({ reason: 'connect', force: true });
    startPeriodicSync();
    return { state: result.state, mode };
  }
  startPeriodicSync();
  return { state: await getSyncState(), mode };
}

export async function connectSyncFolder() {
  const target = await inspectPickedSyncFolder();
  const linked = await linkSyncFolder(target, { mode: 'overwrite' });
  return linked.state;
}

export async function disconnectSync() {
  stopPeriodicSync();
  const cleared = emptySyncState();
  await settingsRepository.setValue(SETTINGS_KEYS.GOOGLE_DRIVE_SYNC, cleared);
  emit(EVENTS.DRIVE_SYNC_CHANGED, cleared);
  return cleared;
}

export async function uploadNow(opts = {}) {
  if (uploading) return { skipped: true, reason: 'busy', state: await getSyncState() };
  const state = await getSyncState();
  if (!state.enabled || !state.folderId) throw new Error('Google Drive sync folder is not connected');
  if (!(await isDriveApiConfigured())) throw new Error('Google Drive API is not configured');

  if (!opts.force) {
    const localAt = await getLocalDataUpdatedAt();
    if (localAt && state.lastUploadedAt && Date.parse(localAt) <= Date.parse(state.lastUploadedAt) + 1000) {
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
    const uploaded = await googleDriveService.uploadOrUpdateBackupFile(blob, fileNameOnDrive, state.folderId, {
      existingFileId: state.fileId,
      exportedAt,
    });
    lastAutoUploadMs = Date.now();
    const today = toDateInput(new Date());
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
      lastAutoSyncDay: opts.reason === 'periodic' || opts.reason === 'connect' ? today : state.lastAutoSyncDay,
      lastError: null,
    });
    try {
      const { recordActivity } = await import('./activityLogService.js');
      const pathLabel = state.parentFolderName
        ? `${state.parentFolderName} / ${state.folderName}`
        : state.folderName || 'Google Drive';
      await recordActivity({ category: 'Sync', message: `Uploaded backup to Google Drive (${pathLabel})` });
    } catch {
      /* ignore */
    }
    return { skipped: false, uploaded, summary, exportedAt, state: next };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await saveSyncState({ lastError: message, lastCheckedAt: nowIso() });
    throw err;
  } finally {
    uploading = false;
  }
}

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
    if (!googleDriveService.getCachedAccessToken()) await googleDriveService.getAccessToken();
    let meta = null;
    if (state.fileId) {
      try {
        meta = await googleDriveService.getFileMetadata(state.fileId);
      } catch {
        meta = null;
      }
    }
    if (!meta) {
      meta = await googleDriveService.findFileInFolder(state.folderId, state.fileName || DRIVE_SYNC_FILE_NAME);
    }
    await saveSyncState({
      lastCheckedAt: nowIso(),
      fileId: meta?.id || state.fileId,
      lastDriveModifiedAt: meta?.modifiedTime || state.lastDriveModifiedAt,
      lastDriveExportedAt: meta?.appProperties?.[DRIVE_EXPORTED_AT_PROP] || state.lastDriveExportedAt,
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
    const remoteAt = meta.appProperties?.[DRIVE_EXPORTED_AT_PROP] || meta.modifiedTime || null;
    const remoteMs = remoteAt ? Date.parse(remoteAt) : 0;
    const localMs = localAt ? Date.parse(localAt) : 0;
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

export async function downloadSyncedBackup(fileId) {
  const state = await getSyncState();
  const id = fileId || state.fileId;
  if (!id) {
    const found = state.folderId
      ? await googleDriveService.findFileInFolder(state.folderId, state.fileName || DRIVE_SYNC_FILE_NAME)
      : null;
    if (!found?.id) throw new Error('No synced backup file found on Google Drive');
    const blob = await googleDriveService.downloadDriveFile(found.id);
    return backupService.parseBackupFile(blob, found.name || DRIVE_SYNC_FILE_NAME);
  }
  const blob = await googleDriveService.downloadDriveFile(id);
  return backupService.parseBackupFile(blob, state.fileName || DRIVE_SYNC_FILE_NAME);
}

export async function loadDriveActivityLog() {
  const state = await getSyncState();
  if (!state.enabled || !state.folderId) throw new Error('Google Drive sync folder is not connected');
  const parsed = await downloadSyncedBackup(state.fileId || undefined);
  if (!parsed.ok || !parsed.raw) throw new Error(parsed.errors?.[0] || 'Could not read Drive backup');
  const { extractActivityLogFromBackup } = await import('./activityLogService.js');
  return {
    activityLog: extractActivityLogFromBackup(parsed.raw),
    exportedAt: parsed.exportedAt ? String(parsed.exportedAt) : null,
    fileName: state.fileName || DRIVE_SYNC_FILE_NAME,
  };
}

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

export function shouldRunAutoSync(state) {
  if (!state.enabled || !state.folderId || !state.autoSyncEnabled) return false;
  if (state.autoSyncMode === 'daily') {
    const today = toDateInput(new Date());
    if (state.lastAutoSyncDay === today) return false;
    const [hh, mm] = normalizeDailyTime(state.autoSyncDailyTime).split(':').map(Number);
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes() >= hh * 60 + mm;
  }
  const hours = normalizeIntervalHours(state.autoSyncIntervalHours);
  const lastMs = state.lastUploadedAt ? Date.parse(state.lastUploadedAt) : 0;
  if (!lastMs) return true;
  return Date.now() - lastMs >= hours * 60 * 60 * 1000;
}

export function startPeriodicSync() {
  stopPeriodicSync();
  periodicTimer = setInterval(() => {
    runScheduledUpload().catch((err) => console.warn('[Drive sync]', err));
  }, DRIVE_SYNC_TICK_MS);
  setTimeout(() => {
    runScheduledUpload().catch((err) => console.warn('[Drive sync]', err));
  }, 5000);
}

export function stopPeriodicSync() {
  if (periodicTimer) {
    clearInterval(periodicTimer);
    periodicTimer = null;
  }
}

async function runScheduledUpload() {
  const state = await getSyncState();
  if (!shouldRunAutoSync(state)) return;
  if (!navigator.onLine) return;
  if (!googleDriveService.getCachedAccessToken()) return;
  const result = await uploadNow({ reason: 'periodic' });
  if (!result.skipped) await saveSyncState({ lastAutoSyncDay: toDateInput(new Date()) });
}

export async function initDriveSync() {
  bindLocalChangeTracking();
  const state = await getSyncState();
  if (state.enabled && state.folderId && state.autoSyncEnabled) startPeriodicSync();
  return state;
}
