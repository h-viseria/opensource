import { EVENTS, SETTINGS_KEYS, STORES } from '../core/constants.js';
import { emit } from '../core/eventBus.js';
import { uuid } from '../core/uuid.js';
import { nowIso } from '../utils/date.js';
import { DEFAULT_CATEGORY_TREE } from '../data/defaults.js';
import { categoryRepository } from '../repositories/index.js';
import { transactionRepository } from '../repositories/index.js';
import { recordAudit, AUDIT_ACTIONS } from './auditService.js';
import { markLocalDataChanged } from './settingsService.js';

/**
 * @param {Partial<{ name: string, parentId: string|null, kind: string, color: string, icon: string, sortOrder: number, active: boolean }>} input
 */
export async function createCategory(input) {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('Category name is required');
  const rec = {
    id: uuid(),
    name,
    parentId: input.parentId || null,
    kind: input.kind || 'expense',
    color: input.color || '#2F6F6A',
    icon: input.icon || 'folder',
    sortOrder: input.sortOrder ?? Date.now(),
    active: input.active !== false,
    archived: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await categoryRepository.put(rec);
  await recordAudit({ action: AUDIT_ACTIONS.CREATED, entity: STORES.CATEGORIES, entityId: rec.id, detail: name });
  await markLocalDataChanged();
  emit(EVENTS.MASTER_CHANGED, rec);
  return rec;
}

export async function updateCategory(id, patch) {
  const rec = await categoryRepository.getById(id);
  if (!rec) throw new Error('Category not found');
  const next = { ...rec, ...patch, id, updatedAt: nowIso() };
  if (patch.name != null) next.name = String(patch.name).trim();
  await categoryRepository.put(next);
  await recordAudit({ action: AUDIT_ACTIONS.MODIFIED, entity: STORES.CATEGORIES, entityId: id });
  await markLocalDataChanged();
  emit(EVENTS.MASTER_CHANGED, next);
  return next;
}

export async function archiveCategory(id) {
  return updateCategory(id, { archived: true, active: false });
}

export async function reorderCategories(ids) {
  const now = nowIso();
  let i = 0;
  for (const id of ids) {
    const rec = await categoryRepository.getById(id);
    if (rec) await categoryRepository.put({ ...rec, sortOrder: i++, updatedAt: now });
  }
  await markLocalDataChanged();
}

export async function listCategories({ includeArchived = false } = {}) {
  const all = await categoryRepository.getAll();
  const rows = includeArchived ? all : all.filter((c) => !c.archived);
  rows.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name));
  return rows;
}

export async function getCategoryTree() {
  const cats = await listCategories();
  const byParent = new Map();
  for (const c of cats) {
    const k = c.parentId || '';
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k).push(c);
  }
  const roots = byParent.get('') || [];
  return roots.map((r) => ({ ...r, children: byParent.get(r.id) || [] }));
}

export async function categoryInUse(id) {
  const txns = await transactionRepository.getAll();
  return txns.some((t) => !t.deletedAt && (t.categoryId === id || t.subcategoryId === id));
}

export async function seedDefaultCategories() {
  const existing = await categoryRepository.count();
  if (existing) return listCategories();
  const created = [];
  let order = 0;
  for (const group of DEFAULT_CATEGORY_TREE) {
    const parent = await createCategory({
      name: group.name,
      kind: group.kind || 'expense',
      color: group.color,
      icon: group.icon,
      sortOrder: order++,
    });
    created.push(parent);
    for (const child of group.children || []) {
      created.push(
        await createCategory({
          name: child,
          parentId: parent.id,
          kind: group.kind || 'expense',
          color: group.color,
          icon: group.icon,
          sortOrder: order++,
        })
      );
    }
  }
  return created;
}

export async function findCategoryByName(name) {
  const n = String(name || '').toLowerCase().trim();
  const cats = await listCategories({ includeArchived: true });
  return cats.find((c) => c.name.toLowerCase() === n) || null;
}

export { SETTINGS_KEYS };
