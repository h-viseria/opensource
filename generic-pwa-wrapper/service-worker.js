/**
 * Service Worker for Generic PWA Wrapper
 * Provides offline support and basic caching for the wrapper itself
 */

const CACHE_NAME = 'pwa-wrapper-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './main.js',
  './manifest.json',
];

// Install event: cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching wrapper assets...');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate event: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event: network-first for external requests, cache-first for wrapper assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // For requests to the wrapper itself, use cache-first strategy
  if (url.hostname === self.location.hostname) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          return cached;
        }
        return fetch(request).then((response) => {
          if (response.ok && request.method === 'GET') {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, response.clone());
            });
          }
          return response;
        }).catch(() => {
          // Fallback to cached index.html for offline
          return caches.match('./index.html') ||
            new Response('Offline - Please check your connection', { status: 503 });
        });
      })
    );
    return;
  }

  // For external requests (iframed URLs), use network-first strategy
  // This allows iframes to load from their servers primarily
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful responses
        if (response.ok && request.method === 'GET') {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, response.clone());
          });
        }
        return response;
      })
      .catch(() => {
        // Try cache if network fails
        return caches.match(request).then((cached) => {
          return cached || new Response(
            'Offline - Unable to load content from ' + url.hostname,
            { status: 503 }
          );
        });
      })
  );
});

// Handle skipWaiting messages
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('[Service Worker] PWA Wrapper Service Worker loaded');

