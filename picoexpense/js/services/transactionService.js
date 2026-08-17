import {
  EVENTS,
  REIMBURSEMENT_STATUS,
  STORES,
  TRANSFER_LIKE,
  TXN_TYPES,
} from '../core/constants.js';
import { emit } from '../core/eventBus.js';
import { uuid } from '../core/uuid.js';
import { nowIso } from '../utils/date.js';
import {
  assertCurrency,
  assertDate,
  assertDifferentAccounts,
  assertMinor,
  assertPaymentMethod,
  assertReimbursement,
  assertSplitsBalance,
  assertTxnType,
} from '../utils/validation.js';
import { convertMinor } from '../utils/money.js';
import {
  splitRepository,
  transactionRepository,
  accountRepository,
} from '../repositories/index.js';
import { withTransaction } from '../repositories/storeRepository.js';
import { recordAudit, AUDIT_ACTIONS } from './auditService.js';
import { markLocalDataChanged, getSetting } from './settingsService.js';
import { SETTINGS_KEYS } from '../core/constants.js';
import { getRate } from './currencyService.js';

/**
 * @param {object} input
 */
export async function saveTransaction(input) {
  const isNew = !input.id;
  const existing = input.id ? await transactionRepository.getById(input.id) : null;
  if (input.id && !existing) throw new Error('Transaction not found');

  const type = input.type || TXN_TYPES.EXPENSE;
  assertTxnType(type);
  assertDate(input.date);
  const currency = String(input.currency || 'AED').toUpperCase();
  assertCurrency(currency);
  const amountMinor = Math.trunc(input.amountMinor);
  assertMinor(amountMinor);
  if (amountMinor <= 0 && type !== TXN_TYPES.ADJUSTMENT) {
    throw new Error('Amount must be greater than zero');
  }
  assertPaymentMethod(input.paymentMethod);
  assertReimbursement(input.reimbursementStatus);

  const account = await accountRepository.getById(input.accountId);
  if (!account) throw new Error('Account must exist');

  const transferLike = TRANSFER_LIKE.includes(type);
  if (transferLike) {
    assertDifferentAccounts(input.accountId, input.transferAccountId);
    const dest = await accountRepository.getById(input.transferAccountId);
    if (!dest) throw new Error('Destination account must exist');
  }

  const categoryRequired = type === TXN_TYPES.EXPENSE || type === TXN_TYPES.INCOME;
  if (categoryRequired && !input.categoryId && !(input.splits && input.splits.length)) {
    throw new Error('Category is required');
  }

  const splits = Array.isArray(input.splits) ? input.splits : [];
  if (splits.length) {
    for (const s of splits) assertMinor(Math.trunc(s.amountMinor));
    assertSplitsBalance(amountMinor, splits.map((s) => ({ amountMinor: Math.trunc(s.amountMinor) })));
  }

  const baseCurrency = String((await getSetting(SETTINGS_KEYS.BASE_CURRENCY)) || currency).toUpperCase();
  let baseAmountMinor = amountMinor;
  let exchangeRate = input.exchangeRate != null ? Number(input.exchangeRate) : null;
  let incompleteFx = false;
  if (currency !== baseCurrency) {
    if (input.baseAmountMinor != null && Number.isInteger(input.baseAmountMinor)) {
      baseAmountMinor = input.baseAmountMinor;
    } else if (exchangeRate && exchangeRate > 0) {
      baseAmountMinor = convertMinor(amountMinor, currency, baseCurrency, exchangeRate);
    } else {
      const looked = await getRate(currency, baseCurrency, input.date);
      if (looked) {
        exchangeRate = looked;
        baseAmountMinor = convertMinor(amountMinor, currency, baseCurrency, looked);
      } else {
        incompleteFx = true;
        baseAmountMinor = null;
      }
    }
  }

  const now = nowIso();
  const rec = {
    id: existing?.id || uuid(),
    date: input.date,
    time: input.time || '',
    type,
    amountMinor,
    currency,
    originalAmountMinor: input.originalAmountMinor ?? amountMinor,
    originalCurrency: input.originalCurrency || currency,
    exchangeRate: exchangeRate,
    baseAmountMinor,
    baseCurrency,
    fxIncomplete: incompleteFx,
    accountId: input.accountId,
    transferAccountId: transferLike ? input.transferAccountId : null,
    categoryId: input.categoryId || null,
    subcategoryId: input.subcategoryId || null,
    merchantId: input.merchantId || null,
    description: String(input.description || ''),
    notes: String(input.notes || ''),
    paymentMethod: input.paymentMethod || '',
    personId: input.personId || null,
    tagIds: Array.isArray(input.tagIds) ? input.tagIds : [],
    location: String(input.location || ''),
    country: String(input.country || ''),
    isReimbursable: Boolean(input.isReimbursable),
    reimbursementStatus: input.reimbursementStatus || REIMBURSEMENT_STATUS.NONE,
    isTaxRelated: Boolean(input.isTaxRelated),
    isTaxDeductible: Boolean(input.isTaxDeductible),
    isTaxableIncome: Boolean(input.isTaxableIncome),
    reference: String(input.reference || ''),
    attachmentIds: existing?.attachmentIds || input.attachmentIds || [],
    isSample: Boolean(input.isSample),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    deletedAt: null,
    version: (existing?.version || 0) + 1,
  };

  const splitRows = splits.map((s) => ({
    id: s.id || uuid(),
    transactionId: rec.id,
    categoryId: s.categoryId || rec.categoryId,
    amountMinor: Math.trunc(s.amountMinor),
    description: String(s.description || ''),
    personId: s.personId || null,
    tagIds: Array.isArray(s.tagIds) ? s.tagIds : [],
  }));

  await withTransaction([STORES.TRANSACTIONS, STORES.SPLITS], async (stores) => {
    stores[STORES.TRANSACTIONS].put(rec);
    if (existing) {
      const old = await new Promise((resolve, reject) => {
        const req = stores[STORES.SPLITS].index('transactionId').getAll(rec.id);
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
      for (const row of old) stores[STORES.SPLITS].delete(row.id);
    }
    for (const s of splitRows) stores[STORES.SPLITS].put(s);
  });

  await recordAudit({
    action: isNew ? AUDIT_ACTIONS.CREATED : AUDIT_ACTIONS.MODIFIED,
    entity: STORES.TRANSACTIONS,
    entityId: rec.id,
  });
  await markLocalDataChanged();
  emit(EVENTS.TXN_CHANGED, rec);

  if (isNew) {
    await markLocalDataChanged();
    const { setSetting } = await import('./settingsService.js');
    await setSetting(SETTINGS_KEYS.LAST_ACCOUNT_ID, rec.accountId);
    if (rec.categoryId) await setSetting(SETTINGS_KEYS.LAST_CATEGORY_ID, rec.categoryId);
    if (rec.merchantId) await setSetting(SETTINGS_KEYS.LAST_MERCHANT_ID, rec.merchantId);
  }

  return rec;
}

export async function getTransaction(id) {
  const rec = await transactionRepository.getById(id);
  if (!rec) return null;
  const splits = await splitRepository.getAllByIndex('transactionId', id);
  return { ...rec, splits };
}

export async function listTransactions({ includeDeleted = false } = {}) {
  const all = await transactionRepository.getAll();
  const rows = includeDeleted ? all : all.filter((t) => !t.deletedAt);
  rows.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return rows;
}

/**
 * Paginated newest-first by date index.
 * @param {{ offset?: number, limit?: number, includeDeleted?: boolean }} [opts]
 */
export async function pageTransactions(opts = {}) {
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  const all = await listTransactions({ includeDeleted: opts.includeDeleted });
  return { rows: all.slice(offset, offset + limit), total: all.length, offset, limit };
}

export async function softDeleteTransaction(id) {
  const rec = await transactionRepository.getById(id);
  if (!rec) throw new Error('Transaction not found');
  const next = { ...rec, deletedAt: nowIso(), updatedAt: nowIso(), version: (rec.version || 0) + 1 };
  await transactionRepository.put(next);
  await recordAudit({ action: AUDIT_ACTIONS.DELETED, entity: STORES.TRANSACTIONS, entityId: id });
  await markLocalDataChanged();
  emit(EVENTS.TXN_CHANGED, next);
  return next;
}

export async function restoreTransaction(id) {
  const rec = await transactionRepository.getById(id);
  if (!rec) throw new Error('Transaction not found');
  const next = { ...rec, deletedAt: null, updatedAt: nowIso(), version: (rec.version || 0) + 1 };
  await transactionRepository.put(next);
  await recordAudit({ action: AUDIT_ACTIONS.RESTORED, entity: STORES.TRANSACTIONS, entityId: id });
  await markLocalDataChanged();
  emit(EVENTS.TXN_CHANGED, next);
  return next;
}

export async function permanentlyDeleteTransaction(id) {
  const splits = await splitRepository.getAllByIndex('transactionId', id);
  await withTransaction([STORES.TRANSACTIONS, STORES.SPLITS], async (stores) => {
    stores[STORES.TRANSACTIONS].delete(id);
    for (const s of splits) stores[STORES.SPLITS].delete(s.id);
  });
  await recordAudit({ action: AUDIT_ACTIONS.PERMANENT_DELETE, entity: STORES.TRANSACTIONS, entityId: id });
  await markLocalDataChanged();
  emit(EVENTS.TXN_CHANGED, { id, deleted: true });
}

export async function emptyTrash() {
  const all = await transactionRepository.getAll();
  const dead = all.filter((t) => t.deletedAt);
  for (const t of dead) await permanentlyDeleteTransaction(t.id);
}

export async function duplicateTransaction(id) {
  const rec = await getTransaction(id);
  if (!rec) throw new Error('Transaction not found');
  const { id: _i, createdAt: _c, updatedAt: _u, version: _v, deletedAt: _d, splits, ...rest } = rec;
  return saveTransaction({
    ...rest,
    splits: (splits || []).map(({ id: sid, transactionId: _t, ...s }) => s),
  });
}

/**
 * @param {string[]} ids
 * @param {object} patch
 */
export async function bulkUpdate(ids, patch) {
  for (const id of ids) {
    const rec = await getTransaction(id);
    if (!rec || rec.deletedAt) continue;
    await saveTransaction({ ...rec, ...patch, id });
  }
}

export async function bulkDelete(ids) {
  for (const id of ids) await softDeleteTransaction(id);
}
