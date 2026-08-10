/**
 * Application shell — sidebar, topbar, content outlet, book switcher.
 */

import { on, emit } from '../core/eventBus.js';
import { EVENTS } from '../core/constants.js';
import * as router from '../core/router.js';
import * as bookService from '../services/bookService.js';
import { escapeHtml } from './modal.js';
import { showToast } from './toast.js';
import * as backupActions from './backupActions.js';

/** @type {import('../models/types.js').Book | null} */
let currentBook = null;
/** @type {import('../models/types.js').FinancialYear | null} */
let currentFy = null;

/**
 * Top-level nav with optional children (shown as collapsible sub-menus).
 * Deep links live under hubs so the sidebar stays short.
 */
const NAV = [
  {
    section: 'Overview',
    items: [
      { path: '/portfolio', label: 'Portfolio', icon: '▣', requiresBook: false },
      { path: '/dashboard', label: 'Book dashboard', icon: '▦', requiresBook: true },
    ],
  },
  {
    section: 'This book',
    items: [
      {
        path: '/masters',
        label: 'Masters',
        icon: '☰',
        requiresBook: true,
        children: [
          { path: '/masters/chart', label: 'Chart of Accounts' },
          { path: '/masters/groups', label: 'Ledger groups' },
          { path: '/masters/ledgers', label: 'Ledgers' },
          { path: '/masters/gnucash-import', label: 'GNUCash Import/Export' },
        ],
      },
      {
        path: '/transactions',
        label: 'Transactions',
        icon: '↔',
        requiresBook: true,
        children: [
          { path: '/transactions/list', label: 'All vouchers' },
          { path: '/transactions/new/Journal', label: 'New journal' },
        ],
      },
      {
        path: '/invoices',
        label: 'Invoices',
        icon: '▦',
        requiresBook: true,
        children: [
          { path: '/invoices', label: 'All invoices' },
          { path: '/invoices/new/Sales', label: 'New sales invoice' },
          { path: '/invoices/new/Purchase', label: 'New purchase invoice' },
          { path: '/invoices/templates', label: 'Invoice templates' },
        ],
      },
      {
        path: '/inventory',
        label: 'Inventory',
        icon: '▣',
        requiresBook: true,
        children: [
          { path: '/inventory/items', label: 'Items' },
          { path: '/inventory/catalogue', label: 'Catalogue' },
          { path: '/inventory/movements', label: 'Movements' },
          { path: '/inventory/units', label: 'Units' },
          { path: '/inventory/warehouses', label: 'Warehouses' },
          { path: '/inventory/categories', label: 'Categories' },
        ],
      },
      {
        path: '/tax',
        label: 'Tax',
        icon: '%',
        requiresBook: true,
        children: [
          { path: '/tax/codes', label: 'Tax codes' },
          { path: '/reports/tax-summary', label: 'Tax summary' },
          { path: '/reports/tax-ledger', label: 'Tax ledger' },
          { path: '/reports/tax-payable', label: 'Tax payable' },
        ],
      },
      {
        path: '/finance',
        label: 'Personal finance',
        icon: '◈',
        requiresBook: true,
        children: [
          { path: '/finance/budgets', label: 'Budgets' },
          { path: '/finance/goals', label: 'Goals' },
          { path: '/reports/net-worth', label: 'Net worth' },
          { path: '/reports/budget-variance', label: 'Budget variance' },
        ],
      },
      {
        path: '/reports',
        label: 'Reports',
        icon: '▤',
        requiresBook: true,
        children: [
          { path: '/reports/trial-balance', label: 'Trial Balance' },
          { path: '/reports/profit-loss', label: 'Profit & Loss' },
          { path: '/reports/balance-sheet', label: 'Balance Sheet' },
          { path: '/reports/ledger', label: 'Ledger' },
          { path: '/reports/ledger-detail', label: 'Ledger detail' },
          { path: '/reports/accounts-summary', label: 'Accounts Summary' },
          { path: '/reports/day-book', label: 'Day Book' },
          { path: '/reports/cash-flow', label: 'Cash Flow' },
          { path: '/reports/stock-summary', label: 'Stock Summary' },
        ],
      },
    ],
  },
  {
    section: 'System',
    items: [
      { path: '/books', label: 'Manage books', icon: '▤', requiresBook: false },
      { path: '/guide', label: 'User Guide', icon: '?', requiresBook: false },
      { path: '/settings', label: 'Settings', icon: '⚙', requiresBook: false },
    ],
  },
];

/**
 * @param {{ book: import('../models/types.js').Book|null, financialYear: import('../models/types.js').FinancialYear|null }} session
 * @returns {{ outlet: HTMLElement }}
 */
export function mountShell(session) {
  currentBook = session.book;
  currentFy = session.financialYear;

  const app = document.getElementById('app');
  if (!app) throw new Error('#app not found');

  const hasBook = Boolean(session.book);

  app.innerHTML = `
    <div class="app-shell ${hasBook ? '' : 'app-shell--no-active-book'}" id="app-shell">
      <div class="sidebar-overlay" id="sidebar-overlay" hidden></div>
      ${renderSidebar(hasBook)}
      <div class="main-column">
        ${renderTopbar(hasBook)}
        <main class="content" id="content">
          <div class="content__inner" id="outlet"></div>
        </main>
      </div>
    </div>
  `;

  bindShellEvents();
  const outlet = /** @type {HTMLElement} */ (document.getElementById('outlet'));
  return { outlet };
}

export function getNavConfig() {
  return NAV;
}

/**
 * @param {boolean} hasBook
 */
function renderSidebar(hasBook) {
  const bookName = currentBook?.name ?? 'No book selected';
  const fyName = currentFy?.name ?? 'Select a book to post';

  const sections = NAV.map((sec) => {
    const links = sec.items.map((item) => renderNavItem(item, hasBook)).join('');
    return `
      <div class="nav-section">
        <div class="nav-section__label">${escapeHtml(sec.section)}</div>
        ${links}
      </div>`;
  }).join('');

  return `
    <aside class="sidebar" id="sidebar" aria-label="Main navigation">
      <div class="sidebar__brand">
        <img class="sidebar__logo" src="icons/icon-192.png" width="36" height="36" alt="" />
        <div>
          <div class="sidebar__title">PicoERP</div>
          <div class="sidebar__subtitle">
            <a class="sidebar__contact" href="mailto:support@picoai.org" title="support@picoai.org">Contact us</a>
          </div>
        </div>
      </div>
      <nav class="sidebar__nav">${sections}</nav>
      <div class="sidebar__footer">
        <button type="button" class="sidebar__book" id="btn-switch-book" title="Switch book">
          <span class="sidebar__book-icon" aria-hidden="true">▤</span>
          <span class="sidebar__book-meta">
            <div class="sidebar__book-name">${escapeHtml(bookName)}</div>
            <div class="sidebar__book-fy">${escapeHtml(fyName)}</div>
          </span>
        </button>
      </div>
    </aside>`;
}

/**
 * @param {any} item
 * @param {boolean} hasBook
 */
function renderNavItem(item, hasBook) {
  const locked = item.requiresBook === true && !hasBook;
  const title = locked ? 'Select a book first' : item.label;
  const children = Array.isArray(item.children) ? item.children : [];

  if (children.length === 0) {
    return `
      <a href="#${item.path}"
         class="nav-link ${locked ? 'is-disabled' : ''}"
         data-path="${item.path}"
         data-requires-book="${item.requiresBook === true ? '1' : '0'}"
         title="${escapeHtml(title)}">
        <span class="nav-link__icon" aria-hidden="true">${item.icon}</span>
        <span class="nav-link__text">${escapeHtml(item.label)}</span>
      </a>`;
  }

  const childLinks = children
    .map(
      (child) => `
      <a href="#${child.path}"
         class="nav-sublink ${locked ? 'is-disabled' : ''}"
         data-path="${child.path}"
         data-requires-book="${item.requiresBook === true ? '1' : '0'}"
         title="${escapeHtml(locked ? title : child.label)}">
        ${escapeHtml(child.label)}
      </a>`
    )
    .join('');

  return `
    <div class="nav-group" data-nav-group="${escapeHtml(item.path)}">
      <div class="nav-group__row">
        <a href="#${item.path}"
           class="nav-link nav-link--parent ${locked ? 'is-disabled' : ''}"
           data-path="${item.path}"
           data-requires-book="${item.requiresBook === true ? '1' : '0'}"
           title="${escapeHtml(title)}">
          <span class="nav-link__icon" aria-hidden="true">${item.icon}</span>
          <span class="nav-link__text">${escapeHtml(item.label)}</span>
        </a>
        <button type="button" class="nav-group__toggle" data-nav-toggle="${escapeHtml(item.path)}"
                aria-expanded="false" aria-label="Expand ${escapeHtml(item.label)}" ${locked ? 'disabled' : ''}>
          ▾
        </button>
      </div>
      <div class="nav-group__children" data-nav-children="${escapeHtml(item.path)}" hidden>
        ${childLinks}
      </div>
    </div>`;
}

/**
 * @param {boolean} hasBook
 */
function renderTopbar(hasBook) {
  const bookLabel = hasBook
    ? escapeHtml(currentBook?.name || '')
    : 'Select book';
  const fyLabel = hasBook ? escapeHtml(currentFy?.name || '') : '';

  return `
    <header class="topbar">
      <button type="button" class="topbar__toggle" id="btn-nav-toggle" aria-label="Open menu">☰</button>
      <div class="topbar__crumb">
        <span class="topbar__crumb-current" id="crumb-current">Portfolio</span>
      </div>
      <div class="topbar__actions">
        <div class="topbar__backup" role="group" aria-label="Backup">
          <button type="button" class="topbar__icon-btn" id="btn-topbar-backup"
                  title="Download full backup" aria-label="Download full backup">
            <svg class="topbar__icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path fill="currentColor" d="M12 3a1 1 0 0 1 1 1v9.6l2.3-2.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L11 13.6V4a1 1 0 0 1 1-1Zm-7 14a1 1 0 0 1 1 1v1h12v-1a1 1 0 1 1 2 0v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1Z"/>
            </svg>
          </button>
          <button type="button" class="topbar__icon-btn" id="btn-topbar-gdrive"
                  title="Google Drive sync / backup" aria-label="Google Drive sync / backup">
            <svg class="topbar__icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path fill="currentColor" d="M8.4 3.2 3 12.5l2.7 4.7h5.1L7.7 7.9 8.4 3.2Zm1.5 0 3.3 5.7-3.5 6.1H4.5L9.9 3.2Zm4.2 0L21 15.4h-5.4l-3.6-6.2 2.7-6Zm-1.2 12.7 2.7 4.7H4.5l2.7-4.7h6.7Z"/>
            </svg>
          </button>
        </div>
        <div class="book-switcher" id="book-switcher">
          <button type="button" class="book-switcher__btn" id="btn-book-menu" aria-haspopup="listbox" aria-expanded="false">
            <span class="book-switcher__label">
              <span class="book-switcher__eyebrow">Active book</span>
              <span class="book-switcher__name">${bookLabel}</span>
              ${fyLabel ? `<span class="book-switcher__fy">${fyLabel}</span>` : ''}
            </span>
            <span class="book-switcher__chevron" aria-hidden="true">▾</span>
          </button>
          <div class="book-switcher__menu" id="book-menu" hidden role="listbox"></div>
        </div>
      </div>
    </header>`;
}

function bindShellEvents() {
  const shell = document.getElementById('app-shell');
  const overlay = document.getElementById('sidebar-overlay');
  const toggle = document.getElementById('btn-nav-toggle');
  const switchBook = document.getElementById('btn-switch-book');
  const bookMenuBtn = document.getElementById('btn-book-menu');
  const bookMenu = document.getElementById('book-menu');

  const closeNav = () => shell?.classList.remove('app-shell--nav-open');
  const openNav = () => shell?.classList.add('app-shell--nav-open');

  toggle?.addEventListener('click', () => {
    if (shell?.classList.contains('app-shell--nav-open')) closeNav();
    else openNav();
  });

  overlay?.addEventListener('click', closeNav);

  switchBook?.addEventListener('click', () => {
    router.navigate('/books');
    closeNav();
  });

  document.querySelectorAll('[data-nav-toggle]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const key = btn.getAttribute('data-nav-toggle');
      if (!key) return;
      const group = findByDataAttr('data-nav-group', key);
      if (!group) return;
      setNavGroupOpen(key, !group.classList.contains('is-open'));
    });
  });

  bookMenuBtn?.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!bookMenu) return;
    const open = bookMenu.hasAttribute('hidden');
    if (open) {
      await fillBookMenu(bookMenu);
      bookMenu.removeAttribute('hidden');
      bookMenuBtn.setAttribute('aria-expanded', 'true');
    } else {
      bookMenu.setAttribute('hidden', '');
      bookMenuBtn.setAttribute('aria-expanded', 'false');
    }
  });

  document.getElementById('btn-topbar-backup')?.addEventListener('click', async () => {
    try {
      await backupActions.downloadFullBackupLocal();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Backup failed', 'error');
    }
  });

  document.getElementById('btn-topbar-gdrive')?.addEventListener('click', async () => {
    const btn = /** @type {HTMLButtonElement|null} */ (document.getElementById('btn-topbar-gdrive'));
    if (btn) btn.disabled = true;
    try {
      await backupActions.uploadFullBackupToGoogleDrive();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Google Drive upload failed', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  document.addEventListener('click', (e) => {
    const root = document.getElementById('book-switcher');
    if (!root || !bookMenu) return;
    if (!root.contains(/** @type {Node} */ (e.target))) {
      bookMenu.setAttribute('hidden', '');
      bookMenuBtn?.setAttribute('aria-expanded', 'false');
    }
  });

  on(EVENTS.ROUTE_CHANGE, (ctx) => {
    closeNav();
    updateActiveNav(ctx.path);
    const crumb = document.getElementById('crumb-current');
    if (crumb) crumb.textContent = ctx.route.title;
  });
}

/**
 * @param {string} attr
 * @param {string} value
 * @returns {HTMLElement | null}
 */
function findByDataAttr(attr, value) {
  const el = Array.from(document.querySelectorAll(`[${attr}]`)).find(
    (node) => node.getAttribute(attr) === value
  );
  return /** @type {HTMLElement | null} */ (el || null);
}

/**
 * @param {string} key
 * @param {boolean} open
 */
function setNavGroupOpen(key, open) {
  const group = findByDataAttr('data-nav-group', key);
  if (!group) return;
  const children = group.querySelector(`[data-nav-children]`);
  const btn = group.querySelector(`[data-nav-toggle]`);
  group.classList.toggle('is-open', open);
  if (children) {
    if (open) children.removeAttribute('hidden');
    else children.setAttribute('hidden', '');
  }
  btn?.setAttribute('aria-expanded', open ? 'true' : 'false');
}

/**
 * @param {HTMLElement} menu
 */
async function fillBookMenu(menu) {
  const books = await bookService.listBooks();
  const activeId = currentBook?.id;

  if (books.length === 0) {
    menu.innerHTML = `
      <div class="book-switcher__empty">No books yet</div>
      <a class="book-switcher__item" href="#/books">Create a book</a>`;
    return;
  }

  menu.innerHTML =
    books
      .map((b) => {
        const active = b.id === activeId;
        return `
        <button type="button" class="book-switcher__item ${active ? 'is-active' : ''}"
                role="option" data-book-id="${b.id}" ${active ? 'aria-selected="true"' : ''}>
          <span class="book-switcher__item-name">${escapeHtml(b.name)}</span>
          <span class="book-switcher__item-meta">${escapeHtml(b.currency || 'INR')}${active ? ' · Active' : ''}</span>
        </button>`;
      })
      .join('') +
    `<a class="book-switcher__item book-switcher__item--link" href="#/books">Manage books…</a>
     <a class="book-switcher__item book-switcher__item--link" href="#/portfolio">Portfolio overview</a>`;

  menu.querySelectorAll('[data-book-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const bookId = btn.getAttribute('data-book-id');
      if (!bookId || bookId === activeId) {
        menu.setAttribute('hidden', '');
        return;
      }
      try {
        await bookService.setActiveBook(bookId);
        showToast('Switched book', 'success');
        menu.setAttribute('hidden', '');
        router.navigate('/dashboard');
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Could not switch book', 'error');
      }
    });
  });
}

/**
 * @param {string} path
 * @param {string} hubPath
 * @param {{ path: string }[]} [children]
 */
function pathBelongsToHub(path, hubPath, children = []) {
  if (path === hubPath || path.startsWith(hubPath + '/')) return true;
  if (children.some((c) => path === c.path || path.startsWith(c.path + '/'))) return true;
  return false;
}

/**
 * @param {string} path
 */
function updateActiveNav(path) {
  document.querySelectorAll('.nav-link, .nav-sublink').forEach((el) => {
    const linkPath = el.getAttribute('data-path');
    if (!linkPath) return;
    let active = false;
    if (el.classList.contains('nav-sublink')) {
      active = linkPath === path;
    } else if (el.classList.contains('nav-link--parent')) {
      const item = NAV.flatMap((s) => s.items).find((i) => i.path === linkPath);
      active = pathBelongsToHub(path, linkPath, item?.children || []);
    } else {
      active = linkPath === path || path.startsWith(linkPath + '/');
    }
    el.classList.toggle('is-active', active);
  });

  for (const item of NAV.flatMap((s) => s.items)) {
    if (!item.children?.length) continue;
    if (pathBelongsToHub(path, item.path, item.children)) {
      setNavGroupOpen(item.path, true);
    }
  }
}

/**
 * Book gate when there are zero books in the database.
 * @returns {{ outlet: HTMLElement }}
 */
export function mountBookGate() {
  const app = document.getElementById('app');
  if (!app) throw new Error('#app not found');

  app.innerHTML = `
    <div class="book-gate">
      <header class="book-gate__header">
        <img class="book-gate__logo" src="icons/icon-192.png" width="40" height="40" alt="" />
        <div class="book-gate__brand">PicoERP</div>
      </header>
      <div class="book-gate__body">
        <div class="book-gate__panel" id="outlet"></div>
      </div>
    </div>
  `;

  const outlet = /** @type {HTMLElement} */ (document.getElementById('outlet'));
  return { outlet };
}

export function notifyNavToggle() {
  emit(EVENTS.NAV_TOGGLE);
}
