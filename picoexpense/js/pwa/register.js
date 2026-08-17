import { showToast } from '../ui/toast.js';

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return null;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          showToast('Update available — refresh to load the new version', 'info');
        }
      });
    });
    return reg;
  } catch (err) {
    console.warn('[PWA] SW registration failed', err);
    return null;
  }
}
