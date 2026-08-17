# PicoExpense user manual

PicoExpense (Pico Personal Finance) is an offline personal money tracker. Data stays on **this device** in a browser database named `PicoPersonalFinance`. There is no account, no PicoExpense server, and no analytics.

Open the same guide inside the app: **App → User guide** (`#/guide`).

This version does **not** track investments or automatic recurring bills. Enter those by hand as ordinary transactions, or import them from CSV.

---

## Contents

1. [Getting started](#1-getting-started)
2. [Transactions](#2-transactions)
3. [Accounts and lists](#3-accounts-and-lists)
4. [Budgets and goals](#4-budgets-and-goals)
5. [Home and reports](#5-home-and-reports)
6. [Import, backup, Drive](#6-import-backup-drive)
7. [Settings and privacy](#7-settings-and-privacy)
8. [How-to recipes](#8-how-to-recipes)

---

## 1. Getting started

### What it is

PicoExpense runs entirely in your browser. After the first load it works offline (installable as an app). You own the files: download JSON backups anytime. Google Drive is optional.

It is **not** an accounting ERP. There are no journals or vouchers — only accounts, categories, and transactions.

### First-run setup

The first time you open the app you see a short setup screen.

1. Enter a name (for you, not a login).
2. Pick a **base currency** — the currency reports use. You can still record a transaction in another currency later.
3. Optionally set country/locale.
4. Create your first account (everyday bank, cash, or wallet) and an opening balance if you want the starting figure to be correct.
5. Tap **Start**.

**Skip for now** still lets you use the app; add an account before you save a transaction.

**Use sample data** loads labelled SAMPLE accounts and transactions so you can click around. Remove them later under Settings.

### Finding your way around

- **Desktop:** the left sidebar is grouped. Home sits at the top. Click a group name (Activity, Reports, Plan, Lists, Data, App) to expand or collapse it. Open groups are remembered on this browser.
- **Phone:** five buttons along the bottom — Home, Activity (transactions), **+** (add), Reports, More. More lists the remaining screens in the same groups.
- The top bar has Search, the command palette (⌘K / Ctrl+K), Drive, and **Add transaction**.
- A PicoScan button may float on screen for receipt scanning. Drag it if it covers something.

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| `N` | New transaction (when you are not typing in a field) |
| `/` | Search merchants, notes, and amounts |
| `Ctrl+K` or `⌘K` | Command palette |
| `Ctrl+Enter` | Save on the add/edit form |
| `Esc` | Close search or the command palette |

### Install as an app

In Chrome or Edge, use Install / Add to Home screen. On iPhone, Share → Add to Home Screen.

Once installed, the app opens full-screen and keeps a local cache. Google Drive sign-in still needs a network connection; everything else works offline.

Each **browser profile** has its own database. Chrome on this PC is not the same store as Safari on your phone until you restore a backup.

---

## 2. Transactions

### The Transactions screen

This screen is for **looking at** activity already saved. It is not the form for creating an entry.

- By default you see the **latest 10**, newest first.
- Tap a row to open and edit it.
- **Show older** loads the next 10. **Newer** goes back.
- **Add transaction** (top of the page or top bar) opens a blank form.

**Narrow this list** is a collapsed filter panel. Dates there are *filters*, not the date of a new expense:

- **From date** — include transactions on or after this day.
- **To date** — include transactions on or before this day.
- Account, category, type, and text search further limit the list.

Leave dates empty to keep showing the latest activity. Apply filters, or Clear filters to return to the last 10.

### How to add an expense

1. Click **Add transaction** (or press `N`).
2. Leave type on **Expense** — money you spent.
3. **Date of this transaction** is the calendar day the money moved, not “today” unless it happened today.
4. **Amount** is how much, in the account’s currency.
5. **Account** is the wallet, bank, or card it came from.
6. **Category** is what it was for (Groceries, Fuel, …). Required for expenses so reports work.
7. Save. **Save & another** keeps the form open for the next one.

Optional details (merchant, notes, tags, receipt, splits) sit under **Optional details**.

### How to add income

1. Add transaction, then tap **Income**.
2. Date = payday. Amount = what landed. Account = the account that received it.
3. Category under Income (Salary, Bonus, Interest, …).

Refunds of spending are usually a **Refund** (they reduce expense totals), not income. Use Income for money you earned or received as income.

### How to move money between your accounts

A transfer is **not spending** and **not income**. It only moves money you already have.

1. Add transaction → **Transfer**.
2. Account = where it left. To account = where it arrived.
3. Save. Reports will not treat this as an expense.

Use this for bank → savings, wallet top-ups from a bank, and similar.

### Credit cards: purchase vs payment

Create a Credit card account (with optional credit limit and payment due day). Then:

- **Buying something** — Expense, account = the card. That is real spending. Outstanding balance goes up.
- **Paying the card bill** — not an expense. Use a transfer from your bank to the card. Outstanding goes down. If you also booked the same payment as an Expense you would double-count.

The Accounts screen shows outstanding, available credit, and utilisation for cards.

### Edit, duplicate, delete, trash

- Open a row to edit. Save writes over the same entry.
- The duplicate button copies the transaction so you can change the date or amount.
- Delete moves it to **Trash** (soft delete). Restore from Trash, or delete forever.
- Empty trash is permanent. Receipt files are not automatically removed with the transaction.

### Splits, tags, people, receipts

Under Optional details:

- **Splits** — break one payment across categories (e.g. groceries + household on one receipt). Amounts must add up to the total.
- **Merchant** — store or payee; also used by categorisation rules.
- **Person** — who it was for or with.
- **Tags** — extra labels (Vacation, Tax) independent of category.
- **Reimbursable / tax** checkboxes flag the row for later reports.
- **Receipt** — attach a photo or PDF to this entry.

### How to scan a receipt

OCR uses **PicoScan** on this same origin. Nothing is saved as a transaction until you confirm.

1. Open Scan receipt from the command palette, or choose a file on that screen, or use the floating PicoScan button.
2. Check merchant, date, total, and currency. Fix anything the scan got wrong.
3. Save or Save & Edit — you still land on the transaction form to pick account and category, then save.
4. Cancel goes to a blank add form. Rescan picks another file.

If PicoScan is missing (the sibling `picoscan` app is not being served), you will see a notice and can type the expense manually. Serve the parent folder that contains both apps so the widget URL resolves.

---

## 3. Accounts and lists

### Accounts

An account is a place money lives: bank, savings, cash, wallet, debit or credit card, prepaid, or other asset/liability. PicoExpense never stores bank logins.

1. Accounts → Add account.
2. Name, type, currency, opening balance (what was already there before you started tracking).
3. Cards: optional credit limit and payment due day (1–31).

Balances = opening + inflows − outflows (liabilities shown as amounts you owe). Foreign-currency accounts need a manual FX rate in Settings before Home/Reports can convert them to the base currency.

### Categories

Setup seeds a tree (Housing, Food, Transport, Income, Transfer, …) with subcategories. Add your own with Add, or Sub on a parent.

Used categories are **archived**, not deleted, so old transactions keep their labels.

Expenses need a category. Transfers typically use a transfer category and are excluded from spending totals.

### Merchants, tags, people, rules

On Settings, under Masters:

- **Merchants** — payee names. Typing a merchant on a transaction can suggest a category.
- **Tags** — extra filters (Vacation, Business).
- **People** — assign a person to a transaction.
- **Rules** — if description/merchant contains a pattern (e.g. “carrefour”), suggest Groceries. Rules run locally; they never auto-save a transaction.

---

## 4. Budgets and goals

### Budgets

1. Add budget → name, Monthly or Annual, optional category (or Overall), amount in base currency.
2. The bar shows spent vs limit: normal, warning, or exceeded.
3. Home also shows budget bars for the current month.

Transfers and card *payments* do not eat an expense budget. Card *purchases* do.

### Goals

Savings targets such as an emergency fund. Progress is **manual** in this version — tap Update progress and enter the current amount. It is not auto-linked to an account balance.

Set a target amount and optional target date. Delete removes the goal only, not your transactions.

---

## 5. Home and reports

### Home (this month)

Month arrows change the month. You will see spent this month, income, net, savings rate, daily average, cash & banks, cash, card outstanding, and pending reimbursable amounts.

The category donut is clickable — it opens Transactions filtered to that category. Largest expense links to the row.

A yellow banner means some foreign amounts could not be converted. Add a rate under Settings.

### Reports, monthly, annual

- **Reports** — current-month snapshot plus a count of tax-flagged transactions.
- **Monthly** — income, expenses, net, savings rate, category mix, largest items, budget variance.
- **Annual** — year totals and a month-by-month income vs expense chart.

Income includes reimbursements. Expenses are purchases (not transfers). Refunds reduce expense totals.

### Foreign currency

Each transaction keeps its original amount and currency. Reports convert to the base currency only when a **manual** rate exists for that pair and date. There is no live FX download.

Rate format: units of quote per 1 unit of base (example: INR per 1 AED). Missing rates mark the report **incomplete** instead of guessing.

---

## 6. Import, backup, Drive

### How to import a bank CSV

1. Export CSV from your bank (date, amount, description at minimum).
2. Import CSV → choose the file.
3. Map each column: date, description, amount (or separate debit/credit), currency, account, merchant, category, notes, type — or ignore.
4. Pick a default account (and category if the file has none).
5. Preview. Possible duplicates are flagged; skip them by default.
6. Import. Fix any row errors shown in the banner.

Duplicates are detected locally against existing transactions. The wizard never talks to a bank API.

### How to back up

Backup & data shows counts, last backup/restore times, and storage used.

- **Download JSON backup** — canonical file (`*.exp.json`). Keep copies somewhere safe.
- **Encrypted backup** — same data, passphrase + AES-GCM. You must remember the passphrase; it cannot be recovered.
- **Export CSV** — transactions only, for spreadsheets.

Back up before you clear the browser, switch phones, or try a restore.

### Google Drive sync

Optional. The app uses a folder named **PicoExpenseBackup** and a file `PicoExpense_sync.exp.zip` inside the Drive folder you pick. Day-to-day tracking still works fully offline.

1. Tap Drive in the top bar, or Google Drive sync on Backup. Sign in and pick a folder.
2. If that folder already has a backup: **Use this backup** replaces local data; **Overwrite** replaces the Drive file with this browser; **Change folder** picks another place.
3. Later, Drive compares timestamps. You choose upload (this browser → Drive) or download (Drive → this browser). Same timestamps = nothing to do.

Change Drive folder or Disconnect from Backup. If Drive APIs are not configured, you get a download plus a tab to upload the zip by hand.

### How to restore or merge

1. On Backup, choose a `.json`, `.zip`, or encrypted file. Enter the passphrase if asked.
2. **Replace all** wipes local PicoExpense data and loads the file.
3. If you cancel that, you can **Merge** — keep existing rows; add records whose IDs are missing locally.

Restore from Drive uses the synced zip, or lets you pick another Drive file.

**Delete all data** erases the local database on this device. It does not delete your Drive file unless you overwrite it afterwards.

---

## 7. Settings and privacy

### Settings

- Profile name, base currency, theme (light / dark / system), date format.
- Default account and category for new transactions.
- Large text, high contrast, reduced motion.
- Manual exchange rates.
- Load or remove sample data (SAMPLE-labelled).
- Audit log of created/modified/deleted/imported rows on this device.

### Privacy

Data stays in IndexedDB on this device. No PicoExpense login. OCR runs locally via PicoScan. Drive, if you use it, sends backup files only to *your* Google account.

Clearing site data in the browser deletes the local database. That is why backups matter.

### Not in this version

- Investments and portfolio tracking
- Automatic recurring transactions / bill reminders
- Live bank feeds or paid FX APIs
- Multi-user cloud accounts

Enter a repeating bill each time it posts, or import it from CSV.

---

## 8. How-to recipes

### Record a grocery trip

1. Add transaction → Expense.
2. Date on the receipt. Amount = total paid.
3. Account = the card or cash you used.
4. Category = Food / Groceries (or split if the receipt mixed household items).
5. Optional: merchant = the store; attach the receipt photo.
6. Save.

### Record salary

1. Add transaction → Income.
2. Date = payday. Amount = net credit. Account = the bank that received it.
3. Category = Income / Salary.
4. Save. Home income and savings rate will include it for that month.

### Pay a credit card from the bank

1. Add transaction → Transfer.
2. Account = bank. To account = the credit card.
3. Amount = what you paid. Date = payment date.
4. Save. Card outstanding drops; this is not a new expense (the expenses were the purchases).

### Split one receipt across categories

1. Add the expense with the *full* amount.
2. Open Optional details → Add split. One row per category and amount.
3. The split amounts must add up to the total or Save will refuse.

### Withdraw cash from an ATM

Create a Cash account if you do not have one. Then Transfer: from bank (or debit card account) to Cash. That is not an expense. Spending the cash later is a separate Expense on the Cash account.

### Spend while travelling

1. Add an account in that currency, or book the transaction in the foreign currency on an existing account.
2. On the form, set Currency and, if you know it, the FX rate into your base currency.
3. If reports show Incomplete, Settings → Add rate for that date and pair.

### Mark something as reimbursable

On the expense, Optional details → Reimbursable. Home shows pending reimbursement. When the money comes back, add Income or a Reimbursement-type entry (or a refund) so you are not still “out of pocket” in reports.

### Move to a new phone or browser

1. On the old device: Backup → Download JSON (or Encrypted, or Drive upload).
2. Copy the file to the new device (or connect the same Drive folder).
3. Open PicoExpense on the new device, finish setup (or skip), then Backup → restore the file → Replace all (or Use this backup on Drive).

Do not rely on “the cloud” unless you actually connected Drive or copied the JSON. Clearing site data on a device wipes that copy.
