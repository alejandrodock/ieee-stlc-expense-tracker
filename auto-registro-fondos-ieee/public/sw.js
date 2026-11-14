// Bump on every deploy that changes caching behaviour; old caches are purged on activate.
const CACHE_NAME = 'ieee-projects-v4';
const OFFLINE_URLS = ['/', '/stlc', '/hart'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_URLS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Only same-origin app assets; never cache API data, receipts or third-party requests.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/galeria/')) return;
  // RSC responses are not full HTML documents and must not replace a cached page.
  if (request.headers.has('RSC') || url.searchParams.has('_rsc')) return;

  // Network-first, falling back to cache when offline.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((r) => r || caches.match('/')))
  );
});
