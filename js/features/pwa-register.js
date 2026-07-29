// ============================================
// ChitChat Pakistan — PWA registration
// ============================================
// Registers service-worker.js (root scope, so it can control the whole
// site) and wires up the manifest's install prompt. Self-contained,
// does not touch app.js.
// ============================================
(function () {
    'use strict';

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
            navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
                .then(function (reg) {
                    console.log('ChitChat PWA: service worker registered', reg.scope);
                })
                .catch(function (err) {
                    console.error('ChitChat PWA: service worker registration failed', err);
                });
        });
    }

    // "Install App" button (id="pwaInstallBtn", in the main header — shows
    // on both the login screen and after login since the header is shared).
    // Hidden by default; only shown once the browser confirms installing
    // is actually possible, and hidden again once installed.
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
        }
    });
    window.addEventListener('appinstalled', function () {
        deferredInstallPrompt = null;
        const btn = document.getElementById('pwaInstallBtn');
        if (btn) btn.style.display = 'none';
    });
})();
