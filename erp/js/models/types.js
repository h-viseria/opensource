/**
 * Shared JSDoc typedefs for domain entities.
 * Runtime is plain objects; this file documents the shape for editors.
 */

/**
 * @typedef {Object} Book
 * @property {string} id
 * @property {string} name
 * @property {string} [legalName]
 * @property {string} [currency] ISO code, default INR
 * @property {string} [country]
 * @property {number} [fyStartMonth] 1–12
 * @property {string} [address]
 * @property {string} [taxId]
 * @property {string} [templateId] Industry COA template id
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} FinancialYear
 * @property {string} id
 * @property {string} bookId
 * @property {string} name
 * @property {string} startDate YYYY-MM-DD
 * @property {string} endDate YYYY-MM-DD
 * @property {boolean} isActive
 * @property {boolean} [isClosed]
 * @property {string} createdAt
 */

/**
 * @typedef {Object} SettingRow
 * @property {string} id
 * @property {string} key
 * @property {unknown} value
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} LedgerGroup
 * @property {string} id
 * @property {string} bookId
 * @property {string} name
 * @property {string} [code]
 * @property {string} nature Asset|Liability|Equity|Income|Expense
 * @property {string|null} parentId
 * @property {boolean} isPrimary
 * @property {boolean} isSystem
 * @property {number} sortOrder
 * @property {string} [notes]
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} Ledger
 * @property {string} id
 * @property {string} bookId
 * @property {string} groupId
 * @property {string} name
 * @property {string} [code]
 * @property {string} nature
 * @property {'debit'|'credit'} normalBalance
 * @property {number} openingBalance
 * @property {'debit'|'credit'} openingBalanceType
 * @property {boolean} isSystem
 * @property {boolean} isActive
 * @property {string} [notes]
 * @property {number} [sortOrder]
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} Voucher
 * @property {string} id
 * @property {string} bookId
 * @property {string} financialYearId
 * @property {string} voucherType
 * @property {string} voucherNumber
 * @property {string} date YYYY-MM-DD
 * @property {string} [narration]
 * @property {number} debitTotal
 * @property {number} creditTotal
 * @property {number} lineCount
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} VoucherLine
 * @property {string} id
 * @property {string} bookId
 * @property {string} voucherId
 * @property {string} financialYearId
 * @property {string} voucherType
 * @property {string} date
 * @property {number} lineNo
 * @property {string} ledgerId
 * @property {number} debit
 * @property {number} credit
 * @property {string|null} [costCenterId]
 * @property {string|null} [taxCodeId]
 * @property {string} [narration]
 * @property {string} createdAt
 */

/**
 * @typedef {Object} Unit
 * @property {string} id
 * @property {string} bookId
 * @property {string} name
 * @property {string} [code]
 * @property {string} [symbol]
 * @property {boolean} [isSystem]
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} ItemCategory
 * @property {string} id
 * @property {string} bookId
 * @property {string} name
 * @property {string} [code]
 * @property {string|null} [parentId]
 * @property {boolean} [isSystem]
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} Warehouse
 * @property {string} id
 * @property {string} bookId
 * @property {string} name
 * @property {string} [code]
 * @property {boolean} [isDefault]
 * @property {boolean} [isSystem]
 * @property {string} [address]
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} CatalogueAttributeDef
 * @property {string} key
 * @property {string} label
 * @property {boolean} required
 * @property {string[]} [options] Empty = free text; otherwise pick-list
 */

/**
 * @typedef {Object} CatalogueType
 * @property {string} id
 * @property {string} bookId
 * @property {string} name
 * @property {string} [code]
 * @property {string} [notes]
 * @property {boolean} isActive
 * @property {CatalogueAttributeDef[]} attributes
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} InventoryItem
 * @property {string} id
 * @property {string} bookId
 * @property {string} name Display / SKU label (often built from attributes)
 * @property {string} [code]
 * @property {string|null} [categoryId]
 * @property {string|null} [catalogueTypeId]
 * @property {Record<string, string>} [attributes] brand, name, type, size, colour, …
 * @property {string} unitId
 * @property {number} reorderLevel
 * @property {number} [purchaseRate]
 * @property {number} [saleRate]
 * @property {boolean} isActive
 * @property {string} [notes]
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} InventoryTransaction
 * @property {string} id
 * @property {string} bookId
 * @property {string} date YYYY-MM-DD
 * @property {string} itemId
 * @property {string} warehouseId
 * @property {'Opening'|'Purchase'|'Sale'|'Sales Return'|'Purchase Return'|'Adjustment'|'Transfer'} type
 * @property {number} quantity Absolute quantity moved
 * @property {number} rate Unit cost used for this posting
 * @property {number} value quantity * rate (absolute)
 * @property {1|-1} [adjustmentSign] Adjustment only: +1 stock in, -1 stock out
 * @property {string|null} [toWarehouseId] Transfer destination
 * @property {string|null} [voucherId] Linked accounting voucher
 * @property {string} [narration]
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * Sales / Purchase invoice or Credit / Debit note (return).
 * @typedef {Object} Invoice
 * @property {string} id
 * @property {string} bookId
 * @property {string} financialYearId
 * @property {'Sales'|'Purchase'|'Credit Note'|'Debit Note'} invoiceType
 * @property {string} invoiceNumber
 * @property {string} date
 * @property {string} partyLedgerId
 * @property {string} partyName
 * @property {string|null} [salesLedgerId]
 * @property {string} warehouseId
 * @property {string} [warehouseName]
 * @property {string} [narration]
 * @property {InvoiceLine[]} lines
 * @property {number} subtotal
 * @property {number} taxTotal
 * @property {number} grandTotal
 * @property {number} [costTotal]
 * @property {string|null} [voucherId]
 * @property {string[]} [stockVoucherIds]
 * @property {string[]} [inventoryTxnIds]
 * @property {'Posted'|'PartiallyReturned'|'Cancelled'} [status]
 * @property {string|null} [sourceInvoiceId] Set on credit/debit notes
 * @property {string} [sourceInvoiceNumber]
 * @property {string[]} [returnInvoiceIds] Credit/debit note ids against this invoice
 * @property {string} [cancelReason]
 * @property {string} [cancelledAt]
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} InvoiceLine
 * @property {number} lineNo
 * @property {string} itemId
 * @property {string} itemName
 * @property {string} [itemCode]
 * @property {string|null} [unitId]
 * @property {number} quantity
 * @property {number} rate
 * @property {number} amount
 * @property {string|null} [taxCodeId]
 * @property {string} [taxCodeName]
 * @property {number} [taxRate]
 * @property {number} [taxAmount]
 * @property {number} lineTotal
 * @property {string|null} [inventoryTxnId]
 * @property {number} [returnedQuantity] Cumulative returned qty (source invoices)
 * @property {number} [sourceLineNo] Original line on source (return notes)
 * @property {string|null} [sourceInventoryTxnId]
 */

/**
 * @typedef {Object} TaxCode
 * @property {string} id
 * @property {string} bookId
 * @property {string} name
 * @property {string} [code]
 * @property {'VAT'|'GST'|'Sales Tax'} taxType
 * @property {'Input'|'Output'} component
 * @property {number} rate Percent e.g. 18
 * @property {string|null} [ledgerId] Linked Input/Output tax ledger
 * @property {boolean} isActive
 * @property {boolean} [isSystem]
 * @property {string} [notes]
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} Budget
 * @property {string} id
 * @property {string} bookId
 * @property {string} name
 * @property {string} ledgerId Expense or Income ledger
 * @property {'month'|'year'} periodType
 * @property {string} periodKey YYYY-MM or YYYY
 * @property {number} amount Budgeted amount
 * @property {string} [notes]
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} Goal
 * @property {string} id
 * @property {string} bookId
 * @property {string} name
 * @property {string} category
 * @property {number} targetAmount
 * @property {number} currentAmount Manual progress when no linked ledger
 * @property {string|null} [linkedLedgerId] Optional asset ledger for live balance
 * @property {string|null} [targetDate] YYYY-MM-DD
 * @property {boolean} isActive
 * @property {string} [notes]
 * @property {string} createdAt
 * @property {string} updatedAt
 */

export {};
