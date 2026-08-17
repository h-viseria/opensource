/**
 * First-launch setup and optional synthetic sample data.
 */

import { SETTINGS_KEYS, TXN_TYPES, ACCOUNT_TYPES } from '../core/constants.js';
import { getSetting, setSetting } from './settingsService.js';
import { seedDefaultCategories, findCategoryByName } from './categoryService.js';
import { createAccount, listAccounts } from './accountService.js';
import { saveTransaction, listTransactions, permanentlyDeleteTransaction } from './transactionService.js';
import { savePerson, saveTag, saveRule, listPeople, listTags } from './masterService.js';
import { seedCurrencies, setBaseCurrency } from './currencyService.js';
import { DEFAULT_PEOPLE, DEFAULT_TAGS, DEFAULT_RULES } from '../data/defaults.js';
import { toMinor } from '../utils/money.js';
import { todayIsoDate, addMonths, toDateInput } from '../utils/date.js';

export async function isSetupComplete() {
  return Boolean(await getSetting(SETTINGS_KEYS.SETUP_COMPLETE));
}

/**
 * @param {{ profileName: string, baseCurrency: string, country?: string, locale?: string, accountName: string, accountType?: string, openingMinor?: number, seedCategories?: boolean }} input
 */
export async function completeSetup(input) {
  await seedCurrencies();
  await setSetting(SETTINGS_KEYS.PROFILE_NAME, String(input.profileName || 'Me').trim() || 'Me');
  await setBaseCurrency(input.baseCurrency || 'AED');
  await setSetting(SETTINGS_KEYS.COUNTRY, input.country || '');
  await setSetting(SETTINGS_KEYS.LOCALE, input.locale || navigator.language || 'en');
  await setSetting(SETTINGS_KEYS.DATE_FORMAT, 'D MMM YYYY');
  await setSetting(SETTINGS_KEYS.THEME, 'system');
  if (input.seedCategories !== false) await seedDefaultCategories();
  const accounts = await listAccounts();
  let account = accounts[0];
  if (!account && input.accountName) {
    account = await createAccount({
      name: input.accountName,
      type: input.accountType || ACCOUNT_TYPES.BANK,
      currency: input.baseCurrency || 'AED',
      openingBalanceMinor: input.openingMinor || 0,
    });
  }
  if (account) await setSetting(SETTINGS_KEYS.DEFAULT_ACCOUNT_ID, account.id);
  const people = await listPeople();
  if (!people.length) {
    for (const p of DEFAULT_PEOPLE) await savePerson(p);
  }
  const tags = await listTags();
  if (!tags.length) {
    for (const t of DEFAULT_TAGS) await saveTag({ name: t });
  }
  for (const r of DEFAULT_RULES) {
    const cat = await findCategoryByName(r.categoryName);
    if (cat) await saveRule({ pattern: r.pattern, categoryId: cat.id, priority: 10 });
  }
  await setSetting(SETTINGS_KEYS.SETUP_COMPLETE, true);
  return { account };
}

export async function skipSetup() {
  await seedCurrencies();
  await seedDefaultCategories();
  await setSetting(SETTINGS_KEYS.BASE_CURRENCY, (await getSetting(SETTINGS_KEYS.BASE_CURRENCY)) || 'AED');
  await setSetting(SETTINGS_KEYS.SETUP_COMPLETE, true);
}

export async function loadSampleData() {
  await seedDefaultCategories();
  const currency = String((await getSetting(SETTINGS_KEYS.BASE_CURRENCY)) || 'AED');
  const bank = await createAccount({
    name: 'Sample Checking',
    type: ACCOUNT_TYPES.CURRENT,
    currency,
    openingBalanceMinor: toMinor('12500', currency),
    isSample: true,
  });
  const cash = await createAccount({
    name: 'Sample Cash',
    type: ACCOUNT_TYPES.CASH,
    currency,
    openingBalanceMinor: toMinor('800', currency),
    isSample: true,
  });
  const card = await createAccount({
    name: 'Sample Credit Card',
    type: ACCOUNT_TYPES.CREDIT_CARD,
    currency,
    openingBalanceMinor: toMinor('2100', currency),
    creditLimitMinor: toMinor('15000', currency),
    isSample: true,
  });
  const groceries = await findCategoryByName('Groceries');
  const salary = await findCategoryByName('Salary');
  const fuel = await findCategoryByName('Fuel');
  const today = todayIsoDate();
  const lastMonth = toDateInput(addMonths(today, -1));
  await saveTransaction({
    date: lastMonth,
    type: TXN_TYPES.INCOME,
    amountMinor: toMinor('18000', currency),
    currency,
    accountId: bank.id,
    categoryId: salary?.id,
    description: 'SAMPLE — Salary',
    isSample: true,
  });
  await saveTransaction({
    date: today,
    type: TXN_TYPES.EXPENSE,
    amountMinor: toMinor('342.50', currency),
    currency,
    accountId: card.id,
    categoryId: groceries?.id,
    description: 'SAMPLE — Groceries',
    isSample: true,
  });
  await saveTransaction({
    date: today,
    type: TXN_TYPES.EXPENSE,
    amountMinor: toMinor('85', currency),
    currency,
    accountId: cash.id,
    categoryId: fuel?.id,
    description: 'SAMPLE — Fuel',
    isSample: true,
  });
  await saveTransaction({
    date: today,
    type: TXN_TYPES.CREDIT_CARD_PAYMENT,
    amountMinor: toMinor('2100', currency),
    currency,
    accountId: bank.id,
    transferAccountId: card.id,
    description: 'SAMPLE — Card payment',
    isSample: true,
  });
  await setSetting(SETTINGS_KEYS.SAMPLE_DATA, true);
  await setSetting(SETTINGS_KEYS.DEFAULT_ACCOUNT_ID, bank.id);
}

export async function removeSampleData() {
  const txns = await listTransactions({ includeDeleted: true });
  for (const t of txns.filter((x) => x.isSample)) {
    await permanentlyDeleteTransaction(t.id);
  }
  const accounts = await listAccounts({ includeInactive: true });
  const { accountRepository } = await import('../repositories/index.js');
  for (const a of accounts.filter((x) => x.isSample)) {
    await accountRepository.remove(a.id);
  }
  await setSetting(SETTINGS_KEYS.SAMPLE_DATA, false);
}
