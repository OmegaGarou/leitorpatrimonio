const CACHE_NAME = 'patrimonio-pwa-v18';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon.svg',
  './js/xlsx.full.min.js',
  './js/html5-qrcode.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

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

self.addEventListener('fetch', (event) => {
  // Ignora requisições não GET, chamadas ao Google Apps Script ou APIs dinâmicas
  if (
    event.request.method !== 'GET' ||
    !event.request.url.startsWith('http') ||
    event.request.url.includes('script.google.com') ||
    event.request.url.includes('googleusercontent.com') ||
    event.request.url.includes('api.github.com') ||
    event.request.url.includes('raw.githubusercontent.com') ||
    event.request.url.includes('serveousercontent.com') ||
    event.request.url.includes('endpoint.json') ||
    event.request.url.includes('/api') ||
    event.request.url.includes('action=')
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return networkResponse;
        }
        // Se o túnel oscilar momentaneamente (502/503/504), entrega do cache sem exibir erro na tela
        return caches.match(event.request).then((cached) => cached || caches.match('./index.html') || networkResponse);
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => cached || caches.match('./index.html'));
      })
  );
});
