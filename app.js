// ============================================
// ChitChat Pakistan - Complete App (v3.0 - Extended)
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

// Ads Elements
const adminAdsEnabled = document.getElementById('adminAdsEnabled');
const adminAdTopCode = document.getElementById('adminAdTopCode');
const adminAdBottomCode = document.getElementById('adminAdBottomCode');
const adminAdPopunderCode = document.getElementById('adminAdPopunderCode');
const saveAdsBtn = document.getElementById('saveAdsBtn');
const adTopSlot = document.getElementById('adTopSlot');
const adBottomSlot = document.getElementById('adBottomSlot');

// ===== GLOBAL VARIABLES =====
let currentUser = null;
let currentRoomId = 'room1';
let isAdmin = false;
let isMuted = false;
let isGhost = false;
let isVIP = false;
let isReadOnly = false;
let messagesRef = null;
let messagesListenerRoomRef = null;
let messagesAddedCallback = null;
let messagesRemovedCallback = null;
let statusRef = database.ref('status');
let roomsRef = database.ref('rooms');
let stickersRef = database.ref('stickers');
let badwordsRef = database.ref('badwords/list');
let settingsRef = database.ref('settings');
let logsRef = database.ref('activity_logs');
let bansRef = database.ref('banned_users');
let adsRef = database.ref('settings/ads');
let popunderInjected = false;
let privateChatRef = null;
let privateChatListener = null;
let privateChatWith = null;
let lastSendTime = 0;
let allUsersCache = [];
let typingTimeout = null;
const typingRef = database.ref('typing');

const ADMIN_EMAIL = "maqsoodhassansolangi90@gmail.com";

// ============================================
// XSS PROTECTION — escape any user-controlled text
// before it is placed inside innerHTML.
// ============================================
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Hash room passwords with SHA-256 before storing so they are never kept
// as plain, human-readable text in the database.
// NOTE: this only stops casual/plain-text exposure (e.g. anyone glancing
// at the Firebase console). True access control must still come from
// Firebase Security Rules — a client-side hash can be brute-forced by
// anyone who can read the database.
async function sha256Hex(str) {
    const enc = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

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
            // Firebase signs the new user in automatically — onAuthStateChanged
            // below will take them straight into the chat, so we don't tell
            // them to "sign in now" (that used to be misleading).
            alert('Account created! Taking you to the chat...');
        })
        .catch(err => alert(err.message));
});

loginForm.addEventListener('submit', e => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const pass = document.getElementById('loginPassword').value.trim();
    auth.signInWithEmailAndPassword(email, pass)
        .catch(err => alert(err.message));
});

googleBtn.addEventListener('click', () => {
    auth.signInWithPopup(new firebase.auth.GoogleAuthProvider())
        .catch(err => alert(err.message));
});

guestBtn.addEventListener('click', () => {
    auth.signInAnonymously()
        .then(() => settingsRef.child('allowGuest').once('value'))
        .then(snap => {
            if (snap.val() === false) {
                alert('Guest login is currently disabled by the admin.');
                auth.signOut();
            }
        })
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
    loadAds();
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
    if (messagesListenerRoomRef) {
        if (messagesAddedCallback) messagesListenerRoomRef.off('child_added', messagesAddedCallback);
        if (messagesRemovedCallback) messagesListenerRoomRef.off('child_removed', messagesRemovedCallback);
        messagesListenerRoomRef = null;
        messagesAddedCallback = null;
        messagesRemovedCallback = null;
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
        saveUserRecord(user);
        initPresence(user);
        listenModerationFlags(user);
        loadSettings();
        showChat();
        logActivity('login');
    } else {
        currentUser = null;
        isAdmin = false;
        isMuted = false;
        isGhost = false;
        isVIP = false;
        document.body.classList.remove('is-admin');
        showAuth();
    }
});

// Writes the basic user record (email, uid, first-seen date) so the
// Admin > Users tab actually has something to show — previously nothing
// ever wrote this, so every user showed up as blank/"N/A".
function saveUserRecord(user) {
    const userRef = database.ref('users/' + user.uid);
    userRef.once('value', snap => {
        const updates = { uid: user.uid, lastSeen: Date.now() };
        if (user.email) updates.email = user.email;
        if (!snap.exists() || !snap.val().createdAt) updates.createdAt = Date.now();
        userRef.update(updates);
    });
}

// Keeps isMuted / isGhost / isVIP in sync in real time so admin toggles
// actually take effect immediately, without the user needing to relogin.
function listenModerationFlags(user) {
    database.ref('users/' + user.uid + '/isMuted').on('value', snap => {
        isMuted = !!snap.val();
    });
    database.ref('users/' + user.uid + '/isVIP').on('value', snap => {
        isVIP = !!snap.val();
    });
    database.ref('users/' + user.uid + '/isGhost').on('value', snap => {
        isGhost = !!snap.val();
        updatePresenceState();
    });
}

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
            updatePresenceState();
        });
    });

    statusRef.orderByChild('state').equalTo('online').on('value', snap => {
        onlineCount.textContent = `🟢 ${snap.numChildren()} online`;
    });
}

// Ghost users write "offline" to their own status so they don't show
// up as online to other users, without actually disconnecting them.
function updatePresenceState() {
    if (!currentUser) return;
    const userStatusRef = statusRef.child(currentUser.uid);
    if (isGhost) {
        userStatusRef.set({ state: 'offline', lastSeen: Date.now(), ghost: true });
    } else {
        userStatusRef.set({ state: 'online', lastSeen: Date.now() });
    }
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
        isReadOnly = !!settings.readonly;
        if (isReadOnly && !isAdmin) {
            messageInput.disabled = true;
            messageInput.placeholder = 'Chat is read-only right now';
            sendBtn.disabled = true;
            attachBtn.disabled = true;
        } else {
            messageInput.disabled = false;
            messageInput.placeholder = 'Type a message...';
            sendBtn.disabled = false;
            attachBtn.disabled = false;
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
// ADVERTISEMENTS (Adsterra) - Admin Controlled
// ============================================
// Ad codes (Adsterra etc.) often contain <script> tags. Setting innerHTML
// directly does NOT execute those scripts, so we rebuild each <script>
// tag manually and re-insert it, which makes the browser actually run it.
function renderAdCode(container, codeStr) {
    container.innerHTML = '';
    if (!codeStr || !codeStr.trim()) {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'flex';
    const temp = document.createElement('div');
    temp.innerHTML = codeStr;
    Array.from(temp.childNodes).forEach(node => {
        if (node.tagName === 'SCRIPT') {
            const script = document.createElement('script');
            Array.from(node.attributes).forEach(attr => script.setAttribute(attr.name, attr.value));
            script.textContent = node.textContent;
            container.appendChild(script);
        } else {
            container.appendChild(node.cloneNode(true));
        }
    });
}

function injectPopunder(codeStr) {
    if (!codeStr || !codeStr.trim() || popunderInjected) return;
    popunderInjected = true;
    const temp = document.createElement('div');
    temp.innerHTML = codeStr;
    Array.from(temp.childNodes).forEach(node => {
        if (node.tagName === 'SCRIPT') {
            const script = document.createElement('script');
            Array.from(node.attributes).forEach(attr => script.setAttribute(attr.name, attr.value));
            script.textContent = node.textContent;
            document.body.appendChild(script);
        } else {
            document.body.appendChild(node.cloneNode(true));
        }
    });
}

function loadAds() {
    adsRef.on('value', snap => {
        const ads = snap.val() || {};
        if (!ads.enabled) {
            adTopSlot.style.display = 'none';
            adTopSlot.innerHTML = '';
            adBottomSlot.style.display = 'none';
            adBottomSlot.innerHTML = '';
            return;
        }
        renderAdCode(adTopSlot, ads.topCode || '');
        renderAdCode(adBottomSlot, ads.bottomCode || '');
        injectPopunder(ads.popunderCode || '');
    });
}

function loadAdminAds() {
    adsRef.once('value', snap => {
        const ads = snap.val() || {};
        adminAdsEnabled.checked = ads.enabled || false;
        adminAdTopCode.value = ads.topCode || '';
        adminAdBottomCode.value = ads.bottomCode || '';
        adminAdPopunderCode.value = ads.popunderCode || '';
    });
}

saveAdsBtn.addEventListener('click', function() {
    if (!isAdmin) return;
    const adsData = {
        enabled: adminAdsEnabled.checked,
        topCode: adminAdTopCode.value.trim(),
        bottomCode: adminAdBottomCode.value.trim(),
        popunderCode: adminAdPopunderCode.value.trim()
    };
    adsRef.set(adsData).then(() => {
        alert('Ad settings saved!');
        logActivity('ads_update');
    }).catch(err => alert('Error: ' + err.message));
});

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
            tab.textContent = room.name || id;
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
    roomsRef.child(roomId).once('value', async snap => {
        const room = snap.val();
        currentRoomName.textContent = `# ${room ? room.name : roomId}`;
        if (room && room.isPrivate && !isAdmin) {
            const password = prompt('This room is password protected. Enter password:');
            const hashed = password ? await sha256Hex(password) : '';
            if (hashed !== room.password) {
                alert('Incorrect password!');
                joinRoom('room1');
                return;
            }
        }
    });
    chatMessages.innerHTML = '';
    attachMessagesListener(roomId);
    listenTyping(roomId);
    leaveRoomBtn.style.display = roomId !== 'room1' ? 'inline-block' : 'none';
    privateChatBtn.style.display = 'inline-block';
    setTimeout(scrollToBottom, 100);
}

// ============================================
// CORRECTED: attachMessagesListener (لائن 386 سے بدلیں)
// ============================================
function attachMessagesListener(roomId) {
    // پہلے سے موجود listener کو صحیح طریقے سے ہٹائیں (.off() کے ساتھ) —
    // پہلے یہ محض ایک function کو دوبارہ کال کر رہا تھا جو اصل میں
    // listener کو detach نہیں کرتا تھا، اس لیے پرانے room کا listener
    // ہمیشہ چلتا رہتا تھا۔
    if (messagesListenerRoomRef) {
        if (messagesAddedCallback) messagesListenerRoomRef.off('child_added', messagesAddedCallback);
        if (messagesRemovedCallback) messagesListenerRoomRef.off('child_removed', messagesRemovedCallback);
        messagesListenerRoomRef = null;
        messagesAddedCallback = null;
        messagesRemovedCallback = null;
    }

    // اگر roomId نہیں ہے تو واپس آ جائیں
    if (!roomId) {
        console.warn('attachMessagesListener: roomId is missing');
        return;
    }

    // صرف اس مخصوص روم کے میسجز کو سنیں، ترتیب وقت کے حساب سے، صرف آخری 50
    messagesRef = database.ref('messages/' + roomId);
    const roomQuery = messagesRef.orderByChild('timestamp').limitToLast(50);
    messagesListenerRoomRef = roomQuery;

    messagesAddedCallback = roomQuery.on('child_added', function(snapshot) {
        // 🛡️ چیک کریں کہ ڈیٹا موجود ہے
        if (!snapshot || !snapshot.exists()) {
            console.warn('No data for room:', roomId);
            return;
        }

        const msg = snapshot.val();
        if (msg) {
            msg.key = snapshot.key; // ✅ key پراپرٹی ہے، فنکشن نہیں
            displayMessage(msg);
        }
        scrollToBottom();
    });

    // جب کوئی پیغام database سے حذف ہو تو اسے فوراً DOM سے بھی ہٹا دیں
    // (پہلے یہ listener سرے سے موجود ہی نہیں تھا، اسی لیے delete کے بعد
    // پیغام صفحے پر رہ جاتا تھا اور صرف refresh پر غائب ہوتا تھا)۔
    messagesRemovedCallback = roomQuery.on('child_removed', function(snapshot) {
        const el = chatMessages.querySelector(`[data-id="${snapshot.key}"]`);
        if (el) el.remove();
    });
}

// ============================================
// CORRECTED: getAvatarHTML (لائن 400 سے بدلیں)
// ============================================
function getAvatarHTML(name, size = 32) {
    if (!name) name = '?';
    // نام کا پہلا حرف (بڑے میں)
    const firstLetter = escapeHtml(name.charAt(0).toUpperCase());
    // ایک خوبصورت دائرہ (circle) بنائیں جس میں حرف ہو
    return `<div style="display:inline-block; width:${size}px; height:${size}px; border-radius:50%; background-color:#075E54; color:#ffffff; text-align:center; line-height:${size}px; font-weight:bold; font-size:${size/1.6}px; flex-shrink:0;">${firstLetter}</div>`;
}

function highlightMentions(text, currentUserName) {
    if (!currentUserName) return text;
    const regex = new RegExp('@' + currentUserName, 'gi');
    return text.replace(regex, (match) => {
        return `<span style="background:#ffeb3b; color:#000; padding:0 4px; border-radius:4px; font-weight:bold;">${match}</span>`;
    });
}

function deleteMessage(roomId, msgId) {
    if (!confirm('Delete this message?')) return;
    database.ref('messages/' + roomId + '/' + msgId).remove()
        .then(() => console.log('Message deleted'))
        .catch(err => alert('Error: ' + err.message));
}

function displayMessage(msg) {
    if (!msg || !msg.key) return;
    if (chatMessages.querySelector(`[data-id="${msg.key}"]`)) return;

    const div = document.createElement('div');
    const isMine = currentUser && msg.uid === currentUser.uid;
    div.className = 'message-bubble ' + (isMine ? 'sent' : 'received');
    div.dataset.id = msg.key;

    // Avatar
    const safeName = escapeHtml(msg.name || 'Guest');
    const avatarHTML = getAvatarHTML(msg.name || 'Guest', 30);

    // Content
    let content = escapeHtml(msg.text || '');
    if (msg.isSticker && msg.stickerUrl) {
        content = `<img src="${escapeHtml(msg.stickerUrl)}" class="sticker-img" alt="sticker">`;
    } else {
        content = filterBadWords(content);
        if (currentUser) {
            const myName = currentUser.displayName || currentUser.email || 'Guest';
            content = highlightMentions(content, myName);
        }
        if (msg.attachments && msg.attachments.length) {
            msg.attachments.forEach(att => {
                const safeUrl = (att.url || '').startsWith('http') ? escapeHtml(att.url) : '#';
                content += `<div class="attachment">📎 <a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(att.name)}</a></div>`;
            });
        }
    }

    // Delete Button (only for own messages)
    let deleteBtn = '';
    if (isMine && !msg.isSticker) {
        deleteBtn = `<span onclick="deleteMessage('${currentRoomId}', '${msg.key}')" style="cursor:pointer; font-size:12px; color:#e74c3c; margin-left:8px;">✕</span>`;
    }

    const timeStr = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : 'Just now';
    div.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
            ${avatarHTML}
            <span class="sender-name">${msg.isVIP ? '⭐ ' : ''}${safeName}</span>
            ${deleteBtn}
        </div>
        <span>${content}</span>
        <span class="message-time">${timeStr}</span>
    `;
    chatMessages.appendChild(div);
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
// SEND MESSAGE
// ============================================
function sendMessage(text, isSticker = false, stickerUrl = '', attachments = []) {
    if (!currentUser) return alert('Please login first!');
    if (isMuted) return alert('You have been muted by an admin and cannot send messages.');
    if (isReadOnly && !isAdmin) return alert('Chat is currently read-only.');
    if (!text && !isSticker && !attachments.length) return;

    const msgData = {
        uid: currentUser.uid,
        name: currentUser.displayName || currentUser.email || 'Guest',
        text: text || '',
        timestamp: Date.now(),
        isSticker: isSticker,
        stickerUrl: stickerUrl || '',
        attachments: attachments || [],
        isVIP: isVIP
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
    loadAdminAds();
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
            const email = escapeHtml(data.email || uid);
            const name = escapeHtml(data.profile?.displayName || 'N/A');
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
                <span>${escapeHtml(msg.name || 'Guest')}: ${escapeHtml(msg.text || '[sticker]')} (Room: ${escapeHtml(msg.roomId)})</span>
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
                <span><b>${escapeHtml(room.name || id)}</b> ${room.isPrivate ? '🔒' : ''} ${room.hidden ? '🙈' : ''}</span>
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
                <span>User: ${escapeHtml(uid)} - Reason: ${escapeHtml(data.reason || 'No reason')} - Expiry: ${data.expiry ? new Date(data.expiry).toLocaleString() : 'Permanent'}</span>
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
                <span><b>${escapeHtml(sticker.name || 'Unnamed')}</b> <img src="${escapeHtml(sticker.url)}" style="max-height:30px; max-width:50px;"></span>
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
                <span>${escapeHtml(log.email || log.uid)}: ${escapeHtml(log.action)} ${log.details ? '- ' + escapeHtml(log.details) : ''}</span>
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
        if (panel === 'ads') loadAdminAds();
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
    const input = document.getElementById('adminBanUserInput').value.trim();
    const reason = document.getElementById('adminBanReason').value.trim();
    if (!input) return alert('Enter User ID or email.');

    if (input.includes('@')) {
        // Resolve email -> uid using the cached user list (populated by
        // the Users tab). Previously typing an email here silently
        // created a ban entry that could never match a real user.
        const match = allUsersCache.find(([uid, data]) => data.email === input);
        if (!match) {
            return alert('No user found with that email. Open the Users tab first, or use their User ID instead.');
        }
        adminBanUser(match[0], reason, 0);
    } else {
        adminBanUser(input, reason, 0);
    }
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
        <span>${escapeHtml(msg.name)}: ${escapeHtml(msg.text)}</span>
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
            const rawName = data.profile?.displayName || data.email || uid;
            const name = escapeHtml(rawName);
            const statusRef = database.ref('status/' + uid + '/state');
            statusRef.once('value', snap => {
                const status = snap.val();
                const dot = status === 'online' ? 'online' : 'offline';
                div.innerHTML = `
                    <span><span class="status-dot ${dot}"></span>${name}</span>
                    <div>
                        <button class="admin-btn pm-user-btn">💬 PM</button>
                    </div>
                `;
                // Using addEventListener (not inline onclick) so a malicious
                // display name can never break out and execute arbitrary JS.
                div.querySelector('.pm-user-btn').addEventListener('click', () => openPrivateChat(uid, rawName));
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

async function roomSettings() {
    if (!isAdmin) return alert('Admin only!');
    const room = currentRoomId;
    const isPrivate = confirm('Make this room password protected?');
    if (isPrivate) {
        const password = prompt('Enter password for this room:');
        if (password) {
            const hashed = await sha256Hex(password);
            roomsRef.child(room).update({ isPrivate: true, password: hashed });
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
// PRIVATE CHAT BUTTON — opens the Users list so people can pick who
// to message, instead of asking them to type a raw Firebase UID
// (which no real user would ever know).
// ============================================
privateChatBtn.addEventListener('click', function() {
    openUsers();
});

// ============================================
// INITIALIZATION
// ============================================
console.log("✅ ChitChat Pakistan v3.0 (Extended) loaded successfully!");
console.log("🔥 Admin Email: maqsoodhassansolangi90@gmail.com");
console.log("💬 All features are ready!");
