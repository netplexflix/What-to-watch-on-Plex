// File: public/sw.js
const CACHE_NAME = 'wtw-v2';

// Only cache specific static assets, not dynamic content
const STATIC_ASSETS = [
  '/favicon.ico',
];

self.addEventListener('install', (event) => {
  // Skip waiting to activate immediately
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .catch((err) => console.log('Cache install error:', err))
  );
});

self.addEventListener('activate', (event) => {
  // Take control of all pages immediately
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Take control of all clients
      self.clients.claim()
    ])
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Don't intercept:
  // - API requests
  // - WebSocket connections
  // - Chrome extension requests
  // - Non-GET requests
  // - Asset bundles (JS/CSS with hashes)
  // - Dynamic manifest and PWA icons (served by Express)
  if (
    event.request.method !== 'GET' ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/ws') ||
    url.protocol === 'chrome-extension:' ||
    url.pathname.startsWith('/assets/') ||
    url.pathname === '/manifest.json' ||
    url.pathname.startsWith('/pwa-icons/') ||
    url.pathname === '/apple-touch-icon.png' ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.map')
  ) {
    return; // Let the browser handle these normally
  }
  
  // For navigation requests (HTML pages), use network-first strategy
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match('/index.html'))
    );
    return;
  }
  
  // For static assets in our cache list, try cache first
  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(event.request)
        .then((response) => response || fetch(event.request))
    );
    return;
  }
  
  // For everything else, use network only
  // Don't intercept - let browser handle normally
});