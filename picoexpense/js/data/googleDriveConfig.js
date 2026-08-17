/**
 * Google Drive credentials & sync defaults for PicoExpense.
 * Same Cloud project as PicoERP; folder/file names are PicoExpense-specific.
 */

export const GOOGLE_DRIVE_DEFAULTS = Object.freeze({
  clientId: '360191098183-cknkgqadrgpada5c3ir0ug6tstjsb7a1.apps.googleusercontent.com',
  apiKey: 'AIzaSyAYGiSItMgqYwi47pjkDNmgBQ7kJp29lt0',
  appId: '',
});

export const DRIVE_SYNC_FILE_NAME = 'PicoExpense_sync.exp.zip';
export const DRIVE_SYNC_FOLDER_NAME = 'PicoExpenseBackup';
export const DRIVE_SYNC_INTERVAL_HOURS = Object.freeze([2, 4, 6, 8]);
export const DRIVE_SYNC_DEFAULT_INTERVAL_HOURS = 4;
export const DRIVE_SYNC_DEFAULT_DAILY_TIME = '18:00';
export const DRIVE_SYNC_TICK_MS = 60 * 1000;
export const DRIVE_SYNC_MIN_GAP_MS = 2 * 60 * 1000;
export const DRIVE_EXPORTED_AT_PROP = 'picoexpenseExportedAt';
