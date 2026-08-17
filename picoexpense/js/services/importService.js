/**
 * CSV import wizard — map arbitrary columns, validate, detect duplicates.
 */

import { TXN_TYPES } from '../core/constants.js';
import { parseCsv } from '../utils/csv.js';
import { parseFlexibleDate } from '../utils/date.js';
import { toMinor } from '../utils/money.js';
import { findDuplicates } from '../engine/duplicateEngine.js';
import { listTransactions, saveTransaction } from './transactionService.js';
import { listAccounts } from './accountService.js';
import { getOrCreateMerchant } from './masterService.js';
import { recordAudit, AUDIT_ACTIONS } from './auditService.js';
import { STORES } from '../core/constants.js';

export const IMPORT_FIELDS = Object.freeze([
  'ignore',
  'date',
  'description',
  'amount',
  'debit',
  'credit',
  'currency',
  'account',
  'reference',
  'merchant',
  'category',
  'notes',
  'type',
]);

/**
 * @param {string} text
 */
export function inspectCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error('CSV is empty');
  const headers = rows[0].map((h, i) => String(h || `Column ${i + 1}`));
  const sample = rows.slice(1, 8);
  const suggested = headers.map((h) => suggestField(h));
  return { headers, suggested, sample, dataRows: rows.slice(1), rowCount: rows.length - 1 };
}

/**
 * @param {string} header
 */
export function suggestField(header) {
  const h = String(header || '').toLowerCase();
  if (/date|txn date|value date|posted/.test(h)) return 'date';
  if (/descr|narrat|particular|details|memo/.test(h)) return 'description';
  if (/withdraw|debit|dr\b/.test(h)) return 'debit';
  if (/deposit|credit|cr\b/.test(h)) return 'credit';
  if (/^amount$|txn amount|value/.test(h)) return 'amount';
  if (/currency|ccy/.test(h)) return 'currency';
  if (/account/.test(h)) return 'account';
  if (/ref|cheque|chq/.test(h)) return 'reference';
  if (/merchant|payee/.test(h)) return 'merchant';
  if (/categor/.test(h)) return 'category';
  if (/note/.test(h)) return 'notes';
  if (/type/.test(h)) return 'type';
  return 'ignore';
}

/**
 * @param {string[][]} dataRows
 * @param {string[]} mapping field per column
 * @param {{ defaultAccountId: string, defaultCurrency: string, accounts: object[] }} ctx
 */
export function previewRows(dataRows, mapping, ctx) {
  const errors = [];
  const rows = [];
  dataRows.forEach((cols, index) => {
    /** @type {Record<string, string>} */
    const rec = {};
    mapping.forEach((field, i) => {
      if (!field || field === 'ignore') return;
      rec[field] = String(cols[i] ?? '').trim();
    });
    const date = parseFlexibleDate(rec.date);
    let amount = 0;
    let type = TXN_TYPES.EXPENSE;
    try {
      if (rec.debit || rec.credit) {
        const debit = rec.debit ? Math.abs(toMinor(rec.debit, ctx.defaultCurrency)) : 0;
        const credit = rec.credit ? Math.abs(toMinor(rec.credit, ctx.defaultCurrency)) : 0;
        if (debit && !credit) {
          amount = debit;
          type = TXN_TYPES.EXPENSE;
        } else if (credit && !debit) {
          amount = credit;
          type = TXN_TYPES.INCOME;
        } else if (debit && credit) {
          errors.push({ index, message: 'Both debit and credit present' });
          return;
        }
      } else if (rec.amount) {
        const raw = rec.amount.replace(/,/g, '');
        const signed = Number(raw);
        amount = Math.abs(toMinor(raw.replace(/^[+-]/, ''), rec.currency || ctx.defaultCurrency));
        type = signed < 0 ? TXN_TYPES.EXPENSE : TXN_TYPES.INCOME;
        if (raw.startsWith('-')) type = TXN_TYPES.EXPENSE;
      }
    } catch (err) {
      errors.push({ index, message: err instanceof Error ? err.message : 'Bad amount' });
      return;
    }
    if (rec.type) {
      const t = rec.type.toUpperCase();
      if (Object.values(TXN_TYPES).includes(t)) type = t;
      else if (/income|credit|deposit/.test(rec.type.toLowerCase())) type = TXN_TYPES.INCOME;
    }
    if (!date) {
      errors.push({ index, message: 'Invalid date' });
      return;
    }
    if (!amount) {
      errors.push({ index, message: 'Missing amount' });
      return;
    }
    let accountId = ctx.defaultAccountId;
    if (rec.account) {
      const hit = ctx.accounts.find((a) => a.name.toLowerCase() === rec.account.toLowerCase());
      if (hit) accountId = hit.id;
    }
    rows.push({
      index,
      date,
      description: rec.description || rec.merchant || '',
      merchantName: rec.merchant || '',
      amountMinor: amount,
      currency: (rec.currency || ctx.defaultCurrency).toUpperCase(),
      accountId,
      reference: rec.reference || '',
      notes: rec.notes || '',
      type,
      categoryName: rec.category || '',
    });
  });
  return { rows, errors };
}

/**
 * @param {object[]} previewed
 * @param {{ skip?: Set<number>, importAnyway?: Set<number> }} decisions
 * @param {{ defaultCategoryId?: string }} opts
 */
export async function commitImport(previewed, decisions, opts = {}) {
  const existing = await listTransactions({ includeDeleted: true });
  const dupes = findDuplicates(previewed, existing);
  const dupeIndexes = new Set(dupes.map((d) => d.index));
  let imported = 0;
  let skipped = 0;
  const rowErrors = [];
  for (const row of previewed) {
    if (decisions.skip?.has(row.index)) {
      skipped += 1;
      continue;
    }
    if (dupeIndexes.has(row.index) && !decisions.importAnyway?.has(row.index)) {
      skipped += 1;
      continue;
    }
    try {
      let merchantId = null;
      if (row.merchantName) {
        const m = await getOrCreateMerchant(row.merchantName);
        merchantId = m.id;
      }
      await saveTransaction({
        date: row.date,
        type: row.type,
        amountMinor: row.amountMinor,
        currency: row.currency,
        accountId: row.accountId,
        categoryId: opts.defaultCategoryId || null,
        description: row.description,
        merchantId,
        reference: row.reference,
        notes: row.notes,
      });
      imported += 1;
    } catch (err) {
      rowErrors.push({ index: row.index, message: err instanceof Error ? err.message : 'Import failed' });
    }
  }
  await recordAudit({ action: AUDIT_ACTIONS.IMPORTED, entity: STORES.TRANSACTIONS, detail: `${imported} rows` });
  return { imported, skipped, errors: rowErrors, duplicates: dupes };
}

export async function analyzeDuplicates(previewed) {
  const existing = await listTransactions({ includeDeleted: true });
  return findDuplicates(previewed, existing);
}

export { listAccounts };
