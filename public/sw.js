// IMPORTANTE: bumpar a versao do CACHE_NAME (ex: v3 -> v4) sempre que mudar
// STATIC_PATHS, comportamento de cache, ou quando precisar invalidar cache
// dos clients ja instalados. O nome muda -> browser detecta byte diff no
// /sw.js -> baixa novo SW -> activate roda -> caches antigos sao deletados
// (filtro key !== CACHE_NAME) -> clients.claim assume controle ->
// PwaRegistration detecta controllerchange e faz reload automatico.
// Sem o bump, o browser nao detecta mudanca no SW e clients continuam
// servidos do cache antigo eternamente. Foi a causa do bug "barra bege
// nao some" persistir por 13 tentativas de fix — todos os fixes estavam
// em prod mas os clients viam HTML/JS cacheado do SW antigo.
const CACHE_NAME = 'rastreio-shell-v10-2026-06-10-informe-offline';
const STATIC_PATHS = ['/', '/login', '/offline', '/informe', '/manifest.webmanifest', '/logo-laudo.png', '/logo-safras-branco.png'];
// Documentos cujo HTML e varrido no install pra precachear tambem os chunks
// JS/CSS que eles referenciam. Sem isso o precache do documento e inutil
// offline-cold: o HTML abre mas os assets so estariam no cache se o user
// tivesse visitado a pagina depois do deploy. /informe esta aqui pra o
// formulario de visita funcionar offline mesmo sem visita previa.
const PRECACHE_DOCUMENTS = ['/', '/login', '/offline', '/informe'];

// Extrai URLs /_next/static do HTML de um documento ja precacheado e as
// adiciona ao cache (scripts, css, preloads). Para cada CSS cacheado,
// varre tambem url(...) de /_next/static/media (fontes/imagens). Tudo
// best-effort: a falha de um asset nao derruba o install.
async function cacheDocumentAssets(cache, path) {
  try {
    const response = await cache.match(path);
    if (!response) {
      return;
    }

    const html = await response.clone().text();
    const assetUrls = new Set(html.match(/\/_next\/static\/[^"'\s\\)]+/g) || []);
    await Promise.all(
      [...assetUrls].map((assetUrl) =>
        cache.add(new Request(assetUrl, { cache: 'reload' })).catch(() => undefined)
      )
    );

    const cssUrls = [...assetUrls].filter((assetUrl) => assetUrl.includes('/css/'));
    await Promise.all(cssUrls.map((cssUrl) => cacheCssAssets(cache, cssUrl)));
  } catch {
    // Best-effort.
  }
}

async function cacheCssAssets(cache, cssUrl) {
  try {
    const response = await cache.match(cssUrl);
    if (!response) {
      return;
    }

    const css = await response.clone().text();
    const mediaUrls = new Set(css.match(/\/_next\/static\/media\/[^"'\s\\)]+/g) || []);
    await Promise.all(
      [...mediaUrls].map((mediaUrl) =>
        cache.add(new Request(mediaUrl, { cache: 'reload' })).catch(() => undefined)
      )
    );
  } catch {
    // Best-effort.
  }
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async (cache) => {
        // Falha individual nao derruba o install dos demais paths.
        await Promise.all(
          STATIC_PATHS.map((path) =>
            cache
              .add(
                new Request(path, {
                  cache: 'reload'
                })
              )
              .catch(() => undefined)
          )
        );

        await Promise.all(PRECACHE_DOCUMENTS.map((path) => cacheDocumentAssets(cache, path)));
      })
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

        if (request.destination === 'document') {
          const offlinePage = await caches.match('/offline');
          if (offlinePage) {
            return offlinePage;
          }
        }

        throw new Error('Network unavailable and no cached response was found');
      })
  );
});
