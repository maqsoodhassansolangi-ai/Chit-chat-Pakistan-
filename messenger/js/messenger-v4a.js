// ============================================
// ChitChat Pakistan — Messenger V4-A: Block + Mute + Delete Chat
// ============================================
// Self-contained: does NOT modify app.js. Uses the same decoupled-listener
// pattern as V3-A/V3-B (own Firebase listeners, enhances DOM V1 already
// built) plus one new tiny hook already added to messenger-v1.js:
// renderInbox() now dispatches 'messenger:inboxRendered' after every
// rebuild, since V4-A needs to re-apply the 🔇 mute icon each time the
// inbox list's innerHTML is replaced.
//
// NOTE on Block, honestly stated: the master spec's own schema/rules only
// store users/{uid}/blocked/{blockedUid} under the blocker's OWN node,
// readable/writable by that user only — there's no reverse index, so this
// is necessarily one-directional. If YOU block someone, their messages
// stop appearing to you and you can't send to them. There's no way (with
// this schema/rules) to detect if THEY blocked you — doing that would
// need a reverse "blockedBy" index with different write rules, which
// isn't in the spec's V1 rules block. Flagging this rather than silently
// pretending it's symmetric.
//
// DB additions (V4-A):
//   users/{uid}/blocked/{otherUid}: true
//   users/{uid}/muted/{chatId}: { duration: '8h'|'1w'|'always', mutedUntil: ts|null }
//   users/{uid}/chats/{chatId}: removed entirely on "Delete Chat" (messages remain)
// ============================================
(function () {
    'use strict';

    let mgrChatId = null;
    let mgrOtherUid = null;
    let mgrBlockedMap = {};
    let mgrMutedMap = {};
    let mgrBlockedRef = null;
    let mgrBlockedCallback = null;
    let mgrMutedRef = null;
    let mgrMutedCallback = null;
    let mgrChatMessagesRef = null;
    let mgrChatMessagesCallback = null;
    let mgrV4aWired = false;

    // ============================================
    // Global (login-scoped) listeners: blocked list + muted list
    // ============================================
    auth.onAuthStateChanged(function (user) {
        detachGlobalListeners();
        mgrBlockedMap = {};
        mgrMutedMap = {};
        if (!user) return;
        mgrBlockedRef = database.ref('users/' + user.uid + '/blocked');
        mgrBlockedCallback = mgrBlockedRef.on('value', function (snap) {
            mgrBlockedMap = snap.val() || {};
            applyBlockedStateToOpenChat();
        }, function (err) { console.error('Messenger V4-A: blocked listener error', err); });

        mgrMutedRef = database.ref('users/' + user.uid + '/muted');
        mgrMutedCallback = mgrMutedRef.on('value', function (snap) {
            mgrMutedMap = snap.val() || {};
            decorateInboxMuteIcons();
        }, function (err) { console.error('Messenger V4-A: muted listener error', err); });
    });

    function detachGlobalListeners() {
        if (mgrBlockedRef && mgrBlockedCallback) mgrBlockedRef.off('value', mgrBlockedCallback);
        if (mgrMutedRef && mgrMutedCallback) mgrMutedRef.off('value', mgrMutedCallback);
        mgrBlockedRef = null; mgrBlockedCallback = null;
        mgrMutedRef = null; mgrMutedCallback = null;
    }

    function isMuted(chatId) {
        const m = mgrMutedMap[chatId];
        if (!m) return false;
        return m.duration === 'always' || (typeof m.mutedUntil === 'number' && m.mutedUntil > Date.now());
    }

    // ============================================
    // Inbox: 🔇 mute icon on each row, re-applied every rebuild
    // ============================================
    document.addEventListener('messenger:inboxRendered', decorateInboxMuteIcons);

    function decorateInboxMuteIcons() {
        const listEl = document.getElementById('messengerInboxList');
        if (!listEl) return;
        listEl.querySelectorAll('.messenger-inbox-item').forEach(function (item) {
            const chatId = item.dataset.chatId;
            const nameRow = item.querySelector('.messenger-inbox-name-row');
            if (!nameRow) return;
            let icon = nameRow.querySelector('.messenger-inbox-mute-icon');
            if (isMuted(chatId)) {
                if (!icon) {
                    icon = document.createElement('span');
                    icon.className = 'messenger-inbox-mute-icon';
                    icon.textContent = '🔇';
                    const nameEl = nameRow.querySelector('.messenger-inbox-name');
                    if (nameEl) nameEl.insertAdjacentElement('afterend', icon);
                }
            } else if (icon) {
                icon.remove();
            }
        });
    }

    // ============================================
    // Chat screen: block banner + header ⋮ menu
    // ============================================
    document.addEventListener('messenger:chatOpen', function (e) {
        resetChatState();
        wireV4aUIOnce();
        mgrChatId = e.detail.chatId;
        mgrOtherUid = e.detail.otherUid;
        applyBlockedStateToOpenChat();
    });

    document.addEventListener('messenger:chatClose', function () {
        resetChatState();
    });

    function resetChatState() {
        mgrChatId = null;
        mgrOtherUid = null;
        closeChatMenu();
    }

    function applyBlockedStateToOpenChat() {
        if (!mgrChatId || !mgrOtherUid) return;
        const banner = document.getElementById('messengerBlockedBanner');
        const inputbar = document.querySelector('#messengerChatScreen .messenger-chat-inputbar');
        if (!banner || !inputbar) return;
        if (mgrBlockedMap[mgrOtherUid]) {
            banner.style.display = 'block';
            inputbar.style.display = 'none';
        } else {
            banner.style.display = 'none';
            inputbar.style.display = 'flex';
        }
    }

    function openChatMenu() {
        const menu = document.getElementById('messengerChatMenu');
        const buttonsRow = document.getElementById('messengerChatMenuButtons');
        const anchorBtn = document.getElementById('messengerChatMenuBtn');
        if (!menu || !buttonsRow || !anchorBtn || !mgrChatId || !mgrOtherUid) return;

        const blocked = !!mgrBlockedMap[mgrOtherUid];
        const muted = isMuted(mgrChatId);

        const items = [
            {
                label: blocked ? '✅ Unblock' : '🚫 Block',
                danger: !blocked,
                onClick: function () { closeChatMenu(); confirmBlockToggle(blocked); }
            },
            {
                label: muted ? '🔊 Unmute' : '🔇 Mute',
                onClick: function () {
                    closeChatMenu();
                    if (muted) unmuteChat(); else openMuteModal();
                }
            },
            {
                label: '🗑️ Delete Chat',
                danger: true,
                onClick: function () { closeChatMenu(); confirmDeleteChat(); }
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

        const rect = anchorBtn.getBoundingClientRect();
        menu.style.display = 'block';
        const menuWidth = menu.offsetWidth || 200;
        menu.style.top = (rect.bottom + 6) + 'px';
        menu.style.left = Math.max(8, rect.right - menuWidth) + 'px';
        setTimeout(function () { document.addEventListener('click', closeChatMenuOnOutsideClick); }, 0);
    }

    function closeChatMenu() {
        const menu = document.getElementById('messengerChatMenu');
        if (menu) menu.style.display = 'none';
        document.removeEventListener('click', closeChatMenuOnOutsideClick);
    }

    function closeChatMenuOnOutsideClick(e) {
        const menu = document.getElementById('messengerChatMenu');
        const anchorBtn = document.getElementById('messengerChatMenuBtn');
        if (menu && !menu.contains(e.target) && e.target !== anchorBtn) closeChatMenu();
    }

    // ============================================
    // Block / Unblock
    // ============================================
    function confirmBlockToggle(currentlyBlocked) {
        showConfirmModal({
            text: currentlyBlocked
                ? 'Unblock this contact? They will be able to message you again.'
                : 'Block this contact? You will stop seeing their messages and won\'t be able to message them.',
            okLabel: currentlyBlocked ? 'Unblock' : 'Block',
            danger: !currentlyBlocked,
            onConfirm: function () { toggleBlock(currentlyBlocked); }
        });
    }

    function toggleBlock(currentlyBlocked) {
        if (!currentUser || !mgrOtherUid) return;
        const ref = database.ref('users/' + currentUser.uid + '/blocked/' + mgrOtherUid);
        const op = currentlyBlocked ? ref.remove() : ref.set(true);
        op.catch(function (err) {
            console.error('Messenger V4-A: block/unblock failed', err);
            alert('Could not update block status. Please try again.');
        });
    }

    // ============================================
    // Mute / Unmute
    // ============================================
    function openMuteModal() {
        document.getElementById('messengerMuteModal').classList.add('active');
    }

    function closeMuteModal() {
        document.getElementById('messengerMuteModal').classList.remove('active');
    }

    function muteChat(duration) {
        if (!currentUser || !mgrChatId) return;
        const now = Date.now();
        let mutedUntil = null;
        if (duration === '8h') mutedUntil = now + 8 * 60 * 60 * 1000;
        else if (duration === '1w') mutedUntil = now + 7 * 24 * 60 * 60 * 1000;
        database.ref('users/' + currentUser.uid + '/muted/' + mgrChatId).set({
            duration: duration,
            mutedUntil: mutedUntil
        }).catch(function (err) {
            console.error('Messenger V4-A: mute failed', err);
            alert('Could not mute this chat. Please try again.');
        });
    }

    function unmuteChat() {
        if (!currentUser || !mgrChatId) return;
        database.ref('users/' + currentUser.uid + '/muted/' + mgrChatId).remove().catch(function (err) {
            console.error('Messenger V4-A: unmute failed', err);
            alert('Could not unmute this chat. Please try again.');
        });
    }

    // ============================================
    // Delete Chat (removes from my inbox only; messages remain)
    // ============================================
    function confirmDeleteChat() {
        showConfirmModal({
            text: 'Delete this chat? It will be removed from your inbox. The other person will still have their copy.',
            okLabel: 'Delete Chat',
            danger: true,
            onConfirm: deleteChat
        });
    }

    function deleteChat() {
        if (!currentUser || !mgrChatId) return;
        const chatId = mgrChatId;
        database.ref('users/' + currentUser.uid + '/chats/' + chatId).remove().then(function () {
            history.back(); // returns to inbox via V1's own popstate handler
        }).catch(function (err) {
            console.error('Messenger V4-A: delete chat failed', err);
            alert('Could not delete this chat. Please try again.');
        });
    }

    // ============================================
    // Generic confirm modal (Block/Unblock, Delete Chat)
    // ============================================
    let mgrConfirmCallback = null;

    function showConfirmModal(opts) {
        document.getElementById('messengerConfirmText').textContent = opts.text;
        const okBtn = document.getElementById('messengerConfirmOkBtn');
        okBtn.textContent = opts.okLabel;
        okBtn.classList.toggle('messenger-delete-danger', !!opts.danger);
        mgrConfirmCallback = opts.onConfirm;
        document.getElementById('messengerConfirmModal').classList.add('active');
    }

    function closeConfirmModal() {
        document.getElementById('messengerConfirmModal').classList.remove('active');
        mgrConfirmCallback = null;
    }

    // ============================================
    // Wire V4-A UI elements once (guaranteed to exist by first chatOpen)
    // ============================================
    function wireV4aUIOnce() {
        if (mgrV4aWired) return;
        mgrV4aWired = true;

        document.getElementById('messengerChatMenuBtn').addEventListener('click', function (e) {
            e.stopPropagation();
            openChatMenu();
        });

        document.getElementById('messengerConfirmOkBtn').addEventListener('click', function () {
            const cb = mgrConfirmCallback;
            closeConfirmModal();
            if (cb) cb();
        });
        document.getElementById('messengerConfirmCancelBtn').addEventListener('click', closeConfirmModal);
        document.getElementById('messengerConfirmModal').addEventListener('click', function (e) {
            if (e.target.id === 'messengerConfirmModal') closeConfirmModal();
        });

        document.getElementById('messengerMute8hBtn').addEventListener('click', function () { muteChat('8h'); closeMuteModal(); });
        document.getElementById('messengerMute1wBtn').addEventListener('click', function () { muteChat('1w'); closeMuteModal(); });
        document.getElementById('messengerMuteAlwaysBtn').addEventListener('click', function () { muteChat('always'); closeMuteModal(); });
        document.getElementById('messengerMuteCancelBtn').addEventListener('click', closeMuteModal);
        document.getElementById('messengerMuteModal').addEventListener('click', function (e) {
            if (e.target.id === 'messengerMuteModal') closeMuteModal();
        });
    }
})();
