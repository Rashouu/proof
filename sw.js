// Offline: keep every app file in a cache and always serve from it.
// Bump VERSION on every release so phones download the new files (they apply on the next launch).
const VERSION = 'proof-v1';
const FILES = [
  './', 'index.html', 'styles.css', 'app.js', 'logic.js', 'db.js', 'manifest.webmanifest',
  'icon-180.png', 'icon-512.png', 'fonts/anybody.woff2', 'fonts/atkinson-hyperlegible-next.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || fetch(event.request)));
});
