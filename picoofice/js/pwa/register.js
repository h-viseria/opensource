export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return null;
  if (new URLSearchParams(location.search).has('nosw')) return null;
  try {
    return await navigator.serviceWorker.register('./sw.js', { scope: './' });
  } catch (error) {
    console.warn('[PicoOffice] Service worker registration failed:', error);
    return null;
  }
}
