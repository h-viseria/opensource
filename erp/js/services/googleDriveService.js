/**
 * Google Drive backup — sign-in + Google Picker (folder / file).
 * Scope: drive.file (access to files/folders the user picks or the app creates).
 */

import { SETTINGS_KEYS } from '../core/constants.js';
import { settingsRepository } from '../repositories/settingsRepository.js';
import { GOOGLE_DRIVE_DEFAULTS } from '../data/googleDriveConfig.js';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const GAPI_SRC = 'https://apis.google.com/js/api.js';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const TOKEN_KEY = 'picoerp.gdrive.accessToken';
const TOKEN_EXP_KEY = 'picoerp.gdrive.tokenExp';

/** @type {Promise<void>|null} */
let gisLoadPromise = null;
/** @type {Promise<void>|null} */
let gapiLoadPromise = null;
/** @type {Promise<void>|null} */
let pickerLoadPromise = null;

/** @type {string|null} */
let memoryToken = null;
/** @type {number} */
let memoryTokenExp = 0;

/**
 * @returns {Promise<{ clientId: string, apiKey: string, appId: string }>}
 */
export async function getDriveCredentials() {
  const [clientId, apiKey, appId] = await Promise.all([
    settingsRepository.getValue(SETTINGS_KEYS.GOOGLE_DRIVE_CLIENT_ID),
    settingsRepository.getValue(SETTINGS_KEYS.GOOGLE_DRIVE_API_KEY),
    settingsRepository.getValue(SETTINGS_KEYS.GOOGLE_DRIVE_APP_ID),
  ]);
  return {
    clientId: String(clientId || GOOGLE_DRIVE_DEFAULTS.clientId || '').trim(),
    apiKey: String(apiKey || GOOGLE_DRIVE_DEFAULTS.apiKey || '').trim(),
    appId: String(appId || GOOGLE_DRIVE_DEFAULTS.appId || '').trim(),
  };
}

/**
 * @param {{ clientId?: string, apiKey?: string, appId?: string }} creds
 */
export async function saveDriveCredentials(creds) {
  if (creds.clientId !== undefined) {
    await settingsRepository.setValue(
      SETTINGS_KEYS.GOOGLE_DRIVE_CLIENT_ID,
      String(creds.clientId || '').trim()
    );
  }
  if (creds.apiKey !== undefined) {
    await settingsRepository.setValue(
      SETTINGS_KEYS.GOOGLE_DRIVE_API_KEY,
      String(creds.apiKey || '').trim()
    );
  }
  if (creds.appId !== undefined) {
    await settingsRepository.setValue(
      SETTINGS_KEYS.GOOGLE_DRIVE_APP_ID,
      String(creds.appId || '').trim()
    );
  }
}

/** @deprecated use getDriveCredentials */
export async function getGoogleDriveClientId() {
  return (await getDriveCredentials()).clientId;
}

/** @deprecated use saveDriveCredentials */
export async function setGoogleDriveClientId(clientId) {
  await saveDriveCredentials({ clientId });
}

/**
 * @param {string} src
 */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.getAttribute('data-loaded') === '1') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error(`Could not load ${src}`)));
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.setAttribute('data-loaded', '1');
      resolve();
    };
    script.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(script);
  });
}

function loadGis() {
  const g = /** @type {any} */ (window).google;
  if (g?.accounts?.oauth2) return Promise.resolve();
  if (gisLoadPromise) return gisLoadPromise;
  gisLoadPromise = loadScript(GIS_SRC);
  return gisLoadPromise;
}

function loadGapi() {
  if (/** @type {any} */ (window).gapi) return Promise.resolve();
  if (gapiLoadPromise) return gapiLoadPromise;
  gapiLoadPromise = loadScript(GAPI_SRC);
  return gapiLoadPromise;
}

async function loadPicker() {
  await loadGapi();
  const gapi = /** @type {any} */ (window).gapi;
  if (/** @type {any} */ (window).google?.picker) return;
  if (pickerLoadPromise) return pickerLoadPromise;
  pickerLoadPromise = new Promise((resolve, reject) => {
    try {
      gapi.load('picker', { callback: () => resolve(), onerror: () => reject(new Error('Picker failed')) });
    } catch (err) {
      reject(err instanceof Error ? err : new Error('Picker failed'));
    }
  });
  return pickerLoadPromise;
}

function readCachedToken() {
  if (memoryToken && Date.now() < memoryTokenExp - 60_000) return memoryToken;
  try {
    const token = sessionStorage.getItem(TOKEN_KEY);
    const exp = Number(sessionStorage.getItem(TOKEN_EXP_KEY) || 0);
    if (token && Date.now() < exp - 60_000) {
      memoryToken = token;
      memoryTokenExp = exp;
      return token;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * @param {string} token
 * @param {number} [expiresInSec]
 */
function cacheToken(token, expiresInSec = 3600) {
  memoryToken = token;
  memoryTokenExp = Date.now() + expiresInSec * 1000;
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(TOKEN_EXP_KEY, String(memoryTokenExp));
  } catch {
    /* ignore */
  }
}

export function clearGoogleDriveToken() {
  memoryToken = null;
  memoryTokenExp = 0;
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_EXP_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * @param {{ prompt?: ''|'consent', clientId?: string }} [opts]
 * @returns {Promise<string>}
 */
export async function getAccessToken(opts = {}) {
  const cached = readCachedToken();
  if (cached && opts.prompt !== 'consent') return cached;

  const creds = await getDriveCredentials();
  const clientId = String(opts.clientId || creds.clientId || '').trim();
  if (!clientId) {
    throw new Error('Google Drive is not connected yet');
  }

  await loadGis();
  const google = /** @type {any} */ (window).google;
  if (!google?.accounts?.oauth2) {
    throw new Error('Google sign-in failed to load (check network / ad blockers)');
  }

  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (resp) => {
        if (resp.error) {
          reject(new Error(resp.error_description || resp.error || 'Google sign-in failed'));
          return;
        }
        if (!resp.access_token) {
          reject(new Error('No access token returned from Google'));
          return;
        }
        cacheToken(resp.access_token, Number(resp.expires_in) || 3600);
        resolve(resp.access_token);
      },
      error_callback: (err) => {
        reject(new Error(err?.message || 'Google sign-in cancelled'));
      },
    });
    client.requestAccessToken({ prompt: opts.prompt === 'consent' ? 'consent' : '' });
  });
}

/**
 * Open Google Picker to choose a destination folder.
 * @returns {Promise<{ id: string, name: string }|null>}
 */
export async function pickDriveFolder() {
  const creds = await getDriveCredentials();
  if (!creds.apiKey) throw new Error('Google Drive API key is missing');
  const token = await getAccessToken();
  await loadPicker();
  const google = /** @type {any} */ (window).google;

  return new Promise((resolve) => {
    const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)
      .setMimeTypes('application/vnd.google-apps.folder')
      .setParent('root');

    let builder = new google.picker.PickerBuilder()
      .addView(view)
      .enableFeature(google.picker.Feature.NAV_HIDDEN)
      .setOAuthToken(token)
      .setDeveloperKey(creds.apiKey)
      .setTitle('Choose a Google Drive folder for the backup')
      .setCallback((data) => {
        if (data.action === google.picker.Action.CANCEL) {
          resolve(null);
          return;
        }
        if (data.action !== google.picker.Action.PICKED) return;
        const doc = data.docs && data.docs[0];
        if (!doc?.id) {
          resolve(null);
          return;
        }
        resolve({ id: String(doc.id), name: String(doc.name || 'Folder') });
      });

    if (creds.appId) builder = builder.setAppId(creds.appId);
    const picker = builder.build();
    picker.setVisible(true);
  });
}

/**
 * Open Google Picker to choose a backup .zip / .json file.
 * @returns {Promise<{ id: string, name: string, mimeType?: string }|null>}
 */
export async function pickDriveBackupFile() {
  const creds = await getDriveCredentials();
  if (!creds.apiKey) throw new Error('Google Drive API key is missing');
  const token = await getAccessToken();
  await loadPicker();
  const google = /** @type {any} */ (window).google;

  return new Promise((resolve) => {
    const view = new google.picker.DocsView()
      .setIncludeFolders(true)
      .setMimeTypes(
        'application/zip,application/x-zip-compressed,application/json,text/json,application/octet-stream'
      );

    let builder = new google.picker.PickerBuilder()
      .addView(view)
      .addView(new google.picker.DocsView(google.picker.ViewId.DOCS))
      .setOAuthToken(token)
      .setDeveloperKey(creds.apiKey)
      .setTitle('Choose a PicoERP backup (.erp.zip or .erp.json)')
      .setCallback((data) => {
        if (data.action === google.picker.Action.CANCEL) {
          resolve(null);
          return;
        }
        if (data.action !== google.picker.Action.PICKED) return;
        const doc = data.docs && data.docs[0];
        if (!doc?.id) {
          resolve(null);
          return;
        }
        resolve({
          id: String(doc.id),
          name: String(doc.name || 'backup'),
          mimeType: doc.mimeType ? String(doc.mimeType) : undefined,
        });
      });

    if (creds.appId) builder = builder.setAppId(creds.appId);
    const picker = builder.build();
    picker.setVisible(true);
  });
}

/**
 * Upload a ZIP (or JSON) backup into an optional Drive folder.
 * @param {Blob} blob
 * @param {string} fileName
 * @param {string} [folderId]
 * @returns {Promise<{ id: string, name: string, webViewLink?: string }>}
 */
export async function uploadBackupFile(blob, fileName, folderId) {
  const token = await getAccessToken();
  /** @type {Record<string, unknown>} */
  const metadata = {
    name: fileName,
    mimeType: blob.type || 'application/zip',
  };
  if (folderId) metadata.parents = [folderId];

  const boundary = `picoerp_${Date.now()}`;
  const metaPart =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n`;
  const fileHeader =
    `--${boundary}\r\n` +
    `Content-Type: ${metadata.mimeType}\r\n\r\n`;
  const footer = `\r\n--${boundary}--`;

  const body = new Blob([metaPart, fileHeader, blob, footer], {
    type: `multipart/related; boundary=${boundary}`,
  });

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body,
    }
  );
  if (!res.ok) {
    const detail = await safeError(res);
    if (res.status === 401) clearGoogleDriveToken();
    throw new Error(detail || `Google Drive upload failed (${res.status})`);
  }
  return res.json();
}

/**
 * Download a Drive file as Blob.
 * @param {string} fileId
 */
export async function downloadDriveFile(fileId) {
  const token = await getAccessToken();
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    const detail = await safeError(res);
    if (res.status === 401) clearGoogleDriveToken();
    throw new Error(detail || `Could not download Drive file (${res.status})`);
  }
  return res.blob();
}

/**
 * @param {Response} res
 */
async function safeError(res) {
  try {
    const data = await res.json();
    return data?.error?.message || '';
  } catch {
    return '';
  }
}
