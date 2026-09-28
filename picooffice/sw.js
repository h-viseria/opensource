/**
 * Minimal service worker for Web Share Target and PWA install metadata.
 * Bump CACHE_VERSION when share-handling behavior changes.
 */
const CACHE_VERSION = '2026-09-28-openwith1';
const SHARE_CACHE = 'picooffice-share-v1';
const SHARE_KEY = 'pending-share';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith('picooffice-share-') && key !== SHARE_CACHE).map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST') return;
  if (!url.pathname.endsWith('/share-target') && !url.pathname.endsWith('/share-target/')) return;

  event.respondWith(handleShareTarget(event.request));
});

async function handleShareTarget(request) {
  const formData = await request.formData();
  /** @type {File | null} */
  let file = null;

  for (const value of formData.values()) {
    if (value instanceof File && value.size > 0) {
      file = value;
      break;
    }
  }

  if (file) {
    const cache = await caches.open(SHARE_CACHE);
    const headers = new Headers({
      'x-filename': encodeURIComponent(file.name),
      'x-mimetype': file.type || 'application/octet-stream',
    });
    await cache.put(SHARE_KEY, new Response(await file.arrayBuffer(), { headers }));
  }

  const redirect = new URL('./', self.location.origin);
  redirect.searchParams.set('shared', '1');
  return Response.redirect(redirect.toString(), 303);
}
