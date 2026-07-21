// Minimal service worker: caches the app shell so the page loads instantly on
// repeat visits and qualifies as an installable app on Android.
const CACHE = 'chat2text-v4';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  // Never cache the big OCR engine / language data from the CDN.
  if (request.url.includes('cdn.jsdelivr.net') || request.url.includes('tessdata')) {
    return;
  }
  e.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});
