// ============================================
// feature-economy-core.js
// Phase 0.5 (part 1): the coin infrastructure everything else in the
// Economy system (gifts, VIP, withdrawals) will build on.
//
// Covers, per the agreed design:
//  - Two separate coin types: Ad Coins (ads/login bonus, spent only
//    on bypassing the daily new-chat limit) vs Wallet Coins (manual
//    purchase only, spent only on Gifts/VIP — NOT implemented in
//    this file yet, that's the next slice).
//  - Gender-based daily new-chat limit: male -> female, first-ever
//    message to a given person only.
//  - Small coin balance display + a "watch ad, earn coins" flow.
//
// Zero edits to app.js: openPrivateChat is wrapped (same pattern used
// for sendMessage in feature-rate-limit.js), and the coin badge is
// injected next to the existing #logoutBtn via DOM insertion.
// ============================================

const DAILY_FREE_NEW_CHATS = 5;          // male -> new female contact, free per day
const NEW_CHAT_AD_COIN_COST = 10;        // cost to open one MORE beyond the free daily limit
const STARTER_AD_COINS = 20;             // one-time bonus on first ever login
const DAILY_LOGIN_BONUS_AD_COINS = 5;    // once per calendar day
const WATCH_AD_REWARD_COINS = 15;
const WATCH_AD_DURATION_SECONDS = 20;

let myGender = null; // cached after first read, refreshed on login

function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}

// ===== 1. Init + daily login bonus =====
function ensureEconomyInitialized(uid) {
    const ref = database.ref('users/' + uid + '/economy');
    ref.once('value', snap => {
        if (!snap.exists()) {
            ref.set({
                adCoins: STARTER_AD_COINS,
                walletCoins: 0,
                newChatsToday: 0,
                newChatsDate: todayStr(),
                lastLoginBonusDate: todayStr() // don't also give the daily bonus the same day as the starter bonus
            });
            return;
        }
        const data = snap.val();
        if (data.lastLoginBonusDate !== todayStr()) {
            ref.update({
                adCoins: (data.adCoins || 0) + DAILY_LOGIN_BONUS_AD_COINS,
                lastLoginBonusDate: todayStr()
            });
        }
    });
}

// ===== 2. Coin balance badge (injected next to Logout) =====
function injectCoinBadge() {
    if (document.getElementById('coinBadge')) return;
    const logoutBtn = document.getElementById('logoutBtn');
    if (!logoutBtn) return;
    const badge = document.createElement('div');
    badge.id = 'coinBadge';
    badge.className = 'coin-badge';
    badge.innerHTML = `<span class="coin-ad">🪙 <span id="coinBadgeAd">0</span></span><span class="coin-wallet">💰 <span id="coinBadgeWallet">0</span></span>`;
    badge.title = 'Ad Coins (left) — Wallet Coins (right). Tap to earn more.';
    badge.addEventListener('click', showWatchAdModal);
    logoutBtn.insertAdjacentElement('beforebegin', badge);
}

function watchCoinBalance(uid) {
    database.ref('users/' + uid + '/economy').on('value', snap => {
        const data = snap.val() || {};
        const adEl = document.getElementById('coinBadgeAd');
        const walletEl = document.getElementById('coinBadgeWallet');
        if (adEl) adEl.textContent = data.adCoins || 0;
        if (walletEl) walletEl.textContent = data.walletCoins || 0;
    });
}

// ===== 3. Watch-Ad-For-Coins flow =====
// NOTE (documented honestly): Adsterra doesn't give us a client-side
// "ad finished watching, here's a verified callback" signal the way a
// proper rewarded-video SDK would. This is a placeholder rewarded-flow
// — a timed modal that just requires staying on the page for the
// countdown — good enough to ship the feature now, but it can (and
// should) be swapped for a real rewarded-ad SDK's completion callback
// later if ad fraud/abuse becomes a real problem.
function showWatchAdModal() {
    if (document.getElementById('watchAdModal')) return;
    const modal = document.createElement('div');
    modal.id = 'watchAdModal';
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:340px; text-align:center;">
            <h2>🎬 Watch to earn coins</h2>
            <p style="color:#888; font-size:13px;">Stay on this screen for <span id="watchAdCountdown">${WATCH_AD_DURATION_SECONDS}</span>s to earn ${WATCH_AD_REWARD_COINS} Ad Coins.</p>
            <div style="background:#f0f0f0; border-radius:10px; height:80px; display:flex; align-items:center; justify-content:center; color:#aaa; margin:14px 0;">(ad space)</div>
            <button id="watchAdCloseBtn" class="auth-btn" style="background:#ccc;">Cancel</button>
        </div>
    `;
    document.body.appendChild(modal);

    let remaining = WATCH_AD_DURATION_SECONDS;
    const countdownEl = document.getElementById('watchAdCountdown');
    const timer = setInterval(() => {
        remaining--;
        if (countdownEl) countdownEl.textContent = remaining;
        if (remaining <= 0) {
            clearInterval(timer);
            const uid = auth.currentUser && auth.currentUser.uid;
            if (uid) {
                database.ref('users/' + uid + '/economy/adCoins').once('value', snap => {
                    database.ref('users/' + uid + '/economy/adCoins').set((snap.val() || 0) + WATCH_AD_REWARD_COINS);
                });
            }
            modal.remove();
            alert('🎉 You earned ' + WATCH_AD_REWARD_COINS + ' Ad Coins!');
        }
    }, 1000);

    document.getElementById('watchAdCloseBtn').addEventListener('click', () => {
        clearInterval(timer);
        modal.remove();
    });
}

// ===== 4. Gender-based daily new-chat limit =====
function installPrivateChatGate() {
    if (typeof window.openPrivateChat !== 'function') {
        return setTimeout(installPrivateChatGate, 50);
    }
    const originalOpenPrivateChat = window.openPrivateChat;
    window.openPrivateChat = function(targetUid, targetName) {
        const uid = auth.currentUser && auth.currentUser.uid;
        if (!uid) return originalOpenPrivateChat(targetUid, targetName);

        database.ref('users/' + uid + '/profile/gender').once('value', mySnap => {
            const gender = mySnap.val();
            myGender = gender;

            // The limit only ever applies to a male user messaging a
            // female user for the first time — everyone else proceeds
            // exactly as before, with zero extra steps.
            if (gender !== 'male') return originalOpenPrivateChat(targetUid, targetName);

            database.ref('users/' + targetUid + '/profile/gender').once('value', targetSnap => {
                if (targetSnap.val() !== 'female') return originalOpenPrivateChat(targetUid, targetName);

                database.ref('users/' + uid + '/chatPartners/' + targetUid).once('value', partnerSnap => {
                    if (partnerSnap.exists()) {
                        // Already messaged this person before — never limited again.
                        return originalOpenPrivateChat(targetUid, targetName);
                    }
                    enforceNewChatLimit(uid, targetUid, targetName, originalOpenPrivateChat);
                });
            });
        });
    };
}

function enforceNewChatLimit(uid, targetUid, targetName, proceedFn) {
    const economyRef = database.ref('users/' + uid + '/economy');
    economyRef.once('value', snap => {
        let data = snap.val() || { adCoins: 0, newChatsToday: 0, newChatsDate: todayStr() };
        if (data.newChatsDate !== todayStr()) {
            data.newChatsToday = 0;
            data.newChatsDate = todayStr();
        }

        const proceedAndRecord = (extraUpdates) => {
            database.ref('users/' + uid + '/chatPartners/' + targetUid).set(true);
            economyRef.update(Object.assign({
                newChatsToday: data.newChatsToday + 1,
                newChatsDate: todayStr()
            }, extraUpdates || {}));
            proceedFn(targetUid, targetName);
        };

        if (data.newChatsToday < DAILY_FREE_NEW_CHATS) {
            proceedAndRecord();
            return;
        }

        // Over the free daily limit — needs Ad Coins to open one more.
        const adCoins = data.adCoins || 0;
        if (adCoins < NEW_CHAT_AD_COIN_COST) {
            alert('You\'ve used your ' + DAILY_FREE_NEW_CHATS + ' free new chats for today. Watch an ad to earn Ad Coins and start more (costs ' + NEW_CHAT_AD_COIN_COST + ' Ad Coins per new chat).');
            showWatchAdModal();
            return;
        }
        if (!confirm('You\'ve used today\'s free new chats. Spend ' + NEW_CHAT_AD_COIN_COST + ' Ad Coins to message ' + targetName + '?')) return;
        proceedAndRecord({ adCoins: adCoins - NEW_CHAT_AD_COIN_COST });
    });
}

// ===== 5. Wire it all up on login =====
auth.onAuthStateChanged(function(user) {
    if (!user) return;
    ensureEconomyInitialized(user.uid);
    injectCoinBadge();
    watchCoinBalance(user.uid);
});
installPrivateChatGate();
