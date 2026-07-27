// ============================================
// ChitChat Pakistan — Messenger V2: Typing + Status
// ============================================
// Self-contained: does NOT modify app.js, and does not read
// messenger-v1.js's internal state directly. It listens for the
// 'messenger:chatOpen' / 'messenger:chatClose' / 'messenger:messageSent'
// DOM events that messenger-v1.js dispatches (a small hook added there
// for this purpose) and reuses the site's EXISTING `typingRef` and
// `statusRef` globals from app.js, so the schema matches Room chat
// exactly:
//   typing/{chatId}/{uid}: true            (auto-clears after 3s)
//   status/{uid}: { state, lastSeen, ghost? }   (already written by
//                                                app.js's presence system)
// ============================================
(function () {
    'use strict';

    let mgrTypingTimeout = null;
    let mgrOtherTypingRef = null;
    let mgrOtherTypingCallback = null;
    let mgrOtherStatusRef = null;
    let mgrOtherStatusCallback = null;
    let mgrCurrentChatId = null;
    let mgrOtherIsTyping = false;
    let mgrOtherStatus = null;
    let mgrInputListenerAttached = false;

    function timeAgo(ts) {
        if (!ts) return '';
        const diff = Math.floor((Date.now() - ts) / 1000);
        if (diff < 60) return 'just now';
        if (diff < 3600) return Math.floor(diff / 60) + ' min ago';
        if (diff < 86400) return Math.floor(diff / 3600) + ' hr ago';
        return Math.floor(diff / 86400) + 'd ago';
    }

    function renderStatusLine() {
        const el = document.getElementById('messengerChatStatusLine');
        if (!el) return;
        if (mgrOtherIsTyping) {
            el.textContent = 'typing...';
            el.classList.add('messenger-status-typing');
            return;
        }
        el.classList.remove('messenger-status-typing');
        if (mgrOtherStatus && mgrOtherStatus.state === 'online' && !mgrOtherStatus.ghost) {
            el.textContent = '🟢 Online';
        } else if (mgrOtherStatus && mgrOtherStatus.lastSeen) {
            el.textContent = '⚫ last seen ' + timeAgo(mgrOtherStatus.lastSeen);
        } else {
            el.textContent = '';
        }
    }

    // ---- broadcasting MY typing state ----
    function setMyTyping(chatId, isTyping) {
        if (!currentUser || !chatId) return;
        const ref = typingRef.child(chatId).child(currentUser.uid);
        clearTimeout(mgrTypingTimeout);
        if (isTyping) {
            ref.set(true);
            mgrTypingTimeout = setTimeout(function () { ref.remove(); }, 3000);
        } else {
            ref.remove();
        }
    }

    function attachInputListener() {
        if (mgrInputListenerAttached) return;
        const input = document.getElementById('messengerMsgInput');
        if (!input) return;
        input.addEventListener('input', function () {
            if (mgrCurrentChatId) setMyTyping(mgrCurrentChatId, true);
        });
        mgrInputListenerAttached = true;
    }

    // ---- watching the OTHER person's typing + status ----
    function listenOtherTyping(chatId, otherUid) {
        mgrOtherTypingRef = typingRef.child(chatId).child(otherUid);
        mgrOtherTypingCallback = mgrOtherTypingRef.on('value', function (snap) {
            mgrOtherIsTyping = snap.val() === true;
            renderStatusLine();
        }, function (err) { console.error('Messenger V2: typing listener error', err); });
    }

    function listenOtherStatus(otherUid) {
        mgrOtherStatusRef = statusRef.child(otherUid);
        mgrOtherStatusCallback = mgrOtherStatusRef.on('value', function (snap) {
            mgrOtherStatus = snap.val();
            renderStatusLine();
        }, function (err) { console.error('Messenger V2: status listener error', err); });
    }

    function detachAll() {
        if (mgrOtherTypingRef && mgrOtherTypingCallback) mgrOtherTypingRef.off('value', mgrOtherTypingCallback);
        if (mgrOtherStatusRef && mgrOtherStatusCallback) mgrOtherStatusRef.off('value', mgrOtherStatusCallback);
        mgrOtherTypingRef = null;
        mgrOtherTypingCallback = null;
        mgrOtherStatusRef = null;
        mgrOtherStatusCallback = null;
        mgrOtherIsTyping = false;
        mgrOtherStatus = null;
        // clear my own typing flag for the chat I'm leaving, so I don't
        // appear to be "still typing" to the other person after I leave
        if (mgrCurrentChatId && currentUser) {
            typingRef.child(mgrCurrentChatId).child(currentUser.uid).remove();
        }
        clearTimeout(mgrTypingTimeout);
        mgrCurrentChatId = null;
    }

    document.addEventListener('messenger:chatOpen', function (e) {
        detachAll();
        mgrCurrentChatId = e.detail.chatId;
        attachInputListener();
        listenOtherTyping(e.detail.chatId, e.detail.otherUid);
        listenOtherStatus(e.detail.otherUid);
    });

    document.addEventListener('messenger:chatClose', function () {
        detachAll();
    });

    // sending a message ends "typing" immediately instead of waiting
    // out the full 3s auto-clear
    document.addEventListener('messenger:messageSent', function (e) {
        if (e.detail && e.detail.chatId) setMyTyping(e.detail.chatId, false);
    });
})();
