// ============================================
// ChitChat Pakistan — Messenger V3-A: Reactions + Multi-Select + Delete
// ============================================
// Self-contained: does NOT modify app.js, and does not read messenger-v1.js's
// internal state. Listens for the same 'messenger:chatOpen'/'chatClose'
// events V2 uses, and runs its OWN independent Firebase listeners on
// messages/private/{chatId} (child_added to cache + enhance the bubbles
// V1 already created, child_changed to pick up reaction/delete updates).
//
// Extensibility hooks for V3-B (Forward/Reply) and later versions:
//   window.messengerRegisterMessageAction(fn(msgKey, msgData) -> {label, danger, onClick} | null)
//     adds an extra button to the long-press action menu
//   window.messengerRegisterSelectBarAction(fn(selectedKeysArray) -> HTMLElement | null)
//     adds an extra control to the multi-select top bar
//
// DB additions (V3):
//   messages/private/{chatId}/{msgKey}/reactions/{emoji}/{uid}: true
//   messages/private/{chatId}/{msgKey}/deletedForEveryone: true
//   users/{uid}/hiddenMessages/{msgKey}: true
// ============================================
(function () {
    'use strict';

    const REACTION_EMOJIS = ['❤️', '👍', '😂', '😮', '😢'];

    let mgrChatId = null;
    let mgrOtherUid = null;
    let mgrMessages = {};
    let mgrHiddenSet = new Set();
    let mgrHiddenRef = null;
    let mgrHiddenCallback = null;
    let mgrAddedRef = null;
    let mgrAddedCallback = null;
    let mgrChangedRef = null;
    let mgrChangedCallback = null;
    let mgrSelectMode = false;
    let mgrSelectedKeys = new Set();
    let mgrExtraActionBuilders = [];
    let mgrExtraSelectBarBuilders = [];
    let mgrV3Wired = false;

    window.messengerRegisterMessageAction = function (fn) { mgrExtraActionBuilders.push(fn); };
    window.messengerRegisterSelectBarAction = function (fn) { mgrExtraSelectBarBuilders.push(fn); };

    function safeEscape(str) {
        return (typeof escapeHtml === 'function') ? escapeHtml(str) : String(str || '');
    }

    // ============================================
    // Lifecycle: hook into V1's chat open/close events
    // ============================================
    document.addEventListener('messenger:chatOpen', function (e) {
        resetState();
        wireV3UIOnce();
        mgrChatId = e.detail.chatId;
        mgrOtherUid = e.detail.otherUid;
        loadHiddenMessages();
        listenMessageChanges();
    });

    document.addEventListener('messenger:chatClose', function () {
        resetState();
    });

    function resetState() {
        if (mgrHiddenRef && mgrHiddenCallback) mgrHiddenRef.off('value', mgrHiddenCallback);
        if (mgrAddedRef && mgrAddedCallback) mgrAddedRef.off('child_added', mgrAddedCallback);
        if (mgrChangedRef && mgrChangedCallback) mgrChangedRef.off('child_changed', mgrChangedCallback);
        mgrHiddenRef = null; mgrHiddenCallback = null;
        mgrAddedRef = null; mgrAddedCallback = null;
        mgrChangedRef = null; mgrChangedCallback = null;
        mgrChatId = null;
        mgrOtherUid = null;
        mgrMessages = {};
        mgrHiddenSet = new Set();
        exitSelectMode();
        closeActionMenu();
    }

    // ============================================
    // Hidden-for-me messages
    // ============================================
    function loadHiddenMessages() {
        if (!currentUser) return;
        mgrHiddenRef = database.ref('users/' + currentUser.uid + '/hiddenMessages');
        mgrHiddenCallback = mgrHiddenRef.on('value', function (snap) {
            mgrHiddenSet = new Set(Object.keys(snap.val() || {}));
            applyHiddenFilter();
        }, function (err) { console.error('Messenger V3: hiddenMessages listener error', err); });
    }

    function applyHiddenFilter() {
        const msgsEl = document.getElementById('messengerChatMessages');
        if (!msgsEl) return;
        mgrHiddenSet.forEach(function (key) {
            const el = msgsEl.querySelector('[data-msg-key="' + key + '"]');
            if (el) el.style.display = 'none';
        });
    }

    // ============================================
    // Message data + bubble enhancement
    // ============================================
    function listenMessageChanges() {
        const ref = database.ref('messages/private/' + mgrChatId);
        mgrAddedRef = ref;
        mgrAddedCallback = ref.on('child_added', function (snap) {
            mgrMessages[snap.key] = snap.val();
            enhanceBubbleWhenReady(snap.key);
        }, function (err) { console.error('Messenger V3: message listener error', err); });

        mgrChangedRef = ref;
        mgrChangedCallback = ref.on('child_changed', function (snap) {
            mgrMessages[snap.key] = snap.val();
            renderBubbleExtras(snap.key);
        }, function (err) { console.error('Messenger V3: message change listener error', err); });
    }

    // V1's own listener creates the bubble DOM node asynchronously; retry
    // briefly in case this fires first.
    function enhanceBubbleWhenReady(key, attempt) {
        attempt = attempt || 0;
        const msgsEl = document.getElementById('messengerChatMessages');
        const el = msgsEl && msgsEl.querySelector('[data-msg-key="' + key + '"]');
        if (!el) {
            if (attempt < 10) setTimeout(function () { enhanceBubbleWhenReady(key, attempt + 1); }, 50);
            return;
        }
        wireBubbleInteractions(el, key);
        renderBubbleExtras(key);
        if (mgrHiddenSet.has(key)) el.style.display = 'none';
    }

    function wireBubbleInteractions(el, key) {
        if (el.dataset.v3Wired) return;
        el.dataset.v3Wired = '1';

        el.addEventListener('click', function () {
            if (mgrSelectMode) toggleSelect(key, el);
        });

        el.addEventListener('dblclick', function () {
            if (mgrSelectMode) return;
            toggleReaction(key, '❤️');
        });

        let touchTimer = null;
        el.addEventListener('touchstart', function () {
            touchTimer = setTimeout(function () { openActionMenu(key, el); }, 500);
        });
        el.addEventListener('touchend', function () { clearTimeout(touchTimer); });
        el.addEventListener('touchmove', function () { clearTimeout(touchTimer); });
        el.addEventListener('contextmenu', function (e) {
            e.preventDefault();
            openActionMenu(key, el);
        });
    }

    function renderBubbleExtras(key) {
        const msgsEl = document.getElementById('messengerChatMessages');
        const el = msgsEl && msgsEl.querySelector('[data-msg-key="' + key + '"]');
        if (!el) return;
        const msg = mgrMessages[key];
        if (!msg) return;

        const iAmStaff = (typeof isOwner !== 'undefined' && isOwner) || (typeof isAdmin !== 'undefined' && isAdmin);
        if (msg.deletedForEveryone && !iAmStaff) {
            if (!el.classList.contains('messenger-deleted-msg')) {
                const timeEl = el.querySelector('.message-time');
                const timeText = timeEl ? timeEl.textContent : '';
                el.classList.add('messenger-deleted-msg');
                el.innerHTML = '🚫 This message was deleted<span class="message-time">' + timeText + '</span>';
            }
            return;
        }

        const old = el.querySelector('.messenger-reactions-badge');
        if (old) old.remove();
        if (msg.reactions) {
            const counts = {};
            Object.keys(msg.reactions).forEach(function (emoji) {
                const n = Object.keys(msg.reactions[emoji] || {}).length;
                if (n > 0) counts[emoji] = n;
            });
            const emojis = Object.keys(counts);
            if (emojis.length) {
                const badge = document.createElement('span');
                badge.className = 'messenger-reactions-badge';
                badge.textContent = emojis.map(function (e) { return e + (counts[e] > 1 ? counts[e] : ''); }).join(' ');
                el.appendChild(badge);
            }
        }
    }

    // ============================================
    // Reactions
    // ============================================
    function toggleReaction(key, emoji) {
        if (!currentUser || !mgrChatId) return;
        const msg = mgrMessages[key] || {};
        const reactions = msg.reactions || {};
        let myPrevEmoji = null;
        Object.keys(reactions).forEach(function (e) {
            if (reactions[e] && reactions[e][currentUser.uid]) myPrevEmoji = e;
        });

        const updates = {};
        const base = 'messages/private/' + mgrChatId + '/' + key + '/reactions/';
        if (myPrevEmoji === emoji) {
            updates[base + emoji + '/' + currentUser.uid] = null;
        } else {
            if (myPrevEmoji) updates[base + myPrevEmoji + '/' + currentUser.uid] = null;
            updates[base + emoji + '/' + currentUser.uid] = true;
        }
        database.ref().update(updates).catch(function (err) {
            console.error('Messenger V3: failed to react', err);
            alert('Could not add reaction. Please try again.');
        });
        closeActionMenu();
    }

    // ============================================
    // Long-press action menu
    // ============================================
    function openActionMenu(key, el) {
        if (mgrSelectMode) return;
        const msg = mgrMessages[key];
        if (!msg) return;
        const menu = document.getElementById('messengerActionMenu');
        const reactionsRow = document.getElementById('messengerActionReactions');
        const buttonsRow = document.getElementById('messengerActionButtons');
        if (!menu || !reactionsRow || !buttonsRow) return;

        reactionsRow.innerHTML = REACTION_EMOJIS.map(function (e) {
            return '<span data-emoji="' + e + '">' + e + '</span>';
        }).join('');
        reactionsRow.querySelectorAll('span').forEach(function (span) {
            span.addEventListener('click', function () { toggleReaction(key, span.dataset.emoji); });
        });

        const buttons = [];
        buttons.push({ label: '☑️ Select', onClick: function () { enterSelectMode(key, el); closeActionMenu(); } });
        mgrExtraActionBuilders.forEach(function (fn) {
            try {
                const extra = fn(key, msg);
                if (extra) buttons.push(extra);
            } catch (err) { console.error('Messenger V3: action builder error', err); }
        });
        buttons.push({ label: '🗑️ Delete', danger: true, onClick: function () { openDeleteModal([key]); closeActionMenu(); } });

        buttonsRow.innerHTML = '';
        buttons.forEach(function (b) {
            const btn = document.createElement('button');
            btn.textContent = b.label;
            if (b.danger) btn.classList.add('messenger-danger');
            btn.addEventListener('click', b.onClick);
            buttonsRow.appendChild(btn);
        });

        positionMenu(menu, el);
        menu.style.display = 'block';
        setTimeout(function () { document.addEventListener('click', closeActionMenuOnOutsideClick); }, 0);
    }

    function positionMenu(menu, anchorEl) {
        const rect = anchorEl.getBoundingClientRect();
        menu.style.display = 'block';
        const menuHeight = menu.offsetHeight || 200;
        let top = rect.bottom + 6;
        if (top + menuHeight > window.innerHeight) top = Math.max(8, rect.top - menuHeight - 6);
        const left = Math.min(Math.max(8, rect.left), window.innerWidth - 240);
        menu.style.top = top + 'px';
        menu.style.left = left + 'px';
    }

    function closeActionMenu() {
        const menu = document.getElementById('messengerActionMenu');
        if (menu) menu.style.display = 'none';
        document.removeEventListener('click', closeActionMenuOnOutsideClick);
    }

    function closeActionMenuOnOutsideClick(e) {
        const menu = document.getElementById('messengerActionMenu');
        if (menu && !menu.contains(e.target)) closeActionMenu();
    }

    // ============================================
    // Multi-select mode
    // ============================================
    function enterSelectMode(firstKey, firstEl) {
        mgrSelectMode = true;
        mgrSelectedKeys = new Set();
        toggleSelect(firstKey, firstEl);
        const bar = document.getElementById('messengerSelectBar');
        if (bar) bar.style.display = 'flex';
    }

    function exitSelectMode() {
        mgrSelectMode = false;
        const msgsEl = document.getElementById('messengerChatMessages');
        if (msgsEl) msgsEl.querySelectorAll('.messenger-selected').forEach(function (el) { el.classList.remove('messenger-selected'); });
        mgrSelectedKeys = new Set();
        const bar = document.getElementById('messengerSelectBar');
        if (bar) bar.style.display = 'none';
    }

    function toggleSelect(key, el) {
        if (mgrSelectedKeys.has(key)) {
            mgrSelectedKeys.delete(key);
            el.classList.remove('messenger-selected');
        } else {
            mgrSelectedKeys.add(key);
            el.classList.add('messenger-selected');
        }
        if (mgrSelectedKeys.size === 0) {
            exitSelectMode();
        } else {
            updateSelectBar();
        }
    }

    function updateSelectBar() {
        const countEl = document.getElementById('messengerSelectCount');
        if (countEl) countEl.textContent = String(mgrSelectedKeys.size);
        const extraEl = document.getElementById('messengerSelectExtra');
        if (!extraEl) return;
        extraEl.innerHTML = '';
        mgrExtraSelectBarBuilders.forEach(function (fn) {
            try {
                const el = fn(Array.from(mgrSelectedKeys));
                if (el) extraEl.appendChild(el);
            } catch (err) { console.error('Messenger V3: select-bar builder error', err); }
        });
    }

    // ============================================
    // Delete for me / Delete for everyone
    // ============================================
    function openDeleteModal(keys) {
        const allMine = keys.every(function (k) {
            const m = mgrMessages[k];
            return m && currentUser && m.uid === currentUser.uid && !m.deletedForEveryone;
        });
        const everyoneBtn = document.getElementById('messengerDeleteForEveryoneBtn');
        if (everyoneBtn) everyoneBtn.style.display = allMine ? 'block' : 'none';
        const modal = document.getElementById('messengerDeleteModal');
        modal.classList.add('active');
        modal.dataset.keys = JSON.stringify(keys);
    }

    function closeDeleteModal() {
        const modal = document.getElementById('messengerDeleteModal');
        if (modal) modal.classList.remove('active');
    }

    function deleteForMe(keys) {
        if (!currentUser) return;
        const updates = {};
        keys.forEach(function (k) { updates['users/' + currentUser.uid + '/hiddenMessages/' + k] = true; });
        database.ref().update(updates).then(function () {
            const msgsEl = document.getElementById('messengerChatMessages');
            keys.forEach(function (k) {
                const el = msgsEl && msgsEl.querySelector('[data-msg-key="' + k + '"]');
                if (el) el.style.display = 'none';
                mgrHiddenSet.add(k);
            });
        }).catch(function (err) {
            console.error('Messenger V3: delete-for-me failed', err);
            alert('Could not delete message(s). Please try again.');
        });
    }

    function deleteForEveryone(keys) {
        if (!mgrChatId) return;
        const updates = {};
        keys.forEach(function (k) { updates['messages/private/' + mgrChatId + '/' + k + '/deletedForEveryone'] = true; });
        database.ref().update(updates).catch(function (err) {
            console.error('Messenger V3: delete-for-everyone failed', err);
            alert('Could not delete message(s). Please try again.');
        });
    }

    // ============================================
    // Wire the V3 UI elements once messenger.html exists
    // (guaranteed by the time 'messenger:chatOpen' first fires)
    // ============================================
    function wireV3UIOnce() {
        if (mgrV3Wired) return;
        mgrV3Wired = true;

        document.getElementById('messengerSelectCancelBtn').addEventListener('click', exitSelectMode);
        document.getElementById('messengerSelectDeleteBtn').addEventListener('click', function () {
            openDeleteModal(Array.from(mgrSelectedKeys));
        });
        document.getElementById('messengerDeleteCancelBtn').addEventListener('click', closeDeleteModal);
        document.getElementById('messengerDeleteForMeBtn').addEventListener('click', function () {
            const keys = JSON.parse(document.getElementById('messengerDeleteModal').dataset.keys || '[]');
            deleteForMe(keys);
            closeDeleteModal();
            exitSelectMode();
        });
        document.getElementById('messengerDeleteForEveryoneBtn').addEventListener('click', function () {
            const keys = JSON.parse(document.getElementById('messengerDeleteModal').dataset.keys || '[]');
            deleteForEveryone(keys);
            closeDeleteModal();
            exitSelectMode();
        });
        document.getElementById('messengerDeleteModal').addEventListener('click', function (e) {
            if (e.target.id === 'messengerDeleteModal') closeDeleteModal();
        });
    }
})();
