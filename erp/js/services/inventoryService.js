/**
 * Inventory application service.
 * Masters (units, categories, warehouses, items) + stock movements + WA valuation.
 */

import { EVENTS, INVENTORY_TXN_TYPES, STORES, VOUCHER_TYPES } from '../core/constants.js';
import { emit } from '../core/eventBus.js';
import { uuid } from '../core/uuid.js';
import { nowIso, toDateInput } from '../utils/date.js';
import { roundMoney } from '../utils/money.js';
import {
  INVENTORY_TYPE_LIST,
  computeStock,
  stockKey,
  validateNewPosting,
  roundQty,
} from '../engine/inventoryEngine.js';
import { DEFAULT_UNITS, DEFAULT_CATEGORIES, DEFAULT_WAREHOUSE } from '../data/inventoryDefaults.js';
import { unitRepository } from '../repositories/unitRepository.js';
import { itemCategoryRepository } from '../repositories/itemCategoryRepository.js';
import { warehouseRepository } from '../repositories/warehouseRepository.js';
import { itemRepository } from '../repositories/itemRepository.js';
import { inventoryTransactionRepository } from '../repositories/inventoryTransactionRepository.js';
import { ledgerRepository } from '../repositories/ledgerRepository.js';
import { ledgerGroupRepository } from '../repositories/ledgerGroupRepository.js';
import { auditLogRepository } from '../repositories/auditLogRepository.js';
import { ACCOUNT_NATURES, normalBalanceFor } from '../core/accountTypes.js';
import * as voucherService from './voucherService.js';
import * as bookService from './bookService.js';
import * as catalogueService from './catalogueService.js';

export { INVENTORY_TYPE_LIST, INVENTORY_TXN_TYPES };

const SYSTEM_LEDGER_NAMES = {
  STOCK: 'Stock',
  COGS: 'Cost of Goods Sold',
  STOCK_ADJ: 'Stock Adjustment',
};

/* ── Ensure / seed ─────────────────────────────────────── */

/**
 * Seed default units, categories, warehouse; ensure inventory ledgers exist.
 * @param {string} bookId
 * @param {{
 *   catalogueTypes?: import('../data/bookTemplates.js').CatalogueTypeDef[]|null,
 *   categories?: { name: string, code: string }[],
 *   units?: { name: string, code: string, symbol: string }[],
 * }} [opts]
 */
export async function ensureInventoryMasters(bookId, opts = {}) {
  await ensureInventoryLedgers(bookId);
  await catalogueService.ensureCatalogueTypes(bookId, opts.catalogueTypes);

  const unitDefs = opts.units?.length ? opts.units : DEFAULT_UNITS;
  const units = await unitRepository.findByBook(bookId);
  if (units.length === 0) {
    const now = nowIso();
    await unitRepository.saveMany(
      unitDefs.map((u) => ({
        id: uuid(),
        bookId,
        name: u.name,
        code: u.code,
        symbol: u.symbol,
        isSystem: true,
        createdAt: now,
        updatedAt: now,
      }))
    );
  }

  const catDefs = opts.categories?.length ? opts.categories : DEFAULT_CATEGORIES;
  const cats = await itemCategoryRepository.findByBook(bookId);
  if (cats.length === 0) {
    const now = nowIso();
    await itemCategoryRepository.saveMany(
      catDefs.map((c) => ({
        id: uuid(),
        bookId,
        name: c.name,
        code: c.code,
        parentId: null,
        isSystem: true,
        createdAt: now,
        updatedAt: now,
      }))
    );
  }

  const warehouses = await warehouseRepository.findByBook(bookId);
  if (warehouses.length === 0) {
    const now = nowIso();
    await warehouseRepository.create({
      id: uuid(),
      bookId,
      name: DEFAULT_WAREHOUSE.name,
      code: DEFAULT_WAREHOUSE.code,
      isDefault: true,
      isSystem: true,
      address: '',
      createdAt: now,
      updatedAt: now,
    });
  }

  return {
    units: await unitRepository.count('bookId', bookId),
    categories: await itemCategoryRepository.count('bookId', bookId),
    warehouses: await warehouseRepository.count('bookId', bookId),
    items: await itemRepository.countByBook(bookId),
  };
}

/**
 * Ensure Stock / COGS / Stock Adjustment ledgers exist (for books seeded before Phase 5).
 * @param {string} bookId
 */
export async function ensureInventoryLedgers(bookId) {
  const ledgers = await ledgerRepository.findByBook(bookId);
  const byName = new Map(ledgers.map((l) => [l.name.toLowerCase(), l]));
  const now = nowIso();
  const created = [];

  if (!byName.has(SYSTEM_LEDGER_NAMES.STOCK.toLowerCase())) {
    const inventoryGroup = await findOrCreateGroup(bookId, 'Inventory', ACCOUNT_NATURES.ASSET, '1400');
    const row = {
      id: uuid(),
      bookId,
      groupId: inventoryGroup.id,
      name: SYSTEM_LEDGER_NAMES.STOCK,
      code: '1401',
      nature: ACCOUNT_NATURES.ASSET,
      normalBalance: normalBalanceFor(ACCOUNT_NATURES.ASSET),
      openingBalance: 0,
      openingBalanceType: 'debit',
      isSystem: true,
      isActive: true,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    };
    await ledgerRepository.create(row);
    created.push(row.name);
  }

  const needExpense = [
    { name: SYSTEM_LEDGER_NAMES.COGS, code: '5801' },
    { name: SYSTEM_LEDGER_NAMES.STOCK_ADJ, code: '5802' },
  ];
  for (const need of needExpense) {
    if (byName.has(need.name.toLowerCase())) continue;
    const cosGroup = await findOrCreateGroup(bookId, 'Cost of Sales', ACCOUNT_NATURES.EXPENSE, '5800');
    const row = {
      id: uuid(),
      bookId,
      groupId: cosGroup.id,
      name: need.name,
      code: need.code,
      nature: ACCOUNT_NATURES.EXPENSE,
      normalBalance: normalBalanceFor(ACCOUNT_NATURES.EXPENSE),
      openingBalance: 0,
      openingBalanceType: 'debit',
      isSystem: true,
      isActive: true,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    };
    await ledgerRepository.create(row);
    created.push(row.name);
  }

  return created;
}

/**
 * @param {string} bookId
 * @param {string} name
 * @param {string} nature
 * @param {string} code
 */
async function findOrCreateGroup(bookId, name, nature, code) {
  const groups = await ledgerGroupRepository.findByBook(bookId);
  const existing = groups.find((g) => g.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing;

  const primary = groups.find((g) => g.isPrimary && g.nature === nature && !g.parentId);
  const now = nowIso();
  const group = {
    id: uuid(),
    bookId,
    name,
    code,
    nature,
    parentId: primary?.id ?? null,
    isPrimary: !primary,
    isSystem: true,
    sortOrder: groups.length,
    createdAt: now,
    updatedAt: now,
  };
  await ledgerGroupRepository.create(group);
  return group;
}

/**
 * @param {string} bookId
 * @param {string} name
 */
async function requireLedgerByName(bookId, name) {
  await ensureInventoryLedgers(bookId);
  const led = await ledgerRepository.findByBookAndName(bookId, name);
  if (!led) throw new Error(`Ledger "${name}" not found. Open Masters to refresh the chart.`);
  return led;
}

/* ── Units ─────────────────────────────────────────────── */

/** @param {string} bookId */
export async function listUnits(bookId) {
  return unitRepository.findByBook(bookId);
}

/**
 * @param {string} bookId
 * @param {{ name: string, code?: string, symbol?: string }} input
 */
export async function createUnit(bookId, input) {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('Unit name is required');
  const clash = await unitRepository.findByBookAndName(bookId, name);
  if (clash) throw new Error(`Unit "${name}" already exists`);
  const now = nowIso();
  const row = {
    id: uuid(),
    bookId,
    name,
    code: String(input.code || '').trim(),
    symbol: String(input.symbol || '').trim(),
    isSystem: false,
    createdAt: now,
    updatedAt: now,
  };
  await unitRepository.create(row);
  emit(EVENTS.INVENTORY_CHANGED, { bookId, entity: 'Unit', operation: 'Create' });
  return row;
}

/**
 * @param {string} id
 * @param {{ name?: string, code?: string, symbol?: string }} patch
 */
export async function updateUnit(id, patch) {
  const row = await unitRepository.findById(id);
  if (!row) throw new Error('Unit not found');
  if (patch.name !== undefined) {
    const name = String(patch.name).trim();
    if (!name) throw new Error('Unit name is required');
    const clash = await unitRepository.findByBookAndName(row.bookId, name);
    if (clash && clash.id !== id) throw new Error(`Unit "${name}" already exists`);
    row.name = name;
  }
  if (patch.code !== undefined) row.code = String(patch.code).trim();
  if (patch.symbol !== undefined) row.symbol = String(patch.symbol).trim();
  row.updatedAt = nowIso();
  await unitRepository.save(row);
  emit(EVENTS.INVENTORY_CHANGED, { bookId: row.bookId, entity: 'Unit', operation: 'Update' });
  return row;
}

/** @param {string} id */
export async function deleteUnit(id) {
  const row = await unitRepository.findById(id);
  if (!row) throw new Error('Unit not found');
  if (row.isSystem) throw new Error('System units cannot be deleted');
  const items = await itemRepository.findByBook(row.bookId);
  if (items.some((i) => i.unitId === id)) {
    throw new Error('Unit is used by one or more items');
  }
  await unitRepository.delete(id);
  emit(EVENTS.INVENTORY_CHANGED, { bookId: row.bookId, entity: 'Unit', operation: 'Delete' });
}

/* ── Categories ────────────────────────────────────────── */

/** @param {string} bookId */
export async function listCategories(bookId) {
  return itemCategoryRepository.findByBook(bookId);
}

/**
 * @param {string} bookId
 * @param {{ name: string, code?: string }} input
 */
export async function createCategory(bookId, input) {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('Category name is required');
  const clash = await itemCategoryRepository.findByBookAndName(bookId, name);
  if (clash) throw new Error(`Category "${name}" already exists`);
  const now = nowIso();
  const row = {
    id: uuid(),
    bookId,
    name,
    code: String(input.code || '').trim(),
    parentId: null,
    isSystem: false,
    createdAt: now,
    updatedAt: now,
  };
  await itemCategoryRepository.create(row);
  emit(EVENTS.INVENTORY_CHANGED, { bookId, entity: 'Category', operation: 'Create' });
  return row;
}

/**
 * @param {string} id
 * @param {{ name?: string, code?: string }} patch
 */
export async function updateCategory(id, patch) {
  const row = await itemCategoryRepository.findById(id);
  if (!row) throw new Error('Category not found');
  if (patch.name !== undefined) {
    const name = String(patch.name).trim();
    if (!name) throw new Error('Category name is required');
    const clash = await itemCategoryRepository.findByBookAndName(row.bookId, name);
    if (clash && clash.id !== id) throw new Error(`Category "${name}" already exists`);
    row.name = name;
  }
  if (patch.code !== undefined) row.code = String(patch.code).trim();
  row.updatedAt = nowIso();
  await itemCategoryRepository.save(row);
  emit(EVENTS.INVENTORY_CHANGED, { bookId: row.bookId, entity: 'Category', operation: 'Update' });
  return row;
}

/** @param {string} id */
export async function deleteCategory(id) {
  const row = await itemCategoryRepository.findById(id);
  if (!row) throw new Error('Category not found');
  if (row.isSystem) throw new Error('System categories cannot be deleted');
  const items = await itemRepository.findByCategory(id);
  if (items.length) throw new Error('Category is used by one or more items');
  await itemCategoryRepository.delete(id);
  emit(EVENTS.INVENTORY_CHANGED, { bookId: row.bookId, entity: 'Category', operation: 'Delete' });
}

/* ── Warehouses ────────────────────────────────────────── */

/** @param {string} bookId */
export async function listWarehouses(bookId) {
  return warehouseRepository.findByBook(bookId);
}

/**
 * @param {string} bookId
 * @param {{ name: string, code?: string, address?: string, isDefault?: boolean }} input
 */
export async function createWarehouse(bookId, input) {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('Warehouse name is required');
  const now = nowIso();
  const makeDefault = Boolean(input.isDefault);
  if (makeDefault) await clearDefaultWarehouses(bookId);

  const existing = await warehouseRepository.findByBook(bookId);
  const row = {
    id: uuid(),
    bookId,
    name,
    code: String(input.code || '').trim(),
    address: String(input.address || '').trim(),
    isDefault: makeDefault || existing.length === 0,
    isSystem: false,
    createdAt: now,
    updatedAt: now,
  };
  await warehouseRepository.create(row);
  emit(EVENTS.INVENTORY_CHANGED, { bookId, entity: 'Warehouse', operation: 'Create' });
  return row;
}

/**
 * @param {string} id
 * @param {{ name?: string, code?: string, address?: string, isDefault?: boolean }} patch
 */
export async function updateWarehouse(id, patch) {
  const row = await warehouseRepository.findById(id);
  if (!row) throw new Error('Warehouse not found');
  if (patch.name !== undefined) {
    const name = String(patch.name).trim();
    if (!name) throw new Error('Warehouse name is required');
    row.name = name;
  }
  if (patch.code !== undefined) row.code = String(patch.code).trim();
  if (patch.address !== undefined) row.address = String(patch.address).trim();
  if (patch.isDefault === true) {
    await clearDefaultWarehouses(row.bookId);
    row.isDefault = true;
  }
  row.updatedAt = nowIso();
  await warehouseRepository.save(row);
  emit(EVENTS.INVENTORY_CHANGED, { bookId: row.bookId, entity: 'Warehouse', operation: 'Update' });
  return row;
}

/** @param {string} id */
export async function deleteWarehouse(id) {
  const row = await warehouseRepository.findById(id);
  if (!row) throw new Error('Warehouse not found');
  if (row.isSystem) throw new Error('System warehouse cannot be deleted');
  const txns = await inventoryTransactionRepository.findByBook(row.bookId);
  if (txns.some((t) => t.warehouseId === id || t.toWarehouseId === id)) {
    throw new Error('Warehouse has stock movements and cannot be deleted');
  }
  const all = await warehouseRepository.findByBook(row.bookId);
  if (all.length <= 1) throw new Error('At least one warehouse is required');
  await warehouseRepository.delete(id);
  if (row.isDefault) {
    const next = (await warehouseRepository.findByBook(row.bookId))[0];
    if (next) {
      next.isDefault = true;
      next.updatedAt = nowIso();
      await warehouseRepository.save(next);
    }
  }
  emit(EVENTS.INVENTORY_CHANGED, { bookId: row.bookId, entity: 'Warehouse', operation: 'Delete' });
}

/** @param {string} bookId */
async function clearDefaultWarehouses(bookId) {
  const rows = await warehouseRepository.findByBook(bookId);
  for (const w of rows) {
    if (!w.isDefault) continue;
    w.isDefault = false;
    w.updatedAt = nowIso();
    await warehouseRepository.save(w);
  }
}

/* ── Items ─────────────────────────────────────────────── */

/** @param {string} bookId */
export async function listItems(bookId) {
  return itemRepository.findByBook(bookId);
}

/**
 * @param {string} bookId
 * @param {{
 *   name?: string,
 *   code?: string,
 *   categoryId?: string|null,
 *   catalogueTypeId?: string|null,
 *   attributes?: Record<string, string>,
 *   unitId: string,
 *   reorderLevel?: number,
 *   purchaseRate?: number,
 *   saleRate?: number,
 *   notes?: string,
 * }} input
 */
export async function createItem(bookId, input) {
  if (!input.unitId) throw new Error('Unit is required');
  const unit = await unitRepository.findById(input.unitId);
  if (!unit || unit.bookId !== bookId) throw new Error('Invalid unit');

  let catalogueType = null;
  /** @type {Record<string, string>} */
  let attributes = {};
  let name = String(input.name || '').trim();

  if (input.catalogueTypeId) {
    catalogueType = await catalogueService.getCatalogueType(input.catalogueTypeId);
    if (!catalogueType || catalogueType.bookId !== bookId) {
      throw new Error('Catalogue type not found');
    }
    attributes = catalogueService.normalizeAttributes(catalogueType, input.attributes || {});
    const check = catalogueService.validateAttributes(catalogueType, attributes);
    if (!check.ok) throw new Error(check.errors.join('; '));
    name = catalogueService.buildSkuDisplayName(attributes, name);
  }

  if (!name) throw new Error('Item name is required (or fill Brand / Name / Type / Size)');
  const clash = await itemRepository.findByBookAndName(bookId, name);
  if (clash) throw new Error(`Item "${name}" already exists`);

  const now = nowIso();
  const row = {
    id: uuid(),
    bookId,
    name,
    code: String(input.code || '').trim(),
    categoryId: input.categoryId || null,
    catalogueTypeId: catalogueType?.id || null,
    attributes,
    unitId: input.unitId,
    reorderLevel: Number(input.reorderLevel) || 0,
    purchaseRate: roundMoney(input.purchaseRate || 0),
    saleRate: roundMoney(input.saleRate || 0),
    isActive: true,
    notes: String(input.notes || '').trim(),
    createdAt: now,
    updatedAt: now,
  };
  await itemRepository.create(row);
  await auditLogRepository.log({
    bookId,
    entity: 'InventoryItem',
    recordId: row.id,
    operation: 'Create',
    detail: { name, catalogueTypeId: row.catalogueTypeId },
  });
  emit(EVENTS.INVENTORY_CHANGED, { bookId, entity: 'Item', operation: 'Create' });
  return row;
}

/**
 * @param {string} id
 * @param {Partial<import('../models/types.js').InventoryItem> & { attributes?: Record<string, string> }} patch
 */
export async function updateItem(id, patch) {
  const row = await itemRepository.findById(id);
  if (!row) throw new Error('Item not found');

  if (patch.catalogueTypeId !== undefined || patch.attributes !== undefined) {
    const typeId =
      patch.catalogueTypeId !== undefined ? patch.catalogueTypeId || null : row.catalogueTypeId;
    if (typeId) {
      const catalogueType = await catalogueService.getCatalogueType(typeId);
      if (!catalogueType || catalogueType.bookId !== row.bookId) {
        throw new Error('Catalogue type not found');
      }
      const rawAttrs =
        patch.attributes !== undefined ? patch.attributes : row.attributes || {};
      const attributes = catalogueService.normalizeAttributes(catalogueType, rawAttrs);
      const check = catalogueService.validateAttributes(catalogueType, attributes);
      if (!check.ok) throw new Error(check.errors.join('; '));
      row.catalogueTypeId = catalogueType.id;
      row.attributes = attributes;
      if (patch.name === undefined) {
        row.name = catalogueService.buildSkuDisplayName(attributes, row.name);
      }
    } else {
      row.catalogueTypeId = null;
      row.attributes = {};
    }
  }

  if (patch.name !== undefined) {
    const name = String(patch.name).trim();
    if (!name) throw new Error('Item name is required');
    const clash = await itemRepository.findByBookAndName(row.bookId, name);
    if (clash && clash.id !== id) throw new Error(`Item "${name}" already exists`);
    row.name = name;
  } else if (row.catalogueTypeId && row.attributes) {
    row.name = catalogueService.buildSkuDisplayName(row.attributes, row.name);
  }

  if (patch.code !== undefined) row.code = String(patch.code).trim();
  if (patch.categoryId !== undefined) row.categoryId = patch.categoryId || null;
  if (patch.unitId !== undefined) {
    const unit = await unitRepository.findById(patch.unitId);
    if (!unit || unit.bookId !== row.bookId) throw new Error('Invalid unit');
    row.unitId = patch.unitId;
  }
  if (patch.reorderLevel !== undefined) row.reorderLevel = Number(patch.reorderLevel) || 0;
  if (patch.purchaseRate !== undefined) row.purchaseRate = roundMoney(patch.purchaseRate);
  if (patch.saleRate !== undefined) row.saleRate = roundMoney(patch.saleRate);
  if (patch.isActive !== undefined) row.isActive = Boolean(patch.isActive);
  if (patch.notes !== undefined) row.notes = String(patch.notes).trim();
  row.updatedAt = nowIso();
  await itemRepository.save(row);
  emit(EVENTS.INVENTORY_CHANGED, { bookId: row.bookId, entity: 'Item', operation: 'Update' });
  return row;
}

/** @param {string} id */
export async function deleteItem(id) {
  const row = await itemRepository.findById(id);
  if (!row) throw new Error('Item not found');
  const txns = await inventoryTransactionRepository.findByItem(id);
  if (txns.length) throw new Error('Item has stock movements and cannot be deleted');
  await itemRepository.delete(id);
  emit(EVENTS.INVENTORY_CHANGED, { bookId: row.bookId, entity: 'Item', operation: 'Delete' });
}

/* ── Movements ─────────────────────────────────────────── */

/**
 * @param {string} bookId
 * @param {{ itemId?: string, type?: string, fromDate?: string, toDate?: string, limit?: number }} [filters]
 */
export async function listMovements(bookId, filters = {}) {
  let rows = await inventoryTransactionRepository.findByBook(bookId);
  if (filters.itemId) rows = rows.filter((t) => t.itemId === filters.itemId);
  if (filters.type) rows = rows.filter((t) => t.type === filters.type);
  if (filters.fromDate) rows = rows.filter((t) => t.date >= filters.fromDate);
  if (filters.toDate) rows = rows.filter((t) => t.date <= filters.toDate);
  rows = [...rows].reverse();
  if (filters.limit && filters.limit > 0) rows = rows.slice(0, filters.limit);
  return rows;
}

/**
 * Post a stock movement. Optionally creates a linked accounting voucher.
 * @param {{
 *   bookId: string,
 *   financialYearId?: string,
 *   type: string,
 *   date: string,
 *   itemId: string,
 *   warehouseId: string,
 *   quantity: number,
 *   rate?: number,
 *   value?: number,
 *   adjustmentSign?: 1|-1,
 *   toWarehouseId?: string|null,
 *   narration?: string,
 *   postAccounting?: boolean,
 *   counterLedgerId?: string,
 * }} input
 */
export async function postMovement(input) {
  const bookId = input.bookId;
  await ensureInventoryMasters(bookId);

  const item = await itemRepository.findById(input.itemId);
  if (!item || item.bookId !== bookId) throw new Error('Item not found');
  if (!item.isActive) throw new Error('Item is inactive');

  const warehouse = await warehouseRepository.findById(input.warehouseId);
  if (!warehouse || warehouse.bookId !== bookId) throw new Error('Warehouse not found');

  if (input.toWarehouseId) {
    const toWh = await warehouseRepository.findById(input.toWarehouseId);
    if (!toWh || toWh.bookId !== bookId) throw new Error('Destination warehouse not found');
  }

  const existing = await inventoryTransactionRepository.findByBook(bookId);
  const validation = validateNewPosting(existing, {
    type: input.type,
    itemId: input.itemId,
    warehouseId: input.warehouseId,
    quantity: input.quantity,
    rate: input.rate,
    value: input.value,
    adjustmentSign: input.adjustmentSign,
    toWarehouseId: input.toWarehouseId,
    date: input.date || toDateInput(new Date()),
  });
  if (!validation.ok) {
    throw new Error(validation.errors.join('; '));
  }

  const now = nowIso();
  const date = String(input.date || '').trim() || toDateInput(new Date());
  const qty = validation.quantity;
  const type = input.type;

  let rate = roundMoney(validation.rate || 0);
  let value = roundMoney(validation.value || 0);

  // Outflows use WA cost from validation
  if (
    type === INVENTORY_TXN_TYPES.SALE ||
    type === INVENTORY_TXN_TYPES.PURCHASE_RETURN ||
    type === INVENTORY_TXN_TYPES.TRANSFER ||
    (type === INVENTORY_TXN_TYPES.ADJUSTMENT && (input.adjustmentSign ?? 1) < 0)
  ) {
    rate = roundMoney(validation.costRate || 0);
    value = roundMoney(validation.costValue || 0);
  } else if (type === INVENTORY_TXN_TYPES.SALES_RETURN) {
    // Restock at the provided cost (usually original sale COGS rate)
    rate = roundMoney(validation.rate || 0);
    value = roundMoney(validation.value || qty * rate);
  }

  /** @type {import('../models/types.js').InventoryTransaction} */
  const txn = {
    id: uuid(),
    bookId,
    date,
    itemId: input.itemId,
    warehouseId: input.warehouseId,
    type: /** @type {any} */ (type),
    quantity: qty,
    rate,
    value,
    adjustmentSign:
      type === INVENTORY_TXN_TYPES.ADJUSTMENT ? (input.adjustmentSign === -1 ? -1 : 1) : undefined,
    toWarehouseId: type === INVENTORY_TXN_TYPES.TRANSFER ? input.toWarehouseId || null : null,
    voucherId: null,
    narration: String(input.narration || '').trim(),
    createdAt: now,
    updatedAt: now,
  };

  let voucher = null;
  if (input.postAccounting !== false) {
    voucher = await maybeCreateStockVoucher({
      bookId,
      financialYearId: input.financialYearId,
      txn,
      counterLedgerId: input.counterLedgerId,
      itemName: item.name,
    });
    if (voucher) txn.voucherId = voucher.id;
  }

  await inventoryTransactionRepository.create(txn);
  await auditLogRepository.log({
    bookId,
    entity: 'InventoryTransaction',
    recordId: txn.id,
    operation: 'Create',
    detail: { type: txn.type, itemId: txn.itemId, quantity: txn.quantity, value: txn.value },
  });
  emit(EVENTS.INVENTORY_CHANGED, { bookId, entity: 'Movement', operation: 'Create', id: txn.id });
  return { transaction: txn, voucher };
}

/**
 * @param {{
 *   bookId: string,
 *   financialYearId?: string,
 *   txn: import('../models/types.js').InventoryTransaction,
 *   counterLedgerId?: string,
 *   itemName: string,
 * }} opts
 */
async function maybeCreateStockVoucher(opts) {
  const { bookId, txn, itemName } = opts;
  const session = await bookService.getSessionContext();
  const financialYearId = opts.financialYearId || session.financialYear?.id;
  if (!financialYearId) return null;

  const stock = await requireLedgerByName(bookId, SYSTEM_LEDGER_NAMES.STOCK);
  const cogs = await requireLedgerByName(bookId, SYSTEM_LEDGER_NAMES.COGS);
  const adj = await requireLedgerByName(bookId, SYSTEM_LEDGER_NAMES.STOCK_ADJ);
  const value = roundMoney(txn.value);
  if (value <= 0 && txn.type !== INVENTORY_TXN_TYPES.TRANSFER) {
    // Zero-value adjustment — skip voucher
    if (txn.type === INVENTORY_TXN_TYPES.ADJUSTMENT) return null;
  }

  const narration = txn.narration || `${txn.type} — ${itemName}`;

  /** @type {{ ledgerId: string, debit: number, credit: number }[] | null} */
  let lines = null;
  let voucherType = VOUCHER_TYPES.JOURNAL;

  if (
    txn.type === INVENTORY_TXN_TYPES.OPENING ||
    txn.type === INVENTORY_TXN_TYPES.PURCHASE
  ) {
    if (value <= 0) return null;
    const counterId = opts.counterLedgerId;
    if (!counterId) {
      // Opening without counter: skip auto voucher; user can post manually
      if (txn.type === INVENTORY_TXN_TYPES.OPENING) return null;
      throw new Error('Select a counter ledger (Cash / Bank / Payable) for purchase accounting');
    }
    if (counterId === stock.id) throw new Error('Counter ledger cannot be Stock');
    lines = [
      { ledgerId: stock.id, debit: value, credit: 0 },
      { ledgerId: counterId, debit: 0, credit: value },
    ];
    voucherType =
      txn.type === INVENTORY_TXN_TYPES.PURCHASE ? VOUCHER_TYPES.PURCHASE : VOUCHER_TYPES.OPENING;
  } else if (txn.type === INVENTORY_TXN_TYPES.SALES_RETURN) {
    if (value <= 0) return null;
    // Reverse COGS: Dr Stock Cr COGS
    lines = [
      { ledgerId: stock.id, debit: value, credit: 0 },
      { ledgerId: cogs.id, debit: 0, credit: value },
    ];
    voucherType = VOUCHER_TYPES.JOURNAL;
  } else if (
    txn.type === INVENTORY_TXN_TYPES.SALE ||
    txn.type === INVENTORY_TXN_TYPES.PURCHASE_RETURN
  ) {
    if (value <= 0) return null;
    if (txn.type === INVENTORY_TXN_TYPES.PURCHASE_RETURN) {
      const counterId = opts.counterLedgerId;
      if (!counterId) {
        throw new Error('Select a counter ledger (Cash / Bank / Payable) for purchase return accounting');
      }
      if (counterId === stock.id) throw new Error('Counter ledger cannot be Stock');
      lines = [
        { ledgerId: counterId, debit: value, credit: 0 },
        { ledgerId: stock.id, debit: 0, credit: value },
      ];
      voucherType = VOUCHER_TYPES.DEBIT_NOTE;
    } else {
      // Perpetual inventory: Dr COGS Cr Stock (sales revenue is a separate voucher)
      lines = [
        { ledgerId: cogs.id, debit: value, credit: 0 },
        { ledgerId: stock.id, debit: 0, credit: value },
      ];
      voucherType = VOUCHER_TYPES.JOURNAL;
    }
  } else if (txn.type === INVENTORY_TXN_TYPES.ADJUSTMENT) {
    if (value <= 0) return null;
    const sign = txn.adjustmentSign === -1 ? -1 : 1;
    if (sign > 0) {
      lines = [
        { ledgerId: stock.id, debit: value, credit: 0 },
        { ledgerId: adj.id, debit: 0, credit: value },
      ];
    } else {
      lines = [
        { ledgerId: adj.id, debit: value, credit: 0 },
        { ledgerId: stock.id, debit: 0, credit: value },
      ];
    }
  } else if (txn.type === INVENTORY_TXN_TYPES.TRANSFER) {
    return null; // no P&L / BS impact
  }

  if (!lines) return null;

  const result = await voucherService.createVoucher({
    bookId,
    financialYearId,
    voucherType,
    date: txn.date,
    narration,
    lines,
  });
  return result.voucher;
}

/** @param {string} id */
export async function deleteMovement(id) {
  const txn = await inventoryTransactionRepository.findById(id);
  if (!txn) throw new Error('Movement not found');

  // Only allow deleting the chronologically last movement for that item to keep WA sane
  const all = await inventoryTransactionRepository.findByItem(txn.itemId);
  const last = all[all.length - 1];
  if (last?.id !== id) {
    throw new Error('Only the latest movement for an item can be deleted');
  }

  if (txn.voucherId) {
    try {
      await voucherService.deleteVoucher(txn.voucherId);
    } catch {
      // Voucher may already be gone
    }
  }

  await inventoryTransactionRepository.delete(id);
  await auditLogRepository.log({
    bookId: txn.bookId,
    entity: 'InventoryTransaction',
    recordId: id,
    operation: 'Delete',
    detail: { type: txn.type, itemId: txn.itemId },
  });
  emit(EVENTS.INVENTORY_CHANGED, { bookId: txn.bookId, entity: 'Movement', operation: 'Delete' });
}

/* ── Stock reports ─────────────────────────────────────── */

/**
 * @param {string} bookId
 * @param {{ asOfDate?: string, warehouseId?: string }} [opts]
 */
export async function getStockSummary(bookId, opts = {}) {
  await ensureInventoryMasters(bookId);
  const [items, units, categories, warehouses, txns] = await Promise.all([
    itemRepository.findByBook(bookId),
    unitRepository.findByBook(bookId),
    itemCategoryRepository.findByBook(bookId),
    warehouseRepository.findByBook(bookId),
    inventoryTransactionRepository.findByBook(bookId),
  ]);

  const unitById = new Map(units.map((u) => [u.id, u]));
  const catById = new Map(categories.map((c) => [c.id, c]));
  const whById = new Map(warehouses.map((w) => [w.id, w]));

  const { buckets, byItem } = computeStock(txns, { asOfDate: opts.asOfDate });

  /** @type {any[]} */
  const rows = [];
  let totalValue = 0;
  let lowStockCount = 0;

  for (const item of items) {
    if (opts.warehouseId) {
      const key = stockKey(item.id, opts.warehouseId);
      const bucket = buckets.get(key) || { quantity: 0, value: 0, avgRate: 0 };
      const qty = roundQty(bucket.quantity);
      const value = roundMoney(bucket.value);
      totalValue = roundMoney(totalValue + value);
      const low = qty > 0 && qty <= (item.reorderLevel || 0);
      if (low || (item.reorderLevel > 0 && qty <= item.reorderLevel)) lowStockCount += 1;
      rows.push({
        item,
        unit: unitById.get(item.unitId),
        category: item.categoryId ? catById.get(item.categoryId) : null,
        warehouse: whById.get(opts.warehouseId),
        quantity: qty,
        avgRate: bucket.avgRate,
        value,
        lowStock: item.reorderLevel > 0 && qty <= item.reorderLevel,
      });
    } else {
      const bucket = byItem.get(item.id) || { quantity: 0, value: 0, avgRate: 0 };
      const qty = roundQty(bucket.quantity);
      const value = roundMoney(bucket.value);
      totalValue = roundMoney(totalValue + value);
      if (item.reorderLevel > 0 && qty <= item.reorderLevel) lowStockCount += 1;

      /** @type {any[]} */
      const warehousesBreakdown = [];
      for (const wh of warehouses) {
        const b = buckets.get(stockKey(item.id, wh.id));
        if (!b || b.quantity <= 0) continue;
        warehousesBreakdown.push({
          warehouse: wh,
          quantity: roundQty(b.quantity),
          avgRate: b.avgRate,
          value: roundMoney(b.value),
        });
      }

      rows.push({
        item,
        unit: unitById.get(item.unitId),
        category: item.categoryId ? catById.get(item.categoryId) : null,
        quantity: qty,
        avgRate: bucket.avgRate,
        value,
        lowStock: item.reorderLevel > 0 && qty <= item.reorderLevel,
        warehouses: warehousesBreakdown,
      });
    }
  }

  return {
    asOfDate: opts.asOfDate || toDateInput(new Date()),
    rows,
    totals: {
      items: items.length,
      withStock: rows.filter((r) => r.quantity > 0).length,
      totalValue,
      lowStockCount,
    },
    warehouses,
  };
}

/**
 * Hub stats for inventory home.
 * @param {string} bookId
 */
export async function getInventoryHubStats(bookId) {
  await ensureInventoryMasters(bookId);
  const summary = await getStockSummary(bookId);
  const movementCount = await inventoryTransactionRepository.countByBook(bookId);
  return {
    items: summary.totals.items,
    withStock: summary.totals.withStock,
    totalValue: summary.totals.totalValue,
    lowStockCount: summary.totals.lowStockCount,
    units: await unitRepository.count('bookId', bookId),
    categories: await itemCategoryRepository.count('bookId', bookId),
    catalogueTypes: (await catalogueService.listCatalogueTypes(bookId)).length,
    warehouses: await warehouseRepository.count('bookId', bookId),
    movements: movementCount,
  };
}

/**
 * Counter ledger options for purchase / opening accounting.
 * @param {string} bookId
 */
export async function listCounterLedgers(bookId) {
  const ledgers = await ledgerRepository.findByBook(bookId);
  return ledgers.filter(
    (l) =>
      l.isActive &&
      l.name !== SYSTEM_LEDGER_NAMES.STOCK &&
      (l.nature === ACCOUNT_NATURES.ASSET || l.nature === ACCOUNT_NATURES.LIABILITY || l.nature === ACCOUNT_NATURES.EQUITY)
  );
}

/** @param {string} bookId */
export async function purgeInventory(bookId) {
  await inventoryTransactionRepository.deleteByBook(bookId);
  await itemRepository.deleteByBook(bookId);
  await warehouseRepository.deleteByBook(bookId);
  await itemCategoryRepository.deleteByBook(bookId);
  await unitRepository.deleteByBook(bookId);
  await catalogueService.purgeCatalogueTypes(bookId);
}
