# PicoExpense data model

IndexedDB name: **PicoPersonalFinance**. Schema version: `DB_VERSION` (`js/core/constants.js`). Migrations run in `js/db/schema.js` and never drop the database.

Amounts are **integer minor units** (e.g. AED 123.45 → `12345`) plus ISO currency code. Precision is per-currency (`js/utils/money.js`).

Transaction **date** is a calendar `YYYY-MM-DD` string (local financial date). `createdAt` / `updatedAt` are ISO timestamps. Dates are not stored as UTC midnight.

Soft delete: `transactions.deletedAt`. Trash restore clears it. Receipts are not auto-deleted with the transaction.

## Object stores

| Store | Key | Indexes | Purpose |
|-------|-----|---------|---------|
| transactions | id | date, accountId, categoryId, merchantId, type, deletedAt, personId, updatedAt | Financial events |
| transactionSplits | id | transactionId | Split lines; sum must equal parent `amountMinor` |
| accounts | id | type, active | Bank/cash/card/etc. No credentials. |
| categories | id | parentId, sortOrder, kind | Hierarchy; `kind` expense/income/transfer |
| merchants | id | normalizedName | Master + default category |
| tags | id | name | Independent of categories |
| people | id | — | Optional assignment |
| budgets | id | period, categoryId | Monthly/annual, optional category |
| goals | id | — | Target vs current (manual progress) |
| attachments | id | transactionId | Receipt metadata |
| receipts | id | transactionId | Blob + thumbnail |
| currencies | code | — | Precision metadata |
| exchangeRates | id | pairDate [from,to,date] | Manual FX |
| categorizationRules | id | priority | Local merchant→category rules |
| savedFilters | id | — | Saved report filters |
| auditLog | id | createdAt, entityId | Created/modified/deleted/restored/imported |
| activityLog | id | createdAt | Sync/backup activity |
| settings | key | — | `{ key, value }` |
| metadata | key | — | App metadata |

Investments and recurring transactions are **not** stored in this version. Add new stores in a future `DB_VERSION` bump.

## Transaction types

`EXPENSE` `INCOME` `TRANSFER` `REFUND` `REIMBURSEMENT` `ADJUSTMENT` `CASH_WITHDRAWAL` `CASH_DEPOSIT` `CREDIT_CARD_PAYMENT`

- Transfers, cash movement, and credit-card **payments** are not income/expense.
- Credit-card **purchase** is `EXPENSE` on the card account.
- Refunds reduce expense totals.

## Multi-currency

Each txn keeps original `amountMinor` + `currency`. Reporting uses `baseAmountMinor` / `baseCurrency` when a rate exists. Missing rates mark reports **incomplete** rather than inventing a rate.

## Relationships

- Transaction → account, optional transferAccount, category/subcategory, merchant, person, tagIds[], attachmentIds[]
- Split → transaction, category
- Receipt → optional transactionId
