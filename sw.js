// Permet à l'application de fonctionner sans connexion.
// Pense à changer le numéro de version quand tu modifies les fichiers.
const CACHE = 'mes-depenses-v9';
const FILES = [
  './',
  './index.html',
  './style.css',
  './js/core.js',
  './js/dialog.js',
  './js/photos.js',
  './js/recurring.js',
  './js/stats.js',
  './js/list.js',
  './js/form.js',
  './js/plus.js',
  './js/backup.js',
  './js/settings.js',
  './js/security.js',
  './js/install.js',
  './js/motion.js',
  './js/main.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Réseau d'abord (pour avoir la dernière version), cache si hors ligne.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
