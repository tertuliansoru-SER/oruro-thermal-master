const CACHE_NAME = 'otm-120h-v2';

self.addEventListener('install', () => {
  console.log('[SW] Instalando v2');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activando v2');
  event.waitUntil(
    caches.keys().then(names => 
      Promise.all(names.map(name => {
        console.log('[SW] Borrando caché:', name);
        return caches.delete(name);
      }))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .catch(() => caches.match(event.request))
  );
});
