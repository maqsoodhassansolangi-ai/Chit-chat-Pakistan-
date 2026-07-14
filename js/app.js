// ============================================================
// 🔒 پرانے لاکڈ فنکشنز (بالکل ویسے ہی — کوئی تبدیلی نہیں)
// ============================================================

// Firebase Config (آپ کی دی ہوئی اصل ویلیوز)
const firebaseConfig = {
    apiKey: "AIzaSyD-dGY7B_6-K-j4_u9_z8_ZzQ_-I-jO2a4",
    authDomain: "chit-chat-pakistan.firebaseapp.com",
    databaseURL: "https://chit-chat-pakistan-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "chit-chat-pakistan",
    storageBucket: "chit-chat-pakistan.firebasestorage.app",
    messagingSenderId: "765094629206",
    appId: "1:765094629206:web:b0b3b3b3b3b3b3b3"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

// پرانے فنکشنز (بالکل ویسے ہی)
function signupForm() {
    const name = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    if (!name || !email || !password) {
        alert('Please fill all fields');
        return;
    }
    auth.createUserWithEmailAndPassword(email, password)
        .then((userCredential) => {
            return userCredential.user.updateProfile({
                displayName: name
            });
        })
        .then(() => {
            alert('Account created successfully!');
            showLogin();
        })
        .catch((error) => {
            alert(error.message);
        });
}

function loginForm() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    if (!email || !password) {
        alert('Please fill all fields');
        return;
    }
    auth.signInWithEmailAndPassword(email, password)
        .then(() => {
            document.getElementById('login-form').style.display = 'none';
            document.getElementById('signup-form').style.display = 'none';
            document.getElementById('auth-container').style.display = 'none';
            document.getElementById('chat-container').style.display = 'flex';
            loadMessages();
            initPresence();
        })
        .catch((error) => {
            alert(error.message);
        });
}

function googleBtn() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider)
        .then(() => {
            document.getElementById('login-form').style.display = 'none';
            document.getElementById('signup-form').style.display = 'none';
            document.getElementById('auth-container').style.display = 'none';
            document.getElementById('chat-container').style.display = 'flex';
            loadMessages();
            initPresence();
        })
        .catch((error) => {
            alert(error.message);
        });
}

function guestBtn() {
    auth.signInAnonymously()
        .then(() => {
            document.getElementById('login-form').style.display = 'none';
            document.getElementById('signup-form').style.display = 'none';
            document.getElementById('auth-container').style.display = 'none';
            document.getElementById('chat-container').style.display = 'flex';
            loadMessages();
            initPresence();
        })
        .catch((error) => {
            alert(error.message);
        });
}

function logoutBtn() {
    auth.signOut()
        .then(() => {
            document.getElementById('chat-container').style.display = 'none';
            document.getElementById('auth-container').style.display = 'block';
            document.getElementById('login-form').style.display = 'block';
            document.getElementById('signup-form').style.display = 'none';
            document.getElementById('rooms-list-area').style.display = 'block';
            document.getElementById('chat-box').style.display = 'none';
            document.getElementById('input-area').style.display = 'none';
        })
        .catch((error) => {
            alert(error.message);
        });
}

function initPresence() {
    const user = auth.currentUser;
    if (!user) return;
    const statusRef = db.ref('presence/' + user.uid);
    statusRef.set({
        online: true,
        lastSeen: Date.now(),
        displayName: user.displayName || 'Guest'
    });
    statusRef.onDisconnect().update({
        online: false,
        lastSeen: Date.now()
    });
    // Online count
    const presenceRef = db.ref('presence');
    presenceRef.on('value', (snapshot) => {
        let count = 0;
        snapshot.forEach((child) => {
            if (child.val().online) count++;
        });
        document.getElementById('online-count-text').textContent = count;
    });
}

function loadMessages() {
    const messagesRef = db.ref('messages');
    messagesRef.off();
    messagesRef.on('child_added', (snapshot) => {
        const msg = snapshot.val();
        displayMessage(msg, snapshot.key);
    });
}

function displayMessage(msg, key) {
    const messagesDiv = document.getElementById('messages');
    const user = auth.currentUser;
    const isSent = (msg.uid === user?.uid);
    const div = document.createElement('div');
    div.className = 'message ' + (isSent ? 'sent' : 'received');
    div.id = 'msg-' + key;
    div.innerHTML = `
        <div class="sender">${msg.name || 'Guest'}</div>
        <div>${msg.text}</div>
        <div class="time">${new Date(msg.timestamp).toLocaleTimeString()}</div>
    `;
    messagesDiv.appendChild(div);
    scrollToBottom();
}

function scrollToBottom() {
    const messagesDiv = document.getElementById('messages');
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function adjustViewport() {
    const input = document.getElementById('message-input');
    const chatBox = document.getElementById('chat-box');
    if (window.visualViewport) {
        const height = window.visualViewport.height;
        chatBox.style.height = (height - 150) + 'px';
    }
}

function filterBadWords(text) {
    const badWords = ['badword1', 'badword2', 'badword3']; // Add your own
    let filtered = text;
    badWords.forEach(word => {
        const regex = new RegExp(word, 'gi');
        filtered = filtered.replace(regex, '***');
    });
    return filtered;
}

function sendMessage() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    if (!text) return;
    const user = auth.currentUser;
    if (!user) {
        alert('Please login first');
        return;
    }
    const filteredText = filterBadWords(text);
    const messagesRef = db.ref('messages');
    messagesRef.push({
        uid: user.uid,
        name: user.displayName || 'Guest',
        text: filteredText,
        timestamp: Date.now()
    });
    input.value = '';
}

function showSignup() {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('signup-form').style.display = 'block';
}

function showLogin() {
    document.getElementById('login-form').style.display = 'block';
    document.getElementById('signup-form').style.display = 'none';
}

// لاگ ان چیک کریں
auth.onAuthStateChanged((user) => {
    if (user) {
        document.getElementById('login-form').style.display = 'none';
        document.getElementById('signup-form').style.display = 'none';
        document.getElementById('auth-container').style.display = 'none';
        document.getElementById('chat-container').style.display = 'flex';
        loadMessages();
        initPresence();
    } else {
        document.getElementById('chat-container').style.display = 'none';
        document.getElementById('auth-container').style.display = 'block';
        document.getElementById('login-form').style.display = 'block';
        document.getElementById('signup-form').style.display = 'none';
    }
});

// ============================================================
// 🆕 نئے فنکشنز (صرف یہ شامل کیے گئے ہیں — پرانے کو لاک کیا گیا ہے)
// ============================================================

// متغیرات
let currentRoomId = null;
let allRooms = [];

// مینیو بار کے فنکشنز
function showRoomsList() {
    document.getElementById('rooms-list-area').style.display = 'block';
    document.getElementById('chat-box').style.display = 'none';
    document.getElementById('input-area').style.display = 'none';
    showAllRooms();
}

function showMyRooms() {
    document.getElementById('rooms-list-area').style.display = 'block';
    document.getElementById('chat-box').style.display = 'none';
    document.getElementById('input-area').style.display = 'none';
    // میرے رومز دکھائیں (بعد میں)
}

// All Rooms دکھانا
function showAllRooms() {
    const roomsList = document.getElementById('rooms-list');
    roomsList.innerHTML = '<p>Loading rooms...</p>';
    
    const roomsRef = db.ref('rooms');
    roomsRef.once('value', (snapshot) => {
        roomsList.innerHTML = '';
        allRooms = [];
        snapshot.forEach((child) => {
            const room = child.val();
            const roomId = child.key;
            allRooms.push({ id: roomId, ...room });
            
            const div = document.createElement('div');
            div.className = 'room-item';
            div.innerHTML = `
                <div>
                    <div class="room-name">${room.name || 'Unnamed Room'}</div>
                    <div class="room-info">👥 ${Object.keys(room.members || {}).length} members</div>
                </div>
                <button class="btn-join" onclick="joinRoom('${roomId}')">Join</button>
            `;
            roomsList.appendChild(div);
        });
        if (allRooms.length === 0) {
            roomsList.innerHTML = '<p>No rooms available. Create one!</p>';
        }
    });
}

// Create Room Modal
function openCreateRoomModal() {
    document.getElementById('create-room-modal').style.display = 'flex';
    document.getElementById('new-room-name').value = '';
}

function closeCreateRoomModal() {
    document.getElementById('create-room-modal').style.display = 'none';
}

// createRoom() — نیا روم بنانا
function createRoom() {
    const roomName = document.getElementById('new-room-name').value.trim();
    if (!roomName) {
        alert('Please enter a room name');
        return;
    }
    
    const user = auth.currentUser;
    if (!user) {
        alert('Please login first');
        return;
    }
    
    // چیک کریں کہ آیا صارف ایڈمن ہے (ایڈمن ای میل)
    const adminEmail = 'maqsoodhassansolangi90@gmail.com';
    if (user.email !== adminEmail) {
        alert('Only admin can create rooms');
        return;
    }
    
    const roomsRef = db.ref('rooms');
    const newRoomRef = roomsRef.push();
    const roomData = {
        name: roomName,
        createdBy: user.uid,
        createdAt: Date.now(),
        roomType: 'public',
        members: {
            [user.uid]: true
        }
    };
    
    newRoomRef.set(roomData)
        .then(() => {
            closeCreateRoomModal();
            alert('Room created successfully!');
            showAllRooms();
        })
        .catch((error) => {
            alert('Error creating room: ' + error.message);
        });
}

// joinRoom() — روم میں شامل ہونا
function joinRoom(roomId) {
    const user = auth.currentUser;
    if (!user) {
        alert('Please login first');
        return;
    }
    
    const roomRef = db.ref('rooms/' + roomId + '/members/' + user.uid);
    roomRef.set(true)
        .then(() => {
            alert('Joined room successfully!');
            showAllRooms();
        })
        .catch((error) => {
            alert('Error joining room: ' + error.message);
        });
      }
