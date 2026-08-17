import { listTransactions } from './transactionService.js';
import { listAccounts } from './accountService.js';
import { listCategories } from './categoryService.js';
import { listMerchants, listTags, listPeople } from './masterService.js';

/**
 * Instant in-memory search for typical datasets. Indexes used at repository layer for paging.
 * @param {string} q
 */
export async function searchAll(q) {
  const query = String(q || '').trim().toLowerCase();
  if (!query) return { transactions: [], accounts: [], merchants: [], categories: [] };

  const [txns, accounts, cats, merchants, tags, people] = await Promise.all([
    listTransactions(),
    listAccounts({ includeInactive: true }),
    listCategories({ includeArchived: true }),
    listMerchants(),
    listTags(),
    listPeople(),
  ]);

  const catMap = Object.fromEntries(cats.map((c) => [c.id, c.name]));
  const acctMap = Object.fromEntries(accounts.map((a) => [a.id, a.name]));
  const merchMap = Object.fromEntries(merchants.map((m) => [m.id, m.name]));
  const tagMap = Object.fromEntries(tags.map((t) => [t.id, t.name]));
  const peopleMap = Object.fromEntries(people.map((p) => [p.id, p.name]));

  const transactions = txns.filter((t) => {
    const blob = [
      t.description,
      t.notes,
      t.reference,
      t.amountMinor,
      t.currency,
      t.type,
      catMap[t.categoryId],
      catMap[t.subcategoryId],
      acctMap[t.accountId],
      merchMap[t.merchantId],
      peopleMap[t.personId],
      ...(t.tagIds || []).map((id) => tagMap[id]),
    ]
      .join(' ')
      .toLowerCase();
    return blob.includes(query);
  }).slice(0, 80);

  return {
    transactions,
    accounts: accounts.filter((a) => a.name.toLowerCase().includes(query)).slice(0, 20),
    merchants: merchants.filter((m) => m.name.toLowerCase().includes(query)).slice(0, 20),
    categories: cats.filter((c) => c.name.toLowerCase().includes(query)).slice(0, 20),
  };
}
