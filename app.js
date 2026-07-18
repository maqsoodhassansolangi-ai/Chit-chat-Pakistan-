// ============================================
// ChitChat Pakistan - Complete App (v3.0 - Extended) - FIXED
// ============================================

// ===== FIREBASE CONFIG =====
const firebaseConfig = {
    apiKey: "AIzaSyCvCez1Hpq4gEsloecycnbKM_nuQlQVGIA",
    authDomain: "chit-chat-pakistan.firebaseapp.com",
    databaseURL: "https://chit-chat-pakistan-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "chit-chat-pakistan",
    storageBucket: "chit-chat-pakistan.firebasestorage.app",
    messagingSenderId: "740486617820",
    appId: "1:740486617820:web:a3fef5f11a5ea57526b219"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const database = firebase.database();
const storage = firebase.storage();

// ===== DOM ELEMENTS =====
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const googleBtn = document.getElementById('googleSignInBtn');
const guestBtn = document.getElementById('guestLoginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const authSection = document.getElementById('authSection');
const chatSection = document.getElementById('chatSection');
const loadingScreen = document.getElementById('loadingScreen');
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendMessageBtn');
const onlineCount = document.getElementById('onlineCount');
const roomTabsList = document.getElementById('roomTabsList');
const currentRoomName = document.getElementById('currentRoomName');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');
const privateChatBtn = document.getElementById('privateChatBtn');
const themeToggle = document.getElementById('themeToggle');
const emojiBtn = document.getElementById('emojiBtn');
const attachBtn = document.getElementById('attachBtn');

// Modals
const profileModal = document.getElementById('profileModal');
const passwordModal = document.getElementById('passwordModal');
const adminModal = document.getElementById('adminModal');
const stickerModal = document.getElementById('stickerModal');
const usersModal = document.getElementById('usersModal');
const privateChatModal = document.getElementById('privateChatModal');
const profilePhoto = document.getElementById('profilePhoto');
const profilePhotoInput = document.getElementById('profilePhotoInput');
const profileName = document.getElementById('profileName');
const profileMotto = document.getElementById('profileMotto');
const saveProfileBtn = document.getElementById('saveProfileBtn');
const currentPassword = document.getElementById('currentPassword');
const newPassword = document.getElementById('newPassword');
const confirmPassword = document.getElementById('confirmPassword');
const changePasswordBtn = document.getElementById('changePasswordBtn');
const adminUserList = document.getElementById('adminUserList');
const adminMessageList = document.getElementById('adminMessageList');
const adminRoomList = document.getElementById('adminRoomList');
const adminBanList = document.getElementById('adminBanList');
const adminStickerList = document.getElementById('adminStickerList');
const adminLogList = document.getElementById('adminLogList');
const badwordsInput = document.getElementById('badwordsInput');
const saveBadwordsBtn = document.getElementById('saveBadwordsBtn');
const stickerGrid = document.getElementById('stickerGrid');
const allUsersList = document.getElementById('allUsersList');
const privateChatMessages = document.getElementById('privateChatMessages');
const privateMessageInput = document.getElementById('privateMessageInput');
const sendPrivateMessageBtn = document.getElementById('sendPrivateMessageBtn');
const privateChatTitle = document.getElementById('privateChatTitle');

// Admin Settings Elements
const adminSiteName = document.getElementById('adminSiteName');
const adminAllowGuest = document.getElementById('adminAllowGuest');
const adminMaintenanceMode = document.getElementById('adminMaintenanceMode');
const adminMaxMessageLength = document.getElementById('adminMaxMessageLength');
const adminAnnouncement = document.getElementById('adminAnnouncement');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const adminToggleReadOnlyBtn = document.getElementById('adminToggleReadOnlyBtn');
const adminExportAllDataBtn = document.getElementById('adminExportAllDataBtn');
const adminClearAllMessagesBtn = document.getElementById('adminClearAllMessagesBtn');
const adminDeleteAllMessagesBtn = document.getElementById('adminDeleteAllMessagesBtn');
const adminExportUsersBtn = document.getElementById('adminExportUsersBtn');
const adminBanUserBtn = document.getElementById('adminBanUserBtn');
const addStickerBtn = document.getElementById('addStickerBtn');

// ===== GLOBAL VARIABLES =====
let currentUser = null;
let currentRoomId = 'room1';
let isAdmin = false;
let messagesRef = null;
let messagesListener = null;
let statusRef = database.ref('status');
let roomsRef = database.ref('rooms');
let stickersRef = database.ref('stickers');
let badwordsRef = database.ref('badwords/list');
let settingsRef = database.ref('settings');
let logsRef = database.ref('activity_logs');
let bansRef = database.ref('banned_users');
let privateChatRef = null;
let privateChatListener = null;
let privateChatWith = null;
let lastSendTime = 0;
let allUsersCache = [];
let typingTimeout = null;
const typingRef = database.ref('typing');

const ADMIN_EMAIL = "maqsoodhassansolangi90@gmail.com";

// ============================================
// AUTH & TABS SYSTEM
// ============================================
document.querySelectorAll('.toggle-password').forEach(el => {
    el.addEventListener('click', function() {
        const inp = document.getElementById(this.dataset.target);
        inp.type = inp.type === 'password' ? 'text' : 'password';
        this.textContent = inp.type === 'password' ? '👁️' : '🙈';
    });
});

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
        document.getElementById(this.dataset.tab + 'Form').classList.add('active');
    });
});

signupForm.addEventListener('submit', e => {
    e.preventDefault();
    const email = document.getElementById('signupEmail').value.trim();
    const pass = document.getElementById('signupPassword').value.trim();
    if (!document.getElementById('termsCheckbox').checked) return alert('Accept Terms first');
    if (pass.length < 6) return alert('Password must be 6+ chars');
    auth.createUserWithEmailAndPassword(email, pass)
        .then(() => {
            alert('Account created! Sign in now.');
            document.querySelector('[data-tab="login"]').click();
        })
        .catch(err => alert(err.message));
});

loginForm.addEventListener('submit', e => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const pass = document.getElementById('loginPassword').value.trim();
    auth.signInWithEmailAndPassword(email, pass)
        .then(() => showChat())
        .catch(err => alert(err.message));
});

googleBtn.addEventListener('click', () => {
    auth.signInWithPopup(new firebase.auth.GoogleAuthProvider())
        .then(() => showChat())
        .catch(err => alert(err.message));
});

guestBtn.addEventListener('click', () => {
    auth.signInAnonymously()
        .then(() => showChat())
        .catch(err => alert(err.message));
});

logoutBtn.addEventListener('click', () => {
    auth.signOut().then(() => showAuth());
});

function showChat() {
    authSection.style.display = 'none';
    chatSection.style.display = 'flex';
    logoutBtn.style.display = 'inline-block';
    document.getElementById('authFooter').style.display = 'none';
    document.getElementById('mainMenuBar').style.display = 'flex';
    document.getElementById('roomTabsContainer').style.display = 'flex';
    loadRooms();
    loadBadwords();
    loadStickers();
    loadAnnouncement();
    listenTyping(currentRoomId);
    setTimeout(adjustViewport, 100);
}

function showAuth() {
    authSection.style.display = 'flex';
    chatSection.style.display = 'none';
    logoutBtn.style.display = 'none';
    chatMessages.innerHTML = '';
    document.getElementById('authFooter').style.display = 'block';
    document.getElementById('mainMenuBar').style.display = 'none';
    document.getElementById('roomTabsContainer').style.display = 'none';
    if (messagesListener) {
        messagesListener();
        messagesListener = null;
    }
}

// ===== THEME =====
themeToggle.addEventListener('click', function() {
    document.body.classList.toggle('dark-mode');
    this.textContent = document.body.classList.contains('dark-mode') ? '☀️' : '🌙';
    localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
});
if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark-mode');
    themeToggle.textContent = '☀️';
}

// ============================================
// PRESENCE
// ============================================
auth.onAuthStateChanged(user => {
    loadingScreen.style.display = 'none';
    document.getElementById('appContainer').style.display = 'flex';
    if (user) {
        currentUser = user;
        checkIfBanned(user);
        isAdmin = (user.email && user.email === ADMIN_EMAIL);
        if (isAdmin) {
            database.ref('users/' + user.uid + '/isAdmin').set(true);
        }
        document.body.classList.toggle('is-admin', isAdmin);
        initPresence(user);
        loadSettings();
        showChat();
        logActivity('login');
    } else {
        currentUser = null;
        isAdmin = false;
        document.body.classList.remove('is-admin');
        showAuth();
    }
});

function checkIfBanned(user) {
    database.ref('banned_users/' + user.uid).once('value', snap => {
        const banData = snap.val();
        if (banData && (!banData.expiry || banData.expiry > Date.now())) {
            alert('You are banned! Reason: ' + (banData.reason || 'No reason provided'));
            auth.signOut();
        }
    });
}

function initPresence(user) {
    const userStatusRef = statusRef.child(user.uid);
    database.ref('.info/connected').on('value', function(snap) {
        if (snap.val() === false) return;
        userStatusRef.onDisconnect().set({ state: 'offline', lastSeen: Date.now() }).then(() => {
            userStatusRef.set({ state: 'online', lastSeen: Date.now() });
        });
    });

    statusRef.orderByChild('state').equalTo('online').on('value', snap => {
        onlineCount.textContent = `🟢 ${snap.numChildren()} online`;
    });
}

function logActivity(action, details = '') {
    if (!currentUser) return;
    logsRef.push({
        uid: currentUser.uid,
        email: currentUser.email,
        action: action,
        details: details,
        timestamp: Date.now(),
        ip: 'client-side'
    });
}

// ============================================
// SETTINGS & ANNOUNCEMENT
// ============================================
function loadSettings() {
    settingsRef.on('value', snap => {
        const settings = snap.val() || {};
        document.getElementById('siteStatus').textContent = settings.maintenanceMode ? '🔧 Maintenance' : '';
        if (settings.maintenanceMode && !isAdmin) {
            alert('Site is under maintenance. Please try again later.');
            auth.signOut();
        }
        if (settings.maxMessageLength) {
            document.getElementById('messageInput').maxLength = settings.maxMessageLength;
        }
    });
}

function loadAnnouncement() {
    database.ref('settings/announcement').on('value', snap => {
        const banner = document.getElementById('announcementBanner');
        const text = snap.val();
        if (text) {
            banner.textContent = text;
            banner.style.display = 'block';
        } else {
            banner.style.display = 'none';
        }
    });
}

// ============================================
// ROOMS MANAGEMENT
// ============================================
function loadRooms() {
    roomsRef.orderByChild('order').on('value', snap => {
        const rooms = snap.val();
        roomTabsList.innerHTML = '';
        if (!rooms) {
            const defaultRoom = {
                name: 'General Chat',
                description: 'Main chat room',
                createdBy: 'system',
                createdAt: Date.now(),
                order: 1,
                isPrivate: false,
                hidden: false,
                password: null
            };
            roomsRef.child('room1').set(defaultRoom);
            return;
        }
        const roomIds = Object.keys(rooms).sort((a,b) => (rooms[a].order||999) - (rooms[b].order||999));
        roomIds.forEach(id => {
            const room = rooms[id];
            if (room.hidden && !isAdmin) return;
            const tab = document.createElement('button');
            tab.className = 'room-tab' + (id === currentRoomId ? ' active' : '');
            tab.dataset.roomId = id;
            let label = room.name || id;
            if (room.isPrivate) label += ' 🔒';
            else if (room.isRegisteredOnly) label += ' 🔑';
            else label += ' 🌍';
            tab.textContent = label;
            tab.addEventListener('click', () => joinRoom(id));
            roomTabsList.appendChild(tab);
        });
        if (!rooms[currentRoomId] || rooms[currentRoomId].hidden) {
            joinRoom(roomIds[0] || 'room1');
        } else {
            currentRoomName.textContent = `# ${rooms[currentRoomId].name || currentRoomId}`;
        }
        attachMessagesListener(currentRoomId);
        populateRoomFilter();
    });
}

function populateRoomFilter() {
    const filter = document.getElementById('adminMessageRoomFilter');
    roomsRef.once('value', snap => {
        const rooms = snap.val();
        filter.innerHTML = '<option value="all">All Rooms</option>';
        if (rooms) {
            Object.keys(rooms).forEach(id => {
                const opt = document.createElement('option');
                opt.value = id;
                opt.textContent = rooms[id].name || id;
                filter.appendChild(opt);
            });
        }
    });
}

function joinRoom(roomId) {
    if (roomId === currentRoomId) return;
    closePrivateChat();
    currentRoomId = roomId;
    document.querySelectorAll('.room-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.roomId === roomId);
    });
    roomsRef.child(roomId).once('value', snap => {
        const room = snap.val();
        currentRoomName.textContent = `# ${room ? room.name : roomId}`;
        if (room && room.isPrivate && !isAdmin) {
            const password = prompt('This room is password protected. Enter password:');
            if (password !== room.password) {
                alert('Incorrect password!');
                joinRoom('room1');
                return;
            }
        }
        if (room && room.welcome) {
            const welcomeDiv = document.createElement('div');
            welcomeDiv.className = 'message-bubble received';
            welcomeDiv.innerHTML = `
                <span class="sender-name">System</span>
                <span>${room.welcome}</span>
                <span class="message-time">${new Date().toLocaleTimeString()}</span>
            `;
            chatMessages.appendChild(welcomeDiv);
            setTimeout(scrollToBottom, 100);
        }
    });
    chatMessages.innerHTML = '';
    attachMessagesListener(roomId);
    listenTyping(roomId);
    leaveRoomBtn.style.display = roomId !== 'room1' ? 'inline-block' : 'none';
    privateChatBtn.style.display = 'none';
    setTimeout(scrollToBottom, 100);
}

// ============================================
// TYPING INDICATOR
// ============================================
function setTyping(roomId, isTyping) {
    if (!currentUser) return;
    const userTypingRef = typingRef.child(roomId).child(currentUser.uid);
    if (isTyping) {
        userTypingRef.set(true);
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => userTypingRef.remove(), 3000);
    } else {
        userTypingRef.remove();
        clearTimeout(typingTimeout);
    }
}

function listenTyping(roomId) {
    typingRef.child(roomId).on('value', snap => {
        const typingUsers = snap.val();
        const indicator = document.getElementById('typingIndicator');
        if (!typingUsers) { indicator.style.display = 'none'; return; }
        const names = [];
        const promises = [];
        Object.keys(typingUsers).forEach(uid => {
            if (uid === currentUser?.uid) return;
            const p = database.ref('users/' + uid + '/profile/displayName').once('value')
                .then(s => { if (s.val()) names.push(s.val()); });
            promises.push(p);
        });
        Promise.all(promises).then(() => {
            if (names.length > 0) {
                indicator.textContent = names.join(', ') + ' is typing...';
                indicator.style.display = 'block';
            } else {
                indicator.style.display = 'none';
            }
        });
    });
}

// ============================================
// FIXED: attachMessagesListener (with child_removed)
// ============================================
function attachMessagesListener(roomId) {
    if (messagesListener) {
        messagesListener();
        messagesListener = null;
    }
    if (!roomId) return;

    messagesRef = database.ref('messages/' + roomId);
    
    // Child added (existing)
    const addedListener = messagesRef.orderByChild('timestamp').limitToLast(50).on('child_added', function(snapshot) {
        const msg = snapshot.val();
        if (msg) {
            msg.key = snapshot.key;
            displayMessage(msg);
        }
        scrollToBottom();
    });

    // Child removed (FIX: delete from UI)
    const removedListener = messagesRef.on('child_removed', function(snapshot) {
        const key = snapshot.key;
        const el = chatMessages.querySelector(`[data-id="${key}"]`);
        if (el) el.remove();
    });

    messagesListener = function() {
        messagesRef.off('child_added', addedListener);
        messagesRef.off('child_removed', removedListener);
    };
}

// ============================================
// MESSAGE INTERACTIONS (Long Press, Context Menu)
// ============================================
let selectedMessages = [];
let longPressTimer = null;
let isLongPress = false;

function setupMessageInteractions() {
    chatMessages.querySelectorAll('.message-bubble').forEach(el => {
        el.addEventListener('touchstart', function(e) {
            longPressTimer = setTimeout(() => {
                isLongPress = true;
                showContextMenu(this);
            }, 500);
        });
        el.addEventListener('touchend', function(e) {
            clearTimeout(longPressTimer);
            if (!isLongPress && !e.target.closest('.context-menu')) {
                // Single tap - could select for multi-select
                toggleSelect(this);
            }
            isLongPress = false;
        });
        el.addEventListener('touchmove', function() {
            clearTimeout(longPressTimer);
        });
    });
}

function showContextMenu(el) {
    const msgId = el.dataset.id;
    const msgData = getMessageData(msgId);
    if (!msgData) return;
    const isMine = msgData.uid === currentUser?.uid;
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.cssText = `
        position: fixed; bottom: 100px; left: 50%; transform: translateX(-50%);
        background: #fff; border-radius: 12px; padding: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        z-index: 2000; display: flex; gap: 8px; flex-wrap: wrap; max-width: 90%;
    `;
    // Reactions
    const reactions = ['❤️','😂','😮','😢','😡','👍'];
    reactions.forEach(emoji => {
        const btn = document.createElement('button');
        btn.textContent = emoji;
        btn.style.cssText = 'font-size:28px; background:none; border:none; cursor:pointer;';
        btn.onclick = () => {
            addReaction(msgId, emoji);
            menu.remove();
        };
        menu.appendChild(btn);
    });
    // Reply
    if (!isMine || true) { // anyone can reply
        const replyBtn = document.createElement('button');
        replyBtn.textContent = '↩️ Reply';
        replyBtn.style.cssText = 'padding:6px 12px; background:#075E54; color:#fff; border:none; border-radius:8px; cursor:pointer;';
        replyBtn.onclick = () => {
            replyTo(msgId);
            menu.remove();
        };
        menu.appendChild(replyBtn);
    }
    // Edit (only own messages)
    if (isMine) {
        const editBtn = document.createElement('button');
        editBtn.textContent = '✏️ Edit';
        editBtn.style.cssText = 'padding:6px 12px; background:#075E54; color:#fff; border:none; border-radius:8px; cursor:pointer;';
        editBtn.onclick = () => {
            editMessage(msgId);
            menu.remove();
        };
        menu.appendChild(editBtn);
    }
    // Delete (only own messages)
    if (isMine) {
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '🗑️ Delete';
        deleteBtn.style.cssText = 'padding:6px 12px; background:#e74c3c; color:#fff; border:none; border-radius:8px; cursor:pointer;';
        deleteBtn.onclick = () => {
            deleteMessage(msgId);
            menu.remove();
        };
        menu.appendChild(deleteBtn);
    }
    // Pin (Admin only)
    if (isAdmin) {
        const pinBtn = document.createElement('button');
        pinBtn.textContent = '📌 Pin';
        pinBtn.style.cssText = 'padding:6px 12px; background:#075E54; color:#fff; border:none; border-radius:8px; cursor:pointer;';
        pinBtn.onclick = () => {
            pinMessage(msgId);
            menu.remove();
        };
        menu.appendChild(pinBtn);
    }
    document.body.appendChild(menu);
    setTimeout(() => {
        document.addEventListener('click', function closeMenu(e) {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        });
    }, 10);
}

function getMessageData(msgId) {
    const el = chatMessages.querySelector(`[data-id="${msgId}"]`);
    if (!el) return null;
    const name = el.querySelector('.sender-name')?.textContent || '';
    const text = el.querySelector('span:not(.sender-name):not(.message-time)')?.textContent || '';
    const uid = el.dataset.uid || '';
    return { uid, name, text };
}

function addReaction(msgId, emoji) {
    const ref = database.ref('messages/' + currentRoomId + '/' + msgId + '/reactions');
    ref.once('value', snap => {
        const reactions = snap.val() || {};
        const uid = currentUser.uid;
        reactions[uid] = emoji;
        ref.set(reactions);
    });
}

function replyTo(msgId) {
    const msg = getMessageData(msgId);
    if (!msg) return;
    const replyBar = document.createElement('div');
    replyBar.id = 'replyBar';
    replyBar.style.cssText = 'background:#f0f0f0; padding:8px 12px; border-radius:8px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;';
    replyBar.innerHTML = `
        <span><b>Replying to ${msg.name}:</b> ${msg.text}</span>
        <span style="cursor:pointer; font-size:18px;">✕</span>
    `;
    replyBar.querySelector('span:last-child').onclick = () => replyBar.remove();
    document.getElementById('chatInputArea').prepend(replyBar);
    const originalSend = sendMessage;
    sendMessage = function(text, isSticker, stickerUrl, attachments) {
        if (!currentUser) return alert('Please login first!');
        if (!text && !isSticker && !attachments.length) return;
        const msgData = {
            uid: currentUser.uid,
            name: currentUser.displayName || currentUser.email || 'Guest',
            text: text || '',
            timestamp: Date.now(),
            isSticker: isSticker,
            stickerUrl: stickerUrl || '',
            attachments: attachments || [],
            replyTo: msgId
        };
        messageInput.value = '';
        setTyping(currentRoomId, false);
        messagesRef.push(msgData).then(() => {
            scrollToBottom();
            const bar = document.getElementById('replyBar');
            if (bar) bar.remove();
        }).catch(err => console.error(err));
        sendMessage = originalSend;
    };
}

function editMessage(msgId) {
    const el = chatMessages.querySelector(`[data-id="${msgId}"]`);
    const textSpan = el?.querySelector('span:not(.sender-name):not(.message-time)');
    if (!textSpan) return;
    const newText = prompt('Edit your message:', textSpan.textContent);
    if (newText !== null && newText.trim() !== '') {
        database.ref('messages/' + currentRoomId + '/' + msgId + '/text').set(newText.trim());
        textSpan.textContent = newText.trim() + ' (edited)';
    }
}

function deleteMessage(msgId) {
    const choice = confirm('Delete for everyone? (Cancel for just me)');
    if (choice) {
        database.ref('messages/' + currentRoomId + '/' + msgId).remove();
    } else {
        const el = chatMessages.querySelector(`[data-id="${msgId}"]`);
        if (el) el.style.display = 'none';
        let deleted = JSON.parse(localStorage.getItem('deletedMessages') || '{}');
        if (!deleted[currentRoomId]) deleted[currentRoomId] = [];
        deleted[currentRoomId].push(msgId);
        localStorage.setItem('deletedMessages', JSON.stringify(deleted));
    }
}

function pinMessage(msgId) {
    if (!isAdmin) return alert('Admin only!');
    const ref = database.ref('rooms/' + currentRoomId + '/pinned');
    ref.set(msgId);
}

function toggleSelect(el) {
    // For multi-select (placeholder)
    // We can implement later
}

// ============================================
// DISPLAY MESSAGE (Updated with reply, reactions, delete-for-me)
// ============================================
function displayMessage(msg) {
    if (!msg || !msg.key) return;
    // Check if deleted for me
    let deleted = JSON.parse(localStorage.getItem('deletedMessages') || '{}');
    if (deleted[currentRoomId] && deleted[currentRoomId].includes(msg.key)) {
        return; // skip
    }
    if (chatMessages.querySelector(`[data-id="${msg.key}"]`)) return;

    const div = document.createElement('div');
    const isMine = currentUser && msg.uid === currentUser.uid;
    div.className = 'message-bubble ' + (isMine ? 'sent' : 'received');
    div.dataset.id = msg.key;
    div.dataset.uid = msg.uid || '';

    // Avatar
    const avatarHTML = getAvatarHTML(msg.name || 'Guest', 30);

    // Content
    let content = msg.text || '';
    if (msg.isSticker && msg.stickerUrl) {
        content = `<img src="${msg.stickerUrl}" class="sticker-img" alt="sticker">`;
    } else {
        content = filterBadWords(content);
        if (currentUser) {
            const myName = currentUser.displayName || currentUser.email || 'Guest';
            content = highlightMentions(content, myName);
        }
        if (msg.attachments && msg.attachments.length) {
            msg.attachments.forEach(att => {
                content += `<div class="attachment">📎 <a href="${att.url}" target="_blank">${att.name}</a></div>`;
            });
        }
        // Reply indicator
        if (msg.replyTo) {
            const replyData = getMessageData(msg.replyTo);
            if (replyData) {
                content = `<div style="background:rgba(0,0,0,0.05); padding:4px 8px; border-radius:4px; font-size:13px; margin-bottom:4px; border-left:3px solid #075E54;">
                    <b>Replying to ${replyData.name}:</b> ${replyData.text}
                </div>` + content;
            }
        }
        // Reactions
        if (msg.reactions) {
            const reactionIcons = Object.values(msg.reactions);
            if (reactionIcons.length) {
                content += `<div style="margin-top:4px; display:flex; gap:2px; flex-wrap:wrap;">`;
                reactionIcons.forEach(emoji => {
                    content += `<span style="background:#fff; border-radius:12px; padding:2px 6px; font-size:14px; box-shadow:0 1px 2px rgba(0,0,0,0.1);">${emoji}</span>`;
                });
                content += `</div>`;
            }
        }
    }

    const timeStr = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : 'Just now';
    div.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
            ${avatarHTML}
            <span class="sender-name">${msg.name || 'Anonymous'}</span>
        </div>
        <span>${content}</span>
        <span class="message-time">${timeStr}</span>
    `;
    chatMessages.appendChild(div);
    // Setup interactions for new messages
    setupMessageInteractions();
}

function getAvatarHTML(name, size = 32) {
    if (!name) name = '?';
    const firstLetter = name.charAt(0).toUpperCase();
    return `<div style="display:inline-block; width:${size}px; height:${size}px; border-radius:50%; background-color:#075E54; color:#ffffff; text-align:center; line-height:${size}px; font-weight:bold; font-size:${size/1.6}px; flex-shrink:0;">${firstLetter}</div>`;
}

function highlightMentions(text, currentUserName) {
    if (!currentUserName) return text;
    const regex = new RegExp('@' + currentUserName, 'gi');
    return text.replace(regex, (match) => {
        return `<span style="background:#ffeb3b; color:#000; padding:0 4px; border-radius:4px; font-weight:bold;">${match}</span>`;
    });
}

function filterBadWords(text) {
    if (!window.badWordsList || !window.badWordsList.length) return text;
    let filtered = text;
    window.badWordsList.forEach(word => {
        const regex = new RegExp('\\b' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
        filtered = filtered.replace(regex, '***');
    });
    return filtered;
}

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
    setTimeout(() => chatMessages.scrollTop = chatMessages.scrollHeight, 50);
    setTimeout(() => chatMessages.scrollTop = chatMessages.scrollHeight, 150);
}

function adjustViewport() {
    if (window.visualViewport) {
        const height = window.visualViewport.height;
        document.body.style.height = `${height}px`;
        document.getElementById('appContainer').style.height = `${height}px`;
        scrollToBottom();
    }
}
window.visualViewport?.addEventListener('resize', adjustViewport);
window.visualViewport?.addEventListener('scroll', adjustViewport);
window.addEventListener('resize', adjustViewport);
messageInput.addEventListener('focus', () => {
    setTimeout(adjustViewport, 80);
    setTimeout(scrollToBottom, 200);
});

// ============================================
// SEND MESSAGE
// ============================================
function sendMessage(text, isSticker = false, stickerUrl = '', attachments = []) {
    if (!currentUser) return alert('Please login first!');
    if (!text && !isSticker && !attachments.length) return;

    const msgData = {
        uid: currentUser.uid,
        name: currentUser.displayName || currentUser.email || 'Guest',
        text: text || '',
        timestamp: Date.now(),
        isSticker: isSticker,
        stickerUrl: stickerUrl || '',
        attachments: attachments || []
    };

    messageInput.value = '';
    setTyping(currentRoomId, false);
    messagesRef.push(msgData).then(() => {
        scrollToBottom();
    }).catch(err => {
        console.error("Error sending message: ", err);
    });
}

function safeSend(e) {
    e.preventDefault();
    const now = Date.now();
    if (now - lastSendTime < 300) return;
    lastSendTime = now;
    const text = messageInput.value.trim();
    if (text) sendMessage(text);
}

sendBtn.addEventListener('click', safeSend);
messageInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        safeSend(e);
        return;
    }
    setTyping(currentRoomId, true);
});
messageInput.addEventListener('blur', function() {
    setTyping(currentRoomId, false);
});

// ===== ATTACHMENTS =====
attachBtn.addEventListener('click', function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*, .pdf, .doc, .docx, .txt';
    input.onchange = function(e) {
        const files = e.target.files;
        if (!files.length) return;
        const uploadPromises = [];
        const attachments = [];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const storageRef = storage.ref('attachments/' + Date.now() + '_' + file.name);
            const uploadTask = storageRef.put(file);
            uploadPromises.push(uploadTask.then(snapshot => snapshot.ref.getDownloadURL().then(url => {
                attachments.push({ name: file.name, url: url });
            })));
        }
        Promise.all(uploadPromises).then(() => {
            if (attachments.length) {
                sendMessage('', false, '', attachments);
            }
        }).catch(err => alert('Upload failed: ' + err.message));
    };
    input.click();
});

// ===== EMOJI PICKER =====
emojiBtn.addEventListener('click', function() {
    const emojis = ['😊','😂','❤️','😍','👍','🔥','💯','🎉','🥳','😎','🤔','😢','😡','👋','💪','🫶','🥰','😘','😇','🥺','🤗','😏','😒','🙄','😤','😭','😱','🤯','🥵','🥶','🤧','🤒','😷','🤐','😈','👻','💀','👽','🤖','🎃','🍕','🍔','🍟','🌭','🥓','🥩','🍗','🍖','🧀','🥚','🍳','🥞','🧇','🥐','🥖','🍞','🥯','🥨','🧈','🥔','🧅','🌽','🥕','🥬','🥦','🧄','🧅','🍄','🥜','🌰','🍫','🍬','🍭','🍮','🎂','🍰','🧁','🍩','🍪','☕','🧋','🥤','🍼','🍺','🍻','🥂','🥃','🍷','🍸','🍹','🍾','🧃','🥛','🍽️','🍴','🥄','🔪','🏺','🎁','🎈','🎉','🎊','🎋','🎍','🎎','🎏','🎐','🎑','🎒','🎓','👑','💍','💎','🧶','🧵','🧥','👗','👘','🥻','👙','👚','👛','👜','👝','🎒','👞','👟','🥾','🥿','👠','👡','👢','🧦','🧤','🧣','👒','🎩','🧢','⛑️','👷','💂','🕵️','👮','👳','👲','👸','🤴','🦸','🦹','🧙','🧚','🧛','🧜','🧝','🧞','🧟','🦇','🦉','🦅','🦆','🦢','🦩','🕊️','🐦','🐤','🐣','🐥','🦃','🐔','🐓','🐇','🐁','🐀','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐽','🐸','🐵','🐒','🐶','🐺','🐱','🦝','🐴','🦄','🦓','🦌','🐲','🐉','🐳','🐋','🐬','🐟','🐠','🐡','🦈','🐙','🦑','🐚','🦀','🦞','🦐','🐌','🦋','🐛','🐜','🐝','🐞','🦗','🦟','🪰','🪱','🪲','🪳','🪴','🌵','🎄','🌲','🌳','🌴','🌱','🌿','☘️','🍀','🎍','🎋','🎑','🌾','🌺','🌻','🌹','🥀','🌷','🌼','🌸','💐','🍂','🍁','🌍','🌎','🌏','🌕','🌖','🌗','🌘','🌑','🌒','🌓','🌔','🌚','🌝','🌛','🌜','🌙','⭐','🌟','✨','💫','🔥','💥','💧','💦','☔','⛄','❄️','🌊','🌫️','🌪️','🌈','☀️','🌤️','⛅','🌥️','☁️','🌦️','🌧️','🌨️','🌩️','⚡','🎵','🎶','🎤','🎧','🎼','🎹','🥁','🎷','🎺','🎸','🎻','🪕','🎯','🎳','🎮','🎲','♟️','🧩','🎪','🎨','🎭','🎬','🎫','🎟️','🎠','🎡','🎢','🎣','🎽','🎿','🏂','🏄','🏇','🏊','⛹️','🏋️','🚴','🚵','🏎️','🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🛴','🚲','🛵','🏍️','🛺','🚔','🚍','🚘','🚖','🚡','🚠','🚟','🚃','🚋','🚞','🚝','🚄','🚅','🚆','🚇','🚈','🚉','🚊','🚝','🚞','🚂','✈️','🛩️','🛫','🛬','🪂','💺','🛰️','🚀','🛸','🚁','⛵','🚤','🛥️','🚢','⛴️','🛳️','🚧','🚦','🚥','🚏','🗺️','🗿','🗽','🗼','🏰','🏯','🏟️','🎡','🎢','🎠','⛲','🏛️','🕌','🕍','⛪','🕋','🛕','🏗️','🌉','🏭','🏠','🏡','🏢','🏣','🏤','🏥','🏦','🏨','🏩','🏪','🏫','🏬','🏭','🏯','🏰','💒','🗼','🗽','⛪','🕌','🕍','🛕','🕋','⛲','🌁','🏝️','🏖️','🏜️','🌋','⛰️','🏔️','🗻','🏕️','⛺','🛖'];
    const picker = document.createElement('div');
    picker.style.cssText = 'position:fixed; bottom:70px; left:10px; background:#fff; border-radius:12px; padding:10px; box-shadow:0 4px 20px rgba(0,0,0,0.2); z-index:3000; display:flex; flex-wrap:wrap; gap:4px; max-width:300px; max-height:300px; overflow-y:auto;';
    emojis.forEach(e => {
        const span = document.createElement('span');
        span.textContent = e;
        span.style.cssText = 'font-size:26px; cursor:pointer; padding:4px;';
        span.onclick = function() {
            messageInput.value += this.textContent;
            picker.remove();
            messageInput.focus();
        };
        picker.appendChild(span);
    });
    document.body.appendChild(picker);
    setTimeout(() => {
        document.addEventListener('click', function closePicker(e) {
            if (!picker.contains(e.target) && e.target !== emojiBtn) {
                picker.remove();
                document.removeEventListener('click', closePicker);
            }
        });
    }, 10);
});

// ============================================
// STICKERS
// ============================================
function loadStickers() {
    stickersRef.on('value', snap => {
        const stickers = snap.val();
        stickerGrid.innerHTML = '';
        if (!stickers) return;
        Object.values(stickers).forEach(sticker => {
            const img = document.createElement('img');
            img.src = sticker.url;
            img.className = 'sticker-item';
            img.alt = sticker.name || 'sticker';
            img.onclick = () => {
                sendMessage('', true, sticker.url);
                stickerModal.style.display = 'none';
            };
            stickerGrid.appendChild(img);
        });
    });
}

addStickerBtn.addEventListener('click', function() {
    const name = document.getElementById('stickerNameInput').value.trim();
    const url = document.getElementById('stickerUrlInput').value.trim();
    if (!name || !url) return alert('Please enter both name and URL.');
    stickersRef.push({ name: name, url: url }).then(() => {
        document.getElementById('stickerNameInput').value = '';
        document.getElementById('stickerUrlInput').value = '';
        alert('Sticker added!');
        loadStickers();
    }).catch(err => alert('Error: ' + err.message));
});

// ============================================
// BAD WORDS
// ============================================
function loadBadwords() {
    badwordsRef.on('value', snap => {
        const val = snap.val();
        if (val && Array.isArray(val)) {
            window.badWordsList = val;
            badwordsInput.value = val.join('\n');
        } else {
            const defaults = ['fuck', 'shit', 'ass', 'bitch', 'cunt', 'bastard', 'damn', 'hell', 'idiot', 'stupid', 'dumb', 'fool', 'moron', 'loser', 'suck', 'crap', 'piss', 'dick', 'pussy', 'whore', 'slut', 'gand', 'bhosda', 'chut', 'loda', 'landa', 'bhenchod', 'madarchod', 'kutta', 'suar', 'nalayak', 'bewaqoof', 'chutiya', 'gadha', 'ullu', 'bakwas'];
            window.badWordsList = defaults;
            badwordsInput.value = defaults.join('\n');
            badwordsRef.set(defaults);
        }
    });
}

saveBadwordsBtn.addEventListener('click', function() {
    const words = badwordsInput.value.split('\n').map(w => w.trim()).filter(w => w.length > 0);
    badwordsRef.set(words).then(() => {
        alert('Bad words saved!');
    }).catch(err => alert('Error: ' + err.message));
});

// ============================================
// PROFILE
// ============================================
function loadProfile() {
    if (!currentUser) return;
    const uid = currentUser.uid;
    database.ref('users/' + uid + '/profile').once('value', snap => {
        const data = snap.val() || {};
        profilePhoto.src = data.photoURL || 'default-avatar.png';
        profileName.value = data.displayName || currentUser.displayName || '';
        profileMotto.value = data.motto || '';
    });
}

saveProfileBtn.addEventListener('click', function() {
    if (!currentUser) return;
    const uid = currentUser.uid;
    const updates = {
        displayName: profileName.value.trim() || currentUser.displayName || 'User',
        motto: profileMotto.value.trim() || '',
        photoURL: profilePhoto.src
    };
    database.ref('users/' + uid + '/profile').update(updates).then(() => {
        if (currentUser.displayName !== updates.displayName) {
            currentUser.updateProfile({ displayName: updates.displayName });
        }
        alert('Profile saved!');
        profileModal.style.display = 'none';
        logActivity('profile_update');
    }).catch(err => alert('Error: ' + err.message));
});

profilePhotoInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
        profilePhoto.src = ev.target.result;
    };
    reader.readAsDataURL(file);
});

// ============================================
// CHANGE PASSWORD
// ============================================
changePasswordBtn.addEventListener('click', function() {
    const current = document.getElementById('currentPassword').value.trim();
    const newPass = document.getElementById('newPassword').value.trim();
    const confirm = document.getElementById('confirmPassword').value.trim();
    if (!current || !newPass || !confirm) return alert('Please fill all fields.');
    if (newPass.length < 6) return alert('New password must be at least 6 characters.');
    if (newPass !== confirm) return alert('Passwords do not match.');
    
    const credential = firebase.auth.EmailAuthProvider.credential(currentUser.email, current);
    currentUser.reauthenticateWithCredential(credential).then(() => {
        currentUser.updatePassword(newPass).then(() => {
            alert('Password changed!');
            passwordModal.style.display = 'none';
            logActivity('password_change');
        }).catch(err => alert('Error: ' + err.message));
    }).catch(err => alert('Current password is incorrect.'));
});

// ============================================
// ADMIN PANEL (FULL)
// ============================================
function loadAdminPanel() {
    if (!isAdmin) return;
    loadAdminUsers();
    loadAdminMessages();
    loadAdminRooms();
    loadAdminBans();
    loadAdminStickers();
    loadAdminLogs();
    loadAdminSettings();
}

function loadAdminUsers() {
    database.ref('users').once('value', snap => {
        const users = snap.val();
        const list = document.getElementById('adminUserList');
        list.innerHTML = '';
        if (!users) return;
        allUsersCache = Object.entries(users);
        allUsersCache.forEach(([uid, data]) => {
            const div = document.createElement('div');
            div.className = 'admin-item';
            const email = data.email || uid;
            const name = data.profile?.displayName || 'N/A';
            const isBanned = data.isBanned ? '🚫' : '';
            div.innerHTML = `
                <span>${name} (${email}) ${isBanned}</span>
                <div>
                    <button class="blue" onclick="adminForceLogout('${uid}')">Logout</button>
                    <button class="orange" onclick="adminToggleGhost('${uid}')">👻 Ghost</button>
                    <button class="green" onclick="adminToggleVIP('${uid}')">⭐ VIP</button>
                    <button class="orange" onclick="adminMuteUser('${uid}')">🔇 Mute</button>
                    <button class="blue" onclick="adminViewIP('${uid}')">📡 IP</button>
                    <button onclick="adminBanUser('${uid}', prompt('Reason:'), parseInt(prompt('Expiry mins:')))">🚫 Ban</button>
                    <button onclick="adminAction('delete', '${uid}')">Delete</button>
                    <button class="green" onclick="adminAction('makeadmin', '${uid}')">Make Admin</button>
                </div>
            `;
            list.appendChild(div);
        });
    });
}

function loadAdminMessages() {
    database.ref('messages').once('value', snap => {
        const allRooms = snap.val();
        const list = document.getElementById('adminMessageList');
        list.innerHTML = '';
        if (!allRooms) return;
        let allMsgs = [];
        const roomFilter = document.getElementById('adminMessageRoomFilter').value;
        Object.entries(allRooms).forEach(([roomId, roomMsgs]) => {
            if (roomFilter !== 'all' && roomFilter !== roomId) return;
            if (roomMsgs) {
                Object.values(roomMsgs).forEach(msg => {
                    if (msg) allMsgs.push({ ...msg, roomId });
                });
            }
        });
        allMsgs.sort((a,b) => (b.timestamp||0) - (a.timestamp||0));
        allMsgs.slice(0, 100).forEach(msg => {
            const div = document.createElement('div');
            div.className = 'admin-item';
            div.innerHTML = `
                <span>${msg.name || 'Guest'}: ${msg.text || '[sticker]'} (Room: ${msg.roomId})</span>
                <span style="font-size:11px;color:#888;">${new Date(msg.timestamp).toLocaleTimeString()}</span>
            `;
            list.appendChild(div);
        });
    });
}

function loadAdminRooms() {
    roomsRef.on('value', snap => {
        const rooms = snap.val();
        const list = document.getElementById('adminRoomList');
        list.innerHTML = '';
        if (!rooms) return;
        Object.entries(rooms).forEach(([id, room]) => {
            const div = document.createElement('div');
            div.className = 'admin-item';
            div.innerHTML = `
                <span><b>${room.name || id}</b> ${room.isPrivate ? '🔒' : ''} ${room.hidden ? '🙈' : ''}</span>
                <div>
                    <button onclick="adminAction('editroom', '${id}')">Edit</button>
                    <button onclick="adminDeleteRoom('${id}')">Delete</button>
                </div>
            `;
            list.appendChild(div);
        });
    });
}

function loadAdminBans() {
    bansRef.on('value', snap => {
        const bans = snap.val();
        const list = document.getElementById('adminBanList');
        list.innerHTML = '';
        if (!bans) return;
        Object.entries(bans).forEach(([uid, data]) => {
            const div = document.createElement('div');
            div.className = 'admin-item';
            div.innerHTML = `
                <span>User: ${uid} - Reason: ${data.reason || 'No reason'} - Expiry: ${data.expiry ? new Date(data.expiry).toLocaleString() : 'Permanent'}</span>
                <button onclick="adminAction('unban', '${uid}')">Unban</button>
            `;
            list.appendChild(div);
        });
    });
}

function loadAdminStickers() {
    stickersRef.on('value', snap => {
        const stickers = snap.val();
        const list = document.getElementById('adminStickerList');
        list.innerHTML = '';
        if (!stickers) return;
        Object.entries(stickers).forEach(([key, sticker]) => {
            const div = document.createElement('div');
            div.className = 'admin-item';
            div.innerHTML = `
                <span><b>${sticker.name || 'Unnamed'}</b> <img src="${sticker.url}" style="max-height:30px; max-width:50px;"></span>
                <button onclick="adminAction('deletesticker', '${key}')">Delete</button>
            `;
            list.appendChild(div);
        });
    });
}

function loadAdminLogs() {
    logsRef.orderByChild('timestamp').limitToLast(50).on('value', snap => {
        const logs = snap.val();
        const list = document.getElementById('adminLogList');
        list.innerHTML = '';
        if (!logs) return;
        const sorted = Object.values(logs).sort((a,b) => b.timestamp - a.timestamp);
        sorted.forEach(log => {
            const div = document.createElement('div');
            div.className = 'admin-item';
            div.innerHTML = `
                <span>${log.email || log.uid}: ${log.action} ${log.details ? '- ' + log.details : ''}</span>
                <span style="font-size:11px;color:#888;">${new Date(log.timestamp).toLocaleString()}</span>
            `;
            list.appendChild(div);
        });
    });
}

function loadAdminSettings() {
    settingsRef.once('value', snap => {
        const settings = snap.val() || {};
        adminSiteName.value = settings.siteName || 'ChitChat Pakistan';
        adminAllowGuest.checked = settings.allowGuest !== false;
        adminMaintenanceMode.checked = settings.maintenanceMode || false;
        adminMaxMessageLength.value = settings.maxMessageLength || 500;
        adminAnnouncement.value = settings.announcement || '';
    });
}

// ============================================
// ADMIN GOD MODE FUNCTIONS
// ============================================
function adminForceLogout(uid) {
    if (!isAdmin) return;
    if (!confirm('Force logout this user?')) return;
    database.ref('status/' + uid).set({ state: 'offline', forceLogout: true });
    alert('User force logged out!');
}

function adminToggleGhost(uid) {
    if (!isAdmin) return;
    const ref = database.ref('users/' + uid + '/isGhost');
    ref.once('value', snap => {
        const current = snap.val() || false;
        ref.set(!current).then(() => {
            alert('Ghost mode ' + (!current ? 'enabled' : 'disabled') + ' for user.');
        });
    });
}

function adminToggleVIP(uid) {
    if (!isAdmin) return;
    const ref = database.ref('users/' + uid + '/isVIP');
    ref.once('value', snap => {
        const current = snap.val() || false;
        ref.set(!current).then(() => {
            alert('VIP ' + (!current ? 'enabled' : 'disabled') + ' for user.');
        });
    });
}

function adminMuteUser(uid) {
    if (!isAdmin) return;
    const ref = database.ref('users/' + uid + '/isMuted');
    ref.once('value', snap => {
        const current = snap.val() || false;
        ref.set(!current).then(() => {
            alert('User ' + (!current ? 'muted' : 'unmuted'));
        });
    });
}

function adminViewIP(uid) {
    if (!isAdmin) return;
    database.ref('users/' + uid + '/ip').once('value', snap => {
        alert('User IP: ' + (snap.val() || 'Not stored'));
    });
}

function adminBanUser(uid, reason, expiryMinutes) {
    if (!isAdmin) return;
    if (!uid) return alert('User ID required.');
    const expiry = expiryMinutes > 0 ? Date.now() + expiryMinutes * 60000 : null;
    const banData = {
        reason: reason || 'No reason',
        bannedBy: currentUser.uid,
        bannedAt: Date.now(),
        expiry: expiry
    };
    bansRef.child(uid).set(banData);
    database.ref('users/' + uid + '/isBanned').set(true);
    alert('User banned.');
    loadAdminBans();
}

function adminDeleteRoom(roomId) {
    if (!isAdmin) return;
    if (roomId === 'room1') return alert('Cannot delete default room.');
    if (!confirm('Delete this room and all its messages?')) return;
    database.ref('rooms/' + roomId).remove();
    database.ref('messages/' + roomId).remove();
    alert('Room deleted.');
    loadAdminRooms();
}

function adminToggleReadOnly() {
    if (!isAdmin) return;
    database.ref('settings/readonly').once('value', snap => {
        const current = snap.val() || false;
        database.ref('settings/readonly').set(!current).then(() => {
            alert('Read-only mode ' + (!current ? 'enabled' : 'disabled'));
            loadSettings();
        });
    });
}

function adminExportAllData() {
    if (!isAdmin) return;
    database.ref().once('value', snap => {
        const data = snap.val();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'chitchat_backup_' + Date.now() + '.json';
        a.click();
        URL.revokeObjectURL(url);
        alert('Backup downloaded!');
    });
}

function adminClearAllMessages() {
    if (!isAdmin) return;
    if (!confirm('Delete ALL messages from ALL rooms?')) return;
    database.ref('messages').remove().then(() => {
        alert('All messages cleared!');
        loadAdminMessages();
    });
}

// ============================================
// ADMIN STANDARD ACTIONS (Ban, Unban, Delete, etc.)
// ============================================
window.adminAction = function(action, id) {
    if (!isAdmin) return;
    switch(action) {
        case 'ban':
            const reason = prompt('Reason for ban (optional):');
            const expiry = prompt('Expiry in minutes (0 for permanent):');
            const expMs = parseInt(expiry) > 0 ? Date.now() + parseInt(expiry)*60000 : null;
            bansRef.child(id).set({
                reason: reason || 'No reason',
                bannedBy: currentUser.uid,
                bannedAt: Date.now(),
                expiry: expMs
            });
            database.ref('users/' + id + '/isBanned').set(true);
            alert('User banned.');
            loadAdminBans();
            break;
        case 'unban':
            bansRef.child(id).remove();
            database.ref('users/' + id + '/isBanned').set(false);
            alert('User unbanned.');
            loadAdminBans();
            break;
        case 'delete':
            if (!confirm('Delete this user and all their data?')) return;
            database.ref('users/' + id).remove();
            database.ref('status/' + id).remove();
            bansRef.child(id).remove();
            database.ref('messages').once('value', snap => {
                const rooms = snap.val();
                if (rooms) {
                    Object.keys(rooms).forEach(roomId => {
                        const msgs = rooms[roomId];
                        if (msgs) {
                            Object.keys(msgs).forEach(key => {
                                if (msgs[key].uid === id) {
                                    database.ref('messages/' + roomId + '/' + key).remove();
                                }
                            });
                        }
                    });
                }
            });
            alert('User deleted.');
            loadAdminUsers();
            break;
        case 'makeadmin':
            database.ref('users/' + id + '/isAdmin').set(true);
            alert('User is now admin.');
            loadAdminUsers();
            break;
        case 'deleteroom':
            adminDeleteRoom(id);
            break;
        case 'editroom':
            const newName = prompt('New room name:');
            if (newName) {
                database.ref('rooms/' + id + '/name').set(newName);
                alert('Room renamed.');
                loadAdminRooms();
            }
            break;
        case 'deletesticker':
            if (!confirm('Delete this sticker?')) return;
            stickersRef.child(id).remove();
            alert('Sticker deleted.');
            loadAdminStickers();
            break;
    }
};

// ============================================
// ADMIN TAB SWITCHING
// ============================================
document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', function() {
        document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
        const panel = this.dataset.tab;
        document.querySelector(`.admin-panel[data-panel="${panel}"]`).classList.add('active');
        if (panel === 'users') loadAdminUsers();
        if (panel === 'messages') loadAdminMessages();
        if (panel === 'rooms') loadAdminRooms();
        if (panel === 'bans') loadAdminBans();
        if (panel === 'stickers') loadAdminStickers();
        if (panel === 'logs') loadAdminLogs();
        if (panel === 'settings') loadAdminSettings();
    });
});

// ============================================
// ADMIN BUTTONS (Export, Save, Delete All)
// ============================================
adminExportUsersBtn.addEventListener('click', function() {
    let csv = 'UID,Name,Email,Motto,Admin,Banned\n';
    allUsersCache.forEach(([uid, data]) => {
        const name = data.profile?.displayName || '';
        const email = data.email || '';
        const motto = data.profile?.motto || '';
        const admin = data.isAdmin ? 'Yes' : 'No';
        const banned = data.isBanned ? 'Yes' : 'No';
        csv += `${uid},"${name}","${email}","${motto}","${admin}","${banned}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'users.csv';
    a.click();
    URL.revokeObjectURL(url);
});

saveSettingsBtn.addEventListener('click', function() {
    const settings = {
        siteName: adminSiteName.value.trim() || 'ChitChat Pakistan',
        allowGuest: adminAllowGuest.checked,
        maintenanceMode: adminMaintenanceMode.checked,
        maxMessageLength: parseInt(adminMaxMessageLength.value) || 500,
        announcement: adminAnnouncement.value.trim() || ''
    };
    settingsRef.update(settings).then(() => {
        alert('Settings saved!');
        loadSettings();
        loadAnnouncement();
    }).catch(err => alert('Error: ' + err.message));
});

adminDeleteAllMessagesBtn.addEventListener('click', function() {
    adminClearAllMessages();
});

adminToggleReadOnlyBtn.addEventListener('click', adminToggleReadOnly);
adminExportAllDataBtn.addEventListener('click', adminExportAllData);
adminClearAllMessagesBtn.addEventListener('click', adminClearAllMessages);

adminBanUserBtn.addEventListener('click', function() {
    const uid = document.getElementById('adminBanUserInput').value.trim();
    const reason = document.getElementById('adminBanReason').value.trim();
    if (!uid) return alert('Enter User ID or email.');
    adminBanUser(uid, reason, 0);
});

// ============================================
// PRIVATE CHAT
// ============================================
function openPrivateChat(uid, name) {
    privateChatWith = uid;
    privateChatTitle.textContent = 'Private Chat with ' + name;
    privateChatModal.style.display = 'flex';
    const chatId = [currentUser.uid, uid].sort().join('_');
    privateChatRef = database.ref('private_messages/' + chatId);
    if (privateChatListener) privateChatListener();
    privateChatListener = privateChatRef.orderByChild('timestamp').on('child_added', snapshot => {
        const msg = snapshot.val();
        if (msg) {
            displayPrivateMessage(msg);
        }
    });
}

function displayPrivateMessage(msg) {
    const container = document.getElementById('privateChatMessages');
    const div = document.createElement('div');
    const isMine = currentUser && msg.uid === currentUser.uid;
    div.className = 'private-msg ' + (isMine ? 'sent' : 'received');
    div.innerHTML = `
        <span>${msg.name}: ${msg.text}</span>
        <span style="font-size:10px;color:#888;display:block;">${new Date(msg.timestamp).toLocaleTimeString()}</span>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

sendPrivateMessageBtn.addEventListener('click', function() {
    if (!privateChatWith) return;
    const input = document.getElementById('privateMessageInput');
    const text = input.value.trim();
    if (!text) return;
    const chatId = [currentUser.uid, privateChatWith].sort().join('_');
    database.ref('private_messages/' + chatId).push({
        uid: currentUser.uid,
        name: currentUser.displayName || currentUser.email || 'Guest',
        text: filterBadWords(text),
        timestamp: Date.now(),
        read: false
    }).then(() => {
        input.value = '';
        privateChatMessages.scrollTop = privateChatMessages.scrollHeight;
    }).catch(err => alert('Error: ' + err.message));
});

function closePrivateChat() {
    if (privateChatListener) {
        privateChatListener();
        privateChatListener = null;
    }
    privateChatRef = null;
    privateChatWith = null;
    privateChatModal.style.display = 'none';
    privateChatMessages.innerHTML = '';
    privateMessageInput.value = '';
}

// ============================================
// ALL USERS LIST
// ============================================
function loadAllUsers() {
    database.ref('users').once('value', snap => {
        const users = snap.val();
        const list = document.getElementById('allUsersList');
        list.innerHTML = '';
        if (!users) return;
        const sorted = Object.entries(users).sort((a,b) => (a[1].profile?.displayName || a[0]) > (b[1].profile?.displayName || b[0]) ? 1 : -1);
        sorted.forEach(([uid, data]) => {
            const div = document.createElement('div');
            div.className = 'user-item';
            const name = data.profile?.displayName || data.email || uid;
            const statusRef = database.ref('status/' + uid + '/state');
            statusRef.once('value', snap => {
                const status = snap.val();
                const dot = status === 'online' ? 'online' : 'offline';
                div.innerHTML = `
                    <span><span class="status-dot ${dot}"></span>${name}</span>
                    <div>
                        <button onclick="openPrivateChat('${uid}', '${name}')" class="admin-btn">💬 PM</button>
                    </div>
                `;
            });
            list.appendChild(div);
        });
    });
}

// ============================================
// LEAVE ROOM
// ============================================
leaveRoomBtn.addEventListener('click', function() {
    if (currentRoomId !== 'room1') {
        joinRoom('room1');
    } else {
        alert('You cannot leave the default room.');
    }
});

// ============================================
// MENU DROPDOWNS
// ============================================
function closeAllDropdowns() {
    document.querySelectorAll('.dropdown-menu').forEach(menu => {
        menu.style.display = 'none';
    });
}

document.querySelectorAll('.menu-tab').forEach(tab => {
    tab.addEventListener('click', function(e) {
        e.stopPropagation();
        const dropdown = this.querySelector('.dropdown-menu');
        if (!dropdown) return;
        if (dropdown.style.display === 'flex') {
            dropdown.style.display = 'none';
            return;
        }
        closeAllDropdowns();
        dropdown.style.display = 'flex';
    });
});

document.addEventListener('click', function(e) {
    if (!document.getElementById('mainMenuBar').contains(e.target)) {
        closeAllDropdowns();
    }
});

document.querySelectorAll('.dropdown-item').forEach(item => {
    item.addEventListener('click', function(e) {
        e.stopPropagation();
        const action = this.dataset.action;
        switch(action) {
            case 'create-room': if(isAdmin) createRoom(); break;
            case 'delete-room': if(isAdmin) deleteRoom(); break;
            case 'rename-room': if(isAdmin) renameRoom(); break;
            case 'room-settings': if(isAdmin) roomSettings(); break;
            case 'view-profile': openProfile(); break;
            case 'change-password': openPassword(); break;
            case 'admin-panel': openAdmin(); break;
            case 'logout': auth.signOut(); break;
            case 'open-stickers': openStickers(); break;
            case 'view-users': openUsers(); break;
            case 'site-settings': openSiteSettings(); break;
        }
        closeAllDropdowns();
    });
});

// ===== ADMIN ROOM FUNCTIONS =====
function createRoom() {
    if (!isAdmin) return alert('Admin only!');
    const name = prompt('Enter new room name:');
    if (!name) return;
    const newId = 'room' + Date.now();
    roomsRef.child(newId).set({
        name: name,
        description: '',
        createdBy: currentUser.uid,
        createdAt: Date.now(),
        order: Date.now(),
        isPrivate: false,
        hidden: false,
        password: null
    }).then(() => {
        alert('Room created!');
        joinRoom(newId);
    }).catch(err => alert('Error: ' + err.message));
}

function deleteRoom() {
    if (!isAdmin) return alert('Admin only!');
    if (currentRoomId === 'room1') return alert('Cannot delete default room.');
    if (!confirm('Delete this room and all its messages?')) return;
    adminDeleteRoom(currentRoomId);
}

function renameRoom() {
    if (!isAdmin) return alert('Admin only!');
    const newName = prompt('Enter new name for this room:');
    if (!newName) return;
    roomsRef.child(currentRoomId).child('name').set(newName).then(() => {
        alert('Room renamed.');
        currentRoomName.textContent = `# ${newName}`;
        const tabs = document.querySelectorAll('.room-tab');
        tabs.forEach(tab => {
            if (tab.dataset.roomId === currentRoomId) {
                tab.textContent = newName;
            }
        });
    });
}

function roomSettings() {
    if (!isAdmin) return alert('Admin only!');
    const room = currentRoomId;
    const isPrivate = confirm('Make this room password protected?');
    if (isPrivate) {
        const password = prompt('Enter password for this room:');
        if (password) {
            roomsRef.child(room).update({ isPrivate: true, password: password });
            alert('Room is now password protected.');
        }
    } else {
        roomsRef.child(room).update({ isPrivate: false, password: null });
        alert('Room is now public.');
    }
}

// ===== OPEN MODALS =====
function openProfile() { loadProfile(); profileModal.style.display = 'flex'; }
function openPassword() { passwordModal.style.display = 'flex'; }
function openAdmin() { if (!isAdmin) return alert('Admin only!'); loadAdminPanel(); adminModal.style.display = 'flex'; }
function openStickers() { stickerModal.style.display = 'flex'; }
function openUsers() { loadAllUsers(); usersModal.style.display = 'flex'; }
function openSiteSettings() { if (!isAdmin) return alert('Admin only!'); openAdmin(); document.querySelector('.admin-tab[data-tab="settings"]').click(); }

// ===== CLOSE MODALS =====
document.querySelectorAll('.close-modal').forEach(el => {
    el.addEventListener('click', function() {
        this.closest('.modal').style.display = 'none';
        if (this.closest('#privateChatModal')) closePrivateChat();
    });
});
window.addEventListener('click', function(e) {
    if (e.target.classList.contains('modal')) {
        e.target.style.display = 'none';
        if (e.target.id === 'privateChatModal') closePrivateChat();
    }
});

// ============================================
// PRIVATE CHAT BUTTON (PLACEHOLDER - TO BE USED WITH USER SELECT)
// ============================================
privateChatBtn.addEventListener('click', function() {
    const uid = prompt('Enter User ID to chat with:');
    if (uid) {
        database.ref('users/' + uid + '/profile/displayName').once('value', snap => {
            const name = snap.val() || uid;
            openPrivateChat(uid, name);
        });
    }
});

// ============================================
// INITIALIZATION
// ============================================
console.log("✅ ChitChat Pakistan v3.0 (Extended) loaded successfully!");
console.log("🔥 Admin Email: maqsoodhassansolangi90@gmail.com");
console.log("💬 All features are ready!");
