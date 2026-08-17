/**
 * PicoLearning entry — UI → services → engines → repositories → IndexedDB.
 */

import { APP_NAME, APP_VERSION } from './core/constants.js';
import { getDb } from './db/database.js';
import * as router from './core/router.js';
import { registerRoutes } from './routes.js';
import { mountShell } from './ui/layout.js';
import { initToasts } from './ui/toast.js';
import { applyTheme, bindSystemThemeListener } from './ui/theme.js';
import { registerServiceWorker } from './pwa/register.js';
import { showToast } from './ui/toast.js';

async function main() {
  console.info(`${APP_NAME} v${APP_VERSION}`);
  const root = document.getElementById('app');
  if (!root) throw new Error('#app missing');

  try {
    await getDb();
  } catch (err) {
    root.innerHTML = `<p class="banner" style="margin:2rem">IndexedDB failed: ${
      err instanceof Error ? err.message : String(err)
    }. PicoLearning cannot store data in this browser profile.</p>`;
    return;
  }

  const { outlet } = mountShell(root);
  initToasts();
  bindSystemThemeListener();
  await applyTheme();
  registerRoutes();
  router.setOutlet(outlet);
  router.start();
  registerServiceWorker();
}

main().catch((err) => {
  console.error(err);
  showToast(err instanceof Error ? err.message : 'Startup failed', 'error');
});
