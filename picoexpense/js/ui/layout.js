import { APP_DISPLAY_NAME, APP_NAME, APP_VERSION, EVENTS } from '../core/constants.js';
import { on } from '../core/eventBus.js';
import * as router from '../core/router.js';
import { escapeHtml } from '../utils/html.js';
import { uploadFullBackupToGoogleDrive } from './backupActions.js';
import { showToast } from './toast.js';
import { searchAll } from '../services/searchService.js';
import { openCommandPalette } from './commandPalette.js';
import { getSyncState } from '../services/driveSyncService.js';

const NAV_OPEN_KEY = 'picoexpense.navOpen';

const HOME_ITEM = { href: '#/home', label: 'Home' };

/** Sidebar groups — collapsible. “More” is mobile-only, not a sidebar row. */
export const NAV_GROUPS = [
  {
    id: 'activity',
    label: 'Activity',
    items: [
      { href: '#/transactions', label: 'Transactions' },
      { href: '#/trash', label: 'Trash' },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    items: [
      { href: '#/reports', label: 'Reports' },
      { href: '#/monthly', label: 'Monthly' },
      { href: '#/annual', label: 'Annual' },
    ],
  },
  {
    id: 'plan',
    label: 'Plan',
    items: [
      { href: '#/budgets', label: 'Budgets' },
      { href: '#/goals', label: 'Goals' },
    ],
  },
  {
    id: 'lists',
    label: 'Lists',
    items: [
      { href: '#/accounts', label: 'Accounts' },
      { href: '#/categories', label: 'Categories' },
    ],
  },
  {
    id: 'data',
    label: 'Data',
    items: [
      { href: '#/import', label: 'Import CSV' },
      { href: '#/backup', label: 'Backup' },
    ],
  },
  {
    id: 'app',
    label: 'App',
    items: [
      { href: '#/guide', label: 'User guide' },
      { href: '#/privacy', label: 'Privacy' },
      { href: '#/settings', label: 'Settings' },
    ],
  },
];

/** Flat list for the mobile More page (no duplicate “More” row). */
export const NAV = [HOME_ITEM, ...NAV_GROUPS.flatMap((g) => g.items.map((item) => ({ ...item, group: g.label })))];

const DEFAULT_OPEN = ['activity'];

/**
 * @param {HTMLElement} root
 */
export function mountShell(root) {
  root.innerHTML = `
    <div class="app-shell" id="app-shell">
      <aside class="sidebar" id="sidebar">
        <a class="sidebar__brand" href="#/home">
          <img class="sidebar__logo" src="icons/icon.svg" alt="" width="36" height="36" />
          <div>
            <div class="sidebar__title">${escapeHtml(APP_NAME)}</div>
            <div class="sidebar__subtitle">${escapeHtml(APP_DISPLAY_NAME)}</div>
          </div>
        </a>
        <nav class="sidebar__nav" aria-label="Primary">
          <a class="nav-link nav-link--home" href="${HOME_ITEM.href}" data-nav="${HOME_ITEM.href}">${escapeHtml(HOME_ITEM.label)}</a>
          ${NAV_GROUPS.map((g) => renderNavGroup(g, DEFAULT_OPEN.includes(g.id))).join('')}
        </nav>
        <div class="sidebar__foot">v${escapeHtml(APP_VERSION)}</div>
      </aside>
      <div class="main">
        <header class="topbar">
          <button type="button" class="btn btn--ghost btn--icon" id="btn-menu" aria-label="Menu">☰</button>
          <h1 class="topbar__title" id="page-title">Home</h1>
          <div class="topbar__actions">
            <button type="button" class="btn btn--ghost" id="btn-search" aria-label="Search" title="Search (/)">Search</button>
            <button type="button" class="btn btn--ghost" id="btn-palette" aria-label="Command palette" title="Ctrl+K">⌘K</button>
            <button type="button" class="btn btn--ghost" id="btn-drive" aria-label="Google Drive sync" title="Google Drive">Drive</button>
            <a class="btn btn--primary" href="#/add" title="Add a new expense, income, or transfer">
              <span class="hide-sm">Add transaction</span>
              <span class="show-sm">Add</span>
            </a>
          </div>
        </header>
        <main class="content" id="outlet" tabindex="-1"></main>
      </div>
      <nav class="bottom-nav" aria-label="Mobile">
        <a href="#/home" data-nav="#/home">Home</a>
        <a href="#/transactions" data-nav="#/transactions">Activity</a>
        <a class="bottom-nav__add" href="#/add" aria-label="Add transaction">+</a>
        <a href="#/reports" data-nav="#/reports">Reports</a>
        <a href="#/more" data-nav="#/more">More</a>
      </nav>
    </div>
    <div id="search-overlay" class="search-overlay" hidden>
      <div class="search-overlay__panel">
        <input class="input" id="global-search" type="search" placeholder="Search merchant, notes, amount…" aria-label="Search" />
        <div id="search-results"></div>
      </div>
    </div>
    <div id="toast-root" class="toast-root" aria-live="polite"></div>
  `;

  restoreNavOpen();
  bindNavGroups();

  root.querySelector('#btn-menu')?.addEventListener('click', () => {
    document.getElementById('app-shell')?.classList.toggle('nav-open');
  });
  root.querySelector('#btn-palette')?.addEventListener('click', () => openCommandPalette());
  root.querySelector('#btn-drive')?.addEventListener('click', async () => {
    try {
      await uploadFullBackupToGoogleDrive();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Drive sync failed', 'error');
    }
  });
  root.querySelector('#btn-search')?.addEventListener('click', () => openSearch());

  on(EVENTS.ROUTE_CHANGE, (ctx) => {
    const title = ctx?.route?.title || APP_NAME;
    const el = document.getElementById('page-title');
    if (el) el.textContent = title;
    const path = '#' + (ctx?.path || '');
    document.querySelectorAll('[data-nav]').forEach((a) => {
      const href = a.getAttribute('data-nav') || '';
      a.classList.toggle('is-active', href === path || (href === '#/home' && path === '#/'));
    });
    openGroupForPath(ctx?.path || '');
    document.getElementById('app-shell')?.classList.remove('nav-open');
  });

  refreshDriveButton();
  on(EVENTS.DRIVE_SYNC_CHANGED, refreshDriveButton);
}

/**
 * @param {{ id: string, label: string, items: { href: string, label: string }[] }} group
 * @param {boolean} open
 */
function renderNavGroup(group, open) {
  return `
    <details class="nav-group" data-group="${escapeHtml(group.id)}" ${open ? 'open' : ''}>
      <summary class="nav-group__summary">${escapeHtml(group.label)}</summary>
      <div class="nav-group__items">
        ${group.items
          .map(
            (n) =>
              `<a class="nav-link" href="${n.href}" data-nav="${n.href}"><span class="nav-link__text">${escapeHtml(n.label)}</span></a>`
          )
          .join('')}
      </div>
    </details>`;
}

function bindNavGroups() {
  document.querySelectorAll('.nav-group').forEach((el) => {
    el.addEventListener('toggle', saveNavOpen);
  });
}

function readSavedOpen() {
  try {
    const raw = localStorage.getItem(NAV_OPEN_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch {
    /* ignore */
  }
  return DEFAULT_OPEN;
}

function restoreNavOpen() {
  const open = new Set(readSavedOpen());
  document.querySelectorAll('.nav-group').forEach((el) => {
    const id = el.getAttribute('data-group');
    el.open = open.has(id);
  });
}

function saveNavOpen() {
  const ids = [...document.querySelectorAll('.nav-group')]
    .filter((el) => el.open)
    .map((el) => el.getAttribute('data-group'))
    .filter(Boolean);
  try {
    localStorage.setItem(NAV_OPEN_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

/**
 * Expand the group that contains the current route (does not collapse others).
 * @param {string} path
 */
function openGroupForPath(path) {
  const hash = path.startsWith('#') ? path : `#${path}`;
  for (const group of NAV_GROUPS) {
    const hit = group.items.some((item) => item.href === hash || (item.href === '#/transactions' && hash.startsWith('#/transactions')));
    if (hit) {
      const el = document.querySelector(`.nav-group[data-group="${group.id}"]`);
      if (el && !el.open) {
        el.open = true;
        saveNavOpen();
      }
      break;
    }
  }
}

async function refreshDriveButton() {
  const btn = document.getElementById('btn-drive');
  if (!btn) return;
  try {
    const state = await getSyncState();
    btn.classList.toggle('is-connected', Boolean(state.enabled));
    btn.title = state.enabled ? `Drive sync: ${state.folderName}` : 'Connect Google Drive';
  } catch {
    /* ignore */
  }
}

export function openSearch() {
  const overlay = document.getElementById('search-overlay');
  if (!overlay) return;
  overlay.hidden = false;
  const input = /** @type {HTMLInputElement} */ (document.getElementById('global-search'));
  const results = document.getElementById('search-results');
  input.value = '';
  input.focus();
  let t = 0;
  const run = () => {
    searchAll(input.value).then((res) => {
      if (!results) return;
      const txns = res.transactions
        .map(
          (x) =>
            `<a href="#/transactions/${x.id}">${escapeHtml(x.date)} · ${escapeHtml(x.description || x.type)} · ${x.amountMinor}</a>`
        )
        .join('');
      results.innerHTML = txns || '<p class="muted">No matches</p>';
    });
  };
  input.oninput = () => {
    clearTimeout(t);
    t = window.setTimeout(run, 120);
  };
  overlay.onclick = (e) => {
    if (e.target === overlay) overlay.hidden = true;
  };
}

export { router };
