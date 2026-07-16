const CACHE_NAME = 'nlr-windfarm-v55';

// Critical assets (offline breaks without them) vs optional (must not abort install).
const CRITICAL_ASSETS = [
  './',
  './index.html',
  './manifest.json'
];
const OPTIONAL_ASSETS = [
  './icon-192.png',
  './icon-512.png'
];

// Tell any open pages that the offline copy is fully cached.
async function broadcast(type) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  for (const client of clients) {
    client.postMessage({ type });
  }
}

// Install: cache the app shell.
// CRITICAL uses addAll (all-or-nothing — the app is useless without index.html).
// OPTIONAL is cached one-by-one and ignored on failure, so a missing/renamed
// icon can never wipe out the offline cache.
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CRITICAL_ASSETS);
    await Promise.allSettled(OPTIONAL_ASSETS.map((url) => cache.add(url)));
    await broadcast('CACHE_READY');
  })());
  self.skipWaiting();
});

// Activate: clean up old caches, take control, and confirm readiness.
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
    await self.clients.claim();
    await broadcast('CACHE_READY');
  })());
});

// A reloaded page can ask whether the shell is already cached.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CHECK_CACHE') {
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE_NAME);
      const hit = await cache.match('./index.html');
      if (hit && event.source) {
        event.source.postMessage({ type: 'CACHE_READY' });
      }
    })());
  }
});

// Fetch: cache-first, with a navigation fallback to index.html.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return Response.error();
      });
    })
  );
});
