import { uuid } from '../core/uuid.js';
import { nowIso } from '../utils/date.js';
import { activityRepository } from '../repositories/index.js';

/**
 * @param {{ category: string, message: string }} entry
 */
export async function recordActivity(entry) {
  await activityRepository.put({
    id: uuid(),
    category: entry.category,
    message: entry.message,
    createdAt: nowIso(),
  });
}

export async function listActivity(limit = 100) {
  const rows = await activityRepository.getAll();
  rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return rows.slice(0, limit);
}

/**
 * @param {object} raw backup payload
 */
export function extractActivityLogFromBackup(raw) {
  const rows = raw?.stores?.activityLog;
  return Array.isArray(rows) ? rows : [];
}
