const CACHE_NAME = 'zen-pacer-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/icon.png',
  '/manifest.json'
];

// Install event: cache the files
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Fetch event: serve from cache if available, otherwise go to network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
