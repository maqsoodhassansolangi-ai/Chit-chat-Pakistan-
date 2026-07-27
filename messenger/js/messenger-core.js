// ============================================
// messenger/js/messenger-core.js — V1 (Base Messenger)
// ============================================

(function() {
    'use strict';

    // DOM refs
    const messengerPage = document.getElementById('messengerPage');
    const messengerBackBtn = document.getElementById('messengerBackBtn');
    const messengerChatList = document.getElementById('messengerChatList');
    const messengerChatArea = document.getElementById('messengerChatArea');
    const messengerChatName = document.getElementById('messengerChatName');
    const messengerChatStatus = document.getElementById('messengerChatStatus');
    const messengerMessages = document.getElementById('messengerMessages');
    const messengerMsgInput = document.getElementById('messengerMsgInput');
    const messengerSendBtn = document.getElementById('messengerSendBtn');

    // State
    let currentMessengerChat = null;
    let messengerChats = {};
    let messengerMessagesRef = null;
    let messengerMsgListener = null;

    // ===== HELPER: escapeHtml =====
    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // ===== OPEN / CLOSE MESSENGER =====
    window.openMessenger = function() {
        // اگر HTML موجود نہیں ہے تو اسے fetch کریں
        const existing = document.getElementById('messengerPage');
        if (!existing) {
            fetch('messenger/messenger.html')
                .then(res => res.text())
                .then(html => {
                    document.body.insertAdjacentHTML('beforeend', html);
                    // دوبارہ کال کریں
                    openMessenger();
                })
                .catch(err => alert('Messenger page failed to load: ' + err.message));
            return;
        }

        // اب صفحہ موجود ہے — اسے کھولیں
        messengerPage.style.display = 'flex';
        messengerPage.style.position = 'fixed';
        messengerPage.style.top = '0';
        messengerPage.style.left = '0';
        messengerPage.style.width = '100%';
        messengerPage.style.height = '100%';
        messengerPage.style.zIndex = '9999';
        messengerPage.style.overflow = 'hidden';
        messengerPage.style.flexDirection = 'column';

        loadMessengerChats();
        history.pushState({ page: 'messenger' }, '');
    };

    function closeMessenger() {
        messengerPage.style.display = 'none';
        if (messengerMsgListener) {
            messengerMessagesRef.off('child_added', messengerMsgListener);
            messengerMsgListener = null;
        }
        messengerMessages.innerHTML = '';
        currentMessengerChat = null;
        messengerChatArea.style.display = 'none';
    }

    // Back button (←)
    messengerBackBtn.addEventListener('click', function() {
        if (currentMessengerChat) {
            closeChatView();
        } else {
            closeMessenger();
        }
    });

    // Handle browser back (popstate)
    window.addEventListener('popstate', function(e) {
        if (e.state && e.state.page === 'messenger') {
            if (currentMessengerChat) {
                closeChatView();
            } else {
                closeMessenger();
            }
        } else if (!e.state) {
            closeMessenger();
        }
    });

    // ===== LOAD CHATS =====
    function loadMessengerChats() {
        const user = firebase.auth().currentUser;
        if (!user) return;
        const chatsRef = database.ref('users/' + user.uid + '/chats');
        chatsRef.on('value', snap => {
            messengerChats = snap.val() || {};
            renderChatList();
        });
    }

    function renderChatList() {
        messengerChatList.innerHTML = '';
        const chatIds = Object.keys(messengerChats);
        if (chatIds.length === 0) {
            messengerChatList.innerHTML = '<div style="padding:20px;text-align:center;color:#999;">No chats yet</div>';
            return;
        }
        chatIds.sort((a,b) => (messengerChats[b].lastTimestamp||0) - (messengerChats[a].lastTimestamp||0));
        chatIds.forEach(chatId => {
            const chat = messengerChats[chatId];
            const div = document.createElement('div');
            div.className = 'chat-item' + (currentMessengerChat && currentMessengerChat.uid === chatId ? ' active' : '');
            const name = chat.name || 'Unknown';
            const firstLetter = name.charAt(0).toUpperCase();
            div.innerHTML = `
                <div class="chat-item-avatar" style="background:#075E54;">${firstLetter}</div>
                <div class="chat-item-info">
                    <div class="chat-item-name">${escapeHtml(name)} <span class="status-dot ${chat.online ? 'online' : 'offline'}"></span></div>
                    <div class="chat-item-last">${escapeHtml(chat.lastMessage || 'Start chatting')}</div>
                </div>
                <div class="chat-item-meta">
                    <div class="chat-item-time">${chat.lastTimestamp ? new Date(chat.lastTimestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : ''}</div>
                    ${chat.unread ? `<div class="chat-item-unread">${chat.unread}</div>` : ''}
                </div>
            `;
            div.dataset.chatId = chatId;
            div.addEventListener('click', function() {
                openChatView(chatId, chat);
            });
            messengerChatList.appendChild(div);
        });
    }

    // ===== OPEN / CLOSE CHAT VIEW =====
    function openChatView(chatId, chat) {
        currentMessengerChat = { uid: chatId, name: chat.name || 'Unknown' };
        messengerChatName.textContent = chat.name || 'Unknown';
        messengerChatStatus.textContent = chat.online ? '🟢 Online' : '⚫ Offline';
        messengerChatArea.style.display = 'flex';
        messengerMessages.innerHTML = '';
        history.pushState({ page: 'messenger', chat: chatId }, '', '#messenger/chat/' + chatId);

        const user = firebase.auth().currentUser;
        if (!user) return;
        const chatRoomId = [user.uid, chatId].sort().join('_');
        messengerMessagesRef = database.ref('private_messages/' + chatRoomId);
        messengerMsgListener = messengerMessagesRef.orderByChild('timestamp').on('child_added', snap => {
            const msg = snap.val();
            if (msg) {
                msg.key = snap.key;
                displayMessengerMessage(msg, user.uid);
                if (msg.uid !== user.uid && !msg.read) {
                    messengerMessagesRef.child(snap.key + '/read').set(true);
                }
            }
        });
        const chatsRef = database.ref('users/' + user.uid + '/chats/' + chatId);
        chatsRef.update({ unread: 0 });
    }

    function closeChatView() {
        if (messengerMsgListener) {
            messengerMessagesRef.off('child_added', messengerMsgListener);
            messengerMsgListener = null;
        }
        messengerMessages.innerHTML = '';
        currentMessengerChat = null;
        messengerChatArea.style.display = 'none';
        history.pushState({ page: 'messenger' }, '', '#messenger');
    }

    function displayMessengerMessage(msg, myUid) {
        const div = document.createElement('div');
        const isMine = msg.uid === myUid;
        div.className = 'msg-bubble ' + (isMine ? 'sent' : 'received');
        const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '';
        const tick = isMine ? (msg.read ? ' ✓✓' : ' ✓') : '';
        div.innerHTML = `
            <span>${escapeHtml(msg.text || '')}</span>
            <span class="msg-time">${time}${tick}</span>
        `;
        messengerMessages.appendChild(div);
        messengerMessages.scrollTop = messengerMessages.scrollHeight;
    }

    // ===== SEND MESSAGE =====
    messengerSendBtn.addEventListener('click', sendMessengerMessage);
    messengerMsgInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); sendMessengerMessage(); }
    });

    function sendMessengerMessage() {
        const text = messengerMsgInput.value.trim();
        if (!text || !currentMessengerChat) return;
        const user = firebase.auth().currentUser;
        if (!user) return;
        const chatId = currentMessengerChat.uid;
        const chatRoomId = [user.uid, chatId].sort().join('_');
        const msgData = {
            uid: user.uid,
            name: user.displayName || user.email || 'You',
            text: text,
            timestamp: Date.now(),
            read: false
        };
        messengerMessagesRef.push(msgData).then(() => {
            messengerMsgInput.value = '';
            const chatsRef = database.ref('users/' + user.uid + '/chats/' + chatId);
            chatsRef.update({
                lastMessage: text,
                lastTimestamp: Date.now()
            });
            const otherChatsRef = database.ref('users/' + chatId + '/chats/' + user.uid);
            otherChatsRef.once('value', snap => {
                if (snap.exists()) {
                    otherChatsRef.update({
                        lastMessage: text,
                        lastTimestamp: Date.now(),
                        unread: (snap.val().unread || 0) + 1
                    });
                }
            });
        }).catch(err => alert('Error: ' + err.message));
    }

    // ===== ADD MESSENGER TAB TO MENU (FIXED) =====
    // یہ حصہ اب DOMContentLoaded کے بغیر براہ راست چلے گا
    (function addMessengerTab() {
        const menuBar = document.getElementById('mainMenuBar');
        if (!menuBar) {
            // اگر مینو بار ابھی نہیں ملا، تو 500ms بعد دوبارہ کوشش کریں
            setTimeout(addMessengerTab, 500);
            return;
        }

        if (document.querySelector('.menu-tab[data-messenger]')) return;

        const messengerTab = document.createElement('div');
        messengerTab.className = 'menu-tab';
        messengerTab.setAttribute('data-messenger', 'true');
        messengerTab.textContent = 'Messenger';
        messengerTab.style.cursor = 'pointer';
        messengerTab.style.fontWeight = '500';

        messengerTab.addEventListener('click', function(e) {
            e.stopPropagation();
            if (typeof openMessenger === 'function') {
                openMessenger();
            }
        });

        // "Rooms" کے بعد ڈالیں
        const tabs = menuBar.querySelectorAll('.menu-tab');
        let inserted = false;
        for (let tab of tabs) {
            if (tab.textContent.trim() === 'Rooms' || tab.textContent.trim() === 'Rooms ▼') {
                tab.parentNode.insertBefore(messengerTab, tab.nextSibling);
                inserted = true;
                break;
            }
        }
        if (!inserted) {
            menuBar.querySelector('.menu-tabs').appendChild(messengerTab);
        }
    })();

})();
