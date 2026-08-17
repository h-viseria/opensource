/**
 * JSDoc entity shapes. Architecture is independent of the product display name.
 */

/**
 * @typedef {Object} Transaction
 * @property {string} id
 * @property {string} date YYYY-MM-DD (financial date, not UTC timestamp)
 * @property {string} [time]
 * @property {string} type
 * @property {number} amountMinor
 * @property {string} currency
 * @property {number} [originalAmountMinor]
 * @property {string} [originalCurrency]
 * @property {number} [exchangeRate]
 * @property {number} [baseAmountMinor]
 * @property {string} [baseCurrency]
 * @property {string} accountId
 * @property {string} [transferAccountId]
 * @property {string} [categoryId]
 * @property {string} [subcategoryId]
 * @property {string} [merchantId]
 * @property {string} [description]
 * @property {string} [notes]
 * @property {string} [paymentMethod]
 * @property {string} [personId]
 * @property {string[]} [tagIds]
 * @property {string} [location]
 * @property {string} [country]
 * @property {boolean} [isReimbursable]
 * @property {string} [reimbursementStatus]
 * @property {boolean} [isTaxRelated]
 * @property {boolean} [isTaxDeductible]
 * @property {boolean} [isTaxableIncome]
 * @property {string} [reference]
 * @property {string[]} [attachmentIds]
 * @property {boolean} [isSample]
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {string|null} [deletedAt]
 * @property {number} version
 */

/**
 * @typedef {Object} TransactionSplit
 * @property {string} id
 * @property {string} transactionId
 * @property {string} [categoryId]
 * @property {number} amountMinor
 * @property {string} [description]
 * @property {string} [personId]
 * @property {string[]} [tagIds]
 */

export {};
