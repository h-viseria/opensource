/**
 * Catalogue / item-type master — defines attributes that feed inventory SKUs.
 *
 * Core attributes (always present on a type): Brand, Name, Type, Size.
 * Extra attributes (e.g. Colour) are optional per type, with free text or option lists.
 */

import { EVENTS } from '../core/constants.js';
import { emit } from '../core/eventBus.js';
import { uuid } from '../core/uuid.js';
import { nowIso } from '../utils/date.js';
import { catalogueTypeRepository } from '../repositories/catalogueTypeRepository.js';
import { auditLogRepository } from '../repositories/auditLogRepository.js';

/** Fixed core attribute keys used across the app. */
export const CORE_ATTRIBUTE_KEYS = Object.freeze(['brand', 'name', 'type', 'size']);

export const CORE_ATTRIBUTE_DEFS = Object.freeze([
  { key: 'brand', label: 'Brand', required: true },
  { key: 'name', label: 'Name', required: true },
  { key: 'type', label: 'Type', required: true },
  { key: 'size', label: 'Size', required: true },
]);

/**
 * Default shop catalogue types seeded for new books.
 */
export const DEFAULT_CATALOGUE_TYPES = Object.freeze([
  {
    name: 'General merchandise',
    code: 'GEN',
    extras: [{ key: 'colour', label: 'Colour', required: false, options: [] }],
  },
  {
    name: 'Stationery',
    code: 'STAT',
    extras: [
      { key: 'colour', label: 'Colour', required: false, options: ['Blue', 'Black', 'Red', 'Green'] },
    ],
  },
  {
    name: 'Apparel',
    code: 'APP',
    extras: [
      { key: 'colour', label: 'Colour', required: true, options: [] },
      { key: 'fit', label: 'Fit', required: false, options: ['Regular', 'Slim', 'Relaxed'] },
    ],
  },
  {
    name: 'Electronics accessory',
    code: 'ELEC',
    extras: [
      { key: 'colour', label: 'Colour', required: false, options: [] },
      { key: 'length', label: 'Length', required: false, options: [] },
    ],
  },
]);

/**
 * @param {string} bookId
 */
export async function listCatalogueTypes(bookId) {
  return catalogueTypeRepository.findByBook(bookId);
}

/** @param {string} id */
export async function getCatalogueType(id) {
  return catalogueTypeRepository.findById(id);
}

/**
 * Seed catalogue types when the book has none.
 * @param {string} bookId
 * @param {import('../data/bookTemplates.js').CatalogueTypeDef[]|null} [defs]
 *   Pass [] to skip seeding; omit/null to use built-in defaults.
 */
export async function ensureCatalogueTypes(bookId, defs) {
  const existing = await catalogueTypeRepository.findByBook(bookId);
  if (existing.length > 0) return { seeded: false, count: existing.length };

  const source =
    defs === undefined || defs === null ? DEFAULT_CATALOGUE_TYPES : defs;
  if (!source.length) return { seeded: false, count: 0 };

  const now = nowIso();
  const rows = source.map((def) => ({
    id: uuid(),
    bookId,
    name: def.name,
    code: def.code,
    notes: '',
    isActive: true,
    attributes: buildAttributeList([], def.extras || []),
    createdAt: now,
    updatedAt: now,
  }));
  await catalogueTypeRepository.saveMany(rows);
  return { seeded: true, count: rows.length };
}

/**
 * @param {string} bookId
 * @param {{
 *   name: string,
 *   code?: string,
 *   notes?: string,
 *   isActive?: boolean,
 *   coreOptions?: Record<string, string[]>,
 *   extras?: { key: string, label: string, required?: boolean, options?: string[] }[],
 * }} input
 */
export async function createCatalogueType(bookId, input) {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('Catalogue type name is required');
  const clash = await catalogueTypeRepository.findByBookAndName(bookId, name);
  if (clash) throw new Error(`Catalogue type “${name}” already exists`);

  const now = nowIso();
  const row = {
    id: uuid(),
    bookId,
    name,
    code: String(input.code || '').trim(),
    notes: String(input.notes || '').trim(),
    isActive: input.isActive !== false,
    attributes: buildAttributeList(input.coreOptions || {}, input.extras || []),
    createdAt: now,
    updatedAt: now,
  };
  await catalogueTypeRepository.create(row);
  await auditLogRepository.log({
    bookId,
    entity: 'CatalogueType',
    recordId: row.id,
    operation: 'Create',
    detail: { name },
  });
  emit(EVENTS.INVENTORY_CHANGED, { bookId, entity: 'CatalogueType', operation: 'Create' });
  return row;
}

/**
 * @param {string} id
 * @param {{
 *   name?: string,
 *   code?: string,
 *   notes?: string,
 *   isActive?: boolean,
 *   coreOptions?: Record<string, string[]>,
 *   extras?: { key: string, label: string, required?: boolean, options?: string[] }[],
 * }} patch
 */
export async function updateCatalogueType(id, patch) {
  const row = await catalogueTypeRepository.findById(id);
  if (!row) throw new Error('Catalogue type not found');

  if (patch.name !== undefined) {
    const name = String(patch.name).trim();
    if (!name) throw new Error('Catalogue type name is required');
    const clash = await catalogueTypeRepository.findByBookAndName(row.bookId, name);
    if (clash && clash.id !== id) throw new Error(`Catalogue type “${name}” already exists`);
    row.name = name;
  }
  if (patch.code !== undefined) row.code = String(patch.code).trim();
  if (patch.notes !== undefined) row.notes = String(patch.notes).trim();
  if (patch.isActive !== undefined) row.isActive = Boolean(patch.isActive);
  if (patch.coreOptions !== undefined || patch.extras !== undefined) {
    const currentExtras = (row.attributes || []).filter((a) => !CORE_ATTRIBUTE_KEYS.includes(a.key));
    row.attributes = buildAttributeList(
      patch.coreOptions || optionsFromAttrs(row.attributes, true),
      patch.extras !== undefined ? patch.extras : currentExtras
    );
  }
  row.updatedAt = nowIso();
  await catalogueTypeRepository.save(row);
  emit(EVENTS.INVENTORY_CHANGED, {
    bookId: row.bookId,
    entity: 'CatalogueType',
    operation: 'Update',
  });
  return row;
}

/** @param {string} id */
export async function deleteCatalogueType(id) {
  const row = await catalogueTypeRepository.findById(id);
  if (!row) throw new Error('Catalogue type not found');
  await catalogueTypeRepository.delete(id);
  await auditLogRepository.log({
    bookId: row.bookId,
    entity: 'CatalogueType',
    recordId: id,
    operation: 'Delete',
    detail: { name: row.name },
  });
  emit(EVENTS.INVENTORY_CHANGED, {
    bookId: row.bookId,
    entity: 'CatalogueType',
    operation: 'Delete',
  });
  return true;
}

/** @param {string} bookId */
export async function purgeCatalogueTypes(bookId) {
  return catalogueTypeRepository.deleteByBook(bookId);
}

/**
 * Build display SKU name from attribute map.
 * @param {Record<string, string>} attrs
 * @param {string} [fallback]
 */
export function buildSkuDisplayName(attrs, fallback = '') {
  const seen = new Set();
  /** @type {string[]} */
  const ordered = [];
  for (const key of CORE_ATTRIBUTE_KEYS) {
    const v = String(attrs?.[key] || '').trim();
    if (v && !seen.has(v.toLowerCase())) {
      seen.add(v.toLowerCase());
      ordered.push(v);
    }
  }
  for (const [key, raw] of Object.entries(attrs || {})) {
    if (CORE_ATTRIBUTE_KEYS.includes(key)) continue;
    const v = String(raw || '').trim();
    if (v && !seen.has(v.toLowerCase())) {
      seen.add(v.toLowerCase());
      ordered.push(v);
    }
  }
  return ordered.join(' · ') || String(fallback || '').trim();
}

/**
 * Validate attribute values against a catalogue type.
 * @param {any} catalogueType
 * @param {Record<string, string>} values
 */
export function validateAttributes(catalogueType, values) {
  /** @type {string[]} */
  const errors = [];
  const attrs = catalogueType?.attributes || defaultCoreAttributes();
  for (const def of attrs) {
    const v = String(values?.[def.key] || '').trim();
    if (def.required && !v) {
      errors.push(`${def.label} is required`);
      continue;
    }
    if (v && Array.isArray(def.options) && def.options.length > 0) {
      const ok = def.options.some((o) => String(o).toLowerCase() === v.toLowerCase());
      if (!ok) errors.push(`${def.label} must be one of: ${def.options.join(', ')}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Normalize attribute map to only known keys (trimmed).
 * @param {any} catalogueType
 * @param {Record<string, string>} values
 */
export function normalizeAttributes(catalogueType, values) {
  /** @type {Record<string, string>} */
  const out = {};
  const attrs = catalogueType?.attributes || defaultCoreAttributes();
  for (const def of attrs) {
    const v = String(values?.[def.key] || '').trim();
    if (v) out[def.key] = v;
  }
  return out;
}

/**
 * Search helper: match item against query using name + attributes.
 * @param {any} item
 * @param {string} query
 */
export function itemMatchesQuery(item, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  if (String(item.name || '').toLowerCase().includes(q)) return true;
  if (String(item.code || '').toLowerCase().includes(q)) return true;
  const attrs = item.attributes || {};
  return Object.values(attrs).some((v) => String(v).toLowerCase().includes(q));
}

/**
 * @param {Record<string, string[]>|object} coreOptions
 * @param {{ key: string, label: string, required?: boolean, options?: string[] }[]} extras
 */
function buildAttributeList(coreOptions, extras) {
  const core = CORE_ATTRIBUTE_DEFS.map((def) => ({
    key: def.key,
    label: def.label,
    required: def.required,
    options: normalizeOptions(coreOptions?.[def.key]),
  }));

  const extraRows = [];
  const used = new Set(CORE_ATTRIBUTE_KEYS);
  for (const raw of extras || []) {
    const key = slugAttrKey(raw.key || raw.label);
    if (!key || used.has(key)) continue;
    used.add(key);
    extraRows.push({
      key,
      label: String(raw.label || key).trim() || key,
      required: Boolean(raw.required),
      options: normalizeOptions(raw.options),
    });
  }
  return [...core, ...extraRows];
}

function defaultCoreAttributes() {
  return CORE_ATTRIBUTE_DEFS.map((def) => ({
    key: def.key,
    label: def.label,
    required: def.required,
    options: [],
  }));
}

/**
 * @param {any[]} attrs
 * @param {boolean} coreOnly
 */
function optionsFromAttrs(attrs, coreOnly) {
  /** @type {Record<string, string[]>} */
  const out = {};
  for (const a of attrs || []) {
    if (coreOnly && !CORE_ATTRIBUTE_KEYS.includes(a.key)) continue;
    out[a.key] = normalizeOptions(a.options);
  }
  return out;
}

/** @param {unknown} options */
function normalizeOptions(options) {
  if (!Array.isArray(options)) return [];
  const seen = new Set();
  /** @type {string[]} */
  const out = [];
  for (const o of options) {
    const v = String(o || '').trim();
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

/** @param {string} text */
function slugAttrKey(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
}
