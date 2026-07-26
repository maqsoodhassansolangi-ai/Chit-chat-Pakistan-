// ============================================
// feature-message-cleanup.js
// Auto-deletes messages older than a set age, to protect the
// Firebase Spark (free) plan's 1GB database limit.
//
// Design constraint: Firebase Spark has no Cloud Functions / cron —
// there's no true "scheduled job" available for free. So this runs
// opportunistically ("poor man's cron"): whenever the OWNER logs in,
// we check how long it's been since the last cleanup run (stored in
// the database itself), and if it's been over 24 hours, we run it.
// This means cleanup only actually happens on days the owner opens
// the site — acceptable for now since the owner logs in regularly
// to use the admin panel anyway. A manual "🧹 Run Cleanup Now" button
// will be added once the Admin Panel Restructure is built, so this
// doesn't have to wait on a UI that doesn't exist yet.
//
// Self-contained: zero edits to app.js. Reuses the global ADMIN_EMAIL
// constant that app.js already defines.
// ============================================

const CLEANUP_MAX_AGE_DAYS = 60;
const CLEANUP_MIN_INTERVAL_HOURS = 24;

function runMessageCleanupIfDue() {
    const settingsRef = database.ref('settings/lastCleanupRun');
    settingsRef.once('value', snap => {
        const lastRun = snap.val() || 0;
        const hoursSinceLastRun = (Date.now() - lastRun) / (1000 * 60 * 60);
        if (hoursSinceLastRun < CLEANUP_MIN_INTERVAL_HOURS) return; // not due yet

        settingsRef.set(Date.now()); // mark as run immediately, so overlapping
                                      // tabs/logins don't trigger it twice
        performCleanup();
    });
}

function performCleanup() {
    const cutoff = Date.now() - (CLEANUP_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
    let roomsDeleted = 0, privateDeleted = 0;

    // Clean each public room's messages
    database.ref('rooms').once('value', snap => {
        const rooms = snap.val() || {};
        Object.keys(rooms).forEach(roomId => {
            database.ref('messages/' + roomId)
                .orderByChild('timestamp')
                .endAt(cutoff)
                .once('value', msgSnap => {
                    msgSnap.forEach(child => {
                        child.ref.remove();
                        roomsDeleted++;
                    });
                });
        });
    });

    // Clean private chat threads
    database.ref('private_messages').once('value', snap => {
        const chats = snap.val() || {};
        Object.keys(chats).forEach(chatId => {
            database.ref('private_messages/' + chatId)
                .orderByChild('timestamp')
                .endAt(cutoff)
                .once('value', msgSnap => {
                    msgSnap.forEach(child => {
                        child.ref.remove();
                        privateDeleted++;
                    });
                });
        });
    });

    // Log it for the owner's visibility (uses the existing activity log pattern)
    setTimeout(() => {
        if (typeof logActivity === 'function') {
            logActivity('auto_cleanup_ran');
        }
    }, 5000); // small delay so the async deletes above have started
}

auth.onAuthStateChanged(function(user) {
    if (!user || !user.email) return;
    if (user.email.trim().toLowerCase() !== ADMIN_EMAIL) return; // owner only
    // Small delay so this doesn't compete with everything else that
    // fires immediately on login.
    setTimeout(runMessageCleanupIfDue, 8000);
});
