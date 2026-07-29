/**
 * PicoScan entry — Phase 1 standalone app.
 * Serve with: python -m http.server 30015
 */

import { APP_NAME, APP_VERSION } from './core/constants.js';
import { mountApp } from './ui/app.js';
import { PicoScan } from './widget/picoscan.js';

async function main() {
  console.info(`${APP_NAME} v${APP_VERSION}`);
  const root = document.getElementById('app');
  if (!root) throw new Error('#app missing');
  await mountApp(root);

  /** @type {any} */ (window).PicoScan = PicoScan;

  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('./sw.js');
    } catch (err) {
      console.warn('[PWA] SW registration failed', err);
    }
  }
}

main().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<p style="padding:2rem;font-family:sans-serif">PicoScan failed to start: ${
    err instanceof Error ? err.message : String(err)
  }</p>`;
});
