const CACHE_NAME = 'rastreio-shell-v1';
const STATIC_PATHS = ['/', '/login', '/manifest.webmanifest', '/logo-laudo.png'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.all(
          STATIC_PATHS.map((path) =>
            cache.add(
              new Request(path, {
                cache: 'reload'
              })
            )
          )
        )
      )
      .catch(() => undefined)
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ).then(() => self.clients.claim())
    )
  );
});

function canCache(request, response) {
  if (!response || !response.ok) {
    return false;
  }

  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return false;
  }

  if (url.pathname.startsWith('/api/')) {
    return false;
  }

  return request.destination === 'document' || ['script', 'style', 'image', 'font'].includes(request.destination);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (canCache(request, response)) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        }
        return response;
      })
      .catch(async () => {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
          return cachedResponse;
        }

        throw new Error('Network unavailable and no cached response was found');
      })
  );
});
