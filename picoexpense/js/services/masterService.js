import { EVENTS, STORES } from '../core/constants.js';
import { emit } from '../core/eventBus.js';
import { uuid } from '../core/uuid.js';
import { nowIso } from '../utils/date.js';
import { normalizeMerchantName } from '../data/defaults.js';
import { merchantRepository, tagRepository, personRepository, ruleRepository } from '../repositories/index.js';
import { recordAudit, AUDIT_ACTIONS } from './auditService.js';
import { markLocalDataChanged } from './settingsService.js';

export async function listMerchants() {
  const rows = await merchantRepository.getAll();
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveMerchant(input) {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('Merchant name is required');
  const rec = {
    id: input.id || uuid(),
    name,
    normalizedName: normalizeMerchantName(name),
    defaultCategoryId: input.defaultCategoryId || null,
    defaultSubcategoryId: input.defaultSubcategoryId || null,
    notes: String(input.notes || ''),
    createdAt: input.createdAt || nowIso(),
    updatedAt: nowIso(),
  };
  await merchantRepository.put(rec);
  await markLocalDataChanged();
  emit(EVENTS.MASTER_CHANGED, rec);
  return rec;
}

export async function findMerchantByName(name) {
  const n = normalizeMerchantName(name);
  if (!n) return null;
  const all = await merchantRepository.getAll();
  return all.find((m) => m.normalizedName === n) || all.find((m) => n.includes(m.normalizedName) || m.normalizedName.includes(n)) || null;
}

export async function getOrCreateMerchant(name) {
  const existing = await findMerchantByName(name);
  if (existing) return existing;
  return saveMerchant({ name });
}

export async function listTags() {
  return (await tagRepository.getAll()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveTag(input) {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('Tag name is required');
  const rec = {
    id: input.id || uuid(),
    name,
    createdAt: input.createdAt || nowIso(),
    updatedAt: nowIso(),
  };
  await tagRepository.put(rec);
  await markLocalDataChanged();
  return rec;
}

export async function listPeople() {
  return (await personRepository.getAll()).filter((p) => p.active !== false);
}

export async function savePerson(input) {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('Name is required');
  const rec = {
    id: input.id || uuid(),
    name,
    relationship: input.relationship || 'other',
    active: input.active !== false,
    createdAt: input.createdAt || nowIso(),
    updatedAt: nowIso(),
  };
  await personRepository.put(rec);
  await markLocalDataChanged();
  return rec;
}

export async function listRules() {
  const rows = await ruleRepository.getAll();
  return rows.sort((a, b) => (b.priority || 0) - (a.priority || 0));
}

export async function saveRule(input) {
  const rec = {
    id: input.id || uuid(),
    pattern: String(input.pattern || '').trim().toLowerCase(),
    merchant: String(input.merchant || ''),
    categoryId: input.categoryId || null,
    subcategoryId: input.subcategoryId || null,
    priority: Number(input.priority) || 0,
    createdAt: input.createdAt || nowIso(),
    updatedAt: nowIso(),
  };
  if (!rec.pattern) throw new Error('Rule pattern is required');
  await ruleRepository.put(rec);
  await recordAudit({ action: AUDIT_ACTIONS.CREATED, entity: STORES.RULES, entityId: rec.id });
  await markLocalDataChanged();
  return rec;
}

export async function deleteRule(id) {
  await ruleRepository.remove(id);
  await markLocalDataChanged();
}

/**
 * Local rules engine — no remote AI.
 * @param {{ merchantName?: string, description?: string }} input
 */
export async function suggestCategory(input) {
  const hay = `${input.merchantName || ''} ${input.description || ''}`.toLowerCase();
  const rules = await listRules();
  for (const r of rules) {
    if (r.pattern && hay.includes(r.pattern)) {
      return { categoryId: r.categoryId, subcategoryId: r.subcategoryId, ruleId: r.id };
    }
  }
  if (input.merchantName) {
    const m = await findMerchantByName(input.merchantName);
    if (m?.defaultCategoryId) {
      return { categoryId: m.defaultSubcategoryId || m.defaultCategoryId, subcategoryId: m.defaultSubcategoryId, merchantId: m.id };
    }
  }
  return null;
}

export { STORES };
