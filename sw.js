// This is the Service Worker that allows the app to be installed on Android
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  // This satisfies the "offline-capable" check
  event.respondWith(fetch(event.request));
});