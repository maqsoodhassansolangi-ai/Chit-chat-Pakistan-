// ============================================
// ChitChat Pakistan - app.js (Phase 2 Logic)
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
const mainMenuBar = document.getElementById('mainMenuBar');
const menuTabs = document.querySelectorAll('.menu-tab');
const dropdownItems = document.querySelectorAll('.dropdown-item');

// ===== GLOBAL VARIABLES =====
let messagesRef = database.ref('messages');
let statusRef = database.ref('status');
let currentUser = null;
let listenerAttached = false;
const ADMIN_EMAIL = "maqsoodhassansolangi90@gmail.com";
let isAdmin = false;

// ============================================
// AUTH & TABS SYSTEM (لاکڈ - فیز 1 سے)
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
    if(!document.getElementById('termsCheckbox').checked) return alert('Accept Terms first');
    if(pass.length < 6) return alert('Password must be 6+ chars');
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
    mainMenuBar.style.display = 'flex';
    loadMessages();
    setTimeout(adjustViewport, 100);
}

function showAuth() {
    authSection.style.display = 'flex';
    chatSection.style.display = 'none';
    logoutBtn.style.display = 'none';
    chatMessages.innerHTML = '';
    document.getElementById('authFooter').style.display = 'block';
    mainMenuBar.style.display = 'none';
    
    if (messagesRef) {
        messagesRef.off();
    }
    listenerAttached = false;
}

// Theme Switcher
document.getElementById('themeToggle').addEventListener('click', function() {
    document.body.classList.toggle('dark-mode');
    this.textContent = document.body.classList.contains('dark-mode') ? '☀️' : '🌙';
    localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
});
if(localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark-mode');
    document.getElementById('themeToggle').textContent = '☀️';
}

// ============================================
// PRESENCE (آن لائن کاؤنٹ - فیز 1 سے لاکڈ)
// ============================================
auth.onAuthStateChanged(user => {
    loadingScreen.style.display = 'none';
    document.getElementById('appContainer').style.display = 'flex';
    if (user) {
        currentUser = user;
        isAdmin = (user.email === ADMIN_EMAIL);
        if (isAdmin) {
            document.body.classList.add('is-admin');
        } else {
            document.body.classList.remove('is-admin');
        }
        initPresence(user);
        showChat();
    } else {
        currentUser = null;
        isAdmin = false;
        document.body.classList.remove('is-admin');
        showAuth();
    }
});

function initPresence(user) {
    const userStatusRef = statusRef.child(user.uid);
    database.ref('.info/connected').on('value', function(snapshot) {
        if (snapshot.val() === false) return;
        userStatusRef.onDisconnect().set({ state: 'offline' }).then(() => {
            userStatusRef.set({ state: 'online' });
        });
    });

    statusRef.orderByChild('state').equalTo('online').on('value', snap => {
        onlineCount.textContent = `🟢 ${snap.numChildren()} online`;
    });
}

// ============================================
// MESSAGE LOADING & DISPLAY (فیز 1 سے لاکڈ)
// ============================================
function loadMessages() {
    if (listenerAttached) return;
    listenerAttached = true;

    chatMessages.innerHTML = '';

    messagesRef.orderByChild('timestamp').limitToLast(50).on('child_added', snapshot => {
        const msg = snapshot.val();
        if (msg) {
            msg.key = snapshot.key;
            displayMessage(msg);
        }
        scrollToBottom();
    });
}

function displayMessage(msg) {
    if (!msg || !msg.key) return;
    if (chatMessages.querySelector(`[data-id="${msg.key}"]`)) return;

    const div = document.createElement('div');
    const isMine = currentUser && msg.uid === currentUser.uid;
    div.className = 'message-bubble ' + (isMine ? 'sent' : 'received');
    div.dataset.id = msg.key; 

    const filteredText = filterBadWords(msg.text || '');
    const timeStr = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : 'Just now';

    div.innerHTML = `
        <span class="sender-name">${msg.name || 'Anonymous'}</span>
        <span>${filteredText}</span>
        <span class="message-time">${timeStr}</span>
    `;
    chatMessages.appendChild(div);
}

function filterBadWords(text) {
    const bad = ['fuck','shit','ass','bitch','cunt','bastard','damn','hell','idiot','stupid','dumb','fool','moron','loser','suck','crap','piss','dick','pussy','whore','slut','gand','bhosda','chut','loda','landa','bhenchod','madarchod','kutta','suar','nalayak','bewaqoof','chutiya','gadha','ullu','bakwas'];
    bad.forEach(w => { text = text.replace(new RegExp('\\b' + w + '\\b', 'gi'), '***'); });
    return text;
}

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
    setTimeout(() => {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }, 50);
    setTimeout(() => {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }, 150);
}

function adjustViewport() {
    if (window.visualViewport) {
        const height = window.visualViewport.height;
        const appContainer = document.getElementById('appContainer');
        if (appContainer) {
            document.body.style.height = `${height}px`;
            appContainer.style.height = `${height}px`;
        }
        scrollToBottom();
    }
}
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', adjustViewport);
    window.visualViewport.addEventListener('scroll', adjustViewport);
}
window.addEventListener('resize', adjustViewport);

messageInput.addEventListener('focus', () => {
    setTimeout(adjustViewport, 80);
    setTimeout(scrollToBottom, 200);
});

// ============================================
// SEND MESSAGE (فیز 1 سے لاکڈ)
// ============================================
function sendMessage() {
    if(!currentUser) return alert('Please login first!');
    const text = messageInput.value.trim();
    if(!text) return;

    messageInput.value = '';

    messagesRef.push({
        uid: currentUser.uid,
        name: currentUser.displayName || currentUser.email || 'Guest',
        text: filterBadWords(text),
        timestamp: Date.now()
    }).then(() => {
        scrollToBottom();
    }).catch(err => {
        console.error("Error sending message: ", err);
    });
}
let lastSendTime = 0;
function safeSend(e) {
    e.preventDefault(); 
    const now = Date.now();
    if (now - lastSendTime < 300) return; 
    lastSendTime = now;
    sendMessage();
}
sendBtn.addEventListener('mousedown', safeSend);
sendBtn.addEventListener('touchstart', safeSend, { passive: false });
messageInput.addEventListener('keydown', e => { 
    if(e.key === 'Enter') {
        e.preventDefault(); 
        sendMessage(); 
    }
});
// ============================================
// MENU BAR LOGIC - Phase 2 (NEW FEATURES)
// ============================================

// ===== DROPDOWN ITEMS CLICK HANDLER =====
dropdownItems.forEach(item => {
    item.addEventListener('click', function(e) {
        e.stopPropagation(); // ڈراپ ڈاؤن کو بند ہونے سے روکیں
        const action = this.getAttribute('data-action');
        console.log("Menu Action:", action);
        
        switch(action) {
            case 'public':
                switchRoom('public');
                break;
            case 'registered':
                switchRoom('registered');
                break;
            case 'private':
                switchRoom('private');
                break;
            case 'create':
                createNewRoom();
                break;
            case 'delete':
                deleteRoom();
                break;
            case 'rename':
                renameRoom();
                break;
            case 'announcement':
                sendAnnouncement();
                break;
            case 'public-chat':
                switchRoom('public');
                break;
            case 'search':
                searchMessages();
                break;
            case 'settings':
                openSettings();
                break;
            case 'logout':
                logoutBtn.click();
                break;
            default:
                alert('This feature is coming soon!');
        }
    });
});

// ===== ROOM SWITCHING =====
let currentRoomType = 'public';

function switchRoom(type) {
    currentRoomType = type;
    chatMessages.innerHTML = '';
    
    // Update active tab
    menuTabs.forEach(tab => tab.classList.remove('active'));
    document.querySelector('[data-tab="rooms"]').classList.add('active');
    
    // Update chat header
    const header = document.querySelector('#chatHeader h3');
    if (header) {
        const roomNames = {
            public: '# Public Room',
            registered: '# Registered Room',
            private: '# Private Room'
        };
        header.textContent = roomNames[type] || '# Public Room';
    }
    
    // For demo: load sample messages based on room type
    const demoMessages = {
        public: [
            { name: 'Admin', text: 'Welcome to Public Room! Everyone can join.', time: new Date().toLocaleTimeString() },
            { name: 'Guest', text: 'Hello everyone!', time: new Date().toLocaleTimeString() }
        ],
        registered: [
            { name: 'Admin', text: 'Welcome to Registered Room! Sign in required.', time: new Date().toLocaleTimeString() },
            { name: 'User1', text: 'Glad to be here!', time: new Date().toLocaleTimeString() }
        ],
        private: [
            { name: 'Admin', text: 'Welcome to Private Room! Invite only.', time: new Date().toLocaleTimeString() }
        ]
    };
    
    // Display demo messages (will be replaced with Firebase later)
    chatMessages.innerHTML = '';
    const msgs = demoMessages[type] || demoMessages.public;
    msgs.forEach(msg => {
        const div = document.createElement('div');
        div.className = 'message-bubble received';
        div.innerHTML = `
            <span class="sender-name">${msg.name}</span>
            <span>${msg.text}</span>
            <span class="message-time">${msg.time}</span>
        `;
        chatMessages.appendChild(div);
    });
    
    setTimeout(scrollToBottom, 100);
}

// ===== ADMIN FUNCTIONS =====
function createNewRoom() {
    if (!isAdmin) {
        alert('Only Admin can create new rooms!');
        return;
    }
    const roomName = prompt('Enter room name:');
    if (roomName) {
        // In Phase 3, this will connect to Firebase
        alert(`Room "${roomName}" created successfully! (Demo)`);
    }
}

function deleteRoom() {
    if (!isAdmin) {
        alert('Only Admin can delete rooms!');
        return;
    }
    if (confirm('Are you sure you want to delete this room?')) {
        // In Phase 3, this will connect to Firebase
        alert('Room deleted! (Demo)');
    }
}

function renameRoom() {
    if (!isAdmin) {
        alert('Only Admin can rename rooms!');
        return;
    }
    const newName = prompt('Enter new room name:');
    if (newName) {
        // In Phase 3, this will connect to Firebase
        alert(`Room renamed to "${newName}"! (Demo)`);
    }
}

function sendAnnouncement() {
    if (!isAdmin) {
        alert('Only Admin can send announcements!');
        return;
    }
    const msg = prompt('Enter announcement message:');
    if (msg) {
        // In Phase 3, this will connect to Firebase
        alert(`Announcement sent: "${msg}" (Demo)`);
    }
}

// ===== OTHER FUNCTIONS =====
function searchMessages() {
    const query = prompt('Enter search term:');
    if (query) {
        alert(`Searching for "${query}"... (Demo)`);
    }
}

function openSettings() {
    alert('Settings panel will open here in Phase 5!');
}

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        // Close any open dropdowns
        document.querySelectorAll('.dropdown-menu').forEach(menu => {
            menu.style.display = 'none';
        });
    }
});

// ===== INITIALIZATION =====
console.log("✅ App.js loaded successfully!");
console.log("🔥 Phase 2 Menu Logic Active (Demo Mode)");
