// ============================================
// ChitChat Pakistan — PWA Service Worker
// ============================================
// STRATEGY: network-first for everything same-origin, cache only as an
// offline fallback. This is deliberate, not the "usual" PWA pattern —
// the usual cache-first pattern requires bumping a CACHE_NAME by hand
// on every deploy (or the PWA keeps serving old files forever). Since
// files here are pushed straight to GitHub with no build step, that
// manual bump would get forgotten. Network-first means every file this
// SW touches is always fetched fresh from the live site first; the
// cache is only ever read when the network request itself fails
// (offline / no signal) — so new files/edits show up automatically the
// next time the app is opened online, with zero manual "upgrade" step.
//
// CACHE_NAME below is NOT a per-deploy version — it only needs bumping
// if this service-worker.js file's OWN logic changes (rare, a real
// code change to this file, done as a session like any other bug fix).
// Everyday content deploys (index.html/app.js/messenger/* edits etc.)
// need no change here at all.
//
// Firebase Realtime Database (chat/calls/typing/status/etc.) runs over
// WebSockets, not fetch() — this service worker never sees or affects
// it, so Messenger/calls behave identically with or without this file.
// ============================================

const CACHE_NAME = 'chitchat-shell-v1';

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
    // Take over immediately instead of waiting for all tabs to close —
    // paired with clients.claim() below so an update applies on the
    // very next navigation instead of needing the app closed & reopened.
    self.skipWaiting();
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
