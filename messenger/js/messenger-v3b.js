// ============================================
// ChitChat Pakistan — Messenger V3-B: Forward + Reply
// ============================================
// Self-contained: does NOT modify app.js. Uses the extensibility hooks
// added earlier rather than editing messenger-v1.js/v3.js further:
//   - window.messengerRegisterMessageAction()   (from V3-A, long-press menu)
//   - window.messengerRegisterSelectBarAction() (from V3-A, multi-select bar)
//   - window.messengerGetOutgoingExtras() / messengerClearOutgoingExtras()
//     (from V1's sendMessage — the ONLY place these two functions may be
//     defined; if a future version needs them too, extend this pair here
//     rather than redefining them elsewhere)
// Runs its own independent listener on messages/private/{chatId} to add
// reply-quote / "Forwarded" decoration to bubbles, same pattern V3-A used.
//
// DB additions (V3-B):
//   messages/private/{chatId}/{msgKey}/replyTo: {key, name, text, uid}
//   messages/private/{chatId}/{msgKey}/forwarded: true
// ============================================
(function () {
    'use strict';

    let mgrChatId = null;
    let mgrMessages = {};
    let mgrAddedRef = null;
    let mgrAddedCallback = null;
    let mgrReplyTo = null; // {key, name, text, uid}
    let mgrV3bWired = false;

    function safeEscape(str) {
        return (typeof escapeHtml === 'function') ? escapeHtml(str) : String(str || '');
    }

    // ============================================
    // Lifecycle
    // ============================================
    document.addEventListener('messenger:chatOpen', function (e) {
        resetState();
        wireV3bUIOnce();
        mgrChatId = e.detail.chatId;
        listenMessages();
    });

    document.addEventListener('messenger:chatClose', function () {
        resetState();
    });

    function resetState() {
        if (mgrAddedRef && mgrAddedCallback) mgrAddedRef.off('child_added', mgrAddedCallback);
        mgrAddedRef = null;
        mgrAddedCallback = null;
        mgrChatId = null;
        mgrMessages = {};
        cancelReply();
    }

    // ============================================
    // Bubble decoration: reply-quote block + "Forwarded" tag
    // ============================================
    function listenMessages() {
        const ref = database.ref('messages/private/' + mgrChatId);
        mgrAddedRef = ref;
        mgrAddedCallback = ref.on('child_added', function (snap) {
            mgrMessages[snap.key] = snap.val();
            decorateBubbleWhenReady(snap.key);
        }, function (err) { console.error('Messenger V3-B: message listener error', err); });
    }

    function decorateBubbleWhenReady(key, attempt) {
        attempt = attempt || 0;
        const msgsEl = document.getElementById('messengerChatMessages');
        const el = msgsEl && msgsEl.querySelector('[data-msg-key="' + key + '"]');
        if (!el) {
            if (attempt < 10) setTimeout(function () { decorateBubbleWhenReady(key, attempt + 1); }, 50);
            return;
        }
        if (el.dataset.v3bWired) return;
        el.dataset.v3bWired = '1';
        const msg = mgrMessages[key];
        if (!msg) return;

        if (msg.forwarded) {
            const tag = document.createElement('div');
            tag.className = 'messenger-forwarded-tag';
            tag.textContent = '➡️ Forwarded';
            el.insertBefore(tag, el.firstChild);
        }
        if (msg.replyTo) {
            const quote = document.createElement('div');
            quote.className = 'messenger-reply-quote';
            quote.innerHTML = '<b>' + safeEscape(msg.replyTo.name || 'Message') + '</b>' + safeEscape(msg.replyTo.text || '');
            el.insertBefore(quote, el.firstChild);
        }

        wireSwipeReply(el, key, msg);
    }

    // ============================================
    // Reply — swipe-to-reply (touch) + long-press-menu "Reply" (all devices)
    // ============================================
    function wireSwipeReply(el, key, msg) {
        let startX = null;
        let lastDx = 0;
        el.addEventListener('touchstart', function (e) {
            startX = e.touches[0].clientX;
            lastDx = 0;
        });
        el.addEventListener('touchmove', function (e) {
            if (startX === null) return;
            lastDx = e.touches[0].clientX - startX;
            if (lastDx > 8) {
                el.style.transition = 'none';
                el.style.transform = 'translateX(' + Math.min(lastDx, 60) + 'px)';
            }
        });
        el.addEventListener('touchend', function () {
            el.style.transition = 'transform 0.15s';
            el.style.transform = '';
            if (startX !== null && lastDx > 50) startReply(key, msg);
            startX = null;
            lastDx = 0;
        });
    }

    if (typeof window.messengerRegisterMessageAction === 'function') {
        window.messengerRegisterMessageAction(function (key, msg) {
            if (msg.deletedForEveryone) return null;
            return { label: '↩️ Reply', onClick: function () { startReply(key, msg); } };
        });
        window.messengerRegisterMessageAction(function (key, msg) {
            if (msg.deletedForEveryone) return null;
            return { label: '➡️ Forward', onClick: function () { openForwardModal([key]); } };
        });
    }

    if (typeof window.messengerRegisterSelectBarAction === 'function') {
        window.messengerRegisterSelectBarAction(function (selectedKeys) {
            const btn = document.createElement('button');
            btn.className = 'messenger-icon-btn';
            btn.title = 'Forward';
            btn.textContent = '➡️';
            btn.addEventListener('click', function () { openForwardModal(selectedKeys); });
            return btn;
        });
    }

    function startReply(key, msg) {
        if (!msg || msg.deletedForEveryone) return;
        const senderIsMe = currentUser && msg.uid === currentUser.uid;
        const chatNameEl = document.getElementById('messengerChatName');
        mgrReplyTo = {
            key: key,
            name: senderIsMe ? 'You' : (chatNameEl ? chatNameEl.textContent : 'User'),
            text: (msg.text || '').slice(0, 100),
            uid: msg.uid
        };
        showReplyBar();
    }

    function showReplyBar() {
        const bar = document.getElementById('messengerReplyBar');
        if (!bar || !mgrReplyTo) return;
        document.getElementById('messengerReplyName').textContent = mgrReplyTo.name;
        document.getElementById('messengerReplyText').textContent = mgrReplyTo.text;
        bar.style.display = 'flex';
        const input = document.getElementById('messengerMsgInput');
        if (input) input.focus();
    }

    function cancelReply() {
        mgrReplyTo = null;
        const bar = document.getElementById('messengerReplyBar');
        if (bar) bar.style.display = 'none';
    }

    // the ONLY definition of these two hook functions (see file header note)
    window.messengerGetOutgoingExtras = function () {
        const extras = {};
        if (mgrReplyTo) {
            extras.replyTo = { key: mgrReplyTo.key, name: mgrReplyTo.name, text: mgrReplyTo.text, uid: mgrReplyTo.uid };
        }
        return extras;
    };
    window.messengerClearOutgoingExtras = function () {
        cancelReply();
    };

    // ============================================
    // Forward
    // ============================================
    function openForwardModal(keys) {
        if (!currentUser) return;
        const modal = document.getElementById('messengerForwardModal');
        const listEl = document.getElementById('messengerForwardList');
        modal.dataset.keys = JSON.stringify(keys);
        listEl.innerHTML = '<div class="messenger-empty-state" style="padding:20px;">Loading...</div>';
        modal.classList.add('active');

        database.ref('users/' + currentUser.uid + '/chats').once('value', function (snap) {
            const chats = snap.val() || {};
            const entries = Object.entries(chats).sort(function (a, b) {
                return (b[1].lastTimestamp || 0) - (a[1].lastTimestamp || 0);
            });
            if (!entries.length) {
                listEl.innerHTML = '<div class="messenger-empty-state" style="padding:20px;">No chats to forward to yet.</div>';
                return;
            }
            listEl.innerHTML = entries.map(function (entry) {
                const chatId = entry[0];
                const c = entry[1];
                return '' +
                    '<div class="messenger-user-pick-item" data-chat-id="' + safeEscape(chatId) + '" data-other-uid="' + safeEscape(c.withUid) + '">' +
                    '  <img src="' + safeEscape(c.withPhoto || 'default-avatar.png') + '" alt="">' +
                    '  <span>' + safeEscape(c.withName || 'User') + '</span>' +
                    '</div>';
            }).join('');
            listEl.querySelectorAll('.messenger-user-pick-item').forEach(function (item) {
                item.addEventListener('click', function () {
                    forwardMessages(keys, item.dataset.chatId, item.dataset.otherUid);
                    closeForwardModal();
                });
            });
        }, function (err) {
            console.error('Messenger V3-B: failed to load chats for forwarding', err);
            listEl.innerHTML = '<div class="messenger-empty-state" style="padding:20px;">Could not load chats.</div>';
        });
    }

    function closeForwardModal() {
        document.getElementById('messengerForwardModal').classList.remove('active');
    }

    function forwardMessages(keys, targetChatId, targetOtherUid) {
        if (!currentUser || !targetChatId) return;
        keys.forEach(function (key) {
            const msg = mgrMessages[key];
            if (!msg || msg.deletedForEveryone) return;
            const now = Date.now();
            const forwardedMsg = { uid: currentUser.uid, text: msg.text || '', timestamp: now, read: false, forwarded: true };
            database.ref('messages/private/' + targetChatId).push(forwardedMsg).then(function () {
                database.ref('users/' + currentUser.uid + '/chats/' + targetChatId).update({
                    lastMessage: msg.text || '',
                    lastTimestamp: now
                });
                if (targetOtherUid) {
                    const theirChatRef = database.ref('users/' + targetOtherUid + '/chats/' + targetChatId);
                    theirChatRef.update({ lastMessage: msg.text || '', lastTimestamp: now });
                    theirChatRef.child('unreadCount').transaction(function (v) { return (v || 0) + 1; });
                }
            }).catch(function (err) {
                console.error('Messenger V3-B: failed to forward message', err);
                alert('Could not forward message. Please try again.');
            });
        });
    }

    // ============================================
    // Wire the V3-B UI elements once (guaranteed to exist by first chatOpen)
    // ============================================
    function wireV3bUIOnce() {
        if (mgrV3bWired) return;
        mgrV3bWired = true;
        document.getElementById('messengerReplyCancelBtn').addEventListener('click', cancelReply);
        document.getElementById('messengerForwardCloseBtn').addEventListener('click', closeForwardModal);
        document.getElementById('messengerForwardModal').addEventListener('click', function (e) {
            if (e.target.id === 'messengerForwardModal') closeForwardModal();
        });
    }
})();
