/**
 * PicoScan embed entry (iframe). No service worker — avoid SW clashes with host apps.
 */

import { APP_NAME, APP_VERSION } from '../core/constants.js';
import { mountWidgetApp } from '../ui/widgetApp.js';
import { PicoScan } from './picoscan.js';

async function main() {
  console.info(`${APP_NAME} widget v${APP_VERSION}`);
  const root = document.getElementById('app');
  if (!root) throw new Error('#app missing');
  await mountWidgetApp(root);
  /** @type {any} */ (window).PicoScan = PicoScan;

  try {
    window.parent?.postMessage(
      { source: 'picoscan', type: 'picoscan:ready', version: APP_VERSION },
      window.location.origin
    );
  } catch {
    /* ignore */
  }
}

main().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<p style="padding:1rem;font-family:sans-serif">PicoScan widget failed: ${
    err instanceof Error ? err.message : String(err)
  }</p>`;
});
