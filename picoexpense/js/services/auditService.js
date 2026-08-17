import { AUDIT_ACTIONS, STORES } from '../core/constants.js';
import { uuid } from '../core/uuid.js';
import { nowIso } from '../utils/date.js';
import { auditRepository } from '../repositories/index.js';
import { withTransaction } from '../repositories/storeRepository.js';

/**
 * @param {{ action: string, entity: string, entityId?: string, detail?: string }} entry
 */
export async function recordAudit(entry) {
  await auditRepository.put({
    id: uuid(),
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId || null,
    detail: entry.detail || '',
    createdAt: nowIso(),
  });
}

export async function listAudit(limit = 200) {
  const all = await auditRepository.getAll();
  all.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return all.slice(0, limit);
}

export async function listAuditForEntity(entityId) {
  const all = await auditRepository.getAllByIndex('entityId', entityId);
  all.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return all;
}

export async function clearAudit() {
  await auditRepository.clear();
}

export { AUDIT_ACTIONS, STORES, withTransaction };
