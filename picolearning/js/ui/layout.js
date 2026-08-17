/**
 * Application shell — sidebar, topbar, outlet, mobile bottom nav.
 */

import { APP_NAME, APP_VERSION, EVENTS } from '../core/constants.js';
import { on } from '../core/eventBus.js';
import { escapeHtml } from '../utils/html.js';

/** @type {{ path: string, label: string, icon: string }[]} */
export const NAV = [
  { path: '/home', label: 'Home', icon: '⌂' },
  { path: '/library', label: 'Library', icon: '▤' },
  { path: '/learn', label: 'Learn', icon: '◈' },
  { path: '/ask', label: 'Ask', icon: '?' },
  { path: '/quiz', label: 'Quiz', icon: '✓' },
  { path: '/progress', label: 'Progress', icon: '◎' },
  { path: '/settings', label: 'Settings', icon: '⚙' },
];

const MOBILE_NAV = NAV.filter((n) =>
  ['/home', '/library', '/learn', '/ask', '/quiz'].includes(n.path)
);

/**
 * Mount the app chrome into root. Creates #outlet and #toast-root.
 * @param {HTMLElement} root
 */
export function mountShell(root) {
  if (!root) throw new Error('mountShell requires a root element');

  root.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar" aria-label="Main">
        <div class="sidebar__brand">
          <a href="#/home" class="brand-mark">${escapeHtml(APP_NAME)}</a>
          <p class="sidebar__tag muted">Study from your textbooks — on this device</p>
        </div>
        <nav class="sidebar__nav" aria-label="Primary">
          ${NAV.map(
            (item) => `
            <a class="nav-link" data-nav="${escapeHtml(item.path)}" href="#${escapeHtml(item.path)}">
              <span class="nav-link__icon" aria-hidden="true">${item.icon}</span>
              <span class="nav-link__label">${escapeHtml(item.label)}</span>
            </a>`
          ).join('')}
        </nav>
        <footer class="sidebar__foot">
          <p class="muted">Your learning data stays on this device.</p>
          <p class="muted mono">${escapeHtml(APP_NAME)} v${escapeHtml(APP_VERSION)}</p>
          <p><a href="#/privacy" class="nav-link nav-link--inline">Privacy</a></p>
        </footer>
      </aside>
      <div class="app-main">
        <header class="topbar">
          <button type="button" class="btn btn--ghost btn--sm topbar__menu" data-action="toggle-nav" aria-label="Menu">☰</button>
          <h1 class="topbar__title" id="page-title">Home</h1>
          <div class="topbar__actions"></div>
        </header>
        <main class="content" id="outlet" tabindex="-1"></main>
      </div>
      <nav class="bottom-nav" aria-label="Mobile">
        ${MOBILE_NAV.map(
          (item) => `
          <a class="bottom-nav__link" data-nav="${escapeHtml(item.path)}" href="#${escapeHtml(item.path)}">
            <span aria-hidden="true">${item.icon}</span>
            <span>${escapeHtml(item.label)}</span>
          </a>`
        ).join('')}
      </nav>
      <div id="toast-root" class="toast-root" aria-live="polite"></div>
    </div>
  `;

  root.querySelector('[data-action="toggle-nav"]')?.addEventListener('click', () => {
    root.querySelector('.app-shell')?.classList.toggle('nav-open');
  });

  on(EVENTS.ROUTE_CHANGE, (ctx) => {
    const path = ctx?.path || '/home';
    const title = ctx?.route?.title || APP_NAME;
    const titleEl = root.querySelector('#page-title');
    if (titleEl) titleEl.textContent = title;

    root.querySelectorAll('[data-nav]').forEach((el) => {
      const navPath = el.getAttribute('data-nav') || '';
      const active =
        path === navPath ||
        (navPath !== '/home' && path.startsWith(navPath + '/')) ||
        (navPath === '/library' && path.startsWith('/document'));
      el.classList.toggle('is-active', active);
      if (active) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    });

    root.querySelector('.app-shell')?.classList.remove('nav-open');
  });

  return {
    outlet: /** @type {HTMLElement} */ (root.querySelector('#outlet')),
  };
}
