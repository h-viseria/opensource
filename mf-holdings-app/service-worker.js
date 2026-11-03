/**
 * Service Worker for MF Holdings Lite PWA
 * Enables offline support and caching strategies
 */

const CACHE_NAME = 'mf-holdings-v10';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './main.js',
  './app/ui/appController.js',
  './app/ui/tabNavigation.js',
  './app/application/services/holdingsImportService.js',
  './app/application/services/amcReportService.js',
  './app/application/services/schemeMatcher.js',
  './app/application/services/schemeCodeSyncService.js',
  './app/application/services/navSnapshotService.js',
  './app/application/services/amfiNavSnapshotService.js',
  './app/application/services/reportService.js',
  './app/application/services/periodPnlService.js',
  './app/infrastructure/db/indexedDb.js',
  './app/infrastructure/api/mfApiClient.js',
  './app/infrastructure/api/amfiClient.js',
  './app/infrastructure/parsers/mfcCasParser.js',
  './app/shared/formatters.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
];

// Install event: cache assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching assets...');
      // Only cache local files, skip CDN for now
      return cache.addAll(ASSETS_TO_CACHE.filter(url => !url.includes('cdn')));
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

// Fetch event: Cache-first for same-origin assets. Do not intercept MFAPI or
// other cross-origin calls — that commonly shows up as a CORS error in the page
// even though the same URL opens fine in a new tab.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

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
        return new Response('Offline - resource not available', { status: 503 });
      });
    })
  );
});

// Handle messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('[Service Worker] Loaded');

