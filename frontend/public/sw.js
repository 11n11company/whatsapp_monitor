/**
 * WhatsApp Enterprise Monitor - Progressive Web App Service Worker
 * Version: v1.0.0
 * 
 * STRICT SECURITY CONSTRAINTS:
 * 1. ONLY caches static application shell assets (HTML, CSS, JS, branding icons).
 * 2. STRICTLY NEVER caches private API routes (/api/*), SSE live streams, WhatsApp messages,
 *    customer details, QR codes, media files, or auth tokens.
 * 3. Bypasses all non-GET requests and authenticated endpoints natively to network.
 */

const CACHE_NAME = 'wam-app-shell-v1';

// Static application shell assets to pre-cache
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable.png',
  '/icons/icon-512.svg',
  '/icons/favicon.svg'
];

// Service Worker Install
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Pre-cache core shell
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[PWA SW] Pre-caching non-fatal warning:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Service Worker Activate - Clean up old cache versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Service Worker Fetch Listener
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // 1. STRICT PRIVACY GUARD: Bypass all API endpoints, SSE streams, media downloads, and non-GET requests
  if (
    request.method !== 'GET' ||
    url.pathname.startsWith('/api/') ||
    url.pathname.includes('/live-stream') ||
    url.pathname.includes('/stream-ticket') ||
    url.pathname.includes('/media/') ||
    request.headers.get('accept')?.includes('text/event-stream') ||
    request.headers.get('Authorization')
  ) {
    // Network-only: Let browser make the standard network request without any SW caching or interference
    return;
  }

  // 2. Navigation Requests (HTML pages)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // If valid response, update cached index.html
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put('/index.html', clone);
            });
          }
          return response;
        })
        .catch(async () => {
          // If offline, attempt to serve cached app shell; fallback to offline.html
          const cache = await caches.open(CACHE_NAME);
          const cachedIndex = await cache.match('/index.html');
          if (cachedIndex) return cachedIndex;
          const cachedOffline = await cache.match('/offline.html');
          return cachedOffline || Response.error();
        })
    );
    return;
  }

  // 3. Static Assets (CSS, JS bundles, images, icons, fonts)
  // Stale-while-revalidate for static assets
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            (url.pathname.startsWith('/assets/') ||
             url.pathname.startsWith('/icons/') ||
             url.pathname.endsWith('.js') ||
             url.pathname.endsWith('.css') ||
             url.pathname.endsWith('.svg') ||
             url.pathname.endsWith('.png') ||
             url.pathname.endsWith('.woff2'))
          ) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, clone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // If offline and static asset not in cache, fallback
          return cachedResponse || Response.error();
        });

      return cachedResponse || fetchPromise;
    })
  );
});

// Support manual skipWaiting message from client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

