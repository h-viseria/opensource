/**
 * PicoExpense entry — UI → services → engine → repositories → IndexedDB.
 */

import { APP_NAME, APP_VERSION } from './core/constants.js';
import { getDb } from './db/database.js';
import * as router from './core/router.js';
import { registerRoutes } from './routes.js';
import { mountShell } from './ui/layout.js';
import { initToasts } from './ui/toast.js';
import { applyTheme, bindSystemThemeListener } from './ui/theme.js';
import { bindShortcuts } from './ui/shortcuts.js';
import { mountPicoScanFab } from './ui/picoscanFab.js';
import { checkDriveSyncOnLaunch } from './ui/backupActions.js';
import { registerServiceWorker } from './pwa/register.js';
import { seedCurrencies } from './services/currencyService.js';
import { showToast } from './ui/toast.js';

async function main() {
  console.info(`${APP_NAME} v${APP_VERSION}`);
  const root = document.getElementById('app');
  if (!root) throw new Error('#app missing');

  try {
    await getDb();
    await seedCurrencies();
  } catch (err) {
    root.innerHTML = `<p class="banner" style="margin:2rem">IndexedDB failed: ${
      err instanceof Error ? err.message : String(err)
    }. PicoExpense cannot store data in this browser profile.</p>`;
    return;
  }

  mountShell(root);
  initToasts();
  bindShortcuts();
  bindSystemThemeListener();
  await applyTheme();
  mountPicoScanFab();
  registerRoutes();
  router.setOutlet(document.getElementById('outlet'));
  router.start();
  registerServiceWorker();
  checkDriveSyncOnLaunch().catch((err) => console.warn(err));
}

main().catch((err) => {
  console.error(err);
  showToast(err instanceof Error ? err.message : 'Startup failed', 'error');
});
