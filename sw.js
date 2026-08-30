/**
 * VIYACRAZE — High-Performance Frame Cache Service Worker
 */

const CACHE_NAME = 'viyacraze-v2';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/about.html',
  '/contact.html',
  '/style.css',
  '/app.js',
  '/VIYA_logo_gold.svg',
  '/viyahero.jpeg',
  '/viyahero-gold.jpeg'
];

// Install Event: Pre-cache core shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CORE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event: Cleanup old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Cache-First for WebP frames & images, Stale-While-Revalidate for HTML/CSS/JS
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Cache-First strategy for frames and media
  if (url.pathname.includes('/frames/') || url.pathname.endsWith('.webp') || url.pathname.endsWith('.jpeg') || url.pathname.endsWith('.png') || url.pathname.endsWith('.svg')) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // Network-First / Stale-While-Revalidate for other assets
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networked = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);

      return cached || networked;
    })
  );
});
