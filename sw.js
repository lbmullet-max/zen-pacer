const CACHE_NAME = 'breath-beautiful-v5';
const ASSETS = [
  '/', '/index.html', '/icon.png', '/manifest.json',
  '/fonts/DMSans-variable.woff2', '/fonts/DMSerifDisplay-normal-400.woff2',
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(r => r || fetch(event.request))
  );
});
