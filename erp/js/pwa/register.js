/**
 * Register service worker and surface update prompts (PWA §20).
 */

import { showToast } from '../ui/toast.js';

/**
 * @returns {Promise<ServiceWorkerRegistration|null>}
 */
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;

  // file:// and some hosts block SW
  if (location.protocol !== 'http:' && location.protocol !== 'https:') {
    return null;
  }

  try {
    const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });

    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          showToast('App update available — open Settings to refresh', 'info');
        }
      });
    });

    // Reload when a new worker takes control after SKIP_WAITING
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      // Caller may reload; avoid double-reload loops on first install
    });

    return reg;
  } catch (err) {
    console.warn('[PWA] Service worker registration failed:', err);
    return null;
  }
}
