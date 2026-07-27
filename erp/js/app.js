/**
 * PicoERP — application bootstrap.
 */

import { APP_NAME, APP_VERSION, EVENTS } from './core/constants.js';
import { on } from './core/eventBus.js';
import * as router from './core/router.js';
import { getDatabase } from './db/database.js';
import * as bookService from './services/bookService.js';
import { initToasts, showToast } from './ui/toast.js';
import { mountShell, mountBookGate } from './ui/layout.js';
import { registerRoutes } from './routes.js';
import { renderBooks } from './ui/pages/books.js';
import { registerServiceWorker } from './pwa/register.js';

/** @type {boolean} */
let hasActiveBook = false;

/** @type {string | null} */
let mountedBookId = null;

/** @type {boolean} */
let booting = false;

async function main() {
  console.info(`${APP_NAME} v${APP_VERSION}`);

  initToasts();

  try {
    await getDatabase();
  } catch (err) {
    document.getElementById('app').innerHTML = `
      <div class="book-gate__body">
        <div class="book-gate__panel">
          <h1 class="book-gate__headline">Storage unavailable</h1>
          <p class="book-gate__lede">
            IndexedDB could not be opened. Use a modern browser and serve this app over
            <span class="mono">http://localhost</span> (not a <span class="mono">file://</span> URL).
          </p>
          <p class="muted" style="font-size:0.875rem">${err instanceof Error ? err.message : String(err)}</p>
        </div>
      </div>`;
    return;
  }

  on(EVENTS.BOOK_CHANGED, (payload = {}) => {
    const nextId = payload.bookId ?? null;
    if (nextId !== mountedBookId) {
      setTimeout(() => {
        boot().catch((e) => {
          console.error(e);
          showToast('Failed to refresh session', 'error');
        });
      }, 0);
    }
  });

  on(EVENTS.APP_ERROR, ({ message }) => {
    showToast(message || 'Something went wrong', 'error');
  });

  await boot();

  // PWA — register after first paint so IndexedDB boot is not blocked
  registerServiceWorker().catch((err) => console.warn('[PWA]', err));
}

async function boot() {
  if (booting) return;
  booting = true;

  try {
    router.stop();

    const session = await bookService.getSessionContext();
    const allBooks = await bookService.listBooks();
    hasActiveBook = Boolean(session.book);
    mountedBookId = session.book?.id ?? null;

    /** @type {HTMLElement} */
    let outlet;

    // No books at all → onboarding gate
    if (allBooks.length === 0) {
      ({ outlet } = mountBookGate());
      router.setOutlet(outlet);
      await renderBooks(
        {
          path: '/books',
          params: {},
          query: {},
          route: { path: '/books', title: 'Books', render: () => {} },
        },
        outlet,
        {
          gateMode: true,
          onBookActivated: () => {
            setTimeout(() => boot().catch(console.error), 50);
          },
        }
      );
      if (location.hash !== '#/books') {
        location.replace('#/books');
      }
      return;
    }

    // Books exist → full shell (portfolio works even without an active book)
    ({ outlet } = mountShell(session));
    router.setOutlet(outlet);

    // Ensure inventory / tax ledgers exist for older books
    if (session.book) {
      const { ensureInventoryMasters } = await import('./services/inventoryService.js');
      const { ensureTaxMasters } = await import('./services/taxService.js');
      await ensureInventoryMasters(session.book.id);
      await ensureTaxMasters(session.book.id);
    }

    registerRoutes(outlet, {
      requireBook: () => hasActiveBook,
      onBookActivated: () => boot().catch(console.error),
      onReset: () => {
        location.reload();
      },
    });
    router.start();

    // If no active book, send user to portfolio (unless on books/settings)
    if (!hasActiveBook) {
      const path = router.getLocation().path;
      if (path !== '/books' && path !== '/settings' && path !== '/portfolio') {
        router.navigate('/portfolio', { replace: true });
      }
    }
  } finally {
    booting = false;
  }
}

main().catch((err) => {
  console.error('[App] fatal:', err);
  const app = document.getElementById('app');
  if (app) {
    app.innerHTML = `
      <div class="book-gate__body">
        <div class="book-gate__panel">
          <h1 class="book-gate__headline">Startup failed</h1>
          <p class="book-gate__lede">${err instanceof Error ? err.message : String(err)}</p>
        </div>
      </div>`;
  }
});
