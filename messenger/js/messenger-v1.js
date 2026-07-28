// ============================================
// ChitChat Pakistan — Messenger V1: Base Messenger
// ============================================
// Self-contained: does NOT modify app.js. Registers its own
// auth.onAuthStateChanged(), builds its own UI, and manages its
// own Firebase listeners with proper .off() cleanup on close/logout.
//
// Relies on globals already defined by app.js (loaded before this
// file): `auth`, `database`, `currentUser`, `escapeHtml`.
//
// DB schema (V1):
//   users/{uid}/chats/{chatId}: { withUid, withName, withPhoto,
//                                 lastMessage, lastTimestamp, unreadCount }
//   messages/private/{chatId}/{msgKey}: { uid, text, timestamp, read }
//   chatId = 'dm_' + [uidA, uidB] sorted and joined by '_'
// ============================================
(function () {
    'use strict';

    // ---- module state ----
    let mgrHtmlInjected = false;
    let mgrHtmlLoadingPromise = null;
    let mgrInboxRef = null;
    let mgrInboxCallback = null;
    let mgrChatMessagesRef = null;
    let mgrChatAddedCallback = null;
    let mgrOpenChatId = null;
    let mgrOpenChatOtherUid = null;
    let mgrUsersCache = null;

    // ---- small helpers ----
    function safeEscape(str) {
        return (typeof escapeHtml === 'function') ? escapeHtml(str) : String(str || '');
    }

    function chatIdFor(uidA, uidB) {
        return 'dm_' + [uidA, uidB].sort().join('_');
    }

    function formatTime(ts) {
        if (!ts) return '';
        return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    // ============================================
    // 1. Menu bar tab injection
    // ============================================
    function injectMenuTab() {
        const menuTabs = document.querySelector('#mainMenuBar .menu-tabs');
        if (!menuTabs || document.getElementById('messengerMenuTab')) return;
        const tab = document.createElement('div');
        tab.className = 'menu-tab';
        tab.id = 'messengerMenuTab';
        tab.innerHTML = '💬 Messenger <span id="messengerMenuBadge"></span>';
        tab.addEventListener('click', function (e) {
            e.stopPropagation();
            openMessenger();
        });
        menuTabs.appendChild(tab);
    }

    function updateMenuBadge(count) {
        const badge = document.getElementById('messengerMenuBadge');
        if (!badge) return;
        if (count > 0) {
            badge.textContent = count > 9 ? '9+' : String(count);
            badge.className = 'messenger-tab-badge';
        } else {
            badge.textContent = '';
            badge.className = '';
        }
    }

    // ============================================
    // 2. Lazy-load messenger.html once
    // ============================================
    function ensureHtmlInjected() {
        if (mgrHtmlInjected) return Promise.resolve();
        if (mgrHtmlLoadingPromise) return mgrHtmlLoadingPromise;
        mgrHtmlLoadingPromise = fetch('messenger/messenger.html')
            .then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.text();
            })
            .then(function (html) {
                const wrapper = document.createElement('div');
                wrapper.innerHTML = html;
                document.body.appendChild(wrapper.firstElementChild);
                mgrHtmlInjected = true;
                wireMessengerUI();
            })
            .catch(function (err) {
                console.error('Messenger: failed to load messenger.html', err);
                mgrHtmlLoadingPromise = null;
                throw err;
            });
        return mgrHtmlLoadingPromise;
    }

    // ============================================
    // 3. Wire up static UI event listeners (runs once)
    // ============================================
    function wireMessengerUI() {
        document.getElementById('messengerCloseBtn').addEventListener('click', function () { history.back(); });
        document.getElementById('messengerChatBackBtn').addEventListener('click', function () { history.back(); });
        document.getElementById('messengerNewChatBtn').addEventListener('click', openNewChatModal);
        document.getElementById('messengerNewChatCloseBtn').addEventListener('click', closeNewChatModal);
        document.getElementById('messengerNewChatModal').addEventListener('click', function (e) {
            if (e.target.id === 'messengerNewChatModal') closeNewChatModal();
        });
        document.getElementById('messengerUserSearch').addEventListener('input', function () {
            renderUserPickList(this.value.trim().toLowerCase());
        });
        document.getElementById('messengerSendBtn').addEventListener('click', sendMessage);
        document.getElementById('messengerMsgInput').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); sendMessage(); }
        });
    }

    // ============================================
    // 4. Screen navigation + browser Back-button support
    // ============================================
    window.addEventListener('popstate', function (e) {
        const container = document.getElementById('messengerContainer');
        if (!container) return;
        const state = e.state;
        if (state && state.messengerScreen === 'chat') {
            showChatScreen();
        } else if (state && state.messengerScreen === 'inbox') {
            backToInboxUI();
        } else {
            hideMessengerUI();
        }
    });

    function showInboxScreen() {
        document.getElementById('messengerInboxScreen').classList.add('active');
        document.getElementById('messengerChatScreen').classList.remove('active');
    }

    function showChatScreen() {
        document.getElementById('messengerChatScreen').classList.add('active');
        document.getElementById('messengerInboxScreen').classList.remove('active');
    }

    function backToInboxUI() {
        detachChatListeners();
        mgrOpenChatId = null;
        mgrOpenChatOtherUid = null;
        showInboxScreen();
        document.dispatchEvent(new CustomEvent('messenger:chatClose'));
    }

    function hideMessengerUI() {
        detachChatListeners();
        detachInboxListener();
        mgrOpenChatId = null;
        mgrOpenChatOtherUid = null;
        const container = document.getElementById('messengerContainer');
        if (container) container.classList.add('messenger-hidden');
        document.dispatchEvent(new CustomEvent('messenger:chatClose'));
    }

    function openMessenger() {
        if (!currentUser) return;
        ensureHtmlInjected().then(function () {
            document.getElementById('messengerContainer').classList.remove('messenger-hidden');
            showInboxScreen();
            listenInbox();
            history.pushState({ messengerScreen: 'inbox' }, '');
        });
    }

    function openChat(chatId, otherUid, otherName, otherPhoto) {
        mgrOpenChatId = chatId;
        mgrOpenChatOtherUid = otherUid;
        document.getElementById('messengerChatName').textContent = otherName || 'User';
        document.getElementById('messengerChatAvatar').src = otherPhoto || 'default-avatar.png';
        showChatScreen();
        listenChatMessages(chatId);
        clearUnread(chatId);
        history.pushState({ messengerScreen: 'chat', chatId: chatId }, '');
        // Hook for later versions (V2 typing/status, etc.) — kept as a DOM
        // event so this file never needs to know what V2+ do with it.
        document.dispatchEvent(new CustomEvent('messenger:chatOpen', { detail: { chatId: chatId, otherUid: otherUid } }));
    }

    // ============================================
    // 5. Inbox: list conversations from users/{uid}/chats
    // ============================================
    function listenInbox() {
        if (!currentUser) return;
        detachInboxListener();
        mgrInboxRef = database.ref('users/' + currentUser.uid + '/chats');
        mgrInboxCallback = mgrInboxRef.on('value', renderInbox, function (err) {
            console.error('Messenger: inbox listener error', err);
        });
    }

    function detachInboxListener() {
        if (mgrInboxRef && mgrInboxCallback) mgrInboxRef.off('value', mgrInboxCallback);
        mgrInboxRef = null;
        mgrInboxCallback = null;
    }

    function renderInbox(snapshot) {
        const listEl = document.getElementById('messengerInboxList');
        const emptyEl = document.getElementById('messengerInboxEmpty');
        if (!listEl) return;
        const data = snapshot.val();
        if (!data) {
            listEl.innerHTML = '';
            emptyEl.style.display = 'flex';
            updateMenuBadge(0);
            return;
        }
        emptyEl.style.display = 'none';
        const chats = Object.entries(data).sort(function (a, b) {
            return (b[1].lastTimestamp || 0) - (a[1].lastTimestamp || 0);
        });
        let totalUnread = 0;
        listEl.innerHTML = chats.map(function (entry) {
            const chatId = entry[0];
            const c = entry[1];
            const unread = c.unreadCount || 0;
            totalUnread += unread;
            const photo = safeEscape(c.withPhoto || 'default-avatar.png');
            return '' +
                '<div class="messenger-inbox-item" data-chat-id="' + safeEscape(chatId) + '">' +
                '  <img class="messenger-inbox-avatar" src="' + photo + '" alt="">' +
                '  <div class="messenger-inbox-info">' +
                '    <div class="messenger-inbox-name-row">' +
                '      <span class="messenger-inbox-name">' + safeEscape(c.withName || 'User') + '</span>' +
                '      <span class="messenger-inbox-time">' + formatTime(c.lastTimestamp) + '</span>' +
                '    </div>' +
                '    <div class="messenger-inbox-last-row">' +
                '      <span class="messenger-inbox-last-msg">' + safeEscape(c.lastMessage || '') + '</span>' +
                (unread > 0 ? '<span class="messenger-unread-badge">' + (unread > 9 ? '9+' : unread) + '</span>' : '') +
                '    </div>' +
                '  </div>' +
                '</div>';
        }).join('');
        listEl.querySelectorAll('.messenger-inbox-item').forEach(function (item) {
            item.addEventListener('click', function () {
                const chatId = this.dataset.chatId;
                const c = data[chatId];
                if (c) openChat(chatId, c.withUid, c.withName, c.withPhoto);
            });
        });
        updateMenuBadge(totalUnread);
        // Hook for later versions (V4-A mute icons, etc.) that need to
        // decorate inbox rows after every rebuild — the list is fully
        // re-rendered (innerHTML replace) on every users/{uid}/chats change.
        document.dispatchEvent(new CustomEvent('messenger:inboxRendered'));
    }

    function clearUnread(chatId) {
        if (!currentUser) return;
        database.ref('users/' + currentUser.uid + '/chats/' + chatId + '/unreadCount').set(0);
    }

    // ============================================
    // 6. Chat screen: messages/private/{chatId}
    // ============================================
    function listenChatMessages(chatId) {
        detachChatListeners();
        const msgsEl = document.getElementById('messengerChatMessages');
        msgsEl.innerHTML = '';
        mgrChatMessagesRef = database.ref('messages/private/' + chatId).orderByChild('timestamp');
        mgrChatAddedCallback = mgrChatMessagesRef.on('child_added', function (snap) {
            appendMessageBubble(snap.key, snap.val());
            scrollChatToBottom();
        }, function (err) {
            console.error('Messenger: chat listener error', err);
        });
    }

    function detachChatListeners() {
        if (mgrChatMessagesRef && mgrChatAddedCallback) mgrChatMessagesRef.off('child_added', mgrChatAddedCallback);
        mgrChatMessagesRef = null;
        mgrChatAddedCallback = null;
    }

    function appendMessageBubble(key, msg) {
        if (!msg) return;
        const msgsEl = document.getElementById('messengerChatMessages');
        if (!msgsEl || msgsEl.querySelector('[data-msg-key="' + key + '"]')) return;
        const isMine = currentUser && msg.uid === currentUser.uid;
        const div = document.createElement('div');
        div.className = 'message-bubble ' + (isMine ? 'sent' : 'received');
        div.dataset.msgKey = key;
        div.innerHTML = safeEscape(msg.text) + '<span class="message-time">' + formatTime(msg.timestamp) + '</span>';
        msgsEl.appendChild(div);
    }

    function scrollChatToBottom() {
        const msgsEl = document.getElementById('messengerChatMessages');
        if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight;
    }

    function sendMessage() {
        const input = document.getElementById('messengerMsgInput');
        const text = input.value.trim();
        if (!text || !mgrOpenChatId || !currentUser) return;
        input.value = '';
        document.dispatchEvent(new CustomEvent('messenger:messageSent', { detail: { chatId: mgrOpenChatId } }));
        const chatId = mgrOpenChatId;
        const otherUid = mgrOpenChatOtherUid;
        const now = Date.now();

        // Hook for later versions (V3-B Reply, etc.) to attach extra fields
        // (e.g. replyTo) to the outgoing message without this file needing
        // to know what they are.
        let extras = {};
        if (typeof window.messengerGetOutgoingExtras === 'function') {
            try { extras = window.messengerGetOutgoingExtras() || {}; } catch (err) { console.error('Messenger: outgoing-extras hook error', err); }
        }
        const msgData = Object.assign({ uid: currentUser.uid, text: text, timestamp: now, read: false }, extras);

        database.ref('messages/private/' + chatId).push(msgData).then(function () {
            if (typeof window.messengerClearOutgoingExtras === 'function') {
                try { window.messengerClearOutgoingExtras(); } catch (err) { console.error('Messenger: clear-outgoing-extras hook error', err); }
            }
            database.ref('users/' + currentUser.uid + '/chats/' + chatId).update({
                lastMessage: text,
                lastTimestamp: now
            });
            if (otherUid) {
                const theirChatRef = database.ref('users/' + otherUid + '/chats/' + chatId);
                theirChatRef.update({ lastMessage: text, lastTimestamp: now });
                theirChatRef.child('unreadCount').transaction(function (v) { return (v || 0) + 1; });
            }
        }).catch(function (err) {
            console.error('Messenger: failed to send message', err);
            alert('Message could not be sent. Please try again.');
        });
    }

    // ============================================
    // 7. Start / open a 1-on-1 chat with another user
    // ============================================
    function startChat(otherUid, otherName, otherPhoto) {
        if (!currentUser || !otherUid || otherUid === currentUser.uid) return;
        const myUid = currentUser.uid;
        const chatId = chatIdFor(myUid, otherUid);

        ensureHtmlInjected().then(function () {
            database.ref('users/' + myUid + '/profile').once('value', function (mySnap) {
                const myProfile = mySnap.val() || {};
                const myName = myProfile.displayName || currentUser.displayName || 'User';
                const myPhoto = myProfile.photoURL || 'default-avatar.png';

                const updates = {};
                updates['users/' + myUid + '/chats/' + chatId + '/withUid'] = otherUid;
                updates['users/' + myUid + '/chats/' + chatId + '/withName'] = otherName || 'User';
                updates['users/' + myUid + '/chats/' + chatId + '/withPhoto'] = otherPhoto || 'default-avatar.png';
                updates['users/' + otherUid + '/chats/' + chatId + '/withUid'] = myUid;
                updates['users/' + otherUid + '/chats/' + chatId + '/withName'] = myName;
                updates['users/' + otherUid + '/chats/' + chatId + '/withPhoto'] = myPhoto;

                database.ref().update(updates).then(function () {
                    const container = document.getElementById('messengerContainer');
                    container.classList.remove('messenger-hidden');
                    const alreadyOpen = document.getElementById('messengerInboxScreen').classList.contains('active') ||
                        document.getElementById('messengerChatScreen').classList.contains('active');
                    if (!alreadyOpen) history.pushState({ messengerScreen: 'inbox' }, '');
                    listenInbox();
                    openChat(chatId, otherUid, otherName, otherPhoto);
                    closeNewChatModal();
                }).catch(function (err) {
                    console.error('Messenger: failed to start chat', err);
                    alert('Could not start chat. Please try again.');
                });
            });
        });
    }

    // ============================================
    // 8. New Chat picker modal
    // ============================================
    function openNewChatModal() {
        document.getElementById('messengerNewChatModal').classList.add('active');
        document.getElementById('messengerUserSearch').value = '';
        loadUsersForPicker();
    }

    function closeNewChatModal() {
        document.getElementById('messengerNewChatModal').classList.remove('active');
    }

    function loadUsersForPicker() {
        database.ref('users').once('value', function (snap) {
            const users = snap.val() || {};
            mgrUsersCache = Object.entries(users)
                .filter(function (entry) { return entry[0] !== (currentUser && currentUser.uid); })
                .map(function (entry) {
                    const uid = entry[0];
                    const d = entry[1] || {};
                    return {
                        uid: uid,
                        name: (d.profile && d.profile.displayName) || d.email || uid,
                        photo: (d.profile && d.profile.photoURL) || 'default-avatar.png'
                    };
                });
            renderUserPickList('');
        });
    }

    function renderUserPickList(filterText) {
        const listEl = document.getElementById('messengerUserPickList');
        if (!listEl || !mgrUsersCache) return;
        const filtered = filterText
            ? mgrUsersCache.filter(function (u) { return u.name.toLowerCase().includes(filterText); })
            : mgrUsersCache;
        listEl.innerHTML = filtered.map(function (u) {
            return '' +
                '<div class="messenger-user-pick-item" data-uid="' + safeEscape(u.uid) + '">' +
                '  <img src="' + safeEscape(u.photo) + '" alt="">' +
                '  <span>' + safeEscape(u.name) + '</span>' +
                '</div>';
        }).join('');
        listEl.querySelectorAll('.messenger-user-pick-item').forEach(function (item) {
            const uid = item.dataset.uid;
            item.addEventListener('click', function () {
                const u = mgrUsersCache.find(function (x) { return x.uid === uid; });
                if (u) startChat(u.uid, u.name, u.photo);
            });
        });
    }

    // ============================================
    // 9. Fix the existing dead "💬 PM" button
    // ============================================
    // app.js's "All Users" list already calls window.openPrivateChat(uid, name)
    // on its 💬 PM button, and joinRoom() already calls window.closePrivateChat()
    // on every room switch — but neither function is defined anywhere in this
    // project, so both have been silent dead calls (and closePrivateChat() being
    // undefined throws, which can interrupt joinRoom()). We define them here,
    // routed into the new Messenger, without touching app.js. If a future file
    // defines these first, we don't override it.
    if (typeof window.openPrivateChat !== 'function') {
        window.openPrivateChat = function (uid, name) {
            startChat(uid, name, 'default-avatar.png');
        };
    }
    if (typeof window.closePrivateChat !== 'function') {
        window.closePrivateChat = function () { /* legacy no-op — old PM modal is unused now */ };
    }

    // ============================================
    // 10. Expose openMessenger for V2-V5 to reuse
    // ============================================
    window.openMessenger = openMessenger;

    // ============================================
    // 11. Init
    // ============================================
    injectMenuTab();

    auth.onAuthStateChanged(function (user) {
        if (!user) {
            hideMessengerUI();
        }
    });
})();
