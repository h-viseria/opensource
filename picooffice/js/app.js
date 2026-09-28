export const APP_BUILD = '2026-09-28-openwith1';

import { registerServiceWorker } from './pwa/register.js';
import { installFileLaunchHandler } from './pwa/fileHandling.js';
import { consumePendingShare } from './pwa/shareTarget.js';

async function disableServiceWorker() {
  if (navigator.serviceWorker?.getRegistrations) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }
  if (window.caches?.keys) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
}

function showBootError(message) {
  const root = document.querySelector('#app');
  if (!root) return;
  root.replaceChildren();
  const main = document.createElement('main');
  main.className = 'app';
  main.innerHTML = '<section class="empty"><div class="hero"><h1>PicoOffice could not start</h1></div></section>';
  const lead = document.createElement('p');
  lead.className = 'muted';
  lead.textContent = message;
  const hint = document.createElement('p');
  hint.className = 'muted';
  hint.innerHTML = `Build ${APP_BUILD}. Open DevTools → Network → disable cache, hard refresh. Use <code>?nosw=1</code> to disable the service worker.`;
  main.querySelector('.hero').append(lead, hint);
  root.append(main);
}

async function boot() {
  const nosw = new URLSearchParams(location.search).has('nosw');
  if (nosw) await disableServiceWorker();
  else await registerServiceWorker();

  try {
    const { App } = await import(`./app/App.js?build=${APP_BUILD}`);
    const app = new App(document.querySelector('#app'));
    app.build = APP_BUILD;

    /** @type {Promise<void>} */
    let appReady;

    const openFile = async (file) => {
      await appReady;
      try {
        await app.openFile(file);
      } catch (error) {
        app.toast(error instanceof Error ? error.message : String(error));
      }
    };

    installFileLaunchHandler(openFile);

    appReady = app.start().then(() => {
      window.PicoOffice = app;
    });

    await appReady;
    await consumePendingShare(openFile);
  } catch (error) {
    console.error(error);
    showBootError(error instanceof Error ? error.message : String(error));
  }
}

boot();
