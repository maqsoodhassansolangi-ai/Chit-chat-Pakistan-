// ============================================
// ChitChat Pakistan — PWA registration (v2)
// ============================================
// Registers service-worker.js (root scope, so it can control the whole
// site) and wires up the manifest's install prompt. Self-contained,
// does not touch app.js.
//
// Fixes vs v1:
//   • Hides the install button when the user explicitly DISMISSES the
//     prompt (not only when they complete the install). Previously the
//     button stayed visible forever after a dismiss.
//   • Listens for the SW_ACTIVATED message that the new service-worker
//     posts when it takes over, and shows a soft "Update available"
//     banner so the user can reload to get the latest version without
//     having to know what a service worker is.
// ============================================
(function () {
    'use strict';

    // ── Service Worker registration ────────────────────────────────
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
            navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
                .then(function (reg) {
                    console.log('ChitChat PWA: service worker registered', reg.scope);

                    // Check for a waiting (already-downloaded) new worker
                    // so we can prompt immediately on first load if the SW
                    // updated while the app was closed.
                    if (reg.waiting) {
                        showUpdateBanner(reg.waiting);
                    }

                    // Also catch updates that arrive while the page is open.
                    reg.addEventListener('updatefound', function () {
                        const newWorker = reg.installing;
                        if (!newWorker) return;
                        newWorker.addEventListener('statechange', function () {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                // A new SW is installed and waiting to activate.
                                showUpdateBanner(newWorker);
                            }
                        });
                    });
                })
                .catch(function (err) {
                    console.error('ChitChat PWA: service worker registration failed', err);
                });

            // The new service worker posts SW_ACTIVATED when it calls
            // clients.claim() — at that point it IS already controlling
            // this page, so a plain window.location.reload() picks up
            // all new cached files.
            navigator.serviceWorker.addEventListener('message', function (e) {
                if (e.data && e.data.type === 'SW_ACTIVATED') {
                    // Only show banner if it is not already visible from the
                    // updatefound path above.
                    if (!document.getElementById('pwaUpdateBanner')) {
                        showUpdateBanner(null);
                    }
                }
            });
        });
    }

    // ── "Update available" banner ──────────────────────────────────
    function showUpdateBanner(waitingWorker) {
        if (document.getElementById('pwaUpdateBanner')) return; // already shown
        const banner = document.createElement('div');
        banner.id = 'pwaUpdateBanner';
        banner.style.cssText = [
            'position:fixed', 'bottom:70px', 'left:50%', 'transform:translateX(-50%)',
            'background:#075E54', 'color:#fff', 'padding:10px 20px', 'border-radius:24px',
            'font-size:13px', 'z-index:99999', 'display:flex', 'align-items:center',
            'gap:12px', 'box-shadow:0 4px 14px rgba(0,0,0,0.3)', 'white-space:nowrap'
        ].join(';');
        banner.innerHTML =
            '🔄 <span>App update available</span>' +
            '<button id="pwaUpdateBtn" style="background:rgba(255,255,255,0.25);border:none;' +
            'color:#fff;padding:4px 14px;border-radius:20px;cursor:pointer;font-size:12px;">' +
            'Reload</button>' +
            '<button id="pwaUpdateDismissBtn" style="background:none;border:none;color:rgba(255,255,255,0.7);' +
            'cursor:pointer;font-size:16px;padding:0 4px;">×</button>';
        document.body.appendChild(banner);

        document.getElementById('pwaUpdateBtn').addEventListener('click', function () {
            if (waitingWorker) {
                // Tell the waiting worker to skip waiting so it activates now,
                // then reload once it has claimed the page.
                waitingWorker.postMessage({ type: 'SKIP_WAITING' });
                navigator.serviceWorker.addEventListener('controllerchange', function () {
                    window.location.reload();
                });
            } else {
                window.location.reload();
            }
        });

        document.getElementById('pwaUpdateDismissBtn').addEventListener('click', function () {
            banner.remove();
        });
    }

    // ── Install ("Add to Home Screen") button ─────────────────────
    // Hidden by default; only shown once the browser confirms
    // installing is actually possible.
    let deferredInstallPrompt = null;

    window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();
        deferredInstallPrompt = e;
        const btn = document.getElementById('pwaInstallBtn');
        if (btn) btn.style.display = '';
    });

    document.addEventListener('click', function (e) {
        if (e.target && e.target.id === 'pwaInstallBtn' && deferredInstallPrompt) {
            const promptEvent = deferredInstallPrompt;
            deferredInstallPrompt = null;

            promptEvent.prompt();

            // Hide the button regardless of whether the user accepted or
            // dismissed the prompt — re-prompting right away is bad UX and
            // the browser only lets us call .prompt() once per event anyway.
            promptEvent.userChoice.then(function () {
                const btn = document.getElementById('pwaInstallBtn');
                if (btn) btn.style.display = 'none';
            }).catch(function () {
                const btn = document.getElementById('pwaInstallBtn');
                if (btn) btn.style.display = 'none';
            });
        }
    });

    // Belt-and-suspenders: also hide after confirmed installation.
    window.addEventListener('appinstalled', function () {
        deferredInstallPrompt = null;
        const btn = document.getElementById('pwaInstallBtn');
        if (btn) btn.style.display = 'none';
    });
})();
