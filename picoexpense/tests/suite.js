/**
 * Shared PicoExpense tests (browser + Node).
 */
import { equal, match, throws } from './assert.js';
import { toMinor, fromMinor, convertMinor, sumMinor, decimalsFor } from '../js/utils/money.js';
import { toDateInput, parseFlexibleDate, parseLocalDate, inRange } from '../js/utils/date.js';
import { likelyDuplicate, findDuplicates } from '../js/engine/duplicateEngine.js';
import { calculateAccountBalance, transactionDeltaForAccount } from '../js/engine/balanceEngine.js';
import { periodTotals } from '../js/engine/reportingEngine.js';
import { budgetVariance } from '../js/engine/budgetEngine.js';
import { parseReceiptText } from '../js/ocr/receiptParser.js';
import { validateBackup } from '../js/services/backupService.js';
import { ACCOUNT_TYPES, TXN_TYPES, BACKUP_KIND } from '../js/core/constants.js';
import { assertSplitsBalance, assertDifferentAccounts } from '../js/utils/validation.js';

const tests = [];
export function test(name, fn) {
  tests.push({ name, fn });
}

test('minor units AED', () => {
  equal(toMinor('123.45', 'AED'), 12345);
  equal(fromMinor(12345, 'AED'), '123.45');
  equal(decimalsFor('JPY'), 0);
  equal(toMinor('12', 'JPY'), 12);
});

test('convertMinor', () => {
  equal(convertMinor(10000, 'AED', 'INR', 23), 230000);
});

test('sumMinor integers', () => {
  equal(sumMinor([100, 200, -50]), 250);
});

test('date no UTC shift for YYYY-MM-DD', () => {
  equal(toDateInput('2026-08-14'), '2026-08-14');
  const d = parseLocalDate('2026-08-14');
  equal(d.getFullYear(), 2026);
  equal(d.getMonth(), 7);
  equal(d.getDate(), 14);
  equal(parseFlexibleDate('14/08/26'), '2026-08-14');
  equal(inRange('2026-08-14', '2026-08-01', '2026-08-31'), true);
});

test('splits must equal parent', () => {
  assertSplitsBalance(50000, [{ amountMinor: 30000 }, { amountMinor: 10000 }, { amountMinor: 10000 }]);
  throws(() => assertSplitsBalance(50000, [{ amountMinor: 100 }]));
});

test('transfer accounts differ', () => {
  throws(() => assertDifferentAccounts('a', 'a'));
  assertDifferentAccounts('a', 'b');
});

test('CC purchase vs payment', () => {
  const card = { id: 'cc', type: ACCOUNT_TYPES.CREDIT_CARD, openingBalanceMinor: 0 };
  const bank = { id: 'bk', type: ACCOUNT_TYPES.BANK, openingBalanceMinor: 100000 };
  const purchase = { type: TXN_TYPES.EXPENSE, accountId: 'cc', amountMinor: 5000 };
  const pay = { type: TXN_TYPES.CREDIT_CARD_PAYMENT, accountId: 'bk', transferAccountId: 'cc', amountMinor: 5000 };
  equal(transactionDeltaForAccount(purchase, 'cc', true), 5000);
  equal(transactionDeltaForAccount(pay, 'cc', true), -5000);
  equal(transactionDeltaForAccount(pay, 'bk', false), -5000);
  equal(calculateAccountBalance(card, [purchase, pay]), 0);
  equal(calculateAccountBalance(bank, [purchase, pay]), 95000);
});

test('transfers excluded from expenses', () => {
  const txns = [
    { id: '1', date: '2026-08-01', type: TXN_TYPES.INCOME, amountMinor: 10000, currency: 'AED', deletedAt: null },
    { id: '2', date: '2026-08-02', type: TXN_TYPES.EXPENSE, amountMinor: 3000, currency: 'AED', deletedAt: null },
    { id: '3', date: '2026-08-03', type: TXN_TYPES.TRANSFER, amountMinor: 2000, currency: 'AED', deletedAt: null },
    { id: '4', date: '2026-08-03', type: TXN_TYPES.CREDIT_CARD_PAYMENT, amountMinor: 1000, currency: 'AED', deletedAt: null },
  ];
  const toBase = (t) => ({ minor: t.amountMinor, incomplete: false });
  const r = periodTotals(txns, '2026-08-01', '2026-08-31', toBase);
  equal(r.income, 10000);
  equal(r.expenses, 3000);
  equal(r.savings, 7000);
});

test('refund reduces expenses', () => {
  const txns = [
    { id: '1', date: '2026-08-01', type: TXN_TYPES.EXPENSE, amountMinor: 5000, currency: 'AED' },
    { id: '2', date: '2026-08-02', type: TXN_TYPES.REFUND, amountMinor: 1000, currency: 'AED' },
  ];
  const r = periodTotals(txns, '2026-08-01', '2026-08-31', (t) => ({ minor: t.amountMinor, incomplete: false }));
  equal(r.expenses, 4000);
});

test('budget variance status', () => {
  const budget = { id: 'b', period: 'MONTHLY', amountMinor: 10000, categoryId: null };
  const txns = [{ date: '2026-08-10', type: TXN_TYPES.EXPENSE, amountMinor: 9000 }];
  const v = budgetVariance(budget, txns, '2026-08-14', (t) => ({ minor: t.amountMinor, incomplete: false }));
  equal(v.status, 'WARNING');
  equal(v.actual, 9000);
});

test('duplicate detection', () => {
  const a = { date: '2026-08-01', amountMinor: 100, accountId: 'x', description: 'Carrefour' };
  const b = { date: '2026-08-01', amountMinor: 100, accountId: 'x', description: 'carrefour' };
  equal(likelyDuplicate(a, b), true);
  equal(findDuplicates([a], [b]).length, 1);
});

test('receipt parser', () => {
  const p = parseReceiptText('CARREFOUR\n14/08/2026\nTotal: AED 42.50\nVAT 2.10\nPaid by Visa');
  match(p.merchant, /CARREFOUR/i);
  equal(p.date, '2026-08-14');
  equal(p.total, '42.50');
  equal(p.currency, 'AED');
  equal(p.paymentMethod, 'CREDIT_CARD');
});

test('backup validate', () => {
  const raw = { kind: BACKUP_KIND, schemaVersion: 1, stores: { transactions: [] }, exportedAt: '2026-08-14T00:00:00.000Z' };
  equal(validateBackup(raw).ok, true);
  equal(validateBackup({ stores: 'nope' }).ok, false);
});

test('soft-delete ignored in balance', () => {
  const acct = { id: 'a', type: ACCOUNT_TYPES.CASH, openingBalanceMinor: 0 };
  const t = { type: TXN_TYPES.EXPENSE, accountId: 'a', amountMinor: 50, deletedAt: '2026-08-01T00:00:00.000Z' };
  equal(calculateAccountBalance(acct, [t]), 0);
});

export async function runAll() {
  let failed = 0;
  const lines = [];
  for (const t of tests) {
    try {
      await t.fn();
      lines.push('ok ' + t.name);
    } catch (err) {
      failed += 1;
      lines.push('FAIL ' + t.name + ' ' + (err && err.message ? err.message : err));
    }
  }
  if (failed) lines.push(failed + ' failed');
  else lines.push('all tests passed');
  return { failed, lines };
}
