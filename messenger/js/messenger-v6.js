// ============================================
// ChitChat Pakistan — Messenger V6: Read Receipts + Inbox Long-Press Menu
// ============================================
// Self-contained: does NOT modify app.js. Follows the same pattern as
// V3-A/V4-B (own independent listeners on messages/private/{chatId},
// decorates the DOM V1 already rendered via querySelector('[data-msg-key]'))
// and the same messenger:inboxRendered/chatOpen/chatClose hooks V4-A
// already uses for its mute icon — no edits needed to V3/V4-A/V4-B.
//
// Only pre-existing-file touch this version needed: messenger-v1.js's
// renderInbox() sort comparator now sorts pinned chats first (1-line change)
// since sort order is intrinsic to that render function, not something
// that can be reordered afterward without fighting its own click listeners.
//
// DB additions (V6):
//   messages/private/{chatId}/{msgKey}/read: true   (written by the
//     RECIPIENT when they open the chat — the `read` field already existed
//     in V1's schema/rules but was never actually set anywhere until now)
//   users/{uid}/chats/{chatId}/pinned: true|false
// Clear Chat reuses V3-A's EXISTING users/{uid}/hiddenMessages/{msgKey}
// mechanism (marks every message in the chat hidden-for-me) — no new schema.
// Delete Chat / Mute reuse the same users/{uid}/chats + users/{uid}/muted
// nodes V1/V4-A already use — no new schema or rules needed for any of
// this file's features.
// ============================================
(function () {
    'use strict';

    let mgrChatId = null;
    let mgrOtherUid = null;
    let mgrMessages = {};
    let mgrAddedRef = null;
    let mgrAddedCallback = null;
    let mgrChangedRef = null;
    let mgrChangedCallback = null;
    let mgrMutedMap = {};
    let mgrMutedRef = null;
    let mgrMutedCallback = null;
    let mgrV6Wired = false;

    // ============================================
    // Global (login-scoped): keep my own muted-chats map for the inbox menu
    // ============================================
    auth.onAuthStateChanged(function (user) {
        if (mgrMutedRef && mgrMutedCallback) mgrMutedRef.off('value', mgrMutedCallback);
        mgrMutedRef = null; mgrMutedCallback = null;
        mgrMutedMap = {};
        if (!user) return;
        mgrMutedRef = database.ref('users/' + user.uid + '/muted');
        mgrMutedCallback = mgrMutedRef.on('value', function (snap) {
            mgrMutedMap = snap.val() || {};
        }, function (err) { console.error('Messenger V6: muted listener error', err); });
    });

    function isMuted(chatId) {
        const m = mgrMutedMap[chatId];
        if (!m) return false;
        return m.duration === 'always' || (typeof m.mutedUntil === 'number' && m.mutedUntil > Date.now());
    }

    // ============================================
    // Per-chat lifecycle: read-receipt ticks
    // ============================================
    document.addEventListener('messenger:chatOpen', function (e) {
        resetChatState();
        mgrChatId = e.detail.chatId;
        mgrOtherUid = e.detail.otherUid;
        listenMessageChanges();
        markIncomingMessagesRead();
    });

    document.addEventListener('messenger:chatClose', function () {
        resetChatState();
    });

    function resetChatState() {
        if (mgrAddedRef && mgrAddedCallback) mgrAddedRef.off('child_added', mgrAddedCallback);
        if (mgrChangedRef && mgrChangedCallback) mgrChangedRef.off('child_changed', mgrChangedCallback);
        mgrAddedRef = null; mgrAddedCallback = null;
        mgrChangedRef = null; mgrChangedCallback = null;
        mgrChatId = null;
        mgrOtherUid = null;
        mgrMessages = {};
    }

    function listenMessageChanges() {
        const ref = database.ref('messages/private/' + mgrChatId);
        mgrAddedRef = ref;
        mgrAddedCallback = ref.on('child_added', function (snap) {
            mgrMessages[snap.key] = snap.val();
            renderTickWhenReady(snap.key);
        }, function (err) { console.error('Messenger V6: message listener error', err); });

        mgrChangedRef = ref;
        mgrChangedCallback = ref.on('child_changed', function (snap) {
            mgrMessages[snap.key] = snap.val();
            renderTickWhenReady(snap.key);
        }, function (err) { console.error('Messenger V6: message change listener error', err); });
    }

    // V1's own listener creates the bubble DOM node asynchronously; retry
    // briefly in case this fires first (same pattern V3-A uses).
    function renderTickWhenReady(key, attempt) {
        attempt = attempt || 0;
        const msgsEl = document.getElementById('messengerChatMessages');
        const el = msgsEl && msgsEl.querySelector('[data-msg-key="' + key + '"]');
        if (!el) {
            if (attempt < 10) setTimeout(function () { renderTickWhenReady(key, attempt + 1); }, 50);
            return;
        }
        const msg = mgrMessages[key];
        if (!msg || !currentUser || msg.uid !== currentUser.uid) return; // ticks only shown on MY OWN sent messages
        const timeEl = el.querySelector('.message-time');
        if (!timeEl) return;
        let tick = timeEl.querySelector('.messenger-msg-tick');
        if (!tick) {
            tick = document.createElement('span');
            tick.className = 'messenger-msg-tick';
            timeEl.appendChild(tick);
        }
        tick.textContent = msg.read ? '✓✓' : '✓';
        tick.className = 'messenger-msg-tick ' + (msg.read ? 'read' : 'sent');
    }

    // Recipient marks the other person's messages as read as soon as the
    // chat is opened — this is what makes the SENDER's ticks turn blue.
    function markIncomingMessagesRead() {
        if (!currentUser || !mgrChatId || !mgrOtherUid) return;
        const chatId = mgrChatId;
        const otherUid = mgrOtherUid;
        database.ref('messages/private/' + chatId).once('value', function (snap) {
            const updates = {};
            snap.forEach(function (child) {
                const m = child.val();
                if (m && m.uid === otherUid && !m.read) updates[child.key + '/read'] = true;
            });
            if (Object.keys(updates).length) {
                database.ref('messages/private/' + chatId).update(updates).catch(function (err) {
                    console.error('Messenger V6: mark-as-read failed', err);
                });
            }
        }, function (err) { console.error('Messenger V6: mark-as-read read failed', err); });
    }

    // ============================================
    // Inbox: 📌 pin icon + long-press row menu (Pin/Mute/Clear/Delete)
    // ============================================
    document.addEventListener('messenger:inboxRendered', decorateInboxRows);

    function decorateInboxRows() {
        const listEl = document.getElementById('messengerInboxList');
        if (!listEl) return;
        listEl.querySelectorAll('.messenger-inbox-item').forEach(function (item) {
            wireInboxLongPress(item);
            decoratePinIcon(item);
        });
    }

    function decoratePinIcon(item) {
        database.ref('users/' + currentUser.uid + '/chats/' + item.dataset.chatId + '/pinned').once('value', function (snap) {
            const nameRow = item.querySelector('.messenger-inbox-name-row');
            if (!nameRow) return;
            let icon = nameRow.querySelector('.messenger-inbox-pin-icon');
            if (snap.val()) {
                if (!icon) {
                    icon = document.createElement('span');
                    icon.className = 'messenger-inbox-pin-icon';
                    icon.textContent = '📌';
                    const nameEl = nameRow.querySelector('.messenger-inbox-name');
                    if (nameEl) nameEl.insertAdjacentElement('afterend', icon);
                }
            } else if (icon) {
                icon.remove();
            }
        });
    }

    function wireInboxLongPress(item) {
        if (item.dataset.v6Wired) return;
        item.dataset.v6Wired = '1';
        let touchTimer = null;
        let longPressFired = false;
        item.addEventListener('touchstart', function () {
            longPressFired = false;
            touchTimer = setTimeout(function () {
                longPressFired = true;
                openInboxActionMenu(item);
            }, 500);
        });
        item.addEventListener('touchend', function (e) {
            clearTimeout(touchTimer);
            if (longPressFired) { e.preventDefault(); e.stopPropagation(); } // swallow the click that would open the chat
        });
        item.addEventListener('touchmove', function () { clearTimeout(touchTimer); });
        item.addEventListener('contextmenu', function (e) {
            e.preventDefault();
            openInboxActionMenu(item);
        });
    }

    function openInboxActionMenu(item) {
        const menu = document.getElementById('messengerInboxActionMenu');
        const buttonsRow = document.getElementById('messengerInboxActionButtons');
        if (!menu || !buttonsRow) return;
        const chatId = item.dataset.chatId;

        database.ref('users/' + currentUser.uid + '/chats/' + chatId).once('value', function (snap) {
            const c = snap.val() || {};
            const pinned = !!c.pinned;
            const muted = isMuted(chatId);

            const items = [
                {
                    label: pinned ? '📌 Unpin Chat' : '📌 Pin Chat',
                    onClick: function () { closeInboxActionMenu(); togglePin(chatId, pinned); }
                },
                {
                    label: muted ? '🔊 Unmute' : '🔇 Mute Notifications',
                    onClick: function () { closeInboxActionMenu(); toggleMute(chatId, muted); }
                },
                {
                    label: '🧹 Clear Chat',
                    danger: true,
                    onClick: function () { closeInboxActionMenu(); confirmClearChat(chatId); }
                },
                {
                    label: '🗑️ Delete Chat',
                    danger: true,
                    onClick: function () { closeInboxActionMenu(); confirmDeleteChat(chatId); }
                }
            ];

            buttonsRow.innerHTML = '';
            items.forEach(function (it) {
                const btn = document.createElement('button');
                btn.textContent = it.label;
                if (it.danger) btn.classList.add('messenger-danger');
                btn.addEventListener('click', it.onClick);
                buttonsRow.appendChild(btn);
            });

            const rect = item.getBoundingClientRect();
            menu.style.display = 'block';
            const menuHeight = menu.offsetHeight || 200;
            menu.style.top = Math.max(8, Math.min(rect.top, window.innerHeight - menuHeight - 8)) + 'px';
            menu.style.left = '16px';
            menu.style.right = '16px';
            setTimeout(function () { document.addEventListener('click', closeMenuOnOutsideClick); }, 0);
        });
    }

    function closeInboxActionMenu() {
        const menu = document.getElementById('messengerInboxActionMenu');
        if (menu) menu.style.display = 'none';
        document.removeEventListener('click', closeMenuOnOutsideClick);
    }

    function closeMenuOnOutsideClick(e) {
        const menu = document.getElementById('messengerInboxActionMenu');
        if (menu && !menu.contains(e.target)) closeInboxActionMenu();
    }

    function togglePin(chatId, currentlyPinned) {
        database.ref('users/' + currentUser.uid + '/chats/' + chatId + '/pinned').set(!currentlyPinned).catch(function (err) {
            console.error('Messenger V6: pin toggle failed', err);
            alert('Could not update this chat. Please try again.');
        });
    }

    function toggleMute(chatId, currentlyMuted) {
        const ref = database.ref('users/' + currentUser.uid + '/muted/' + chatId);
        const op = currentlyMuted ? ref.remove() : ref.set({ duration: 'always', mutedUntil: null });
        op.catch(function (err) {
            console.error('Messenger V6: mute toggle failed', err);
            alert('Could not update mute status. Please try again.');
        });
    }

    function confirmClearChat(chatId) {
        if (!confirm('Clear this chat? All messages will be removed from your view only — the other person keeps their copy.')) return;
        clearChat(chatId);
    }

    function clearChat(chatId) {
        database.ref('messages/private/' + chatId).once('value', function (snap) {
            const updates = {};
            snap.forEach(function (child) { updates['users/' + currentUser.uid + '/hiddenMessages/' + child.key] = true; });
            updates['users/' + currentUser.uid + '/chats/' + chatId + '/lastMessage'] = '';
            database.ref().update(updates).catch(function (err) {
                console.error('Messenger V6: clear chat failed', err);
                alert('Could not clear this chat. Please try again.');
            });
        }, function (err) {
            console.error('Messenger V6: clear chat read failed', err);
            alert('Could not clear this chat. Please try again.');
        });
    }

    function confirmDeleteChat(chatId) {
        if (!confirm('Delete this chat? It will be removed from your inbox. The other person will still have their copy.')) return;
        database.ref('users/' + currentUser.uid + '/chats/' + chatId).remove().catch(function (err) {
            console.error('Messenger V6: delete chat failed', err);
            alert('Could not delete this chat. Please try again.');
        });
    }
})();
