/**
 * Google Drive credentials & sync defaults for PicoERP.
 *
 * Fill clientId / apiKey / appId from your Google Cloud project so the app can
 * sign in, pick a folder, upload the backup zip, and sync automatically.
 * Leave empty to fall back to the guided “download + open Drive” flow.
 *
 * Google Cloud setup (publisher):
 * 1. Create a project → enable Google Drive API + Google Picker API
 * 2. Create an OAuth 2.0 Web Client ID (Authorized JavaScript origins = your app URL)
 * 3. Create a Browser API key (restrict to those APIs if desired)
 * 4. Paste values below and rebuild/redeploy
 */
export const GOOGLE_DRIVE_DEFAULTS = Object.freeze({
  /** @type {string} OAuth 2.0 Web Client ID */
  clientId: '360191098183-cknkgqadrgpada5c3ir0ug6tstjsb7a1.apps.googleusercontent.com',
  /** @type {string} Browser API key for Google Picker */
  apiKey: 'AIzaSyAYGiSItMgqYwi47pjkDNmgBQ7kJp29lt0',
  /** @type {string} Cloud project number (optional, for Picker appId) */
  appId: '',
});

/** Stable backup filename in the synced Drive folder (updated in place). */
export const DRIVE_SYNC_FILE_NAME = 'PicoERP_sync.erp.zip';

/** Subfolder created/used inside the folder the user picks. */
export const DRIVE_SYNC_FOLDER_NAME = 'PicoERPBackup';

/** Allowed auto-sync interval choices (hours). */
export const DRIVE_SYNC_INTERVAL_HOURS = Object.freeze([2, 4, 6, 8]);

/** Default auto-sync interval when mode is “every X hours”. */
export const DRIVE_SYNC_DEFAULT_INTERVAL_HOURS = 4;

/** Default local time (HH:MM) for once-a-day auto sync. */
export const DRIVE_SYNC_DEFAULT_DAILY_TIME = '18:00';

/** How often the auto-sync scheduler wakes to check (ms). */
export const DRIVE_SYNC_TICK_MS = 60 * 1000;

/** Minimum gap between automatic uploads even if data keeps changing (ms). */
export const DRIVE_SYNC_MIN_GAP_MS = 2 * 60 * 1000;
