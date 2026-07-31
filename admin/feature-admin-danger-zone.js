// ============================================
// feature-admin-danger-zone.js
// Admin Panel — Messenger tab additions: Moderation Flags viewer (links/
// phone-numbers blocked by messenger-v1.js) + storage cleanup controls
// (delete one user's Messenger data, or everyone's).
//
// Design: zero edits to app.js or feature-admin-messenger.js. The new
// markup lives in index.html inside the existing
// .admin-panel[data-panel="messenger"] block (same convention
// feature-admin-messenger.js already established for that panel).
//
// IMPORTANT — Cloudinary is NOT touched by this file. Deleting the
// actual image/video/voice FILES from Cloudinary requires their Admin
// API + API secret, which cannot safely live in client-side JS (anyone
// could read it from the page source and delete/abuse the account). This
// only clears the Firebase Realtime Database records (messages/private
// + users/{uid}/chats), which is what actually grows the Spark-tier
// database. Cloudinary file cleanup needs a separate manual pass in
// their Media Library (or a future signed server-side endpoint).
//
// Schema read/written:
//   moderationFlags/{pushId}: {uid, chatId, text, matchType, timestamp}
//     — written by messenger-v1.js's sendMessage() guard; NEW node, needs
//       an admin-read rule (regular users only need write, already
//       covered if moderationFlags follows the same "auth != null can
//       write, admin can read" pattern used elsewhere — please add this
//       explicitly if it's not already covered when you send the rules).
//   Deletes: messages/private/{chatId}, users/{uid}/chats/{chatId} (both
//     sides), for the "one user" cleanup; messages/private (whole node)
//     + every users/{uid}/chats, for the "everyone" cleanup.
// ============================================
(function () {
    'use strict';

    function safeEscape(str) {
        return (typeof escapeHtml === 'function') ? escapeHtml(str) : String(str || '');
    }

    // ============================================
    // Moderation Flags list
    // ============================================
    function loadModerationFlags() {
        const listEl = document.getElementById('adminModerationFlagsList');
        if (!listEl) return;
        database.ref('moderationFlags').limitToLast(100).once('value').then(function (snap) {
            const data = snap.val() || {};
            const entries = Object.values(data).sort(function (a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });
            if (!entries.length) {
                listEl.innerHTML = '<div style="padding:14px; color:#888; font-size:13px;">No flags yet.</div>';
                return;
            }
            listEl.innerHTML = entries.map(function (f) {
                const when = f.timestamp ? new Date(f.timestamp).toLocaleString() : '';
                return '' +
                    '<div style="padding:10px 14px; border-bottom:1px solid #eee; font-size:13px;">' +
                    '  <div><strong>' + safeEscape(f.matchType === 'phone' ? '📱 Phone number' : '🔗 Link') + '</strong> · ' + safeEscape(when) + '</div>' +
                    '  <div style="color:#555; word-break:break-word;">' + safeEscape(f.text) + '</div>' +
                    '  <div style="color:#999; font-size:11px;">uid: ' + safeEscape(f.uid) + ' · chat: ' + safeEscape(f.chatId) + '</div>' +
                    '</div>';
            }).join('');
        }).catch(function (err) {
            listEl.innerHTML = '<div style="padding:14px; color:#c0392b; font-size:13px;">Could not load flags — admin read permission for moderationFlags/ may be missing from the rules.</div>';
            console.error('Admin: moderationFlags load failed', err);
        });
    }

    // ============================================
    // Delete one user's Messenger data (by email)
    // ============================================
    function deleteUserChats() {
        const emailInput = document.getElementById('adminDeleteUserChatsEmail');
        const email = (emailInput.value || '').trim().toLowerCase();
        if (!email) { alert('Enter the user\'s email first.'); return; }

        database.ref('users').once('value').then(function (snap) {
            const users = snap.val() || {};
            const match = Object.entries(users).find(function (e) { return e[1].email && e[1].email.trim().toLowerCase() === email; });
            if (!match) { alert('No user found with that email.'); return; }
            const uid = match[0];
            const chats = match[1].chats || {};
            const chatIds = Object.keys(chats);
            if (!chatIds.length) { alert('This user has no Messenger chats.'); return; }

            if (!confirm('Delete all ' + chatIds.length + ' chat(s) and their messages for ' + email + '? This cannot be undone.')) return;

            const updates = {};
            chatIds.forEach(function (chatId) {
                const otherUid = chats[chatId].withUid;
                updates['messages/private/' + chatId] = null;
                updates['users/' + uid + '/chats/' + chatId] = null;
                if (otherUid) updates['users/' + otherUid + '/chats/' + chatId] = null;
            });
            database.ref().update(updates).then(function () {
                alert('Deleted ' + chatIds.length + ' chat(s) for ' + email + '.');
                emailInput.value = '';
            }).catch(function (err) {
                alert('Delete failed — check the console. This may need an admin-write rule added for messages/private and users/{uid}/chats.');
                console.error('Admin: deleteUserChats failed', err);
            });
        }).catch(function (err) {
            alert('Could not look up that user.');
            console.error('Admin: user lookup failed', err);
        });
    }

    // ============================================
    // Delete ALL Messenger data (Owner only)
    // ============================================
    function deleteAllChats() {
        if (!isOwner) { alert('Only the Owner can do this.'); return; }
        if (!confirm('This deletes EVERY Messenger chat and message for EVERY user, permanently. Type OK to confirm — are you absolutely sure?')) return;
        if (!confirm('Really sure? This cannot be undone and will affect all users.')) return;

        database.ref('users').once('value').then(function (snap) {
            const users = snap.val() || {};
            const updates = { 'messages/private': null };
            Object.keys(users).forEach(function (uid) {
                if (users[uid].chats) updates['users/' + uid + '/chats'] = null;
            });
            database.ref().update(updates).then(function () {
                alert('All Messenger data deleted.');
            }).catch(function (err) {
                alert('Delete failed — check the console.');
                console.error('Admin: deleteAllChats failed', err);
            });
        });
    }

    // ============================================
    // Wire up (panel is static markup in index.html, always present)
    // ============================================
    function wire() {
        const flagsList = document.getElementById('adminModerationFlagsList');
        if (!flagsList || flagsList.dataset.wired) return;
        flagsList.dataset.wired = '1';

        document.getElementById('adminDeleteUserChatsBtn').addEventListener('click', deleteUserChats);
        const deleteAllBtn = document.getElementById('adminDeleteAllChatsBtn');
        deleteAllBtn.addEventListener('click', deleteAllChats);

        // Reload the flags list every time the Messenger admin tab is opened.
        const tabBtn = document.querySelector('.admin-tab[data-tab="messenger"]');
        if (tabBtn) tabBtn.addEventListener('click', loadModerationFlags);
    }

    document.addEventListener('DOMContentLoaded', wire);
    if (document.readyState !== 'loading') wire();

    auth.onAuthStateChanged(function (user) {
        if (user && isOwner) {
            const deleteAllBtn = document.getElementById('adminDeleteAllChatsBtn');
            if (deleteAllBtn) deleteAllBtn.style.display = '';
        } else {
            const deleteAllBtn = document.getElementById('adminDeleteAllChatsBtn');
            if (deleteAllBtn) deleteAllBtn.style.display = 'none';
        }
    });
})();
