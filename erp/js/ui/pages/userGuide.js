/**
 * In-app user guide — how to use each PicoERP screen.
 */

import { APP_NAME } from '../../core/constants.js';
import { escapeHtml } from '../modal.js';

/**
 * @typedef {{ id: string, title: string, path?: string, body: string }} GuideSection
 */

/** @type {{ id: string, title: string, sections: GuideSection[] }[]} */
const CHAPTERS = [
  {
    id: 'getting-started',
    title: 'Getting started',
    sections: [
      {
        id: 'overview',
        title: 'What PicoERP is',
        body: `
          <p>${escapeHtml(APP_NAME)} is an <strong>offline-first</strong> double-entry accounting ERP that runs entirely in your browser.
          Books, vouchers, inventory, tax, and reports are stored in IndexedDB on this device — no server is required for day-to-day use.</p>
          <ul>
            <li>Use the <strong>left sidebar</strong> to move between hubs (Masters, Transactions, Invoices, Inventory, Tax, Finance, People, Payroll, Reports).</li>
            <li>Hubs with a chevron expand to show child screens.</li>
            <li>The top bar shows the <strong>active book</strong> and financial year. Switch books anytime from the book control or <a href="#/books">Manage books</a>.</li>
            <li>Screens marked “needs a book” require an active book; open one from Portfolio or Books first.</li>
          </ul>`,
      },
      {
        id: 'books',
        title: 'Manage books',
        path: '/books',
        body: `
          <p>A <strong>book</strong> is one company, shop, society, or personal set of accounts. Each book has its own chart, vouchers, inventory, and tax.</p>
          <h4>Create a book</h4>
          <ol>
            <li>Enter a book name.</li>
            <li>Choose a <strong>Chart template</strong> (Housing society, Textile shop, Electronics, Grocery, Personal finance, Restaurant, Pharmacy, Freelancer, or General business).</li>
            <li>Set currency and financial-year start month.</li>
            <li>Create — ${escapeHtml(APP_NAME)} seeds the chart of accounts and, for shop templates, catalogue types / units / categories.</li>
          </ol>
          <h4>Open, edit, delete</h4>
          <ul>
            <li><strong>Open</strong> makes that book active and takes you to the book dashboard.</li>
            <li><strong>Edit</strong> updates name, legal name, currency, and country.</li>
            <li><strong>Delete</strong> permanently removes the book and all of its data from this browser.</li>
          </ul>
          <p>You can also import books from CSV using the import panel on this page.</p>`,
      },
      {
        id: 'portfolio',
        title: 'Portfolio',
        path: '/portfolio',
        body: `
          <p>Cross-book overview: lists every book with a short snapshot so you can open the right one.
          Use this when you maintain several companies or personal + business books.</p>`,
      },
      {
        id: 'dashboard',
        title: 'Book dashboard',
        path: '/dashboard',
        body: `
          <p>Home screen for the <strong>active book</strong>. Shows session context (book + FY), quick stats, and shortcuts into Masters, Transactions, Inventory, Tax, Finance, and Reports.</p>
          <p>Start here after opening a book to jump to daily work.</p>`,
      },
    ],
  },
  {
    id: 'masters',
    title: 'Masters (Chart of Accounts)',
    sections: [
      {
        id: 'masters-hub',
        title: 'Masters hub',
        path: '/masters',
        body: `
          <p>Entry point for the accounting structure: Chart of Accounts, ledger groups, ledgers, and GNUCash import/export.</p>`,
      },
      {
        id: 'chart',
        title: 'Chart of Accounts',
        path: '/masters/chart',
        body: `
          <p>Tree view of primary groups (Assets, Liabilities, Equity, Income, Expense), sub-groups, and ledgers.</p>
          <ul>
            <li>Expand/collapse branches to explore the hierarchy.</li>
            <li>If the chart is empty, use <strong>Load default chart</strong> (or create a new book with a template).</li>
            <li>CSV import can load a full chart (groups + ledgers) from a template file.</li>
          </ul>
          <p>All reports and vouchers post to these ledgers — keep names clear and avoid deleting system ledgers used by inventory/tax.</p>`,
      },
      {
        id: 'groups',
        title: 'Ledger groups',
        path: '/masters/groups',
        body: `
          <p>Create and edit <strong>groups</strong> under each nature (Asset, Liability, Equity, Income, Expense).</p>
          <ul>
            <li>Primary groups are the five natures; child groups nest under them.</li>
            <li>Assign a parent group, optional code, and sort order.</li>
            <li>Delete only unused groups (no ledgers / children depending on validation).</li>
          </ul>`,
      },
      {
        id: 'ledgers',
        title: 'Ledgers',
        path: '/masters/ledgers',
        body: `
          <p>Individual accounts that receive voucher lines (e.g. Cash in Hand, Sales, Rent Expense).</p>
          <ul>
            <li>Pick a parent <strong>group</strong>, name, optional code, and opening balance / type.</li>
            <li>Opening balances feed Trial Balance, Balance Sheet, and ledger statements.</li>
            <li>Deactivate instead of deleting if the ledger already has history.</li>
          </ul>`,
      },
      {
        id: 'gnucash',
        title: 'GNUCash Import / Export',
        path: '/masters/gnucash-import',
        body: `
          <p>Round-trip with GNUCash CSV exports.</p>
          <ol>
            <li>Import <strong>accounts</strong> first (builds groups and ledgers from Full Account Name paths).
              Choose <strong>Merge</strong> to keep the existing chart and add/reuse matching paths, or
              <strong>Replace</strong> to delete the current chart and import only the CSV
              (blocked if vouchers already exist).</li>
            <li>Account type column may be labeled <span class="mono">Account Type</span> or
              <span class="mono">Type</span>.</li>
            <li>Then import <strong>transactions</strong> (creates balanced vouchers mapped to those ledgers).</li>
            <li>Export from ${escapeHtml(APP_NAME)} when you need CSV back out for GNUCash or archive.</li>
          </ol>
          <p>Follow on-screen column hints; mismatches usually mean an account path that was not imported yet.</p>`,
      },
    ],
  },
  {
    id: 'transactions',
    title: 'Transactions (vouchers)',
    sections: [
      {
        id: 'txn-hub',
        title: 'Transactions hub',
        path: '/transactions',
        body: `
          <p>Shortcuts to create common voucher types and open the full voucher list.
          Every voucher is a balanced double-entry document (total debits = total credits).</p>`,
      },
      {
        id: 'voucher-list',
        title: 'All vouchers',
        path: '/transactions/list',
        body: `
          <p>Searchable, filterable list of vouchers for the active book.</p>
          <ul>
            <li>Filter by type, date range, or text.</li>
            <li>Open a row to view or edit lines.</li>
            <li>Pagination appears when there are many vouchers.</li>
          </ul>`,
      },
      {
        id: 'voucher-new',
        title: 'New / edit voucher',
        path: '/transactions/new/Journal',
        body: `
          <p>Enter date, voucher type (Journal, Payment, Receipt, Contra, Sales, Purchase, etc.), narration, and line items.</p>
          <ol>
            <li>Each line: ledger + debit or credit amount (and optional narration / tax tags where applicable).</li>
            <li>The form shows running totals — you cannot save an unbalanced voucher.</li>
            <li>Saving posts to the ledger balances used by all reports.</li>
          </ol>
          <p>Prefer <strong>Invoices</strong> for stock+tax sales/purchases; use vouchers for adjustments, payments, receipts, and journals.</p>`,
      },
    ],
  },
  {
    id: 'invoices',
    title: 'Invoices',
    sections: [
      {
        id: 'inv-list',
        title: 'All invoices',
        path: '/invoices',
        body: `
          <p>Lists Sales, Purchase, Credit Notes, and Debit Notes for the active book. Filter by type, open one for print/PDF, returns, cancel, or delete.</p>`,
      },
      {
        id: 'inv-sales',
        title: 'New sales invoice',
        path: '/invoices/new/Sales',
        body: `
          <p>Creates a customer invoice that:</p>
          <ul>
            <li>Debits the customer (receivable) ledger</li>
            <li>Credits Sales (+ output tax if selected)</li>
            <li>Reduces stock and posts COGS when items are inventory items</li>
          </ul>
          <ol>
            <li>Set invoice number, date, customer ledger, sales ledger, and warehouse.</li>
            <li>Optionally filter line items by <strong>catalogue</strong> type, then pick SKUs, qty, rate, and tax code.</li>
            <li>Review subtotal / tax / total, then <strong>Post invoice</strong>.</li>
          </ol>`,
      },
      {
        id: 'inv-purchase',
        title: 'New purchase invoice',
        path: '/invoices/new/Purchase',
        body: `
          <p>Creates a supplier bill that credits the payable ledger, debits Stock (+ input tax), and increases inventory quantities.</p>
          <p>Same line workflow as sales: item, quantity, rate, tax. Use purchase rates from the item master when available.</p>`,
      },
      {
        id: 'inv-return',
        title: 'Return / reject items',
        path: '/invoices',
        body: `
          <p>From a posted Sales or Purchase invoice, use <strong>Return / reject</strong> to post a linked note:</p>
          <ul>
            <li><strong>Credit Note</strong> — customer returns / rejected sold goods (restocks inventory, reverses sales + output tax + COGS)</li>
            <li><strong>Debit Note</strong> — purchase returns to supplier (reduces stock, reverses payable + input tax)</li>
          </ul>
          <p>Enter a quantity per line (0 to skip). Partial returns are supported; remaining quantities stay returnable. Status becomes <em>Partially returned</em> until everything is returned.</p>`,
      },
      {
        id: 'inv-cancel',
        title: 'Cancel invoice',
        path: '/invoices',
        body: `
          <p><strong>Cancel invoice</strong> returns all remaining quantities in one step (full credit or debit note) and marks the invoice <em>Cancelled</em>.</p>
          <p>Prefer cancel/return over delete when you need an audit trail. Delete is for mistakes and is blocked if credit/debit notes already exist — delete those notes first.</p>`,
      },
      {
        id: 'inv-detail',
        title: 'Invoice detail',
        path: '/invoices',
        body: `
          <p>After posting, open an invoice to:</p>
          <ul>
            <li>Review lines, returned quantities, and linked voucher</li>
            <li>Open related credit/debit notes</li>
            <li><strong>Print / PDF</strong> via the in-app preview</li>
            <li><strong>Fill Word/ODT template</strong> if you uploaded a template with placeholders</li>
            <li><strong>Return / reject</strong> or <strong>Cancel invoice</strong> when applicable</li>
          </ul>`,
      },
      {
        id: 'inv-templates',
        title: 'Invoice templates',
        path: '/invoices/templates',
        body: `
          <p>Upload <code>.docx</code> or <code>.odt</code> files containing placeholders such as <code>{{invoice_number}}</code>, <code>{{party_name}}</code>, line tables, etc.</p>
          <ul>
            <li>Download the sample shop template to see supported tokens.</li>
            <li>Keep each <code>{{…}}</code> token unbroken (do not split across bold/italic runs).</li>
            <li>Mark a template as default for one-click fill from invoice detail.</li>
          </ul>`,
      },
    ],
  },
  {
    id: 'inventory',
    title: 'Inventory',
    sections: [
      {
        id: 'inv-hub',
        title: 'Inventory hub',
        path: '/inventory',
        body: `
          <p>Masters and stock entry points: catalogue, items, movements, units, warehouses, categories.
          Valuation uses <strong>weighted average</strong> cost.</p>`,
      },
      {
        id: 'catalogue',
        title: 'Catalogue',
        path: '/inventory/catalogue',
        body: `
          <p>Item-type masters that define attributes (Brand, Name, Type, Size, plus optional extras like Colour).</p>
          <ol>
            <li>Create a catalogue type for each kind of product (e.g. Apparel, Fabric, Device).</li>
            <li>Add optional attributes with free text or pick-lists.</li>
            <li>When creating an <strong>Item</strong>, choose a type and fill attributes — the SKU display name is built automatically.</li>
          </ol>`,
      },
      {
        id: 'items',
        title: 'Items',
        path: '/inventory/items',
        body: `
          <p>Stock SKUs linked to a unit, optional category, sale/purchase rates, and catalogue attributes.</p>
          <ul>
            <li>Filter by catalogue type or search by name/code/attributes.</li>
            <li>Active items appear on invoice line pickers.</li>
            <li>Opening stock is usually posted via a stock movement (Opening), not only on the item form.</li>
          </ul>`,
      },
      {
        id: 'movements',
        title: 'Stock movements',
        path: '/inventory/movements',
        body: `
          <p>List of inventory transactions (Opening, Purchase, Sale, Adjustment, etc.).
          Sales/Purchase invoices create movements automatically; use this screen for openings and adjustments.</p>
          <p><a href="#/inventory/movements/new">New stock movement</a> — choose type, item, warehouse, qty, and rate/value as required. Adjustments may post a GL voucher to Stock Adjustment.</p>`,
      },
      {
        id: 'units',
        title: 'Units',
        path: '/inventory/units',
        body: `
          <p>Units of measure (Nos, Kg, L, m, …). Seeded from the book template; add more as needed before creating items.</p>`,
      },
      {
        id: 'warehouses',
        title: 'Warehouses',
        path: '/inventory/warehouses',
        body: `
          <p>Stock locations. One warehouse can be marked default for invoices and movements.</p>`,
      },
      {
        id: 'categories',
        title: 'Item categories',
        path: '/inventory/categories',
        body: `
          <p>Optional grouping for items (e.g. Raw Material, Finished Goods, Fresh). Used for filtering and reporting organisation.</p>`,
      },
    ],
  },
  {
    id: 'tax',
    title: 'Tax',
    sections: [
      {
        id: 'tax-hub',
        title: 'Tax hub',
        path: '/tax',
        body: `
          <p>Tax masters and links to tax reports. New books seed common GST/VAT-style codes and Input / Output / Tax Payable ledgers.</p>`,
      },
      {
        id: 'tax-codes',
        title: 'Tax codes',
        path: '/tax/codes',
        body: `
          <p>Define rate (%), component (Input vs Output), and linked tax ledger.</p>
          <ul>
            <li>Attach codes on invoice lines or voucher lines to drive tax amounts and reports.</li>
            <li>System codes can usually be deactivated rather than deleted if already used.</li>
          </ul>`,
      },
      {
        id: 'tax-summary',
        title: 'Tax summary',
        path: '/reports/tax-summary',
        body: `<p>Period totals of tax by code/component for the active book. Use for filing prep and reconciling output vs input.</p>`,
      },
      {
        id: 'tax-ledger',
        title: 'Tax ledger',
        path: '/reports/tax-ledger',
        body: `<p>Line-level tax-tagged entries in a date range — drill into what posted to tax.</p>`,
      },
      {
        id: 'tax-payable',
        title: 'Tax payable',
        path: '/reports/tax-payable',
        body: `<p>Net position: Output − Input for the selected period (amount due or refundable).</p>`,
      },
    ],
  },
  {
    id: 'finance',
    title: 'Personal finance',
    sections: [
      {
        id: 'finance-hub',
        title: 'Personal finance hub',
        path: '/finance',
        body: `
          <p>Budgets, goals, and personal reports driven from the same double-entry ledgers
          (works especially well with the <strong>Personal finance</strong> book template).</p>`,
      },
      {
        id: 'budgets',
        title: 'Budgets',
        path: '/finance/budgets',
        body: `
          <p>Set monthly (or period) budget amounts against expense/income ledgers.
          Compare later on the Budget variance report.</p>`,
      },
      {
        id: 'goals',
        title: 'Goals',
        path: '/finance/goals',
        body: `
          <p>Savings or net-worth targets linked to asset ledgers. Track progress toward a target amount by a target date.</p>`,
      },
      {
        id: 'net-worth',
        title: 'Net worth',
        path: '/reports/net-worth',
        body: `<p>Assets − Liabilities as of a date, using live ledger balances. Useful for personal books and society corpus checks.</p>`,
      },
      {
        id: 'budget-variance',
        title: 'Budget variance',
        path: '/reports/budget-variance',
        body: `<p>Budgeted vs actual by ledger for a period, with variance amounts to spot overspend.</p>`,
      },
    ],
  },
  {
    id: 'people',
    title: 'People',
    sections: [
      {
        id: 'people-hub',
        title: 'People hub',
        path: '/people',
        body: `
          <p>Offline employees, attendance, and leave for the active book.
          Configure custom fields, working days, attendance statuses, and leave types under
          <strong>Settings</strong>. Use the <strong>Payroll</strong> hub for salary and payslips.</p>`,
      },
      {
        id: 'employees',
        title: 'Employees',
        path: '/people/employees',
        body: `
          <p>Employee master with auto <span class="mono">EMP-####</span> IDs (overridable),
          optional contact and job fields, custom fields, and local document uploads.
          Deactivate instead of deleting when attendance or leave history exists.
          Open an employee’s <strong>Salary structure</strong> from their profile.</p>`,
      },
      {
        id: 'attendance',
        title: 'Attendance',
        path: '/people/attendance',
        body: `
          <p>Daily status grid, monthly code grid, and exportable monthly summary.
          Optional check-in/out and overtime hours when enabled in attendance settings.
          Payroll pulls present days, leave, unpaid leave, and OT from these records.</p>`,
      },
      {
        id: 'leave',
        title: 'Leave',
        path: '/people/leave',
        body: `
          <p>Record leave by type; day counts follow configured working days (editable).
          Leave can sync into attendance as the Leave status. Unpaid leave feeds payroll deductions.</p>`,
      },
    ],
  },
  {
    id: 'payroll',
    title: 'Payroll',
    sections: [
      {
        id: 'payroll-hub',
        title: 'Payroll hub',
        path: '/payroll',
        body: `
          <p>Offline salary calculation for the active book. After finalize you can
          <strong>Post to Accounting</strong> using mapped COA groups, then pay net salaries
          with the existing Payment voucher flow.</p>`,
      },
      {
        id: 'salary-setup',
        title: 'Salary setup',
        path: '/payroll/setup',
        body: `
          <p>Configure earnings and deductions (fixed, percentage, attendance-based, hours-based, manual).
          Set daily/hourly rate methods used for unpaid leave and overtime.
          Each head has an <strong>accounting class</strong> (Salary / Deduction / Tax) used when posting.</p>`,
      },
      {
        id: 'salary-structures',
        title: 'Salary structures',
        path: '/payroll/structures',
        body: `
          <p>Assign heads to each employee with an <strong>effective from</strong> date.
          Changes add history rows instead of overwriting past amounts.</p>`,
      },
      {
        id: 'payroll-runs',
        title: 'Payroll runs',
        path: '/payroll/runs',
        body: `
          <p>Create a monthly draft, <strong>Calculate</strong> (pulls attendance/leave/OT),
          review employee lines and adjustments, then <strong>Finalize</strong> to lock the run.
          After finalize, use <strong>Post to Accounting</strong> (requires account mapping),
          then <strong>Pay payroll</strong> to clear net pay via a Payment voucher.
          Payslips open per employee; use Print → Save as PDF.</p>`,
      },
      {
        id: 'payroll-accounts',
        title: 'Payroll account mapping',
        path: '/settings/payroll-accounts',
        body: `
          <p>Map three Chart of Accounts <strong>groups</strong>: Salary (expense), Deductions (liability),
          and Tax (liability). Select existing groups or create new ones under a parent you choose.
          Posting creates one Journal: Dr employee Salary ledgers, Cr deduction/tax head ledgers,
          Cr employee Payable. Use existing General Ledger reports to review totals — no parallel books.</p>`,
      },
      {
        id: 'payroll-reports',
        title: 'Payroll reports',
        path: '/payroll/reports',
        body: `
          <p>Payroll summary, employee salary register, salary-head totals, and history —
          with CSV and PDF export like other PicoERP reports.</p>`,
      },
    ],
  },
  {
    id: 'reports',
    title: 'Reports',
    sections: [
      {
        id: 'reports-hub',
        title: 'Reports hub',
        path: '/reports',
        body: `
          <p>All financial and stock reports for the <strong>active book only</strong>.
          Most screens support date / FY filters and <strong>CSV</strong> / <strong>PDF (print preview)</strong> export.</p>`,
      },
      {
        id: 'trial-balance',
        title: 'Trial Balance',
        path: '/reports/trial-balance',
        body: `<p>Hierarchical debits and credits by group/ledger as of a date. Confirms the books are in balance.</p>`,
      },
      {
        id: 'profit-loss',
        title: 'Profit & Loss',
        path: '/reports/profit-loss',
        body: `<p>Income and expense for a period, with group subtotals and net profit/loss.</p>`,
      },
      {
        id: 'balance-sheet',
        title: 'Balance Sheet',
        path: '/reports/balance-sheet',
        body: `<p>Assets, liabilities, and equity as of a date. Current-period P&amp;L is reflected in equity when not separately closed.</p>`,
      },
      {
        id: 'ledger-report',
        title: 'Ledger',
        path: '/reports/ledger',
        body: `<p>Statement for one ledger: opening, period lines, running balance, closing.</p>`,
      },
      {
        id: 'ledger-detail',
        title: 'Ledger detail',
        path: '/reports/ledger-detail',
        body: `
          <p>Like Ledger, but each line also shows the <strong>target (contra) account path</strong>
          (e.g. who was paid or which income was credited). Use colon-style paths for nested groups.</p>`,
      },
      {
        id: 'accounts-summary',
        title: 'Accounts Summary',
        path: '/reports/accounts-summary',
        body: `
          <p>For a selected ledger, aggregates debits/credits by opposite account, with grouping levels 1–6 on the target path.
          Useful for “where did Cash go?” style analysis.</p>`,
      },
      {
        id: 'day-book',
        title: 'Day Book',
        path: '/reports/day-book',
        body: `<p>All vouchers in a date range with their lines — daily audit trail.</p>`,
      },
      {
        id: 'cash-flow',
        title: 'Cash Flow',
        path: '/reports/cash-flow',
        body: `<p>Inflows and outflows through cash/bank-style accounts for a period.</p>`,
      },
      {
        id: 'stock-summary',
        title: 'Stock Summary',
        path: '/reports/stock-summary',
        body: `<p>Quantity on hand, weighted-average rate, and stock value by item (and warehouse filters where offered).</p>`,
      },
    ],
  },
  {
    id: 'bulk-load',
    title: 'Bulk Load',
    sections: [
      {
        id: 'bulk-load-hub',
        title: 'Bulk Load hub',
        path: '/bulk-load',
        body: `
          <p>Import many transactions from external files into the active book.
          Start with <a href="#/bulk-load/bank-statement">Bank Statement</a>.</p>`,
      },
      {
        id: 'bank-statement',
        title: 'Bank Statement',
        path: '/bulk-load/bank-statement',
        body: `
          <p>Skip top lines, then map each <span class="mono">Column N</span> from the grid dropdowns
          (Date, Amount <em>or</em> Deposit+Withdrawal, optional Target account, Details).
          No CSV header is required — leftover title/header/**** rows with blank or invalid dates
          appear under <strong>Ignored rows</strong> after validate.</p>
          <ul>
            <li>Preview every row; pick or correct the <strong>target ledger</strong> per line.</li>
            <li>CSV target labels are matched as full paths when they contain <code>:</code>
              (e.g. <code>Expenses:Office</code>), otherwise by ledger name; mappings are
              <strong>remembered</strong> for later imports.</li>
            <li>If 5 or more rows already look posted (same date, direction, amount on that bank ledger),
              you get a duplicate warning — you can skip those rows or import anyway.</li>
            <li>Confirmed rows post as <strong>Receipt</strong> (money in) or <strong>Payment</strong> (money out) vouchers.</li>
          </ul>`,
      },
    ],
  },
  {
    id: 'system',
    title: 'System',
    sections: [
      {
        id: 'settings',
        title: 'Settings',
        path: '/settings',
        body: `
          <h4>Backup</h4>
          <p>Download a full <code>.erp.json</code> backup (all books) or the active book only. Top-bar icons next to Active book also download a full backup or sync a compressed <code>.erp.zip</code> with Google Drive.</p>
          <h4>Restore</h4>
          <p>Choose a local <code>.json</code> / <code>.zip</code> file, or restore from Google Drive. Full backups replace all local data; book backups replace that book. Schema is validated first.</p>
          <h4>Google Drive</h4>
          <p>With Client ID / API key in <code>js/data/googleDriveConfig.js</code>, the Drive button asks you to pick a folder once.
          PicoERP looks for (or creates) a <code>PicoERPBackup</code> subfolder there and keeps <code>PicoERP_sync.erp.zip</code>
          there (includes a rolling activity log of the last 10 actions).
          If that file already exists when you connect or change folder, you are asked to
          <strong>Change folder</strong> (default), <strong>Use this backup</strong> (replace local data),
          or <strong>Overwrite</strong> the Drive file.
          The top-bar Drive icon, Settings → Sync now, and launch all <strong>compare</strong> local vs Drive timestamps first:
          if they match you get a toast; if they differ you choose
          <strong>Upload local → Drive</strong> or <strong>Download Drive → local</strong> (download replaces all local data).
          Under Settings → Google Drive sync you can choose auto sync from one schedule list
          (No Auto Backup, Once a day, Every 2/4/6/8 hours), and open
          <a href="#/settings/drive-activity">Compare activity logs</a> to review local vs Drive recent activity.</p>
          <p>Without those credentials, the Drive button still downloads a zip and opens Drive for a manual upload.</p>
          <h4>PWA / updates</h4>
          <p>Install ${escapeHtml(APP_NAME)} from the browser menu for offline use. Use <strong>Check for updates</strong> after a new version is deployed.</p>
          <h4>Danger zone</h4>
          <p>Resetting local data deletes IndexedDB for this origin. Export a backup first.</p>`,
      },
      {
        id: 'tips',
        title: 'Tips & good practice',
        body: `
          <ul>
            <li>Create a book with the closest <strong>industry template</strong>, then rename/add ledgers — faster than starting blank.</li>
            <li>Post daily work via <strong>invoices</strong> (stock/tax) or <strong>vouchers</strong> (payments/journals); avoid duplicate posting.</li>
            <li>Run <strong>Trial Balance</strong> after large imports to confirm balance.</li>
            <li>Back up before major imports, restores, or clearing data.</li>
            <li>Data stays on this device/browser profile — clearing site data wipes books unless you restore a backup.</li>
          </ul>`,
      },
    ],
  },
];

/**
 * @param {import('../../core/router.js').RouteContext} ctx
 * @param {HTMLElement} outlet
 */
export async function renderUserGuide(ctx, outlet) {
  const toc = CHAPTERS.map((ch) => {
    const links = ch.sections
      .map(
        (s) =>
          `<li><a href="#guide-${escapeHtml(s.id)}" data-guide-jump="${escapeHtml(s.id)}">${escapeHtml(s.title)}</a></li>`
      )
      .join('');
    return `
      <div class="user-guide__toc-group">
        <a class="user-guide__toc-chapter" href="#guide-ch-${escapeHtml(ch.id)}" data-guide-jump-ch="${escapeHtml(ch.id)}">${escapeHtml(ch.title)}</a>
        <ul>${links}</ul>
      </div>`;
  }).join('');

  const body = CHAPTERS.map((ch) => {
    const sections = ch.sections
      .map((s) => {
        const openLink = s.path
          ? `<a class="btn btn--secondary btn--sm" href="#${escapeHtml(s.path)}">Open screen</a>`
          : '';
        return `
          <section class="user-guide__section" id="guide-${escapeHtml(s.id)}">
            <div class="user-guide__section-head">
              <h3 class="user-guide__section-title">${escapeHtml(s.title)}</h3>
              ${openLink}
            </div>
            <div class="user-guide__section-body">${s.body}</div>
          </section>`;
      })
      .join('');
    return `
      <div class="user-guide__chapter" id="guide-ch-${escapeHtml(ch.id)}">
        <h2 class="user-guide__chapter-title">${escapeHtml(ch.title)}</h2>
        ${sections}
      </div>`;
  }).join('');

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-header__title">User Guide</h1>
        <p class="page-header__desc">
          How to use each screen in ${escapeHtml(APP_NAME)}. Jump from the contents, or open a screen directly.
        </p>
      </div>
    </div>

    <div class="user-guide">
      <aside class="user-guide__toc panel" aria-label="Guide contents">
        <h2 class="panel__title" style="margin-bottom:0.75rem">Contents</h2>
        ${toc}
      </aside>
      <div class="user-guide__main">
        ${body}
      </div>
    </div>
  `;

  outlet.querySelectorAll('[data-guide-jump], [data-guide-jump-ch]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const id =
        el.getAttribute('data-guide-jump') ||
        (el.getAttribute('data-guide-jump-ch') ? `ch-${el.getAttribute('data-guide-jump-ch')}` : '');
      const target = outlet.querySelector(`#guide-${id}`);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.replaceState(null, '', `#/guide`);
      }
    });
  });
}
