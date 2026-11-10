// public/sw.js
// Service worker mínimo de RAVEXRADAR: hace la web instalable como app y muestra una
// pantalla propia si abres la app sin conexión. No guarda en caché nada más (los datos
// de Supabase, el mapa y los archivos de la web siempre se piden a internet).
const CACHE = 'rr-shell-v1';
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Solo las páginas: si no hay conexión, pantalla "Sin conexión"
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)));
  }
});
