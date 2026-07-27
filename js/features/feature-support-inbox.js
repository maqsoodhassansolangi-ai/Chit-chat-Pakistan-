// ============================================
// feature-support-inbox.js
// In-site "Help & Support" contact system — replaces WhatsApp entirely
// per explicit instruction. Users never see any admin identity (name,
// email, uid, photo) — replies always show as a generic "Support Team"
// sender, exactly like a real help-desk/contact-us system. Messages
// land inside the Admin Panel itself, with an unread badge visible
// even before the panel is opened (on the Admin Panel / Site Settings
// menu entries), so the owner notices immediately.
//
// Zero edits to app.js/index.html: the floating Help button, its chat
// modal, the new admin "Support" tab, and the unread badges are all
// injected purely via JS.
// ============================================

const SUPPORT_SENDER_LABEL = 'Support Team'; // never the real admin name/email/uid

// ===== 1. User-facing: floating Help & Support button + chat modal =====
function injectSupportButton() {
    if (document.getElementById('supportFab')) return;
    const fab = document.createElement('button');
    fab.id = 'supportFab';
    fab.className = 'support-fab';
    fab.innerHTML = '🛟';
    fab.title = 'Help & Support';
    fab.addEventListener('click', showSupportModal);
    document.body.appendChild(fab);
}

function removeSupportButton() {
    const fab = document.getElementById('supportFab');
    if (fab) fab.remove();
    const modal = document.getElementById('supportModal');
    if (modal) modal.remove();
}

function showSupportModal() {
    const user = auth.currentUser;
    if (!user) return;
    let modal = document.getElementById('supportModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'supportModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:420px; display:flex; flex-direction:column; height:70vh;">
                <span class="close-modal" id="supportCloseBtn">&times;</span>
                <h2>🛟 Help &amp; Support</h2>
                <p style="font-size:12px;color:#888;">Send us a message and we'll get back to you here.</p>
                <div id="supportMessagesList" style="flex:1; overflow-y:auto; margin:10px 0; display:flex; flex-direction:column; gap:8px;"></div>
                <div style="display:flex; gap:6px;">
                    <input type="text" id="supportInput" placeholder="Type your message..." style="flex:1;">
                    <button id="supportSendBtn">➤</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        document.getElementById('supportCloseBtn').addEventListener('click', () => modal.style.display = 'none');
        document.getElementById('supportSendBtn').addEventListener('click', sendSupportMessage);
        document.getElementById('supportInput').addEventListener('keydown', e => {
            if (e.key === 'Enter') sendSupportMessage();
        });
    }
    modal.style.display = 'flex';
    listenToMySupportThread(user.uid);
    database.ref('supportThreads/' + user.uid + '/unreadForUser').set(false);
}

function sendSupportMessage() {
    const user = auth.currentUser;
    const input = document.getElementById('supportInput');
    const text = input.value.trim();
    if (!text || !user) return;
    input.value = '';

    database.ref('users/' + user.uid + '/profile').once('value', snap => {
        const username = (snap.val() || {}).displayName || user.email || 'User';
        const threadRef = database.ref('supportThreads/' + user.uid);
        threadRef.child('messages').push({ sender: 'user', text: text, timestamp: Date.now() });
        threadRef.update({
            username: username,
            lastMessage: text,
            lastMessageAt: Date.now(),
            unreadForAdmin: true
        });
    });
}

let myThreadListenerUid = null;
function listenToMySupportThread(uid) {
    if (myThreadListenerUid === uid) return; // already listening
    if (myThreadListenerUid) database.ref('supportThreads/' + myThreadListenerUid + '/messages').off();
    myThreadListenerUid = uid;
    database.ref('supportThreads/' + uid + '/messages').on('value', snap => {
        const list = document.getElementById('supportMessagesList');
        if (!list) return;
        list.innerHTML = '';
        snap.forEach(child => {
            const msg = child.val();
            const div = document.createElement('div');
            const isMine = msg.sender === 'user';
            div.className = 'support-msg ' + (isMine ? 'support-msg-mine' : 'support-msg-support');
            div.innerHTML = `${!isMine ? `<strong>${SUPPORT_SENDER_LABEL}</strong><br>` : ''}${escapeHtml(msg.text)}`;
            list.appendChild(div);
        });
        list.scrollTop = list.scrollHeight;
    });
}

// ===== 2. Admin-facing: Support tab + unread badges =====
function injectSupportAdminTab() {
    if (document.querySelector('.admin-tab[data-tab="support"]')) return;
    const tabBar = document.querySelector('#adminModal .admin-tabs');
    const panelHost = document.querySelector('#adminModal .admin-panel')?.parentElement;
    if (!tabBar || !panelHost) return;

    const tabBtn = document.createElement('button');
    tabBtn.className = 'admin-tab';
    tabBtn.dataset.tab = 'support';
    tabBtn.innerHTML = 'Support <span id="supportTabBadge" class="support-badge" style="display:none;"></span>';
    tabBar.insertBefore(tabBtn, tabBar.firstChild); // prominent — first tab

    const panel = document.createElement('div');
    panel.className = 'admin-panel';
    panel.dataset.panel = 'support';
    panel.innerHTML = `
        <div style="display:flex; gap:10px; height:400px;">
            <div id="supportThreadList" style="width:40%; overflow-y:auto; border-right:1px solid #eee; padding-right:8px;"></div>
            <div style="flex:1; display:flex; flex-direction:column;">
                <div id="supportAdminMessages" style="flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:6px;"></div>
                <div id="supportAdminReplyRow" style="display:none; gap:6px; margin-top:8px;">
                    <input type="text" id="supportAdminInput" placeholder="Reply as Support Team..." style="flex:1;">
                    <button id="supportAdminSendBtn">➤</button>
                </div>
            </div>
        </div>
    `;
    panelHost.appendChild(panel);

    tabBtn.addEventListener('click', function() {
        document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
        panel.classList.add('active');
        loadAdminSupportThreads();
    });
}

let activeSupportThreadUid = null;
function loadAdminSupportThreads() {
    const list = document.getElementById('supportThreadList');
    if (!list) return;
    database.ref('supportThreads').orderByChild('lastMessageAt').once('value', snap => {
        const entries = [];
        snap.forEach(child => entries.push([child.key, child.val()]));
        entries.reverse();
        list.innerHTML = entries.length ? '' : '<p style="color:#888;font-size:13px;">No messages yet.</p>';
        entries.forEach(([uid, thread]) => {
            const item = document.createElement('div');
            item.className = 'support-thread-item' + (thread.unreadForAdmin ? ' unread' : '');
            item.innerHTML = `<strong>${escapeHtml(thread.username || 'User')}</strong>${thread.unreadForAdmin ? ' 🔴' : ''}<br><small>${escapeHtml((thread.lastMessage || '').slice(0, 40))}</small>`;
            item.addEventListener('click', () => openAdminSupportThread(uid, thread.username));
            list.appendChild(item);
        });
    });
}

function openAdminSupportThread(uid, username) {
    activeSupportThreadUid = uid;
    document.getElementById('supportAdminReplyRow').style.display = 'flex';
    database.ref('supportThreads/' + uid + '/unreadForAdmin').set(false);
    updateSupportUnreadBadges();

    database.ref('supportThreads/' + uid + '/messages').off();
    database.ref('supportThreads/' + uid + '/messages').on('value', snap => {
        const msgList = document.getElementById('supportAdminMessages');
        if (!msgList) return;
        msgList.innerHTML = '';
        snap.forEach(child => {
            const msg = child.val();
            const div = document.createElement('div');
            const isFromUser = msg.sender === 'user';
            div.className = 'support-msg ' + (isFromUser ? 'support-msg-support' : 'support-msg-mine');
            div.innerHTML = `${isFromUser ? `<strong>${escapeHtml(username || 'User')}</strong><br>` : `<strong>You (${SUPPORT_SENDER_LABEL})</strong><br>`}${escapeHtml(msg.text)}`;
            msgList.appendChild(div);
        });
        msgList.scrollTop = msgList.scrollHeight;
    });

    document.getElementById('supportAdminSendBtn').onclick = function() {
        const input = document.getElementById('supportAdminInput');
        const text = input.value.trim();
        if (!text || !activeSupportThreadUid) return;
        input.value = '';
        // Deliberately does NOT include admin uid/name/email anywhere — the
        // user only ever sees "Support Team" regardless of which admin/mod
        // account actually sent it.
        database.ref('supportThreads/' + activeSupportThreadUid + '/messages').push({
            sender: 'support', text: text, timestamp: Date.now()
        });
        database.ref('supportThreads/' + activeSupportThreadUid).update({
            lastMessage: text, lastMessageAt: Date.now(), unreadForUser: true
        });
    };
}

// Unread badges shown on the Admin Panel / Site Settings menu entries
// (visible on the MAIN screen before the panel is even opened) plus the
// Support tab itself once the panel is open.
function updateSupportUnreadBadges() {
    if (!isOwner && !isAdmin) return;
    database.ref('supportThreads').once('value', snap => {
        let unreadCount = 0;
        snap.forEach(child => { if (child.val().unreadForAdmin) unreadCount++; });
        ['[data-action="admin-panel"]', '[data-action="site-settings"]'].forEach(sel => {
            document.querySelectorAll(sel).forEach(el => {
                let dot = el.querySelector('.support-badge-dot');
                if (unreadCount > 0) {
                    if (!dot) {
                        dot = document.createElement('span');
                        dot.className = 'support-badge-dot';
                        el.appendChild(dot);
                    }
                    dot.textContent = unreadCount;
                } else if (dot) {
                    dot.remove();
                }
            });
        });
        const tabBadge = document.getElementById('supportTabBadge');
        if (tabBadge) {
            tabBadge.style.display = unreadCount > 0 ? 'inline-block' : 'none';
            tabBadge.textContent = unreadCount;
        }
    });
}

// ===== 3. Wire everything up =====
auth.onAuthStateChanged(function(user) {
    if (!user) {
        removeSupportButton();
        if (myThreadListenerUid) { database.ref('supportThreads/' + myThreadListenerUid + '/messages').off(); myThreadListenerUid = null; }
        return;
    }
    injectSupportButton();

    // Owner/Admin/Moderator: watch for new support messages live so the
    // badge on the main screen updates in real time, not just on open.
    setTimeout(() => {
        if (isOwner || isAdmin) {
            database.ref('supportThreads').on('value', () => updateSupportUnreadBadges());
        }
    }, 1500); // small delay so isOwner/isAdmin (set by app.js's own listeners) have resolved
});

injectSupportAdminTab();
