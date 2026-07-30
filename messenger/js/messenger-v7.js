// ============================================
// ChitChat Pakistan — Messenger V7: Star Messages + In-Chat Search
// ============================================
// Self-contained: does NOT modify app.js. Follows the same established
// pattern as V4-A/V6 (own independent listeners, decorates DOM V1 already
// rendered, hooks into the messenger:chatOpen/chatClose/inboxRendered
// events) and reuses V3-A's messengerRegisterMessageAction registry for
// the Star/Unstar item in the long-press menu — no edits to any existing
// Messenger file were needed for this version.
//
// DB additions (V7):
//   users/{uid}/starredMessages/{chatId}_{msgKey}: { chatId, msgKey, timestamp }
// No new rules needed — already covered by the existing users/$uid write
// cascade, same as blocked/muted/hiddenMessages/pinned before it.
//
// In-chat Search is intentionally client-side only: it filters the
// messages already loaded/rendered in the currently open chat rather than
// querying the database, which keeps it simple and needs no new schema.
// ============================================
(function () {
    'use strict';

    let mgrChatId = null;
    let mgrOtherUid = null;
    let mgrStarredMap = {};       // "chatId_msgKey" -> {chatId,msgKey,timestamp}
    let mgrStarredRef = null;
    let mgrStarredCallback = null;
    let mgrV7Wired = false;
    let mgrHeaderWired = false;

    function safeEscape(str) {
        return (typeof escapeHtml === 'function') ? escapeHtml(str) : String(str || '');
    }

    function starKeyFor(chatId, msgKey) { return chatId + '_' + msgKey; }

    function otherUidFromChatId(chatId) {
        if (!currentUser) return null;
        const parts = chatId.replace(/^dm_/, '').split('_');
        return parts.find(function (id) { return id !== currentUser.uid; }) || null;
    }

    // ============================================
    // Global (login-scoped): my own starred-messages map
    // ============================================
    auth.onAuthStateChanged(function (user) {
        if (mgrStarredRef && mgrStarredCallback) mgrStarredRef.off('value', mgrStarredCallback);
        mgrStarredRef = null; mgrStarredCallback = null;
        mgrStarredMap = {};
        if (!user) return;
        mgrStarredRef = database.ref('users/' + user.uid + '/starredMessages');
        mgrStarredCallback = mgrStarredRef.on('value', function (snap) {
            mgrStarredMap = snap.val() || {};
            applyStarIconsToOpenChat();
        }, function (err) { console.error('Messenger V7: starredMessages listener error', err); });
    });

    // ============================================
    // Message action: register Star/Unstar in the long-press menu
    // ============================================
    if (typeof window.messengerRegisterMessageAction === 'function') {
        window.messengerRegisterMessageAction(function (msgKey) {
            if (!mgrChatId) return null;
            const starred = !!mgrStarredMap[starKeyFor(mgrChatId, msgKey)];
            return {
                label: starred ? '⭐ Unstar Message' : '☆ Star Message',
                onClick: function () { toggleStar(mgrChatId, msgKey, starred); }
            };
        });
    }

    function toggleStar(chatId, msgKey, currentlyStarred) {
        if (!currentUser) return;
        const ref = database.ref('users/' + currentUser.uid + '/starredMessages/' + starKeyFor(chatId, msgKey));
        const op = currentlyStarred ? ref.remove() : ref.set({ chatId: chatId, msgKey: msgKey, timestamp: Date.now() });
        op.catch(function (err) {
            console.error('Messenger V7: star toggle failed', err);
            alert('Could not update starred status. Please try again.');
        });
    }

    function applyStarIconsToOpenChat() {
        if (!mgrChatId) return;
        const msgsEl = document.getElementById('messengerChatMessages');
        if (!msgsEl) return;
        msgsEl.querySelectorAll('.message-bubble[data-msg-key]').forEach(function (el) {
            const msgKey = el.dataset.msgKey;
            const timeEl = el.querySelector('.message-time');
            if (!timeEl) return;
            const starred = !!mgrStarredMap[starKeyFor(mgrChatId, msgKey)];
            let icon = timeEl.querySelector('.messenger-msg-star-icon');
            if (starred) {
                if (!icon) {
                    icon = document.createElement('span');
                    icon.className = 'messenger-msg-star-icon';
                    icon.textContent = '⭐';
                    // Keep tick (if any) after the star, matching WhatsApp's ordering.
                    const tick = timeEl.querySelector('.messenger-msg-tick');
                    if (tick) timeEl.insertBefore(icon, tick); else timeEl.appendChild(icon);
                }
            } else if (icon) {
                icon.remove();
            }
        });
    }

    // ============================================
    // Chat lifecycle
    // ============================================
    document.addEventListener('messenger:chatOpen', function (e) {
        mgrChatId = e.detail.chatId;
        mgrOtherUid = e.detail.otherUid;
        closeSearchBar();
        wireChatUIOnce();
        setTimeout(applyStarIconsToOpenChat, 60); // let V1's bubbles render first
    });

    document.addEventListener('messenger:chatClose', function () {
        mgrChatId = null;
        mgrOtherUid = null;
        closeSearchBar();
    });

    // Re-apply the star icon on newly-arrived bubbles too (mirrors V6's tick pattern).
    document.addEventListener('messenger:chatOpen', function () {
        setTimeout(applyStarIconsToOpenChat, 300);
    });

    // ============================================
    // In-chat search (client-side filter of already-rendered bubbles)
    // ============================================
    function openSearchBar() {
        document.getElementById('messengerChatSearchBar').style.display = 'flex';
        const input = document.getElementById('messengerChatSearchInput');
        input.value = '';
        input.focus();
    }

    function closeSearchBar() {
        const bar = document.getElementById('messengerChatSearchBar');
        if (bar) bar.style.display = 'none';
        const input = document.getElementById('messengerChatSearchInput');
        if (input) input.value = '';
        filterMessages('');
    }

    function filterMessages(query) {
        const msgsEl = document.getElementById('messengerChatMessages');
        if (!msgsEl) return;
        const q = query.trim().toLowerCase();
        msgsEl.querySelectorAll('.message-bubble[data-msg-key]').forEach(function (el) {
            const matches = !q || el.textContent.toLowerCase().indexOf(q) !== -1;
            el.classList.toggle('messenger-search-hidden', !matches);
        });
    }

    // ============================================
    // Starred Messages view
    // ============================================
    function openStarredModal() {
        const modal = document.getElementById('messengerStarredModal');
        const listEl = document.getElementById('messengerStarredList');
        const emptyEl = document.getElementById('messengerStarredEmpty');
        if (!modal || !listEl) return;

        const entries = Object.values(mgrStarredMap).sort(function (a, b) {
            return (b.timestamp || 0) - (a.timestamp || 0);
        });

        if (!entries.length) {
            listEl.innerHTML = '';
            emptyEl.style.display = 'flex';
        } else {
            emptyEl.style.display = 'none';
            listEl.innerHTML = '<div class="messenger-empty-state" style="padding:20px;">Loading…</div>';
            Promise.all(entries.map(fetchStarredEntryInfo)).then(function (rows) {
                listEl.innerHTML = rows.filter(Boolean).map(renderStarredRow).join('');
                listEl.querySelectorAll('.messenger-inbox-item').forEach(function (item, i) {
                    item.addEventListener('click', function () {
                        const row = rows.filter(Boolean)[i];
                        if (!row) return;
                        closeStarredModal();
                        if (row.otherUid && window.openPrivateChat) window.openPrivateChat(row.otherUid, row.chatName);
                    });
                });
            });
        }
        modal.classList.add('active');
    }

    function fetchStarredEntryInfo(entry) {
        const otherUid = otherUidFromChatId(entry.chatId);
        return Promise.all([
            database.ref('messages/private/' + entry.chatId + '/' + entry.msgKey).once('value'),
            otherUid ? database.ref('users/' + otherUid).once('value') : Promise.resolve(null)
        ]).then(function (results) {
            const msg = results[0].val();
            if (!msg) return null; // message was deleted since being starred
            const userSnap = results[1];
            const chatName = (userSnap && window.resolveDisplayName) ? window.resolveDisplayName(otherUid, userSnap.val()) : 'Chat';
            return {
                chatId: entry.chatId,
                otherUid: otherUid,
                chatName: chatName,
                text: msg.text || '⭐ ' + (msg.type ? (msg.type.charAt(0).toUpperCase() + msg.type.slice(1)) : 'Message'),
                timestamp: entry.timestamp
            };
        }).catch(function () { return null; });
    }

    function renderStarredRow(row) {
        return '' +
            '<div class="messenger-inbox-item">' +
            '  <div class="messenger-inbox-info">' +
            '    <div class="messenger-inbox-name-row"><span class="messenger-inbox-name">' + safeEscape(row.chatName) + '</span></div>' +
            '    <div class="messenger-inbox-last-row"><span class="messenger-inbox-last-msg">' + safeEscape(row.text) + '</span></div>' +
            '  </div>' +
            '</div>';
    }

    function closeStarredModal() {
        const modal = document.getElementById('messengerStarredModal');
        if (modal) modal.classList.remove('active');
    }

    // ============================================
    // Wire UI (chat-screen elements — exist once V1's HTML is injected,
    // guaranteed by the time the first chatOpen fires)
    // ============================================
    function wireChatUIOnce() {
        if (mgrV7Wired) return;
        mgrV7Wired = true;

        document.getElementById('messengerChatSearchBtn').addEventListener('click', openSearchBar);
        document.getElementById('messengerChatSearchCloseBtn').addEventListener('click', closeSearchBar);
        document.getElementById('messengerChatSearchInput').addEventListener('input', function (e) {
            filterMessages(e.target.value);
        });
    }

    // Inbox-header star button only needs wiring once too, but the inbox
    // screen can be reached without ever opening a chat — so wire it off
    // the inboxRendered hook instead (same guard pattern V6 uses per-row).
    document.addEventListener('messenger:inboxRendered', function () {
        if (mgrHeaderWired) return;
        const btn = document.getElementById('messengerStarredBtn');
        if (!btn) return;
        mgrHeaderWired = true;
        btn.addEventListener('click', openStarredModal);
        document.getElementById('messengerStarredCloseBtn').addEventListener('click', closeStarredModal);
        document.getElementById('messengerStarredModal').addEventListener('click', function (e) {
            if (e.target.id === 'messengerStarredModal') closeStarredModal();
        });
    });
})();
