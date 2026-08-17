import { ACCOUNT_TYPES, EVENTS, LIABILITY_ACCOUNT_TYPES, STORES } from '../core/constants.js';
import { emit } from '../core/eventBus.js';
import { uuid } from '../core/uuid.js';
import { todayIsoDate, nowIso } from '../utils/date.js';
import { assertCurrency, assertMinor } from '../utils/validation.js';
import { accountRepository, transactionRepository } from '../repositories/index.js';
import { calculateAccountBalance, creditCardSnapshot, isLiabilityType } from '../engine/balanceEngine.js';
import { recordAudit, AUDIT_ACTIONS } from './auditService.js';
import { markLocalDataChanged } from './settingsService.js';

/**
 * @param {object} input
 */
export async function createAccount(input) {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('Account name is required');
  const type = input.type || ACCOUNT_TYPES.BANK;
  if (!Object.values(ACCOUNT_TYPES).includes(type)) throw new Error('Invalid account type');
  const currency = String(input.currency || 'AED').toUpperCase();
  assertCurrency(currency);
  const opening = Math.trunc(input.openingBalanceMinor || 0);
  assertMinor(opening);
  const rec = {
    id: uuid(),
    name,
    type,
    institution: String(input.institution || ''),
    currency,
    openingBalanceMinor: opening,
    openingBalanceDate: input.openingBalanceDate || todayIsoDate(),
    creditLimitMinor: Math.trunc(input.creditLimitMinor || 0),
    statementDate: input.statementDate ?? null,
    paymentDueDate: input.paymentDueDate ?? null,
    active: input.active !== false,
    notes: String(input.notes || ''),
    isSample: Boolean(input.isSample),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await accountRepository.put(rec);
  await recordAudit({ action: AUDIT_ACTIONS.CREATED, entity: STORES.ACCOUNTS, entityId: rec.id, detail: name });
  await markLocalDataChanged();
  emit(EVENTS.ACCOUNT_CHANGED, rec);
  return rec;
}

export async function updateAccount(id, patch) {
  const rec = await accountRepository.getById(id);
  if (!rec) throw new Error('Account not found');
  const next = { ...rec, ...patch, id, updatedAt: nowIso() };
  if (patch.currency) {
    next.currency = String(patch.currency).toUpperCase();
    assertCurrency(next.currency);
  }
  if (patch.openingBalanceMinor != null) {
    next.openingBalanceMinor = Math.trunc(patch.openingBalanceMinor);
    assertMinor(next.openingBalanceMinor);
  }
  await accountRepository.put(next);
  await recordAudit({ action: AUDIT_ACTIONS.MODIFIED, entity: STORES.ACCOUNTS, entityId: id });
  await markLocalDataChanged();
  emit(EVENTS.ACCOUNT_CHANGED, next);
  return next;
}

export async function listAccounts({ includeInactive = false } = {}) {
  const all = await accountRepository.getAll();
  return (includeInactive ? all : all.filter((a) => a.active !== false)).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

export async function getAccount(id) {
  return accountRepository.getById(id);
}

export async function liveTransactions() {
  const all = await transactionRepository.getAll();
  return all.filter((t) => !t.deletedAt);
}

export async function getAccountBalance(accountId) {
  const account = await getAccount(accountId);
  if (!account) throw new Error('Account not found');
  const txns = await liveTransactions();
  return calculateAccountBalance(account, txns);
}

export async function getBalances() {
  const accounts = await listAccounts({ includeInactive: true });
  const txns = await liveTransactions();
  return accounts.map((a) => ({
    account: a,
    balanceMinor: calculateAccountBalance(a, txns),
    liability: isLiabilityType(a.type),
    card: a.type === ACCOUNT_TYPES.CREDIT_CARD ? creditCardSnapshot(a, txns) : null,
  }));
}

export async function rebuildBalances() {
  return getBalances();
}

export { ACCOUNT_TYPES, LIABILITY_ACCOUNT_TYPES };
