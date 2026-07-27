// ============================================
// feature-economy-wallet.js
// Phase 0.5 (part 2): Wallet Coins purchase — the semi-automatic
// ticket system agreed on (not a plain chat message, and not a fully
// automated payment gateway since none exists yet).
//
// Covers:
//  - "Buy Coins" modal for users: pick coin type (Wallet Coins for
//    gifting, or Ad/Chat Coins — a male can buy these directly
//    instead of watching ads, per the user's explicit request),
//    pick a package, pick a payment method, submit -> creates a
//    request ticket AND opens a prefilled WhatsApp link to the owner.
//  - New Admin "Requests" tab (auto-added to the Economy sidebar
//    group): lists tickets, lets Owner/Admin credit coins + mark
//    approved/rejected, plus a free-standing "Send Coins" tool for
//    crediting any user without a ticket.
//
// Zero edits to app.js/index.html: the admin tab button + content
// panel are injected the same way the existing tab-switch code in
// app.js expects (.admin-tab / .admin-panel[data-panel]), and this
// file attaches its own click handler (app.js's original listener
// loop already ran once at load time over the tabs that existed
// then, so a tab added later needs its own listener — that's what
// we do below).
// ============================================

const COIN_PACKAGES = [
    { price: 100, coins: 100 },
    { price: 200, coins: 210 },
    { price: 500, coins: 550 },
    { price: 1000, coins: 1150 }
];
const PAYMENT_METHODS = ['Easypaisa', 'JazzCash', 'Bank Transfer'];

// ===== 1. Buy Coins modal =====
function injectBuyCoinsModal() {
    if (document.getElementById('buyCoinsModal')) return;
    const modal = document.createElement('div');
    modal.id = 'buyCoinsModal';
    modal.className = 'modal';
    modal.style.display = 'none';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:420px;">
            <h2>🪙 Buy Coins</h2>
            <p style="font-size:13px;color:#888;">Choose what you're buying, then contact the owner to complete payment. Your coins are added once payment is confirmed.</p>

            <label style="font-size:13px;font-weight:600;">What are you buying?</label>
            <select id="buyCoinsType">
                <option value="wallet">💰 Wallet Coins (for sending Gifts)</option>
                <option value="ad">🪙 Chat Coins (for starting new chats)</option>
            </select>

            <label style="font-size:13px;font-weight:600;">Package</label>
            <div id="buyCoinsPackages" style="display:flex;flex-wrap:wrap;gap:8px;margin:8px 0;"></div>

            <label style="font-size:13px;font-weight:600;">Payment method</label>
            <select id="buyCoinsPaymentMethod">
                ${PAYMENT_METHODS.map(m => `<option value="${m}">${m}</option>`).join('')}
            </select>

            <button id="buyCoinsSubmitBtn" class="auth-btn primary" style="margin-top:12px;">Continue on WhatsApp</button>
            <button id="buyCoinsCloseBtn" class="auth-btn" style="background:#ccc;margin-top:6px;">Cancel</button>
        </div>
    `;
    document.body.appendChild(modal);

    let selectedPackageIndex = 0;
    const pkgWrap = document.getElementById('buyCoinsPackages');
    COIN_PACKAGES.forEach((pkg, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'buy-coins-pkg-btn' + (i === 0 ? ' selected' : '');
        btn.innerHTML = `Rs ${pkg.price}<br><small>${pkg.coins} coins</small>`;
        btn.addEventListener('click', () => {
            selectedPackageIndex = i;
            pkgWrap.querySelectorAll('.buy-coins-pkg-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
        });
        pkgWrap.appendChild(btn);
    });

    document.getElementById('buyCoinsCloseBtn').addEventListener('click', () => modal.style.display = 'none');
    document.getElementById('buyCoinsSubmitBtn').addEventListener('click', () => {
        submitCoinPurchaseRequest(COIN_PACKAGES[selectedPackageIndex]);
    });
}

function showBuyCoinsModal() {
    if (!auth.currentUser) return;
    injectBuyCoinsModal();
    document.getElementById('buyCoinsModal').style.display = 'flex';
}

function submitCoinPurchaseRequest(pkg) {
    const user = auth.currentUser;
    if (!user) return;
    const coinType = document.getElementById('buyCoinsType').value;
    const paymentMethod = document.getElementById('buyCoinsPaymentMethod').value;

    database.ref('users/' + user.uid + '/profile').once('value', snap => {
        const profile = snap.val() || {};
        const username = profile.displayName || user.email || 'User';
        const requestRef = database.ref('coinRequests').push();
        requestRef.set({
            uid: user.uid,
            username: username,
            email: user.email || '',
            coinType: coinType,
            priceRs: pkg.price,
            coinsAmount: pkg.coins,
            paymentMethod: paymentMethod,
            status: 'pending',
            createdAt: Date.now()
        }).then(() => {
            document.getElementById('buyCoinsModal').style.display = 'none';
            notifySupportOfPurchaseRequest(user.uid, username, pkg, coinType, paymentMethod, requestRef.key);
        }).catch(err => alert('Error: ' + err.message));
    });
}

// Posts an automatic message into the user's Help & Support thread
// summarizing the request, so it surfaces in the Admin Panel's Support
// tab (and the unread badge) — no WhatsApp, no external contact, and
// the user never sees any admin identity either way.
function notifySupportOfPurchaseRequest(uid, username, pkg, coinType, paymentMethod, requestId) {
    const coinLabel = coinType === 'wallet' ? 'Wallet Coins (Gifting)' : 'Chat Coins';
    const text = `🎫 New coin purchase request: ${pkg.coins} ${coinLabel} for Rs ${pkg.price}, paying via ${paymentMethod}. (Request ID: ${requestId})`;
    const threadRef = database.ref('supportThreads/' + uid);
    threadRef.child('messages').push({ sender: 'user', text: text, timestamp: Date.now() });
    threadRef.update({
        username: username,
        lastMessage: text,
        lastMessageAt: Date.now(),
        unreadForAdmin: true
    });
    alert('Your request has been submitted! You can check its status or message us anytime from the 🛟 Help & Support button.');
}

// ===== 2. Admin: Requests tab (injected into the admin panel) =====
function injectRequestsAdminTab() {
    if (document.querySelector('.admin-tab[data-tab="requests"]')) return;
    const tabBar = document.querySelector('#adminModal .admin-tabs');
    const panelHost = document.querySelector('#adminModal .admin-panel')?.parentElement;
    if (!tabBar || !panelHost) return;

    const tabBtn = document.createElement('button');
    tabBtn.className = 'admin-tab';
    tabBtn.dataset.tab = 'requests';
    tabBtn.textContent = 'Requests';
    tabBar.appendChild(tabBtn);

    const panel = document.createElement('div');
    panel.className = 'admin-panel';
    panel.dataset.panel = 'requests';
    panel.innerHTML = `
        <h3 style="margin:10px 0;">🎫 Purchase Requests</h3>
        <div id="coinRequestsList"></div>
        <h3 style="margin:18px 0 10px;">✋ Manual Send Coins</h3>
        <div id="manualSendCoinsRow" style="display:flex;flex-wrap:wrap;gap:6px;">
            <input type="text" id="manualSendEmail" placeholder="User email">
            <select id="manualSendType"><option value="wallet">Wallet Coins</option><option value="ad">Chat Coins</option></select>
            <input type="number" id="manualSendAmount" placeholder="Amount" style="width:100px;">
            <button id="manualSendBtn">Send</button>
        </div>
    `;
    panelHost.appendChild(panel);

    tabBtn.addEventListener('click', function() {
        document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
        panel.classList.add('active');
        loadAdminCoinRequests();
    });

    document.getElementById('manualSendBtn').addEventListener('click', () => {
        const email = document.getElementById('manualSendEmail').value.trim().toLowerCase();
        const type = document.getElementById('manualSendType').value;
        const amount = parseInt(document.getElementById('manualSendAmount').value);
        if (!email || !amount || amount <= 0) return alert('Enter a valid email and amount.');
        manualSendCoins(email, type, amount);
    });
}

function loadAdminCoinRequests() {
    const list = document.getElementById('coinRequestsList');
    if (!list) return;
    database.ref('coinRequests').orderByChild('createdAt').once('value', snap => {
        list.innerHTML = '';
        const entries = [];
        snap.forEach(child => entries.push([child.key, child.val()]));
        entries.reverse(); // newest first
        if (!entries.length) { list.innerHTML = '<p style="color:#888;">No requests yet.</p>'; return; }
        entries.forEach(([key, req]) => {
            const div = document.createElement('div');
            div.className = 'admin-item';
            const coinLabel = req.coinType === 'wallet' ? '💰 Wallet Coins' : '🪙 Chat Coins';
            const statusBadge = req.status === 'pending' ? '🟡 Pending' : req.status === 'approved' ? '✅ Approved' : '❌ Rejected';
            div.innerHTML = `
                <span>${escapeHtml(req.username)} (${escapeHtml(req.email)}) — ${coinLabel} × ${req.coinsAmount} for Rs ${req.priceRs} via ${escapeHtml(req.paymentMethod)} — ${statusBadge}</span>
                <div>
                    ${req.status === 'pending' ? `<button class="green" data-req="${key}" data-act="approve">✅ Approve & Credit</button>
                    <button class="red" data-req="${key}" data-act="reject">❌ Reject</button>` : ''}
                </div>
            `;
            list.appendChild(div);
        });
        list.querySelectorAll('[data-act="approve"]').forEach(btn => {
            btn.addEventListener('click', () => resolveCoinRequest(btn.dataset.req, 'approved'));
        });
        list.querySelectorAll('[data-act="reject"]').forEach(btn => {
            btn.addEventListener('click', () => resolveCoinRequest(btn.dataset.req, 'rejected'));
        });
    });
}

function resolveCoinRequest(key, newStatus) {
    if (!isOwner && !isAdmin) return;
    const reqRef = database.ref('coinRequests/' + key);
    reqRef.once('value', snap => {
        const req = snap.val();
        if (!req || req.status !== 'pending') return;
        reqRef.update({ status: newStatus, resolvedAt: Date.now(), resolvedBy: currentUser.uid });
        if (newStatus === 'approved') {
            const field = req.coinType === 'wallet' ? 'walletCoins' : 'adCoins';
            const coinRef = database.ref('users/' + req.uid + '/economy/' + field);
            coinRef.once('value', coinSnap => coinRef.set((coinSnap.val() || 0) + req.coinsAmount));
        }
        loadAdminCoinRequests();
    });
}

function manualSendCoins(email, type, amount) {
    if (!isOwner && !isAdmin) return;
    database.ref('users').orderByChild('email').equalTo(email).once('value', snap => {
        if (!snap.exists()) return alert('No user found with that email.');
        let targetUid = null;
        snap.forEach(child => { targetUid = child.key; });
        const field = type === 'wallet' ? 'walletCoins' : 'adCoins';
        const coinRef = database.ref('users/' + targetUid + '/economy/' + field);
        coinRef.once('value', coinSnap => {
            coinRef.set((coinSnap.val() || 0) + amount);
            alert('Sent ' + amount + ' coins.');
            document.getElementById('manualSendEmail').value = '';
            document.getElementById('manualSendAmount').value = '';
        });
    });
}

// ===== 3. Wire the Buy Coins modal to the wallet part of the coin badge =====
function hookBuyCoinsToBadge() {
    const walletSpan = document.querySelector('#coinBadge .coin-wallet');
    if (!walletSpan) return setTimeout(hookBuyCoinsToBadge, 300);
    walletSpan.addEventListener('click', function(e) {
        e.stopPropagation(); // don't also trigger the Watch Ad click on the parent badge
        showBuyCoinsModal();
    });
}

auth.onAuthStateChanged(function(user) {
    if (!user) return;
    setTimeout(hookBuyCoinsToBadge, 500);
});

injectRequestsAdminTab();
