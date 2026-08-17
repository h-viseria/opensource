import { toCsv } from '../utils/csv.js';
import { fromMinor } from '../utils/money.js';
import { listTransactions } from './transactionService.js';
import { listAccounts } from './accountService.js';
import { listCategories } from './categoryService.js';
import { listMerchants, listTags, listPeople } from './masterService.js';
import { filterTransactions } from './reportingService.js';
import { downloadBlob } from './backupService.js';

/**
 * @param {object} [filters]
 */
export async function exportTransactionsCsv(filters = {}) {
  const txns = Object.keys(filters).length ? await filterTransactions(filters) : await listTransactions();
  const [accounts, cats, merchants, tags, people] = await Promise.all([
    listAccounts({ includeInactive: true }),
    listCategories({ includeArchived: true }),
    listMerchants(),
    listTags(),
    listPeople(),
  ]);
  const a = Object.fromEntries(accounts.map((x) => [x.id, x.name]));
  const c = Object.fromEntries(cats.map((x) => [x.id, x.name]));
  const m = Object.fromEntries(merchants.map((x) => [x.id, x.name]));
  const p = Object.fromEntries(people.map((x) => [x.id, x.name]));
  const tmap = Object.fromEntries(tags.map((x) => [x.id, x.name]));
  const rows = [
    ['id', 'date', 'type', 'amount', 'currency', 'account', 'transferAccount', 'category', 'merchant', 'description', 'tags', 'person', 'reference', 'notes'],
  ];
  for (const t of txns) {
    rows.push([
      t.id,
      t.date,
      t.type,
      fromMinor(t.amountMinor, t.currency),
      t.currency,
      a[t.accountId] || '',
      a[t.transferAccountId] || '',
      c[t.subcategoryId] || c[t.categoryId] || '',
      m[t.merchantId] || '',
      t.description || '',
      (t.tagIds || []).map((id) => tmap[id]).filter(Boolean).join('|'),
      p[t.personId] || '',
      t.reference || '',
      t.notes || '',
    ]);
  }
  const csv = toCsv(rows);
  downloadBlob(new Blob([csv], { type: 'text/csv' }), 'picoexpense-transactions.csv');
  return rows.length - 1;
}

export async function exportJsonFiltered(filters = {}) {
  const txns = await filterTransactions(filters);
  downloadBlob(new Blob([JSON.stringify(txns, null, 2)], { type: 'application/json' }), 'picoexpense-transactions.json');
  return txns.length;
}
