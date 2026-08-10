/**
 * Inventory engine — weighted-average valuation (spec §10 Phase 1).
 * Stock is never stored; always computed from inventory transactions.
 */

import { INVENTORY_TXN_TYPES } from '../core/constants.js';
import { roundMoney } from '../utils/money.js';

export { INVENTORY_TXN_TYPES };

export const INVENTORY_TYPE_LIST = Object.freeze([
  INVENTORY_TXN_TYPES.OPENING,
  INVENTORY_TXN_TYPES.PURCHASE,
  INVENTORY_TXN_TYPES.SALE,
  INVENTORY_TXN_TYPES.SALES_RETURN,
  INVENTORY_TXN_TYPES.PURCHASE_RETURN,
  INVENTORY_TXN_TYPES.ADJUSTMENT,
  INVENTORY_TXN_TYPES.TRANSFER,
]);

/**
 * @param {string} type
 */
export function isKnownInventoryType(type) {
  return INVENTORY_TYPE_LIST.includes(type);
}

/**
 * @param {string} itemId
 * @param {string} warehouseId
 */
export function stockKey(itemId, warehouseId) {
  return `${itemId}::${warehouseId}`;
}

/**
 * @typedef {{ quantity: number, value: number, avgRate: number }} StockBucket
 */

/**
 * @returns {StockBucket}
 */
function emptyBucket() {
  return { quantity: 0, value: 0, avgRate: 0 };
}

/**
 * @param {StockBucket} bucket
 * @param {number} qty
 * @param {number} value
 */
function addIn(bucket, qty, value) {
  const q = Number(qty) || 0;
  const v = roundMoney(value);
  if (q <= 0) return;
  bucket.quantity = roundQty(bucket.quantity + q);
  bucket.value = roundMoney(bucket.value + v);
  bucket.avgRate = bucket.quantity > 0 ? roundMoney(bucket.value / bucket.quantity) : 0;
}

/**
 * @param {StockBucket} bucket
 * @param {number} qty Absolute quantity to remove
 * @returns {{ qty: number, value: number, rate: number }}
 */
function takeOut(bucket, qty) {
  const q = Math.min(Number(qty) || 0, bucket.quantity);
  if (q <= 0) return { qty: 0, value: 0, rate: bucket.avgRate };
  const rate = bucket.avgRate;
  const value = roundMoney(q * rate);
  bucket.quantity = roundQty(bucket.quantity - q);
  bucket.value = roundMoney(bucket.value - value);
  if (bucket.quantity <= 0.000001) {
    bucket.quantity = 0;
    bucket.value = 0;
    bucket.avgRate = 0;
  } else {
    bucket.avgRate = roundMoney(bucket.value / bucket.quantity);
  }
  return { qty: q, value, rate };
}

/**
 * @param {number} n
 */
export function roundQty(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round((x + Number.EPSILON) * 10000) / 10000;
}

/**
 * Apply one transaction to warehouse buckets (mutates map).
 * @param {Map<string, StockBucket>} buckets
 * @param {import('../models/types.js').InventoryTransaction} txn
 * @returns {{ ok: boolean, error?: string, costValue?: number, costRate?: number }}
 */
export function applyTransaction(buckets, txn) {
  const type = txn.type;
  const qty = roundQty(txn.quantity);
  const key = stockKey(txn.itemId, txn.warehouseId);

  if (!buckets.has(key)) buckets.set(key, emptyBucket());
  const bucket = /** @type {StockBucket} */ (buckets.get(key));

  if (
    type === INVENTORY_TXN_TYPES.OPENING ||
    type === INVENTORY_TXN_TYPES.PURCHASE ||
    type === INVENTORY_TXN_TYPES.SALES_RETURN
  ) {
    const rate = roundMoney(txn.rate);
    const value = roundMoney(txn.value != null ? txn.value : qty * rate);
    addIn(bucket, qty, value);
    return { ok: true, costValue: value, costRate: rate };
  }

  if (type === INVENTORY_TXN_TYPES.SALE || type === INVENTORY_TXN_TYPES.PURCHASE_RETURN) {
    if (qty > bucket.quantity + 0.0001) {
      return {
        ok: false,
        error: `Insufficient stock (available ${bucket.quantity}, need ${qty})`,
      };
    }
    const out = takeOut(bucket, qty);
    return { ok: true, costValue: out.value, costRate: out.rate };
  }

  if (type === INVENTORY_TXN_TYPES.ADJUSTMENT) {
    const sign = txn.adjustmentSign === -1 ? -1 : 1;
    if (sign > 0) {
      const rate = roundMoney(txn.rate || bucket.avgRate || 0);
      const value = roundMoney(txn.value != null ? txn.value : qty * rate);
      addIn(bucket, qty, value);
      return { ok: true, costValue: value, costRate: rate };
    }
    if (qty > bucket.quantity + 0.0001) {
      return {
        ok: false,
        error: `Insufficient stock for adjustment (available ${bucket.quantity})`,
      };
    }
    const out = takeOut(bucket, qty);
    return { ok: true, costValue: out.value, costRate: out.rate };
  }

  if (type === INVENTORY_TXN_TYPES.TRANSFER) {
    const toId = txn.toWarehouseId;
    if (!toId) return { ok: false, error: 'Transfer requires destination warehouse' };
    if (toId === txn.warehouseId) {
      return { ok: false, error: 'Source and destination warehouse must differ' };
    }
    if (qty > bucket.quantity + 0.0001) {
      return {
        ok: false,
        error: `Insufficient stock to transfer (available ${bucket.quantity})`,
      };
    }
    const out = takeOut(bucket, qty);
    const toKey = stockKey(txn.itemId, toId);
    if (!buckets.has(toKey)) buckets.set(toKey, emptyBucket());
    addIn(/** @type {StockBucket} */ (buckets.get(toKey)), out.qty, out.value);
    return { ok: true, costValue: out.value, costRate: out.rate };
  }

  return { ok: false, error: `Unknown inventory type: ${type}` };
}

/**
 * Replay all transactions chronologically into stock buckets.
 * @param {import('../models/types.js').InventoryTransaction[]} transactions
 * @param {{ asOfDate?: string, itemId?: string }} [opts]
 * @returns {{ buckets: Map<string, StockBucket>, byItem: Map<string, StockBucket> }}
 */
export function computeStock(transactions, opts = {}) {
  const sorted = [...transactions].sort((a, b) => {
    const d = String(a.date).localeCompare(String(b.date));
    if (d !== 0) return d;
    return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  });

  /** @type {Map<string, StockBucket>} */
  const buckets = new Map();

  for (const txn of sorted) {
    if (opts.asOfDate && txn.date > opts.asOfDate) continue;
    if (opts.itemId && txn.itemId !== opts.itemId) continue;
    const result = applyTransaction(buckets, txn);
    if (!result.ok) {
      // Historical data should already be valid; skip corrupt rows safely
      console.warn('[inventoryEngine]', result.error, txn.id);
    }
  }

  /** @type {Map<string, StockBucket>} */
  const byItem = new Map();
  for (const [key, bucket] of buckets) {
    const itemId = key.split('::')[0];
    if (!byItem.has(itemId)) byItem.set(itemId, emptyBucket());
    const agg = /** @type {StockBucket} */ (byItem.get(itemId));
    agg.quantity = roundQty(agg.quantity + bucket.quantity);
    agg.value = roundMoney(agg.value + bucket.value);
    agg.avgRate = agg.quantity > 0 ? roundMoney(agg.value / agg.quantity) : 0;
  }

  return { buckets, byItem };
}

/**
 * Validate a new posting against current stock (before save).
 * @param {import('../models/types.js').InventoryTransaction[]} existing
 * @param {{
 *   type: string,
 *   itemId: string,
 *   warehouseId: string,
 *   quantity: number,
 *   rate?: number,
 *   value?: number,
 *   adjustmentSign?: 1|-1,
 *   toWarehouseId?: string|null,
 *   date: string,
 * }} input
 */
export function validateNewPosting(existing, input) {
  const errors = [];
  if (!isKnownInventoryType(input.type)) {
    errors.push(`Unknown type: ${input.type}`);
  }
  const qty = roundQty(input.quantity);
  if (qty <= 0) errors.push('Quantity must be greater than zero');
  if (!input.itemId) errors.push('Item is required');
  if (!input.warehouseId) errors.push('Warehouse is required');
  if (!input.date) errors.push('Date is required');

  const type = input.type;
  const needsRate =
    type === INVENTORY_TXN_TYPES.OPENING ||
    type === INVENTORY_TXN_TYPES.PURCHASE ||
    type === INVENTORY_TXN_TYPES.SALES_RETURN ||
    (type === INVENTORY_TXN_TYPES.ADJUSTMENT && (input.adjustmentSign ?? 1) > 0);

  if (needsRate) {
    const rate = roundMoney(input.rate);
    if (rate < 0) errors.push('Rate cannot be negative');
    if (type !== INVENTORY_TXN_TYPES.ADJUSTMENT && rate <= 0) {
      errors.push('Rate is required for stock-in movements');
    }
  }

  if (type === INVENTORY_TXN_TYPES.TRANSFER) {
    if (!input.toWarehouseId) errors.push('Destination warehouse is required');
    if (input.toWarehouseId === input.warehouseId) {
      errors.push('Cannot transfer to the same warehouse');
    }
  }

  if (errors.length) return { ok: false, errors };

  // Simulate through as-of date then apply
  const prior = existing.filter((t) => t.date < input.date || (t.date === input.date));
  const { buckets } = computeStock(prior);
  /** @type {import('../models/types.js').InventoryTransaction} */
  const trial = {
    id: '_trial',
    bookId: '',
    date: input.date,
    itemId: input.itemId,
    warehouseId: input.warehouseId,
    type: /** @type {any} */ (type),
    quantity: qty,
    rate: roundMoney(input.rate || 0),
    value: roundMoney(input.value != null ? input.value : qty * roundMoney(input.rate || 0)),
    adjustmentSign: input.adjustmentSign,
    toWarehouseId: input.toWarehouseId || null,
    voucherId: null,
    createdAt: '',
    updatedAt: '',
  };

  // For rate-less adjustment in, use current avg
  if (
    type === INVENTORY_TXN_TYPES.ADJUSTMENT &&
    (input.adjustmentSign ?? 1) > 0 &&
    !input.rate
  ) {
    const key = stockKey(input.itemId, input.warehouseId);
    const b = buckets.get(key);
    trial.rate = b?.avgRate || 0;
    trial.value = roundMoney(qty * trial.rate);
  }

  const result = applyTransaction(buckets, trial);
  if (!result.ok) {
    return { ok: false, errors: [result.error || 'Invalid posting'] };
  }

  return {
    ok: true,
    errors: [],
    costValue: result.costValue,
    costRate: result.costRate,
    quantity: qty,
    rate: trial.rate,
    value: trial.value,
  };
}
