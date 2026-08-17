import { STORES } from '../core/constants.js';
import { createRepository } from './storeRepository.js';

export const settingsRepository = {
  ...createRepository(STORES.SETTINGS),

  /**
   * @param {string} key
   */
  async getValue(key) {
    const rec = await this.getById(key);
    return rec ? rec.value : undefined;
  },

  /**
   * @param {string} key
   * @param {unknown} value
   */
  async setValue(key, value) {
    await this.put({ key, value });
    return value;
  },
};

export const metadataRepository = createRepository(STORES.METADATA);
export const transactionRepository = createRepository(STORES.TRANSACTIONS);
export const splitRepository = createRepository(STORES.SPLITS);
export const accountRepository = createRepository(STORES.ACCOUNTS);
export const categoryRepository = createRepository(STORES.CATEGORIES);
export const merchantRepository = createRepository(STORES.MERCHANTS);
export const tagRepository = createRepository(STORES.TAGS);
export const personRepository = createRepository(STORES.PEOPLE);
export const budgetRepository = createRepository(STORES.BUDGETS);
export const goalRepository = createRepository(STORES.GOALS);
export const attachmentRepository = createRepository(STORES.ATTACHMENTS);
export const receiptRepository = createRepository(STORES.RECEIPTS);
export const currencyRepository = createRepository(STORES.CURRENCIES);
export const exchangeRateRepository = createRepository(STORES.EXCHANGE_RATES);
export const ruleRepository = createRepository(STORES.RULES);
export const savedFilterRepository = createRepository(STORES.SAVED_FILTERS);
export const auditRepository = createRepository(STORES.AUDIT_LOG);
export const activityRepository = createRepository(STORES.ACTIVITY_LOG);
