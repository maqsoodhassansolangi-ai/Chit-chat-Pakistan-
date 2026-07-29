// ============================================
// ChitChat Pakistan — PWA Service Worker (v2)
// ============================================
// STRATEGY: network-first for everything same-origin, cache only as an
// offline fallback. This is deliberate — the usual cache-first pattern
// requires bumping a CACHE_NAME by hand on every deploy (or the PWA
// keeps serving old files forever). Network-first means every file is
// always fetched fresh first; the cache is only read when the network
// request itself fails (offline / no signal).
//
// SHELL PRE-CACHE: on install we pre-cache a small set of app-shell
// files so the very first offline visit has something to show
// (previously the first offline visit returned nothing because the
// cache was only populated lazily on the first online visit).
//
// CACHE_NAME below is NOT a per-deploy version — it only needs bumping
// if this service-worker.js file's OWN logic changes.
//
// Firebase Realtime Database runs over WebSockets — this SW never sees
// or affects it, so Messenger/calls behave identically with or without
// this file.
// ============================================

const CACHE_NAME = 'chitchat-shell-v3';

// App shell: minimal set of files needed to render the page offline.
// IMPORTANT: keep this list in sync with the actual files that exist.
const PRECACHE_URLS = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/messenger/messenger.html',
    '/messenger/css/messenger.css',
    '/messenger/js/messenger-v1.js',
    '/messenger/js/messenger-v2.js',
    '/messenger/js/messenger-v3.js',
    '/messenger/js/messenger-v3b.js',
    '/messenger/js/messenger-v4a.js',
    '/messenger/js/messenger-v4b.js',
    '/messenger/js/messenger-v5a.js',
    '/messenger/js/messenger-v5b.js',
    '/pwa-register.js',
    '/js/features/feature-auth-extended.js',
    '/js/features/feature-admin-restructure.js',
    '/js/features/feature-message-cleanup.js',
    '/js/features/feature-rate-limit.js',
    '/css/features/feature-auth-extended.css',
    '/css/features/feature-admin-restructure.css'
];

// Only same-origin GET requests are ever cached. Firebase SDK CDN
// scripts, Cloudinary uploads, ipapi.co, etc. are left completely
// alone — the browser handles those with its own normal caching.
function isCacheable(request) {
    if (request.method !== 'GET') return false;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return false;
    return true;
}

self.addEventListener('install', function (event) {
    // Pre-cache the app shell so the very first offline visit works.
    // Use {cache: 'reload'} to bypass the HTTP cache and always get
    // a fresh copy (avoids a stale pre-cached file if the SW
    // installs right after a deploy).
    event.waitUntil(
        caches.open(CACHE_NAME).then(function (cache) {
            return Promise.all(
                PRECACHE_URLS.map(function (url) {
                    return fetch(new Request(url, { cache: 'reload' }))
                        .then(function (response) {
                            if (response.ok) return cache.put(url, response);
                        })
                        .catch(function () {
                            // Pre-cache failures are non-fatal — the file may not
                            // exist yet (e.g. on a fresh deploy), and the SW still
                            // installs successfully.
                        });
                })
            );
        }).then(function () {
            // Take over immediately instead of waiting for all tabs to close —
            // paired with clients.claim() below so an update applies on the
            // very next navigation instead of needing the app closed & reopened.
            return self.skipWaiting();
        })
    );
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (names) {
            return Promise.all(
                names.filter(function (name) { return name !== CACHE_NAME; })
                     .map(function (name) { return caches.delete(name); })
            );
        }).then(function () {
            return self.clients.claim();
        })
    );
});

self.addEventListener('fetch', function (event) {
    const request = event.request;
    if (!isCacheable(request)) return; // let the browser handle it normally

    event.respondWith(
        fetch(request).then(function (networkResponse) {
            // Only cache genuinely good responses (skip opaque/error responses)
            if (networkResponse && networkResponse.ok) {
                const copy = networkResponse.clone();
                caches.open(CACHE_NAME).then(function (cache) {
                    cache.put(request, copy);
                });
            }
            return networkResponse;
        }).catch(function () {
            // Offline (or request failed) — fall back to the last good copy
            return caches.match(request).then(function (cached) {
                if (cached) return cached;
                // Last resort for a full-page navigation with nothing cached yet
                if (request.mode === 'navigate') {
                    return caches.match('/index.html');
                }
                return Response.error();
            });
        })
    );
});

// ============================================
// Broadcast a message to all open tabs/windows so the page can show an
// "Update available — tap to reload" banner. Called from the activate
// event above would be too early (the update is just being installed),
// so we instead post from here when a new SW takes over via claim().
// ============================================
self.addEventListener('activate', function (event) {
    event.waitUntil(
        self.clients.matchAll({ type: 'window' }).then(function (clients) {
            clients.forEach(function (client) {
                client.postMessage({ type: 'SW_ACTIVATED' });
            });
        })
    );
});
