/* Digital Dokan — service worker (DD-F6)
   Job: make the app shell load offline + make the app installable.
   Data sync is NOT done here — Firestore offline persistence (Stage B-1)
   already queues shop data and syncs it when the connection returns.

   =====================================================================
   ⚠ VERSION-BUMP RULE — READ BEFORE ANY FUTURE APP PUSH ⚠
   Every future push that changes mydokan2.html (or any precached file)
   MUST bump DD_SW_VERSION below to a new unique value. The cache name
   contains the version, so a bump = old cache deleted on activate and
   users pick up the fresh shell. Forgetting the bump is safe for the
   HTML itself (network-first below always fetches fresh HTML while
   online), but static assets could stay stale — so bump it. Always.
   ===================================================================== */
'use strict';

var DD_SW_VERSION = 'dd-20261113-v5';
var DD_CACHE = 'digital-dokan-' + DD_SW_VERSION;

/* App shell precached on install. All paths are relative to this
   service worker's scope (/digital-dokan/ on GitHub Pages). */
var DD_PRECACHE = [
  './mydokan2.html',
  './digital-dokan-icon.webp',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './favicon-32.png',
  './favicon-180.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(DD_CACHE)
      .then(function (cache) { return cache.addAll(DD_PRECACHE); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (names) {
        return Promise.all(names.map(function (name) {
          /* Delete every older Digital Dokan cache; keep only the current one. */
          if (name.indexOf('digital-dokan-') === 0 && name !== DD_CACHE) {
            return caches.delete(name);
          }
          return null;
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;

  /* Only same-origin GET requests are handled. Everything else — POSTs,
     and every Firebase / Google API call (firestore.googleapis.com,
     identitytoolkit, securetoken, gstatic SDK downloads, …) — is
     cross-origin or non-GET and passes straight through to the network,
     completely untouched by this worker. */
  if (request.method !== 'GET') return;
  var url;
  try { url = new URL(request.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  var isPageLoad = request.mode === 'navigate' ||
    (request.headers.get('accept') || '').indexOf('text/html') !== -1 ||
    url.pathname.slice(-5) === '.html';

  if (isPageLoad) {
    /* NETWORK-FIRST for pages: a new deploy reaches the shopkeeper on
       the very next load while online. The fresh copy also refreshes
       the cache, so the offline fallback is always the latest version
       this device has seen. */
    event.respondWith(
      fetch(request)
        .then(function (response) {
          if (response && response.ok) {
            var copy = response.clone();
            caches.open(DD_CACHE).then(function (cache) { cache.put(request, copy); });
          }
          return response;
        })
        .catch(function () {
          return caches.match(request).then(function (cached) {
            if (cached) return cached;
            /* Unknown page while offline → fall back to the app itself. */
            return caches.match('./mydokan2.html');
          });
        })
    );
    return;
  }

  /* CACHE-FIRST for static assets (icons, manifest, images, fonts,
     styles): instant loads and full offline availability. A cache miss
     goes to the network and is then stored for next time. */
  event.respondWith(
    caches.match(request).then(function (cached) {
      if (cached) return cached;
      return fetch(request).then(function (response) {
        if (response && response.ok) {
          var copy = response.clone();
          caches.open(DD_CACHE).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      });
    })
  );
});
