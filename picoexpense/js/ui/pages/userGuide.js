/**
 * In-app user manual and how-to guide.
 */

import { APP_DISPLAY_NAME, APP_NAME } from '../../core/constants.js';
import { escapeHtml } from '../../utils/html.js';

/**
 * @typedef {{ id: string, title: string, path?: string, body: string }} GuideSection
 */

/** @type {{ id: string, title: string, sections: GuideSection[] }[]} */
const CHAPTERS = [
  {
    id: 'start',
    title: 'Getting started',
    sections: [
      {
        id: 'what',
        title: 'What PicoExpense is',
        body: `
          <p>${escapeHtml(APP_NAME)} (${escapeHtml(APP_DISPLAY_NAME)}) is a personal money tracker that runs in your browser.
          Everything is stored on <strong>this device</strong> in a local database named PicoPersonalFinance. There is no account, no PicoExpense server, and no analytics.</p>
          <ul>
            <li>Works offline after the first load (installable as an app).</li>
            <li>You own the data: download JSON backups anytime; Google Drive is optional.</li>
            <li>This version does <strong>not</strong> track investments or recurring bills. Enter those by hand as ordinary transactions if you need them.</li>
          </ul>
          <p>It is <em>not</em> an accounting ERP. There are no journals or vouchers — only accounts, categories, and transactions.</p>`,
      },
      {
        id: 'setup',
        title: 'First-run setup',
        path: '/setup',
        body: `
          <p>The first time you open the app you see a short setup screen.</p>
          <ol>
            <li>Enter a name (for you, not a login).</li>
            <li>Pick a <strong>base currency</strong> — the currency reports use. You can still record a transaction in another currency later.</li>
            <li>Optionally set country/locale.</li>
            <li>Create your first account (everyday bank, cash, or wallet) and an opening balance if you want the starting figure to be correct.</li>
            <li>Tap <strong>Start</strong>.</li>
          </ol>
          <p><strong>Skip for now</strong> still lets you use the app; add an account before you save a transaction.</p>
          <p><strong>Use sample data</strong> loads labelled SAMPLE accounts and transactions so you can click around. Remove them later under Settings.</p>`,
      },
      {
        id: 'nav',
        title: 'Finding your way around',
        body: `
          <p>Desktop: the <strong>left sidebar</strong> is grouped. Home sits at the top. Click a group name (Activity, Reports, Plan, Lists, Data, App) to expand or collapse it. Open groups are remembered on this browser.</p>
          <p>Phone: five buttons along the bottom — Home, Activity (transactions), <strong>+</strong> (add), Reports, More. More lists the remaining screens in the same groups.</p>
          <p>The top bar has Search, the command palette (⌘K / Ctrl+K), Drive, and <strong>Add transaction</strong>.</p>
          <p>A PicoScan button may float on screen for receipt scanning. Drag it if it covers something.</p>`,
      },
      {
        id: 'keys',
        title: 'Keyboard shortcuts',
        body: `
          <ul>
            <li><kbd>N</kbd> — new transaction (when you are not typing in a field)</li>
            <li><kbd>/</kbd> — search merchants, notes, and amounts</li>
            <li><kbd>Ctrl</kbd>+<kbd>K</kbd> or <kbd>⌘</kbd>+<kbd>K</kbd> — command palette (jump to a screen or action)</li>
            <li><kbd>Ctrl</kbd>+<kbd>Enter</kbd> — save on the add/edit form</li>
            <li><kbd>Esc</kbd> — close search or the command palette</li>
          </ul>`,
      },
      {
        id: 'pwa',
        title: 'Install as an app',
        body: `
          <p>In Chrome or Edge, use Install / Add to Home screen from the browser menu. On iPhone, Share → Add to Home Screen.</p>
          <p>Once installed, the app opens full-screen and keeps a local cache. Google Drive sign-in still needs a network connection; everything else works offline.</p>
          <p>Each <em>browser profile</em> has its own database. Chrome on this PC is not the same store as Safari on your phone until you restore a backup.</p>`,
      },
    ],
  },
  {
    id: 'daily',
    title: 'Transactions',
    sections: [
      {
        id: 'list',
        title: 'The Transactions screen',
        path: '/transactions',
        body: `
          <p>This screen is for <strong>looking at</strong> activity already saved. It is not the form for creating an entry.</p>
          <ul>
            <li>By default you see the <strong>latest 10</strong>, newest first.</li>
            <li>Tap a row to open and edit it.</li>
            <li><strong>Show older</strong> loads the next 10. <strong>Newer</strong> goes back.</li>
            <li><strong>Add transaction</strong> (top of the page or top bar) opens a blank form.</li>
          </ul>
          <h4>Narrow this list</h4>
          <p>Open the collapsed filter panel when you need a range or a subset. Dates here are <em>filters</em>, not the date of a new expense:</p>
          <ul>
            <li><strong>From date</strong> — include transactions on or after this day.</li>
            <li><strong>To date</strong> — include transactions on or before this day.</li>
            <li>Account, category, type, and text search further limit the list.</li>
          </ul>
          <p>Leave dates empty to keep showing the latest activity. Apply filters, or Clear filters to return to the last 10.</p>`,
      },
      {
        id: 'add-expense',
        title: 'How to add an expense',
        path: '/add',
        body: `
          <ol>
            <li>Click <strong>Add transaction</strong> (or press <kbd>N</kbd>).</li>
            <li>Leave type on <strong>Expense</strong> — money you spent.</li>
            <li><strong>Date of this transaction</strong> is the calendar day the money moved, not “today” unless it happened today.</li>
            <li><strong>Amount</strong> is how much, in the account’s currency.</li>
            <li><strong>Account</strong> is the wallet, bank, or card it came from.</li>
            <li><strong>Category</strong> is what it was for (Groceries, Fuel, …). Required for expenses so reports work.</li>
            <li>Save. Save &amp; another keeps the form open for the next one.</li>
          </ol>
          <p>Optional details (merchant, notes, tags, receipt, splits) sit under <strong>Optional details</strong>.</p>`,
      },
      {
        id: 'add-income',
        title: 'How to add income',
        path: '/add?type=INCOME',
        body: `
          <ol>
            <li>Add transaction, then tap <strong>Income</strong>.</li>
            <li>Date = payday. Amount = what landed. Account = the account that received it.</li>
            <li>Category under Income (Salary, Bonus, Interest, …).</li>
          </ol>
          <p>Refunds of spending are usually a <strong>Refund</strong> type (they reduce expense totals), not income. Use Income for money you earned or received as income.</p>`,
      },
      {
        id: 'transfer',
        title: 'How to move money between your accounts',
        path: '/add?type=TRANSFER',
        body: `
          <p>A transfer is <strong>not spending</strong> and <strong>not income</strong>. It only moves money you already have.</p>
          <ol>
            <li>Add transaction → <strong>Transfer</strong>.</li>
            <li>Account = where it left. To account = where it arrived.</li>
            <li>Save. Reports will not treat this as an expense.</li>
          </ol>
          <p>Use this for bank → savings, wallet top-ups from a bank, and similar. Paying a credit card from a bank is a transfer-like <strong>credit card payment</strong> (see below) — still not an expense.</p>`,
      },
      {
        id: 'cards',
        title: 'Credit cards: purchase vs payment',
        path: '/accounts',
        body: `
          <p>Create a Credit card account (with optional credit limit and payment due day). Then:</p>
          <ul>
            <li><strong>Buying something</strong> — Expense, account = the card. That is real spending. Outstanding balance goes up.</li>
            <li><strong>Paying the card bill</strong> — not an expense. Use a transfer from your bank to the card (or a credit-card payment). Outstanding goes down. If you also booked the same payment as an Expense you would double-count.</li>
          </ul>
          <p>The Accounts screen shows outstanding, available credit, and utilisation for cards.</p>`,
      },
      {
        id: 'edit',
        title: 'Edit, duplicate, delete, trash',
        path: '/trash',
        body: `
          <ul>
            <li>Open a row to edit. Save writes over the same entry.</li>
            <li>The duplicate button copies the transaction so you can change the date or amount.</li>
            <li>Delete moves it to <strong>Trash</strong> (soft delete). Restore from Trash, or delete forever.</li>
            <li>Empty trash is permanent. Receipt files are not automatically removed with the transaction.</li>
          </ul>`,
      },
      {
        id: 'splits',
        title: 'Splits, tags, people, receipts',
        path: '/add',
        body: `
          <p>Under Optional details:</p>
          <ul>
            <li><strong>Splits</strong> — break one payment across categories (e.g. groceries + household on one receipt). Amounts must add up to the total.</li>
            <li><strong>Merchant</strong> — store or payee; also used by categorisation rules.</li>
            <li><strong>Person</strong> — who it was for or with (family, reimbursable to someone).</li>
            <li><strong>Tags</strong> — extra labels (Vacation, Tax) independent of category.</li>
            <li><strong>Reimbursable / tax</strong> checkboxes flag the row for later reports.</li>
            <li><strong>Receipt</strong> — attach a photo or PDF to this entry.</li>
          </ul>`,
      },
      {
        id: 'scan',
        title: 'How to scan a receipt',
        path: '/ocr-review',
        body: `
          <p>OCR uses <strong>PicoScan</strong> on this same origin. Nothing is saved as a transaction until you confirm.</p>
          <ol>
            <li>Open Scan receipt from the command palette, or choose a file on that screen, or use the floating PicoScan button.</li>
            <li>Check merchant, date, total, and currency. Fix anything the scan got wrong.</li>
            <li>Save or Save &amp; Edit — you still land on the transaction form to pick account and category, then save.</li>
            <li>Cancel goes to a blank add form. Rescan picks another file.</li>
          </ol>
          <p>If PicoScan is missing (the sibling <span class="mono">picoscan</span> app is not being served), you will see a notice and can type the expense manually. Serve the parent folder that contains both apps so the widget URL resolves.</p>`,
      },
    ],
  },
  {
    id: 'lists',
    title: 'Accounts and lists',
    sections: [
      {
        id: 'accounts',
        title: 'Accounts',
        path: '/accounts',
        body: `
          <p>An account is a place money lives: bank, savings, cash, wallet, debit or credit card, prepaid, or other asset/liability. ${escapeHtml(APP_NAME)} never stores bank logins.</p>
          <h4>Add an account</h4>
          <ol>
            <li>Accounts → Add account.</li>
            <li>Name, type, currency, opening balance (what was already there before you started tracking).</li>
            <li>Cards: optional credit limit and payment due day (1–31).</li>
          </ol>
          <p>Balances = opening + inflows − outflows (liabilities shown as amounts you owe). Foreign-currency accounts need a manual FX rate in Settings before Home/Reports can convert them to the base currency.</p>`,
      },
      {
        id: 'categories',
        title: 'Categories',
        path: '/categories',
        body: `
          <p>Setup seeds a tree (Housing, Food, Transport, Income, Transfer, …) with subcategories. Add your own with Add, or Sub on a parent.</p>
          <p>Used categories are <strong>archived</strong>, not deleted, so old transactions keep their labels. Archived names stay on history but should not be used for new entries.</p>
          <p>Expenses need a category. Transfers typically use a transfer category and are excluded from spending totals.</p>`,
      },
      {
        id: 'masters',
        title: 'Merchants, tags, people, rules',
        path: '/settings',
        body: `
          <p>On Settings, under Masters:</p>
          <ul>
            <li><strong>Merchants</strong> — payee names. Typing a merchant on a transaction can suggest a category.</li>
            <li><strong>Tags</strong> — extra filters (Vacation, Business).</li>
            <li><strong>People</strong> — assign a person to a transaction.</li>
            <li><strong>Rules</strong> — if description/merchant contains a pattern (e.g. “carrefour”), suggest Groceries. Rules run locally; they never auto-save a transaction.</li>
          </ul>`,
      },
    ],
  },
  {
    id: 'plan',
    title: 'Budgets and goals',
    sections: [
      {
        id: 'budgets',
        title: 'Budgets',
        path: '/budgets',
        body: `
          <ol>
            <li>Add budget → name, Monthly or Annual, optional category (or Overall), amount in base currency.</li>
            <li>The bar shows spent vs limit: normal, warning, or exceeded.</li>
            <li>Home also shows budget bars for the current month.</li>
          </ol>
          <p>Transfers and card <em>payments</em> do not eat an expense budget. Card <em>purchases</em> do.</p>`,
      },
      {
        id: 'goals',
        title: 'Goals',
        path: '/goals',
        body: `
          <p>Savings targets such as an emergency fund. Progress is <strong>manual</strong> in this version — tap Update progress and enter the current amount. It is not auto-linked to an account balance.</p>
          <p>Set a target amount and optional target date. Delete removes the goal only, not your transactions.</p>`,
      },
    ],
  },
  {
    id: 'reports',
    title: 'Home and reports',
    sections: [
      {
        id: 'home',
        title: 'Home (this month)',
        path: '/home',
        body: `
          <p>Month arrows change the month. You will see spent this month, income, net, savings rate, daily average, cash &amp; banks, cash, card outstanding, and pending reimbursable amounts.</p>
          <p>The category donut is clickable — it opens Transactions filtered to that category. Largest expense links to the row.</p>
          <p>A yellow banner means some foreign amounts could not be converted. Add a rate under Settings.</p>`,
      },
      {
        id: 'report-pages',
        title: 'Reports, monthly, annual',
        path: '/reports',
        body: `
          <ul>
            <li><strong>Reports</strong> — current-month snapshot plus a count of tax-flagged transactions.</li>
            <li><strong>Monthly</strong> — income, expenses, net, savings rate, category mix, largest items, budget variance. Use the arrows to change month.</li>
            <li><strong>Annual</strong> — year totals and a month-by-month income vs expense chart. Arrows change year.</li>
          </ul>
          <p>Income includes reimbursements. Expenses are purchases (not transfers). Refunds reduce expense totals.</p>`,
      },
      {
        id: 'fx',
        title: 'Foreign currency',
        path: '/settings',
        body: `
          <p>Each transaction keeps its original amount and currency. Reports convert to the base currency only when a <strong>manual</strong> rate exists for that pair and date. There is no live FX download.</p>
          <p>Rate format: units of quote per 1 unit of base (example: INR per 1 AED). Missing rates mark the report <strong>incomplete</strong> instead of guessing.</p>`,
      },
    ],
  },
  {
    id: 'data',
    title: 'Import, backup, Drive',
    sections: [
      {
        id: 'csv',
        title: 'How to import a bank CSV',
        path: '/import',
        body: `
          <ol>
            <li>Export CSV from your bank (date, amount, description at minimum).</li>
            <li>Import CSV → choose the file.</li>
            <li>Map each column: date, description, amount (or separate debit/credit), currency, account, merchant, category, notes, type — or ignore.</li>
            <li>Pick a default account (and category if the file has none).</li>
            <li>Preview. Possible duplicates are flagged; skip them by default.</li>
            <li>Import. Fix any row errors shown in the banner.</li>
          </ol>
          <p>Duplicates are detected locally against existing transactions. The wizard never talks to a bank API.</p>`,
      },
      {
        id: 'backup',
        title: 'How to back up',
        path: '/backup',
        body: `
          <p>Backup &amp; data shows counts, last backup/restore times, and storage used.</p>
          <ul>
            <li><strong>Download JSON backup</strong> — canonical file (<span class="mono">*.exp.json</span>). Keep copies somewhere safe.</li>
            <li><strong>Encrypted backup</strong> — same data, passphrase + AES-GCM. You must remember the passphrase; it cannot be recovered.</li>
            <li><strong>Export CSV</strong> — transactions only, for spreadsheets.</li>
          </ul>
          <p>Back up before you clear the browser, switch phones, or try a restore.</p>`,
      },
      {
        id: 'drive',
        title: 'Google Drive sync',
        path: '/backup',
        body: `
          <p>Optional. The app uses a folder named <strong>PicoExpenseBackup</strong> and a file <span class="mono">PicoExpense_sync.exp.zip</span> inside the Drive folder you pick. Day-to-day tracking still works fully offline.</p>
          <ol>
            <li>Tap Drive in the top bar, or Google Drive sync on Backup. Sign in and pick a folder.</li>
            <li>If that folder already has a backup: <strong>Use this backup</strong> replaces local data; <strong>Overwrite</strong> replaces the Drive file with this browser; <strong>Change folder</strong> picks another place.</li>
            <li>Later, Drive compares timestamps. You choose upload (this browser → Drive) or download (Drive → this browser). Same timestamps = nothing to do.</li>
          </ol>
          <p>Change Drive folder or Disconnect from Backup. If Drive APIs are not configured, you get a download plus a tab to upload the zip by hand.</p>`,
      },
      {
        id: 'restore',
        title: 'How to restore or merge',
        path: '/backup',
        body: `
          <ol>
            <li>On Backup, choose a <span class="mono">.json</span>, <span class="mono">.zip</span>, or encrypted file. Enter the passphrase if asked.</li>
            <li><strong>Replace all</strong> wipes local PicoExpense data and loads the file.</li>
            <li>If you cancel that, you can <strong>Merge</strong> — keep existing rows; add records whose IDs are missing locally.</li>
          </ol>
          <p>Restore from Drive uses the synced zip, or lets you pick another Drive file.</p>
          <p><strong>Delete all data</strong> erases the local database on this device. It does not delete your Drive file unless you overwrite it afterwards.</p>`,
      },
    ],
  },
  {
    id: 'app',
    title: 'Settings and privacy',
    sections: [
      {
        id: 'settings',
        title: 'Settings',
        path: '/settings',
        body: `
          <ul>
            <li>Profile name, base currency, theme (light / dark / system), date format.</li>
            <li>Default account and category for new transactions.</li>
            <li>Large text, high contrast, reduced motion.</li>
            <li>Manual exchange rates.</li>
            <li>Load or remove sample data (SAMPLE-labelled).</li>
            <li>Audit log of created/modified/deleted/imported rows on this device.</li>
          </ul>`,
      },
      {
        id: 'privacy',
        title: 'Privacy',
        path: '/privacy',
        body: `
          <p>Data stays in IndexedDB on this device. No PicoExpense login. OCR runs locally via PicoScan. Drive, if you use it, sends backup files only to <em>your</em> Google account.</p>
          <p>Clearing site data in the browser deletes the local database. That is why backups matter.</p>`,
      },
      {
        id: 'limits',
        title: 'Not in this version',
        body: `
          <ul>
            <li>Investments and portfolio tracking</li>
            <li>Automatic recurring transactions / bill reminders</li>
            <li>Live bank feeds or paid FX APIs</li>
            <li>Multi-user cloud accounts</li>
          </ul>
          <p>Enter a repeating bill each time it posts, or import it from CSV.</p>`,
      },
    ],
  },
  {
    id: 'howto',
    title: 'How-to recipes',
    sections: [
      {
        id: 'ht-grocery',
        title: 'Record a grocery trip',
        path: '/add',
        body: `
          <ol>
            <li>Add transaction → Expense.</li>
            <li>Date on the receipt. Amount = total paid.</li>
            <li>Account = the card or cash you used.</li>
            <li>Category = Food / Groceries (or split if the receipt mixed household items).</li>
            <li>Optional: merchant = the store; attach the receipt photo.</li>
            <li>Save.</li>
          </ol>`,
      },
      {
        id: 'ht-salary',
        title: 'Record salary',
        path: '/add?type=INCOME',
        body: `
          <ol>
            <li>Add transaction → Income.</li>
            <li>Date = payday. Amount = net credit. Account = the bank that received it.</li>
            <li>Category = Income / Salary.</li>
            <li>Save. Home income and savings rate will include it for that month.</li>
          </ol>`,
      },
      {
        id: 'ht-pay-card',
        title: 'Pay a credit card from the bank',
        path: '/add?type=TRANSFER',
        body: `
          <ol>
            <li>Add transaction → Transfer.</li>
            <li>Account = bank. To account = the credit card.</li>
            <li>Amount = what you paid. Date = payment date.</li>
            <li>Save. Card outstanding drops; this is not a new expense (the expenses were the purchases).</li>
          </ol>`,
      },
      {
        id: 'ht-split',
        title: 'Split one receipt across categories',
        path: '/add',
        body: `
          <ol>
            <li>Add the expense with the <em>full</em> amount.</li>
            <li>Open Optional details → Add split. One row per category and amount.</li>
            <li>The split amounts must add up to the total or Save will refuse.</li>
          </ol>`,
      },
      {
        id: 'ht-atm',
        title: 'Withdraw cash from an ATM',
        path: '/add?type=TRANSFER',
        body: `
          <p>Create a Cash account if you do not have one. Then Transfer: from bank (or debit card account) to Cash. That is not an expense. Spending the cash later is a separate Expense on the Cash account.</p>`,
      },
      {
        id: 'ht-fx',
        title: 'Spend while travelling',
        path: '/settings',
        body: `
          <ol>
            <li>Add an account in that currency, or book the transaction in the foreign currency on an existing account.</li>
            <li>On the form, set Currency and, if you know it, the FX rate into your base currency.</li>
            <li>If reports show Incomplete, Settings → Add rate for that date and pair.</li>
          </ol>`,
      },
      {
        id: 'ht-reimb',
        title: 'Mark something as reimbursable',
        path: '/add',
        body: `
          <p>On the expense, Optional details → Reimbursable. Home shows pending reimbursement. When the money comes back, add Income or a Reimbursement-type entry (or a refund) so you are not still “out of pocket” in reports.</p>`,
      },
      {
        id: 'ht-phone',
        title: 'Move to a new phone or browser',
        path: '/backup',
        body: `
          <ol>
            <li>On the old device: Backup → Download JSON (or Encrypted, or Drive upload).</li>
            <li>Copy the file to the new device (or connect the same Drive folder).</li>
            <li>Open ${escapeHtml(APP_NAME)} on the new device, finish setup (or skip), then Backup → restore the file → Replace all (or Use this backup on Drive).</li>
          </ol>
          <p>Do not rely on “the cloud” unless you actually connected Drive or copied the JSON. Clearing site data on a device wipes that copy.</p>`,
      },
    ],
  },
];

/**
 * @param {import('../../core/router.js').RouteContext} [_ctx]
 */
export async function renderUserGuide(_ctx) {
  const outlet = document.getElementById('outlet');
  const toc = CHAPTERS.map((ch) => {
    const links = ch.sections
      .map((s) => `<li><a href="#guide-${escapeHtml(s.id)}" data-guide-jump="${escapeHtml(s.id)}">${escapeHtml(s.title)}</a></li>`)
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
    <section class="page page--guide">
      <h2>User guide</h2>
      <p class="lede">How to use ${escapeHtml(APP_NAME)} — each screen, plus step-by-step recipes. Jump from Contents, or open a screen from a section.</p>
      <div class="user-guide">
        <aside class="user-guide__toc" aria-label="Guide contents">
          <p class="user-guide__toc-label">Contents</p>
          ${toc}
        </aside>
        <div class="user-guide__main">${body}</div>
      </div>
    </section>
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
        history.replaceState(null, '', '#/guide');
      }
    });
  });
}
