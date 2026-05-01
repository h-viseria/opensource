# Browser Accounting System

A web-based accounting system built with pure HTML and JavaScript.

- No backend services
- No external database
- Data stored in browser IndexedDB
- Double-entry style transaction handling
- Account hierarchy and per-account ledger with running balance

## Features

- Upload Chart of Accounts CSV
- Upload Transactions CSV
- Upload GNUCash Transaction Export CSV (inside `Import / Backup` -> `Upload Transactions`)
- Upload HDFC statement CSV/TSV (inside `Import / Backup` -> `Upload Transactions` section)
- Import mode per upload: `Clean / Full Reload` or `Append / Merge`
- Store and query data from IndexedDB
- View account hierarchy with aggregated balances
- Click any account to open ledger details
- Filter ledger by date range and counterpart account
- Reports tab with Trial Balance, P & L, Asset Classification, Balance Sheet, Income Statement, Asset Pie Chart
- Reports tab supports multi-account selector (tree with checkboxes) and hierarchy level filter (Top / Top+1 / Top+2 / ...)
- Global Financial Year filter (01-Apr to 31-Mar)
- Download complete General Ledger for all accounts in PDF and XLS format
- Export/restore backup as JSON
- Header-driven import: column order does not matter and extra columns are ignored (required columns must exist)

## Required CSV Headers

### 1) Chart of Accounts CSV

```text
Opening Date,Account Name,Description,Account ShortCode,Full Account Name,Account Type,Opening Balance
```

- `Account Type` canonical values: `Asset`, `Liability`, `Equity`, `Income`, `Expense`
- Expanded labels are also accepted and auto-mapped, e.g. `CASH / BANK` -> `Asset`, `CREDIT (Card)` -> `Liability`
- `Full Account Name` should be colon-separated from top level (example: `Assets:Current Assets:Mutual Funds:Master Share`)
- Date format: `dd-mmm-yyyy` (example: `20-Apr-2026`)
- `Account Type` is required in each row and drives debit/credit balance behavior

### 2) Transactions CSV

```text
Main Account,Transaction Date,Value Date,Description,Comments1,Comments2,Deposit Amount,Withdrawal Amount,Target Account
```

- Date fields must be in `dd-mmm-yyyy` format
- Mirrored duplicates are auto-merged: if two opposite account entries balance each other out, they are treated as one transaction
- `Deposit Amount` and `Withdrawal Amount` are treated as absolute values (column decides direction)

### 3) HDFC Statement Import (Tab: `HDFC Import`)

Supported HDFC columns (order-independent, extra columns ignored):

```text
Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Account
```

Mapping to internal transaction fields:

- `Date` -> `Transaction Date`
- `Narration` -> `Description`
- `Chq./Ref.No.` -> `Comments1`
- `Value Dt` -> `Value Date`
- `Withdrawal Amt.` -> `Withdrawal Amount`
- `Deposit Amt.` -> `Deposit Amount`
- `Account` -> `Target Account` (expects colon-separated full account name)

Main account is not in HDFC file. Select it in the UI before upload.

Before data is written to IndexedDB, the app shows a preview table with row-level validation/errors and asks for confirmation. Only valid rows are imported on confirmation.

### 4) GNUCash Transaction Export Import

Supported GNUCash columns (order-independent, extra columns ignored):

```text
Date,Transaction Unique ID,Description,Notes,Memo,Full Account,Amount Num.
```

Mapping rules:

- `Date` -> `Transaction Date`
- `Description` -> `Description`
- `Notes` -> `Comments1`
- `Memo` -> `Comments2`
- `Full Account` -> account posting line (resolved via Full Account Name from COA)
- `Amount Num.` -> single signed amount column
  - Positive value => Deposit
  - Negative value => Withdrawal
- Date format accepted: `mm/dd/yyyy` or `mm/dd/yy` (also supports `yyyy-mm-dd` fallback)

Before data is written to IndexedDB, the app shows a preview table with row-level validation/errors and asks for confirmation.

Dual-entry behavior:

- Rows are grouped by `Transaction Unique ID`.
- Two accounting entries for the same ID are paired into one internal transaction.

## Double-Entry Rules Applied

Natural balances:

- Asset: Debit
- Liability: Credit
- Equity: Credit
- Income: Credit
- Expense: Debit

Expanded account categories (mapped to the same natural-balance behavior):

| Account Category | Sub-Types (Examples) | To INCREASE (+Balance) | To DECREASE (-Balance) |
|---|---|---|---|
| ASSET | Mutual Funds, Property, Gold | Debit | Credit |
| CASH / BANK | Savings A/c, Wallet, Digital Pay | Debit | Credit |
| LIABILITY | Home Loan, Personal Loan | Credit | Debit |
| CREDIT (Card) | Credit Card Outstanding | Credit | Debit |
| INCOME | Salary, Dividends, Bonus | Credit | Debit |
| EXPENSE | Rent, Food, Medical, Taxes | Debit | Credit |
| EQUITY | Net Worth, Opening Balances | Credit | Debit |

Notes:

- `CASH / BANK` is treated as Asset behavior (Debit-normal)
- `CREDIT (Card)` is treated as Liability behavior (Credit-normal)
- If type labels contain variants (like `Assets`, `Current Asset`, `Equity Opening`), the app still resolves the correct natural balance

Transaction behavior:

- Asset/Expense: Increase on Debit, Decrease on Credit
- Liability/Income/Equity: Increase on Credit, Decrease on Debit

## Financial Year Filter

- Financial Year runs from `01-Apr` to `31-Mar`
- A global selector is available below the top tabs
- Filter applies only to `Income` and `Expense` transactions/balances
- `Asset`, `Liability`, and `Equity` balances are not filtered by Financial Year

## Run Locally

Use a local static server (recommended for ES modules).

Important: do not open `index.html` directly with a `file://` URL. Modern browsers block module imports from file origin (`origin 'null'`) and you will see a CORS/module error.

### Option A: Python

```powershell
cd C:\Users\Hitesh.Viseria\IdeaProjects\TestProject\accounting-app
python -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

### Option B: package script

```powershell
cd C:\Users\Hitesh.Viseria\IdeaProjects\TestProject\accounting-app
npm run serve
```

### Option C: Node-only server (no Python required)

```powershell
cd C:\Users\Hitesh.Viseria\IdeaProjects\TestProject\accounting-app
npm run serve:node
```

## Smoke Test

```powershell
cd C:\Users\Hitesh.Viseria\IdeaProjects\TestProject\accounting-app
npm run test
```

## Notes

- IndexedDB data is browser-local and persists across refresh/restart.
- Use **Export JSON Backup** before clearing browser data.

