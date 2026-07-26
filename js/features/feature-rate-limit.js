// ============================================
// feature-rate-limit.js
// Basic spam protection: sliding-window message rate limit.
//
// Design: app.js's `sendMessage` is a plain global function (no
// modules), so instead of editing app.js we simply wrap it here —
// window.sendMessage = wrappedVersion(originalSendMessage). Every
// caller in app.js (safeSend, sticker send, attachment send) calls
// the same global name, so they all get rate-limited automatically.
//
// LIMITATION (documented honestly): this is a client-side deterrent
// only. A modified/hacked client could bypass it by calling the
// Firebase SDK directly. True server-side enforcement needs either
// Cloud Functions (Blaze plan) or a carefully-designed Realtime
// Database rule keyed on a per-user "last message timestamp" node —
// worth adding to database.rules.json later if abuse becomes a real
// problem. For now this stops normal spam/flooding from the UI.
// ============================================

(function() {
    const WINDOW_MS = 30000;      // 30 second sliding window
    const MAX_MESSAGES = 15;      // max messages allowed per window
    const WARN_COOLDOWN_MS = 4000; // don't spam the warning alert itself

    let recentSends = [];
    let lastWarnedAt = 0;

    function isRateLimited() {
        const now = Date.now();
        recentSends = recentSends.filter(t => now - t < WINDOW_MS);
        return recentSends.length >= MAX_MESSAGES;
    }

    function recordSend() {
        recentSends.push(Date.now());
    }

    // Wait for app.js to have defined the original sendMessage before wrapping.
    function installWrapper() {
        if (typeof window.sendMessage !== 'function') {
            return setTimeout(installWrapper, 50);
        }
        const originalSendMessage = window.sendMessage;
        window.sendMessage = function(text, isSticker = false, stickerUrl = '', attachments = []) {
            if (isRateLimited()) {
                const now = Date.now();
                if (now - lastWarnedAt > WARN_COOLDOWN_MS) {
                    lastWarnedAt = now;
                    alert('You are sending messages too fast. Please slow down for a few seconds.');
                }
                return;
            }
            recordSend();
            return originalSendMessage(text, isSticker, stickerUrl, attachments);
        };
    }
    installWrapper();
})();
