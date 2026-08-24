/**
 * Service Worker for MF Holdings Lite PWA
 * Enables offline support and caching strategies
 */

const CACHE_NAME = 'mf-holdings-v2';
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
  './app/application/services/reportService.js',
  './app/infrastructure/db/indexedDb.js',
  './app/infrastructure/api/mfApiClient.js',
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

// Fetch event: Network-first strategy for API calls, Cache-first for assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Network-first for API calls and external resources
  if (url.hostname !== self.location.hostname || url.pathname.includes('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful API responses
          if (response.ok && request.method === 'GET') {
            const cache = caches.open(CACHE_NAME);
            cache.then((c) => c.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => {
          // Fall back to cache if network fails
          return caches.match(request).then((cached) => {
            return cached || new Response('Offline - resource not available', { status: 503 });
          });
        })
    );
    return;
  }

  // Cache-first for local assets
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

