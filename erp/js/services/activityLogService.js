/**
 * Rolling user-facing activity log (last N entries).
 * Stored in settings and embedded in full backup zip payloads for Drive compare.
 */

import { SETTINGS_KEYS } from '../core/constants.js';
import { uuid } from '../core/uuid.js';
import { nowIso } from '../utils/date.js';
import { settingsRepository } from '../repositories/settingsRepository.js';

export const ACTIVITY_LOG_MAX = 10;

/**
 * @typedef {{
 *   id: string,
 *   at: string,
 *   message: string,
 *   category: string,
 *   bookName?: string,
 * }} ActivityLogEntry
 */

/**
 * @returns {Promise<ActivityLogEntry[]>}
 */
export async function getActivityLog() {
  const raw = await settingsRepository.getValue(SETTINGS_KEYS.ACTIVITY_LOG);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e) => e && typeof e === 'object' && e.message)
    .map((e) => ({
      id: String(e.id || uuid()),
      at: String(e.at || ''),
      message: String(e.message),
      category: String(e.category || 'Activity'),
      bookName: e.bookName ? String(e.bookName) : undefined,
    }))
    .slice(0, ACTIVITY_LOG_MAX);
}

/**
 * Append a user-friendly activity line (newest first, max 10).
 * @param {{ message: string, category?: string, bookName?: string, at?: string }} input
 */
export async function recordActivity(input) {
  const message = String(input.message || '').trim();
  if (!message) return null;

  const entry = {
    id: uuid(),
    at: input.at || nowIso(),
    message,
    category: String(input.category || 'Activity').trim() || 'Activity',
    bookName: input.bookName ? String(input.bookName).trim() : undefined,
  };

  const prev = await getActivityLog();
  const next = [entry, ...prev].slice(0, ACTIVITY_LOG_MAX);
  await settingsRepository.setValue(SETTINGS_KEYS.ACTIVITY_LOG, next);
  return entry;
}

/**
 * Replace the entire log (e.g. after restore alignment).
 * @param {ActivityLogEntry[]} entries
 */
export async function replaceActivityLog(entries) {
  const next = (Array.isArray(entries) ? entries : [])
    .filter((e) => e && e.message)
    .slice(0, ACTIVITY_LOG_MAX)
    .map((e) => ({
      id: String(e.id || uuid()),
      at: String(e.at || nowIso()),
      message: String(e.message),
      category: String(e.category || 'Activity'),
      bookName: e.bookName ? String(e.bookName) : undefined,
    }));
  await settingsRepository.setValue(SETTINGS_KEYS.ACTIVITY_LOG, next);
  return next;
}

/**
 * Pull activity log from a parsed backup payload.
 * @param {any} payload
 * @returns {ActivityLogEntry[]}
 */
export function extractActivityLogFromBackup(payload) {
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload.activityLog)) {
    return normalizeList(payload.activityLog);
  }
  const settings = payload.stores?.settings;
  if (Array.isArray(settings)) {
    const row = settings.find((s) => s && s.key === SETTINGS_KEYS.ACTIVITY_LOG);
    if (Array.isArray(row?.value)) return normalizeList(row.value);
  }
  return [];
}

/**
 * @param {unknown[]} raw
 * @returns {ActivityLogEntry[]}
 */
function normalizeList(raw) {
  return raw
    .filter((e) => e && typeof e === 'object' && /** @type {any} */ (e).message)
    .map((e) => {
      const row = /** @type {any} */ (e);
      return {
        id: String(row.id || uuid()),
        at: String(row.at || ''),
        message: String(row.message),
        category: String(row.category || 'Activity'),
        bookName: row.bookName ? String(row.bookName) : undefined,
      };
    })
    .slice(0, ACTIVITY_LOG_MAX);
}

/**
 * Compare local vs Drive logs for a friendly side-by-side view.
 * @param {ActivityLogEntry[]} local
 * @param {ActivityLogEntry[]} remote
 */
export function compareActivityLogs(local, remote) {
  const localList = Array.isArray(local) ? local : [];
  const remoteList = Array.isArray(remote) ? remote : [];
  const remoteById = new Map(remoteList.map((e) => [e.id, e]));
  const localById = new Map(localList.map((e) => [e.id, e]));

  /** @type {{ kind: 'both'|'local-only'|'drive-only', local?: ActivityLogEntry, remote?: ActivityLogEntry }[]} */
  const rows = [];

  for (const entry of localList) {
    const match = remoteById.get(entry.id);
    if (match) rows.push({ kind: 'both', local: entry, remote: match });
    else rows.push({ kind: 'local-only', local: entry });
  }
  for (const entry of remoteList) {
    if (!localById.has(entry.id)) rows.push({ kind: 'drive-only', remote: entry });
  }

  const sortAt = (a, b) => {
    const aAt = a.local?.at || a.remote?.at || '';
    const bAt = b.local?.at || b.remote?.at || '';
    return String(bAt).localeCompare(String(aAt));
  };
  rows.sort(sortAt);

  return {
    rows,
    summary: {
      localCount: localList.length,
      driveCount: remoteList.length,
      onlyLocal: rows.filter((r) => r.kind === 'local-only').length,
      onlyDrive: rows.filter((r) => r.kind === 'drive-only').length,
      shared: rows.filter((r) => r.kind === 'both').length,
    },
  };
}
