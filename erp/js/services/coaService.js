/**
 * Chart of Accounts application service.
 * Groups + ledgers, template seeding, tree assembly.
 */

import { EVENTS } from '../core/constants.js';
import { emit } from '../core/eventBus.js';
import { uuid } from '../core/uuid.js';
import { nowIso } from '../utils/date.js';
import {
  ACCOUNT_NATURES,
  NATURE_ORDER,
  normalBalanceFor,
} from '../core/accountTypes.js';
import { DEFAULT_COA_TEMPLATE } from '../data/coaTemplate.js';
import { getBookTemplate, DEFAULT_BOOK_TEMPLATE_ID } from '../data/bookTemplates.js';
import { ledgerGroupRepository } from '../repositories/ledgerGroupRepository.js';
import { ledgerRepository } from '../repositories/ledgerRepository.js';
import { auditLogRepository } from '../repositories/auditLogRepository.js';
import { BaseRepository } from '../repositories/baseRepository.js';
import { STORES } from '../core/constants.js';

const voucherLineRepo = new BaseRepository(STORES.VOUCHER_LINES);

/**
 * Seed default COA for a book if empty.
 * @param {string} bookId
 * @param {{ force?: boolean, templateId?: string }} [opts]
 */
export async function ensureChartOfAccounts(bookId, opts = {}) {
  const existing = await ledgerGroupRepository.findByBook(bookId);
  if (existing.length > 0 && !opts.force) {
    return { seeded: false, groups: existing.length, ledgers: await ledgerRepository.countByBook(bookId) };
  }

  if (opts.force && existing.length > 0) {
    throw new Error('Chart of accounts already exists. Delete groups first or create a new book.');
  }

  return seedDefaultChartOfAccounts(bookId, opts.templateId);
}

/**
 * @param {string} bookId
 * @param {string} [templateId]
 */
export async function seedDefaultChartOfAccounts(bookId, templateId = DEFAULT_BOOK_TEMPLATE_ID) {
  const template = getBookTemplate(templateId);
  const chart = template.coa?.length ? template.coa : DEFAULT_COA_TEMPLATE;
  const now = nowIso();
  /** @type {import('../models/types.js').LedgerGroup[]} */
  const groups = [];
  /** @type {import('../models/types.js').Ledger[]} */
  const ledgers = [];

  let rootOrder = 0;
  for (const root of chart) {
    const rootId = uuid();
    groups.push({
      id: rootId,
      bookId,
      name: root.name,
      code: root.code,
      nature: root.nature,
      parentId: null,
      isPrimary: true,
      isSystem: true,
      sortOrder: rootOrder++,
      createdAt: now,
      updatedAt: now,
    });

    let childOrder = 0;
    for (const child of root.children) {
      const childId = uuid();
      groups.push({
        id: childId,
        bookId,
        name: child.name,
        code: child.code || '',
        nature: root.nature,
        parentId: rootId,
        isPrimary: false,
        isSystem: true,
        sortOrder: childOrder++,
        createdAt: now,
        updatedAt: now,
      });

      let ledgerOrder = 0;
      for (const ledgerName of child.ledgers || []) {
        ledgers.push({
          id: uuid(),
          bookId,
          groupId: childId,
          name: ledgerName,
          code: '',
          nature: root.nature,
          normalBalance: normalBalanceFor(root.nature),
          openingBalance: 0,
          openingBalanceType: normalBalanceFor(root.nature),
          isSystem: true,
          isActive: true,
          notes: '',
          sortOrder: ledgerOrder++,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  await ledgerGroupRepository.saveMany(groups);
  await ledgerRepository.saveMany(ledgers);
  await auditLogRepository.log({
    bookId,
    entity: 'ChartOfAccounts',
    recordId: bookId,
    operation: 'Create',
    detail: {
      groups: groups.length,
      ledgers: ledgers.length,
      source: 'book-template',
      templateId: template.id,
      templateName: template.name,
    },
  });

  emit(EVENTS.COA_CHANGED, { bookId });
  return {
    seeded: true,
    groups: groups.length,
    ledgers: ledgers.length,
    templateId: template.id,
  };
}

/**
 * Remove all groups and ledgers for a book (used on book delete).
 * @param {string} bookId
 */
export async function purgeChartOfAccounts(bookId) {
  const ledgers = await ledgerRepository.deleteByBook(bookId);
  const groups = await ledgerGroupRepository.deleteByBook(bookId);
  return { groups, ledgers };
}

/**
 * Hierarchical tree for UI.
 * @param {string} bookId
 */
export async function getChartTree(bookId) {
  const [groups, ledgers] = await Promise.all([
    ledgerGroupRepository.findByBook(bookId),
    ledgerRepository.findByBook(bookId),
  ]);

  const ledgersByGroup = new Map();
  for (const led of ledgers) {
    if (!ledgersByGroup.has(led.groupId)) ledgersByGroup.set(led.groupId, []);
    ledgersByGroup.get(led.groupId).push(led);
  }

  const childrenByParent = new Map();
  for (const g of groups) {
    const key = g.parentId || '__root__';
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key).push(g);
  }

  function buildNodes(parentKey) {
    const list = childrenByParent.get(parentKey) || [];
    return list.map((g) => ({
      type: 'group',
      group: g,
      children: buildNodes(g.id),
      ledgers: ledgersByGroup.get(g.id) || [],
    }));
  }

  const roots = buildNodes('__root__');
  roots.sort((a, b) => {
    const ia = NATURE_ORDER.indexOf(a.group.nature);
    const ib = NATURE_ORDER.indexOf(b.group.nature);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  return {
    roots,
    stats: {
      groups: groups.length,
      ledgers: ledgers.length,
      byNature: countByNature(groups.filter((g) => g.isPrimary), ledgers),
    },
  };
}

function countByNature(primaryGroups, ledgers) {
  /** @type {Record<string, { groups: number, ledgers: number }>} */
  const out = {};
  for (const n of NATURE_ORDER) {
    out[n] = { groups: 0, ledgers: 0 };
  }
  for (const g of primaryGroups) {
    if (!out[g.nature]) out[g.nature] = { groups: 0, ledgers: 0 };
    out[g.nature].groups += 1;
  }
  for (const l of ledgers) {
    if (!out[l.nature]) out[l.nature] = { groups: 0, ledgers: 0 };
    out[l.nature].ledgers += 1;
  }
  return out;
}

// ── Groups CRUD ──────────────────────────────────────────

/**
 * @param {string} bookId
 */
export async function listGroups(bookId) {
  return ledgerGroupRepository.findByBook(bookId);
}

/**
 * @param {string} id
 */
export async function getGroup(id) {
  return ledgerGroupRepository.findById(id);
}

/**
 * @param {{ bookId: string, name: string, code?: string, nature: string, parentId?: string|null, sortOrder?: number }} input
 */
export async function createGroup(input) {
  const bookId = input.bookId;
  const name = String(input.name || '').trim();
  if (!name) throw new Error('Group name is required');
  if (!Object.values(ACCOUNT_NATURES).includes(input.nature)) {
    throw new Error('Invalid account nature');
  }

  const clash = await ledgerGroupRepository.findByBookAndName(bookId, name);
  if (clash) throw new Error(`Group "${name}" already exists`);

  let nature = input.nature;
  let parentId = input.parentId || null;

  if (parentId) {
    const parent = await ledgerGroupRepository.findById(parentId);
    if (!parent || parent.bookId !== bookId) throw new Error('Parent group not found');
    nature = parent.nature;
  }

  const now = nowIso();
  /** @type {import('../models/types.js').LedgerGroup} */
  const group = {
    id: uuid(),
    bookId,
    name,
    code: String(input.code || '').trim(),
    nature,
    parentId,
    isPrimary: !parentId,
    isSystem: false,
    sortOrder: input.sortOrder ?? 100,
    createdAt: now,
    updatedAt: now,
  };

  await ledgerGroupRepository.create(group);
  await auditLogRepository.log({
    bookId,
    entity: 'LedgerGroup',
    recordId: group.id,
    operation: 'Create',
    detail: { name },
  });
  emit(EVENTS.COA_CHANGED, { bookId });
  return group;
}

/**
 * @param {string} id
 * @param {Partial<import('../models/types.js').LedgerGroup>} patch
 */
export async function updateGroup(id, patch) {
  const group = await ledgerGroupRepository.findById(id);
  if (!group) throw new Error('Group not found');

  if (group.isSystem && patch.name !== undefined && patch.name !== group.name) {
    // Allow rename of system groups for flexibility, but keep nature locked
  }

  if (patch.name !== undefined) {
    const name = String(patch.name).trim();
    if (!name) throw new Error('Group name is required');
    const clash = await ledgerGroupRepository.findByBookAndName(group.bookId, name);
    if (clash && clash.id !== id) throw new Error(`Group "${name}" already exists`);
    group.name = name;
  }

  if (patch.code !== undefined) group.code = String(patch.code || '').trim();

  if (patch.parentId !== undefined && patch.parentId !== group.parentId) {
    if (group.isSystem && group.isPrimary) {
      throw new Error('Cannot re-parent a primary system group');
    }
    const newParentId = patch.parentId || null;
    if (newParentId === id) throw new Error('Group cannot be its own parent');
    if (newParentId) {
      const parent = await ledgerGroupRepository.findById(newParentId);
      if (!parent || parent.bookId !== group.bookId) throw new Error('Parent group not found');
      if (await isDescendant(group.bookId, id, newParentId)) {
        throw new Error('Cannot move a group under its own descendant');
      }
      group.parentId = newParentId;
      group.nature = parent.nature;
      group.isPrimary = false;
    } else {
      group.parentId = null;
      group.isPrimary = true;
    }
  }

  if (patch.nature !== undefined && group.isPrimary && !group.parentId) {
    if (group.isSystem) throw new Error('Cannot change nature of a system primary group');
    if (!Object.values(ACCOUNT_NATURES).includes(patch.nature)) {
      throw new Error('Invalid account nature');
    }
    group.nature = patch.nature;
  }

  if (patch.sortOrder !== undefined) group.sortOrder = Number(patch.sortOrder) || 0;

  group.updatedAt = nowIso();
  await ledgerGroupRepository.save(group);
  await auditLogRepository.log({
    bookId: group.bookId,
    entity: 'LedgerGroup',
    recordId: id,
    operation: 'Update',
    detail: patch,
  });
  emit(EVENTS.COA_CHANGED, { bookId: group.bookId });
  return group;
}

/**
 * @param {string} id
 */
export async function deleteGroup(id) {
  const group = await ledgerGroupRepository.findById(id);
  if (!group) throw new Error('Group not found');
  if (group.isSystem) throw new Error('System groups cannot be deleted');

  const children = await ledgerGroupRepository.findByParent(id);
  if (children.length > 0) {
    throw new Error('Remove sub-groups first');
  }

  const ledgers = await ledgerRepository.findByGroup(id);
  if (ledgers.length > 0) {
    throw new Error('Remove ledgers in this group first');
  }

  await ledgerGroupRepository.delete(id);
  await auditLogRepository.log({
    bookId: group.bookId,
    entity: 'LedgerGroup',
    recordId: id,
    operation: 'Delete',
    detail: { name: group.name },
  });
  emit(EVENTS.COA_CHANGED, { bookId: group.bookId });
}

/**
 * Check if candidateId is under ancestorId in the tree.
 */
async function isDescendant(bookId, ancestorId, candidateId) {
  const groups = await ledgerGroupRepository.findByBook(bookId);
  const byId = new Map(groups.map((g) => [g.id, g]));
  let current = byId.get(candidateId);
  while (current) {
    if (current.id === ancestorId) return true;
    if (!current.parentId) break;
    current = byId.get(current.parentId);
  }
  return false;
}

// ── Ledgers CRUD ─────────────────────────────────────────

/**
 * @param {string} bookId
 */
export async function listLedgers(bookId) {
  return ledgerRepository.findByBook(bookId);
}

/**
 * @param {string} id
 */
export async function getLedger(id) {
  return ledgerRepository.findById(id);
}

/**
 * @param {{
 *   bookId: string,
 *   groupId: string,
 *   name: string,
 *   code?: string,
 *   openingBalance?: number,
 *   openingBalanceType?: 'debit'|'credit',
 *   notes?: string
 * }} input
 */
export async function createLedger(input) {
  const bookId = input.bookId;
  const name = String(input.name || '').trim();
  if (!name) throw new Error('Ledger name is required');

  const group = await ledgerGroupRepository.findById(input.groupId);
  if (!group || group.bookId !== bookId) throw new Error('Ledger group not found');

  // Prefer leaf groups: warn only — allow ledger on any group for flexibility
  const clash = await ledgerRepository.findByBookAndName(bookId, name);
  if (clash) throw new Error(`Ledger "${name}" already exists`);

  const now = nowIso();
  const normal = normalBalanceFor(group.nature);
  const opening = Number(input.openingBalance) || 0;
  const openingType = input.openingBalanceType === 'credit' || input.openingBalanceType === 'debit'
    ? input.openingBalanceType
    : normal;

  /** @type {import('../models/types.js').Ledger} */
  const ledger = {
    id: uuid(),
    bookId,
    groupId: group.id,
    name,
    code: String(input.code || '').trim(),
    nature: group.nature,
    normalBalance: normal,
    openingBalance: opening,
    openingBalanceType: openingType,
    isSystem: false,
    isActive: true,
    notes: String(input.notes || '').trim(),
    sortOrder: 100,
    createdAt: now,
    updatedAt: now,
  };

  await ledgerRepository.create(ledger);
  await auditLogRepository.log({
    bookId,
    entity: 'Ledger',
    recordId: ledger.id,
    operation: 'Create',
    detail: { name, groupId: group.id },
  });
  emit(EVENTS.COA_CHANGED, { bookId });
  return ledger;
}

/**
 * @param {string} id
 * @param {Partial<import('../models/types.js').Ledger>} patch
 */
export async function updateLedger(id, patch) {
  const ledger = await ledgerRepository.findById(id);
  if (!ledger) throw new Error('Ledger not found');

  if (patch.name !== undefined) {
    const name = String(patch.name).trim();
    if (!name) throw new Error('Ledger name is required');
    const clash = await ledgerRepository.findByBookAndName(ledger.bookId, name);
    if (clash && clash.id !== id) throw new Error(`Ledger "${name}" already exists`);
    ledger.name = name;
  }

  if (patch.code !== undefined) ledger.code = String(patch.code || '').trim();
  if (patch.notes !== undefined) ledger.notes = String(patch.notes || '').trim();
  if (patch.isActive !== undefined) ledger.isActive = Boolean(patch.isActive);

  if (patch.openingBalance !== undefined) {
    ledger.openingBalance = Number(patch.openingBalance) || 0;
  }
  if (patch.openingBalanceType === 'debit' || patch.openingBalanceType === 'credit') {
    ledger.openingBalanceType = patch.openingBalanceType;
  }

  if (patch.groupId !== undefined && patch.groupId !== ledger.groupId) {
    const group = await ledgerGroupRepository.findById(patch.groupId);
    if (!group || group.bookId !== ledger.bookId) throw new Error('Ledger group not found');
    ledger.groupId = group.id;
    ledger.nature = group.nature;
    ledger.normalBalance = normalBalanceFor(group.nature);
  }

  ledger.updatedAt = nowIso();
  await ledgerRepository.save(ledger);
  await auditLogRepository.log({
    bookId: ledger.bookId,
    entity: 'Ledger',
    recordId: id,
    operation: 'Update',
    detail: patch,
  });
  emit(EVENTS.COA_CHANGED, { bookId: ledger.bookId });
  return ledger;
}

/**
 * @param {string} id
 */
export async function deleteLedger(id) {
  const ledger = await ledgerRepository.findById(id);
  if (!ledger) throw new Error('Ledger not found');
  if (ledger.isSystem) throw new Error('System ledgers cannot be deleted');

  const lines = await voucherLineRepo.findByIndex('ledgerId', id);
  if (lines.length > 0) {
    throw new Error('Ledger has voucher postings and cannot be deleted');
  }

  await ledgerRepository.delete(id);
  await auditLogRepository.log({
    bookId: ledger.bookId,
    entity: 'Ledger',
    recordId: id,
    operation: 'Delete',
    detail: { name: ledger.name },
  });
  emit(EVENTS.COA_CHANGED, { bookId: ledger.bookId });
}

/**
 * Flat options for selects: "Assets > Cash" etc.
 * @param {string} bookId
 */
export async function listGroupOptions(bookId) {
  const groups = await ledgerGroupRepository.findByBook(bookId);
  const byId = new Map(groups.map((g) => [g.id, g]));

  function path(g) {
    const parts = [g.name];
    let cur = g;
    while (cur.parentId) {
      const p = byId.get(cur.parentId);
      if (!p) break;
      parts.unshift(p.name);
      cur = p;
    }
    return parts.join(' › ');
  }

  return groups
    .map((g) => ({
      id: g.id,
      name: g.name,
      nature: g.nature,
      label: path(g),
      isPrimary: g.isPrimary,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Colon-separated full account path for each ledger (Group:Sub:Ledger).
 * Prefers a GNUCash path tag in notes when present.
 * @param {import('../models/types.js').Ledger[]} ledgers
 * @param {import('../models/types.js').LedgerGroup[]} groups
 * @returns {Map<string, string>}
 */
export function buildLedgerPathMap(ledgers, groups) {
  const groupById = new Map(groups.map((g) => [g.id, g]));

  /**
   * @param {import('../models/types.js').LedgerGroup} group
   */
  function groupColonPath(group) {
    const tagged = gnucashPathFromNotes(group.notes || '');
    if (tagged && !tagged.startsWith('__')) return tagged;
    const parts = [];
    /** @type {import('../models/types.js').LedgerGroup|undefined} */
    let cur = group;
    while (cur) {
      parts.unshift(cur.name);
      cur = cur.parentId ? groupById.get(cur.parentId) : undefined;
    }
    return parts.join(':');
  }

  /** @type {Map<string, string>} */
  const map = new Map();
  for (const led of ledgers) {
    const tagged = gnucashPathFromNotes(led.notes || '');
    if (tagged) {
      map.set(led.id, tagged);
      continue;
    }
    const g = groupById.get(led.groupId);
    const gp = g ? groupColonPath(g) : '';
    map.set(led.id, gp ? `${gp}:${led.name}` : led.name);
  }
  return map;
}

/**
 * @param {string} notes
 */
function gnucashPathFromNotes(notes) {
  const m = String(notes || '').match(/(?:^|\n)gnucash:([^\n\r]+)/);
  if (!m) return '';
  const val = m[1].trim();
  if (/^(type|placeholder|txn):/i.test(val)) return '';
  return val;
}
