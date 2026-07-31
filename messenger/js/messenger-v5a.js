// ============================================
// ChitChat Pakistan — Messenger V5-A: WebRTC Call Core (v2)
// ============================================
// Self-contained: does NOT modify app.js. The call UI (incoming/outgoing/
// active screens) is injected into <body> directly by THIS file's JS
// (not fetched from messenger.html) — a call must be receivable even if
// the person has never opened Messenger yet. It's still styled from
// messenger.css, which always loads on page load regardless.
//
// ICE: multiple public STUN servers (Google + Cloudflare + stunprotocol)
// for better connectivity. Pure STUN still won't connect 100% of the
// time behind strict/symmetric NATs — a TURN relay fixes that but needs
// a paid or signed-up provider. Adding multiple STUN servers handles
// the most common failure case (single-server unavailability).
//
// DB (calls/{callId}, auto-push id):
//   callerUid, calleeUid, callerName, callerPhoto, chatId, type:'audio'|'video',
//   createdAt, offer:{type,sdp}, answer:{type,sdp}?, status:'ringing'|'active'|
//   'ended'|'rejected'|'missed'|'cancelled', startTime?, endTime?,
//   callerCandidates/{pushId}, calleeCandidates/{pushId}
//
// Fixes vs V5-A v1:
//   • Multiple STUN servers — single-server unavailability caused silent failures
//   • Null-check on callTimer element in cleanupCall() — could crash on fast hangup
//   • oniceconnectionstatechange handler — disconnects are now detected and
//     surfaced as "Connection lost" / auto-end after a short grace period
//   • Camera toggle button in active call (video calls only)
//   • Race condition fix in acceptIncomingCall: check call status BEFORE doing
//     getUserMedia so we don't hold the camera open for a dead call
//   • mgrHandledCallIds pruned to the last 50 entries to prevent memory growth
// ============================================
(function () {
    'use strict';

    // STUN + TURN servers for maximum connectivity.
    // STUN: free public servers — tried first (direct P2P, no bandwidth cost).
    // TURN: Metered.ca 20GB/month free plan — relay fallback for users behind
    //       strict/symmetric NAT (common on mobile networks like Telenor/Jazz/Ufone).
    //       UDP:80 → TCP:80 → TLS:443 → TURNS:443 are listed in order so the
    //       browser tries fastest/cheapest first and falls back progressively
    //       through firewalls that block earlier options.
    const ICE_SERVERS = [
        // ── STUN (direct P2P — no relay bandwidth used) ────────────────
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.relay.metered.ca:80' },
        { urls: 'stun:stun.cloudflare.com:3478' },
        // ── TURN relay (Metered.ca — 20GB/month free) ──────────────────
        {
            urls: 'turn:global.relay.metered.ca:80',
            username: 'eb3c778e8fbe345118663ce5',
            credential: 'YjZY5ZAc2gv2gGru'
        },
        {
            urls: 'turn:global.relay.metered.ca:80?transport=tcp',
            username: 'eb3c778e8fbe345118663ce5',
            credential: 'YjZY5ZAc2gv2gGru'
        },
        {
            urls: 'turn:global.relay.metered.ca:443',
            username: 'eb3c778e8fbe345118663ce5',
            credential: 'YjZY5ZAc2gv2gGru'
        },
        {
            urls: 'turns:global.relay.metered.ca:443?transport=tcp',
            username: 'eb3c778e8fbe345118663ce5',
            credential: 'YjZY5ZAc2gv2gGru'
        }
    ];
    const RING_TIMEOUT_MS = 45000;
    // After a disconnect is detected, wait this long before auto-ending the
    // call — gives the WebRTC engine time to reconnect on its own (e.g. a
    // brief network hiccup). If ICE moves back to 'connected'/'completed'
    // within this window the timer is cancelled.
    const ICE_DISCONNECT_GRACE_MS = 8000;

    let mgrChatId = null;       // currently open chat (for the call buttons)
    let mgrOtherUid = null;
    let mgrSettings = { enableVideoCall: true, maxCallDuration: 60, defaultRingtone: 'messenger/assets/ringtone.mp3' };

    // active-call state
    let mgrPc = null;
    let mgrLocalStream = null;
    let mgrCallId = null;
    let mgrCallRole = null;      // 'caller' | 'callee'
    let mgrCallType = null;      // 'audio' | 'video'
    let mgrCallChatId = null;
    let mgrCallOtherUid = null;
    let mgrCallDocRef = null;
    let mgrCallStatusCb = null;
    let mgrCandidatesRef = null;
    let mgrCandidatesCb = null;
    let mgrRingTimeout = null;
    let mgrTimerInterval = null;
    let mgrCallStartTime = null;
    let mgrMuted = false;
    let mgrCameraOff = false;           // NEW: track camera-muted state
    let mgrIceDisconnectTimer = null;   // NEW: grace-period timer on ICE disconnect

    let mgrIncomingRef = null;
    let mgrIncomingCb = null;
    let mgrHandledCallIds = {};
    let mgrHandledCallOrder = [];   // NEW: insertion-order list for pruning

    // BUGFIX: ICE candidates can arrive over Firebase (via listenRemoteCandidates)
    // before this side has finished setRemoteDescription() — WebRTC throws if
    // addIceCandidate() is called first, and that candidate is then lost forever.
    // These two hold candidates that arrive too early, and flush them once the
    // remote description is actually set.
    let mgrRemoteDescSet = false;
    let mgrPendingRemoteCandidates = [];

    function safeEscape(str) {
        return (typeof escapeHtml === 'function') ? escapeHtml(str) : String(str || '');
    }

    // ============================================
    // Inject call UI once, independent of messenger.html
    // ============================================
    function injectCallUI() {
        if (document.getElementById('callIncomingModal')) return;
        const html = '' +
            '<div id="callIncomingModal" class="call-modal">' +
            '  <img id="callIncomingPhoto" class="call-avatar" src="default-avatar.png" alt="">' +
            '  <h2 id="callIncomingName">User</h2>' +
            '  <p id="callIncomingType" class="call-subtext">Video Call</p>' +
            '  <div class="call-incoming-actions">' +
            '    <button id="callRejectBtn" class="call-action-btn call-reject" title="Decline">✕</button>' +
            '    <button id="callAcceptBtn" class="call-action-btn call-accept" title="Accept">✓</button>' +
            '  </div>' +
            '</div>' +
            '<div id="callOutgoingScreen" class="call-modal">' +
            '  <img id="callOutgoingPhoto" class="call-avatar" src="default-avatar.png" alt="">' +
            '  <h2 id="callOutgoingName">User</h2>' +
            '  <p class="call-subtext">Calling...</p>' +
            '  <div class="call-outgoing-actions">' +
            '    <button id="callCancelBtn" class="call-action-btn call-reject" title="Cancel">✕</button>' +
            '  </div>' +
            '</div>' +
            '<div id="callActiveScreen" class="call-modal">' +
            '  <video id="callRemoteVideo" autoplay playsinline></video>' +
            '  <video id="callLocalVideo" autoplay playsinline muted></video>' +
            '  <img id="callAudioAvatar" class="call-avatar call-audio-avatar" src="default-avatar.png" alt="" style="display:none;">' +
            '  <div class="call-info-bar">' +
            '    <span id="callPeerName"></span>' +
            '    <span id="callTimer">00:00</span>' +
            '    <span id="callStatusLabel" class="call-status-label"></span>' +
            '  </div>' +
            '  <div class="call-controls">' +
            '    <button id="callMuteBtn" class="call-control-btn" title="Mute mic">🎙️</button>' +
            '    <button id="callSpeakerBtn" class="call-control-btn" title="Speaker">🔊</button>' +
            '    <button id="callEndBtn" class="call-control-btn call-end" title="End call">📞</button>' +
            '    <button id="callCameraBtn" class="call-control-btn call-camera-btn" title="Toggle camera" style="display:none;">📹</button>' +
            '  </div>' +
            '</div>' +
            '<audio id="callRingtone" loop></audio>';
        const wrap = document.createElement('div');
        wrap.innerHTML = html;
        while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
        wireCallUI();
        unlockRingtoneOnFirstGesture();
    }

    function wireCallUI() {
        document.getElementById('callAcceptBtn').addEventListener('click', acceptIncomingCall);
        document.getElementById('callRejectBtn').addEventListener('click', function () { endCall('rejected'); });
        document.getElementById('callCancelBtn').addEventListener('click', function () { endCall('cancelled'); });
        document.getElementById('callEndBtn').addEventListener('click', function () { endCall('ended'); });
        document.getElementById('callMuteBtn').addEventListener('click', toggleMute);
        document.getElementById('callSpeakerBtn').addEventListener('click', toggleSpeaker);
        document.getElementById('callCameraBtn').addEventListener('click', toggleCamera);
    }

    // ============================================
    // BUGFIX: mobile browsers block audio.play() from running unless it's
    // triggered by (or shortly follows) a real user gesture — but an
    // incoming call's playRingtone() is triggered passively by a Firebase
    // event, not a tap. play() was silently rejected every time, so the
    // ringtone never played even though the file/settings were correct.
    // Fix: "unlock" the audio element the first time the user taps
    // anywhere on the page (even totally unrelated to calling) by
    // play()-then-pause()-ing it once — most mobile browsers then allow
    // that same element to be played programmatically for the rest of
    // the session, including from passive events like an incoming call.
    // ============================================
    let mgrRingtoneUnlocked = false;
    function unlockRingtoneOnFirstGesture() {
        function unlock() {
            if (mgrRingtoneUnlocked) return;
            const el = document.getElementById('callRingtone');
            if (!el) return;
            const wasMuted = el.muted;
            el.muted = true;
            el.play().then(function () {
                el.pause();
                el.currentTime = 0;
                el.muted = wasMuted;
                mgrRingtoneUnlocked = true;
            }).catch(function () {
                el.muted = wasMuted;
                // still locked — will retry on the next gesture since the listeners aren't removed yet
            });
        }
        document.addEventListener('click', unlock, true);
        document.addEventListener('touchstart', unlock, true);
    }

    // ============================================
    // Settings (settings/messenger — Admin panel ships this later; safe defaults meanwhile)
    // ============================================
    function loadSettings() {
        database.ref('settings/messenger').once('value').then(function (snap) {
            const s = snap.val() || {};
            mgrSettings.enableVideoCall = s.enableVideoCall !== false;
            mgrSettings.maxCallDuration = s.maxCallDuration || 60;
            mgrSettings.defaultRingtone = 'messenger/assets/' + (s.defaultRingtone || 'ringtone.mp3');
            const ringtoneEl = document.getElementById('callRingtone');
            if (ringtoneEl) ringtoneEl.src = mgrSettings.defaultRingtone;
            applyCallButtonVisibility();
        }).catch(function (err) { console.error('Messenger V5-A: settings read failed', err); });
    }

    function applyCallButtonVisibility() {
        const videoBtn = document.getElementById('messengerVideoCallBtn');
        if (videoBtn) videoBtn.style.display = mgrSettings.enableVideoCall ? '' : 'none';
    }

    // ============================================
    // Chat-open tracking (for the call buttons in the header)
    // ============================================
    document.addEventListener('messenger:chatOpen', function (e) {
        mgrChatId = e.detail.chatId;
        mgrOtherUid = e.detail.otherUid;
        applyCallButtonVisibility();
    });
    document.addEventListener('messenger:chatClose', function () {
        mgrChatId = null;
        mgrOtherUid = null;
    });

    // ============================================
    // Global: incoming-call listener (works even without Messenger open)
    // ============================================
    auth.onAuthStateChanged(function (user) {
        if (mgrIncomingRef && mgrIncomingCb) mgrIncomingRef.off('child_added', mgrIncomingCb);
        mgrIncomingRef = null;
        mgrIncomingCb = null;
        mgrHandledCallIds = {};
        mgrHandledCallOrder = [];
        if (!user) return;

        injectCallUI();
        loadSettings();

        mgrIncomingRef = database.ref('calls').orderByChild('calleeUid').equalTo(user.uid);
        mgrIncomingCb = mgrIncomingRef.on('child_added', function (snap) {
            const call = snap.val();
            const callId = snap.key;
            if (!call || mgrHandledCallIds[callId]) return;

            // Mark as handled and prune if the map grows large (memory guard).
            mgrHandledCallIds[callId] = true;
            mgrHandledCallOrder.push(callId);
            if (mgrHandledCallOrder.length > 50) {
                const oldest = mgrHandledCallOrder.shift();
                delete mgrHandledCallIds[oldest];
            }

            if (call.status !== 'ringing') return;
            // ignore stale ringing calls from before this session started
            if (call.createdAt && Date.now() - call.createdAt > RING_TIMEOUT_MS) return;
            if (mgrCallId) return; // already on a call — let it just miss for now
            showIncomingCall(callId, call);
        }, function (err) { console.error('Messenger V5-A: incoming-call listener error', err); });
    });

    // ============================================
    // Starting a call (caller side)
    // ============================================
    function startCall(type) {
        if (!currentUser || !mgrChatId || !mgrOtherUid) return;
        if (mgrCallId) { alert('You are already on a call.'); return; }
        if (type === 'video' && !mgrSettings.enableVideoCall) return;

        const constraints = { audio: true, video: type === 'video' };
        navigator.mediaDevices.getUserMedia(constraints).then(function (stream) {
            // Hook for later versions (V5-B Beauty Filters, etc.) to swap in a
            // processed MediaStream (e.g. canvas-filtered video) instead of the
            // raw camera stream — this file never needs to know the details.
            let localStream = stream;
            if (typeof window.messengerProcessLocalStream === 'function') {
                try { localStream = window.messengerProcessLocalStream(stream, type) || stream; } catch (err) { console.error('Messenger V5-A: local-stream-processing hook error', err); }
            }
            mgrLocalStream = localStream;
            mgrCallRole = 'caller';
            mgrCallType = type;
            mgrCallChatId = mgrChatId;
            mgrCallOtherUid = mgrOtherUid;

            const otherName = (document.getElementById('messengerChatName') || {}).textContent || 'User';
            const otherPhoto = (document.getElementById('messengerChatAvatar') || {}).src || 'default-avatar.png';

            showOutgoingScreen(otherName, otherPhoto);
            setupLocalPreview();

            mgrPc = createPeerConnection();
            localStream.getTracks().forEach(function (track) { mgrPc.addTrack(track, localStream); });

            mgrCallDocRef = database.ref('calls').push();
            mgrCallId = mgrCallDocRef.key;

            mgrPc.onicecandidate = function (e) {
                if (e.candidate) mgrCallDocRef.child('callerCandidates').push(e.candidate.toJSON());
            };

            database.ref('users/' + currentUser.uid).once('value').then(function (mySnap) {
                const myData = mySnap.val() || {};
                const myName = (window.resolveDisplayName && window.resolveDisplayName(currentUser.uid, myData)) || currentUser.displayName || 'User';
                const myPhoto = (myData.profile && myData.profile.photoURL) || 'default-avatar.png';
                return mgrPc.createOffer().then(function (offer) {
                    return mgrPc.setLocalDescription(offer).then(function () {
                        return mgrCallDocRef.set({
                            callerUid: currentUser.uid,
                            calleeUid: mgrOtherUid,
                            callerName: myName,
                            callerPhoto: myPhoto,
                            chatId: mgrChatId,
                            type: type,
                            createdAt: Date.now(),
                            offer: { type: offer.type, sdp: offer.sdp },
                            status: 'ringing'
                        });
                    });
                });
            }).catch(function (err) {
                console.error('Messenger V5-A: failed to create offer', err);
                cleanupCall();
            });

            mgrCallStatusCb = mgrCallDocRef.on('value', function (snap) {
                const call = snap.val();
                if (!call) return;
                if (call.answer && mgrPc && !mgrPc.currentRemoteDescription) {
                    mgrPc.setRemoteDescription(new RTCSessionDescription(call.answer)).then(function () {
                        flushPendingCandidates();
                    }).catch(function (err) {
                        console.error('Messenger V5-A: setRemoteDescription (answer) failed', err);
                    });
                }
                if (call.status === 'active' && !mgrCallStartTime) {
                    beginActiveCallUI();
                } else if (call.status === 'rejected') {
                    postCallSystemMessage('📞 Call declined');
                    cleanupCall();
                } else if (call.status === 'ended') {
                    cleanupCall();
                }
            });

            listenRemoteCandidates('calleeCandidates');

            mgrRingTimeout = setTimeout(function () {
                if (mgrCallId && !mgrCallStartTime) {
                    mgrCallDocRef.update({ status: 'missed' });
                    postCallSystemMessage('📞 Missed ' + (type === 'video' ? 'video ' : '') + 'call · no answer');
                    cleanupCall();
                }
            }, RING_TIMEOUT_MS);
        }).catch(function (err) {
            console.error('Messenger V5-A: getUserMedia failed', err);
            alert('Could not access camera/microphone. Please allow permission and try again.');
        });
    }

    // ============================================
    // Incoming call (callee side)
    // ============================================
    function showIncomingCall(callId, call) {
        mgrCallId = callId;
        mgrCallRole = 'callee';
        mgrCallType = call.type;
        mgrCallChatId = call.chatId;
        mgrCallOtherUid = call.callerUid;
        mgrCallDocRef = database.ref('calls/' + callId);

        document.getElementById('callIncomingPhoto').src = call.callerPhoto || 'default-avatar.png';
        document.getElementById('callIncomingName').textContent = call.callerName || 'User';
        document.getElementById('callIncomingType').textContent = call.type === 'video' ? 'Video Call' : 'Audio Call';
        document.getElementById('callIncomingModal').classList.add('active');
        playRingtone();

        mgrCallStatusCb = mgrCallDocRef.on('value', function (snap) {
            const c = snap.val();
            if (!c) { cleanupCall(); return; }
            // BUGFIX: this was missing 'missed' — when the caller's ring timeout
            // fires (no answer within RING_TIMEOUT_MS), it sets status:'missed'
            // and cleans up on its own side, but the callee's incoming-call
            // screen + ringtone never went away because this check didn't
            // include 'missed'. It would sit ringing indefinitely.
            if (c.status === 'cancelled' || c.status === 'ended' || c.status === 'missed') cleanupCall();
        });
    }

    function acceptIncomingCall() {
        // BUGFIX (race condition): the caller might have cancelled while the user
        // was looking at the incoming screen. Re-read the call status right now
        // before doing getUserMedia — avoids holding the camera/mic open for a
        // call that's already dead.
        if (!mgrCallDocRef || !mgrCallId) return;
        mgrCallDocRef.once('value').then(function (snap) {
            const c = snap.val();
            if (!c || c.status !== 'ringing') {
                // Call was cancelled/ended — clean up the ringing UI and stop.
                cleanupCall();
                return;
            }
            proceedToAccept(c);
        }).catch(function (err) {
            console.error('Messenger V5-A: pre-accept status check failed', err);
            cleanupCall();
        });
    }

    function proceedToAccept(callSnap) {
        stopRingtone();
        document.getElementById('callIncomingModal').classList.remove('active');
        const constraints = { audio: true, video: mgrCallType === 'video' };

        navigator.mediaDevices.getUserMedia(constraints).then(function (stream) {
            let localStream = stream;
            if (typeof window.messengerProcessLocalStream === 'function') {
                try { localStream = window.messengerProcessLocalStream(stream, mgrCallType) || stream; } catch (err) { console.error('Messenger V5-A: local-stream-processing hook error', err); }
            }
            mgrLocalStream = localStream;
            setupLocalPreview();
            mgrPc = createPeerConnection();
            localStream.getTracks().forEach(function (track) { mgrPc.addTrack(track, localStream); });

            mgrPc.onicecandidate = function (e) {
                if (e.candidate) mgrCallDocRef.child('calleeCandidates').push(e.candidate.toJSON());
            };

            // Use the already-fetched snapshot when possible; re-fetch if not provided.
            const offerData = callSnap && callSnap.offer ? Promise.resolve(callSnap) : mgrCallDocRef.once('value').then(function (s) { return s.val(); });
            Promise.resolve(offerData).then(function (call) {
                if (!call || !call.offer) throw new Error('offer missing');
                return mgrPc.setRemoteDescription(new RTCSessionDescription(call.offer))
                    .then(function () { flushPendingCandidates(); return mgrPc.createAnswer(); })
                    .then(function (answer) { return mgrPc.setLocalDescription(answer).then(function () { return answer; }); })
                    .then(function (answer) {
                        return mgrCallDocRef.update({
                            answer: { type: answer.type, sdp: answer.sdp },
                            status: 'active',
                            startTime: Date.now()
                        });
                    });
            }).then(function () {
                beginActiveCallUI();
            }).catch(function (err) {
                console.error('Messenger V5-A: accept call failed', err);
                cleanupCall();
            });

            listenRemoteCandidates('callerCandidates');
        }).catch(function (err) {
            console.error('Messenger V5-A: getUserMedia (callee) failed', err);
            alert('Could not access camera/microphone. Please allow permission and try again.');
            mgrCallDocRef.update({ status: 'rejected' });
            cleanupCall();
        });
    }

    // ============================================
    // Shared peer-connection / signaling helpers
    // ============================================
    function createPeerConnection() {
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

        pc.ontrack = function (e) {
            const remoteVideo = document.getElementById('callRemoteVideo');
            if (remoteVideo && (!remoteVideo.srcObject || remoteVideo.srcObject !== e.streams[0])) {
                remoteVideo.srcObject = e.streams[0];
            }
        };

        // NEW: monitor ICE connection health so drops and disconnects are surfaced.
        pc.oniceconnectionstatechange = function () {
            if (!mgrCallId) return; // call already ended
            const state = pc.iceConnectionState;
            const label = document.getElementById('callStatusLabel');

            if (state === 'disconnected') {
                // Disconnected can be transient (e.g. brief network hiccup).
                // Show a "Reconnecting…" notice and wait up to ICE_DISCONNECT_GRACE_MS
                // before giving up and ending the call.
                if (label) label.textContent = 'Reconnecting…';
                mgrIceDisconnectTimer = setTimeout(function () {
                    if (mgrCallId && mgrPc && mgrPc.iceConnectionState !== 'connected' && mgrPc.iceConnectionState !== 'completed') {
                        postCallSystemMessage('📞 Call ended · connection lost');
                        endCall('ended');
                    }
                }, ICE_DISCONNECT_GRACE_MS);

            } else if (state === 'failed') {
                // 'failed' is unrecoverable without an ICE restart — end the call.
                clearTimeout(mgrIceDisconnectTimer);
                if (label) label.textContent = 'Connection failed';
                postCallSystemMessage('📞 Call ended · connection failed');
                endCall('ended');

            } else if (state === 'connected' || state === 'completed') {
                // Connection (re)established — clear any pending disconnect timer.
                clearTimeout(mgrIceDisconnectTimer);
                mgrIceDisconnectTimer = null;
                if (label) label.textContent = '';

            } else if (state === 'closed') {
                clearTimeout(mgrIceDisconnectTimer);
            }
        };

        return pc;
    }

    function listenRemoteCandidates(childName) {
        mgrCandidatesRef = mgrCallDocRef.child(childName);
        mgrCandidatesCb = mgrCandidatesRef.on('child_added', function (snap) {
            if (!mgrPc) return;
            // BUGFIX: candidates can (and often do) arrive from Firebase before
            // this side has called setRemoteDescription() — e.g. the other
            // party's host candidates are usually ready before the offer/answer
            // round-trip finishes. Calling addIceCandidate() before the remote
            // description is set throws and silently drops the candidate,
            // which was causing calls to fail to connect intermittently. Queue
            // early candidates and flush them via flushPendingCandidates()
            // right after setRemoteDescription() resolves.
            if (mgrRemoteDescSet) {
                mgrPc.addIceCandidate(new RTCIceCandidate(snap.val())).catch(function (err) {
                    console.error('Messenger V5-A: addIceCandidate failed', err);
                });
            } else {
                mgrPendingRemoteCandidates.push(snap.val());
            }
        });
    }

    function flushPendingCandidates() {
        mgrRemoteDescSet = true;
        if (!mgrPc || !mgrPendingRemoteCandidates.length) return;
        mgrPendingRemoteCandidates.forEach(function (c) {
            mgrPc.addIceCandidate(new RTCIceCandidate(c)).catch(function (err) {
                console.error('Messenger V5-A: addIceCandidate (queued) failed', err);
            });
        });
        mgrPendingRemoteCandidates = [];
    }

    function setupLocalPreview() {
        const localVideo = document.getElementById('callLocalVideo');
        if (localVideo) localVideo.srcObject = mgrLocalStream;
    }

    // ============================================
    // Screens
    // ============================================
    function showOutgoingScreen(name, photo) {
        document.getElementById('callOutgoingPhoto').src = photo || 'default-avatar.png';
        document.getElementById('callOutgoingName').textContent = name;
        document.getElementById('callOutgoingScreen').classList.add('active');
    }

    function beginActiveCallUI() {
        document.getElementById('callOutgoingScreen').classList.remove('active');
        document.getElementById('callIncomingModal').classList.remove('active');
        stopRingtone();

        const isVideo = mgrCallType === 'video';
        document.getElementById('callLocalVideo').style.display = isVideo ? 'block' : 'none';
        document.getElementById('callRemoteVideo').style.display = isVideo ? 'block' : 'none';
        const avatarEl = document.getElementById('callAudioAvatar');
        avatarEl.style.display = isVideo ? 'none' : 'block';
        avatarEl.src = (mgrCallRole === 'caller'
            ? document.getElementById('callOutgoingPhoto').src
            : document.getElementById('callIncomingPhoto').src) || 'default-avatar.png';

        document.getElementById('callPeerName').textContent = (mgrCallRole === 'caller'
            ? document.getElementById('callOutgoingName').textContent
            : document.getElementById('callIncomingName').textContent);

        // Show camera toggle only for video calls
        const cameraBtn = document.getElementById('callCameraBtn');
        if (cameraBtn) cameraBtn.style.display = isVideo ? '' : 'none';

        document.getElementById('callActiveScreen').classList.add('active');
        mgrCallStartTime = Date.now();
        clearTimeout(mgrRingTimeout);
        startCallTimer();
    }

    function startCallTimer() {
        clearInterval(mgrTimerInterval);
        mgrTimerInterval = setInterval(function () {
            const secs = Math.floor((Date.now() - mgrCallStartTime) / 1000);
            const m = Math.floor(secs / 60);
            const s = secs % 60;
            const el = document.getElementById('callTimer');
            if (el) el.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
            if (secs / 60 >= mgrSettings.maxCallDuration) endCall('ended');
        }, 1000);
    }

    // ============================================
    // Speaker (loudspeaker) toggle
    // ============================================
    // NOTE ON MOBILE SUPPORT: browsers don't give web pages control over
    // which physical audio route (earpiece vs loudspeaker) a phone uses —
    // that's an OS-level decision. setSinkId() (used here) only lets us
    // pick between output DEVICES the browser exposes (e.g. "Speaker" vs
    // a paired Bluetooth headset on desktop Chrome / some Android Chrome
    // versions) — it does NOT exist on iOS Safari or older Android
    // WebViews. Where it isn't supported we still toggle the button state
    // and volume so the UI is never silently broken, and most mobile
    // browsers already default video calls to loudspeaker automatically.
    let mgrSpeakerOn = true;
    function toggleSpeaker() {
        const remoteVideo = document.getElementById('callRemoteVideo');
        if (!remoteVideo) return;
        mgrSpeakerOn = !mgrSpeakerOn;
        const btn = document.getElementById('callSpeakerBtn');
        if (btn) {
            btn.classList.toggle('active', !mgrSpeakerOn);
            btn.textContent = mgrSpeakerOn ? '🔊' : '🔈';
            btn.title = mgrSpeakerOn ? 'Speaker on' : 'Speaker off';
        }
        if (typeof remoteVideo.setSinkId === 'function') {
            navigator.mediaDevices.enumerateDevices().then(function (devices) {
                const outputs = devices.filter(function (d) { return d.kind === 'audiooutput'; });
                if (!outputs.length) return;
                const target = mgrSpeakerOn
                    ? outputs.find(function (d) { return /speaker/i.test(d.label); }) || outputs[0]
                    : outputs.find(function (d) { return /earpiece|receiver/i.test(d.label); }) || outputs[0];
                remoteVideo.setSinkId(target.deviceId).catch(function () {});
            }).catch(function () {});
        }
    }

    // ============================================
    // Mute mic
    // ============================================
    function toggleMute() {
        if (!mgrLocalStream) return;
        mgrMuted = !mgrMuted;
        mgrLocalStream.getAudioTracks().forEach(function (t) { t.enabled = !mgrMuted; });
        const btn = document.getElementById('callMuteBtn');
        if (btn) {
            btn.classList.toggle('active', mgrMuted);
            btn.textContent = mgrMuted ? '🔇' : '🎙️';
            btn.title = mgrMuted ? 'Unmute mic' : 'Mute mic';
        }
    }

    // ============================================
    // NEW: Toggle camera on/off during a video call
    // Disables/re-enables the video track in-place so the remote side
    // sees a frozen or black frame (no re-negotiation needed).
    // ============================================
    function toggleCamera() {
        if (!mgrLocalStream || mgrCallType !== 'video') return;
        mgrCameraOff = !mgrCameraOff;
        mgrLocalStream.getVideoTracks().forEach(function (t) { t.enabled = !mgrCameraOff; });
        const btn = document.getElementById('callCameraBtn');
        const localVideo = document.getElementById('callLocalVideo');
        if (btn) {
            btn.classList.toggle('active', mgrCameraOff);
            btn.title = mgrCameraOff ? 'Turn camera on' : 'Turn camera off';
            btn.textContent = mgrCameraOff ? '🚫' : '📹';
        }
        // Dim the local preview when camera is off so the user gets clear feedback.
        if (localVideo) localVideo.style.opacity = mgrCameraOff ? '0.3' : '1';
    }

    // ============================================
    // Ringtone
    // ============================================
    function playRingtone() {
        const el = document.getElementById('callRingtone');
        if (!el) return;
        el.volume = 1;
        el.currentTime = 0;
        el.play().catch(function (err) {
            console.warn('Messenger V5-A: ringtone blocked by browser autoplay policy (needs one prior tap on the page this session)', err);
        });
    }
    function stopRingtone() {
        const el = document.getElementById('callRingtone');
        if (el) { el.pause(); el.currentTime = 0; }
    }

    // ============================================
    // Ending / cleaning up a call
    // ============================================
    function endCall(reason) {
        if (!mgrCallId) return;
        const wasActive = !!mgrCallStartTime;
        const durationSec = wasActive ? Math.floor((Date.now() - mgrCallStartTime) / 1000) : 0;

        if (mgrCallDocRef) {
            if (reason === 'ended' && wasActive) {
                mgrCallDocRef.update({ status: 'ended', endTime: Date.now() });
            } else if (reason === 'rejected') {
                mgrCallDocRef.update({ status: 'rejected' });
            } else if (reason === 'cancelled') {
                mgrCallDocRef.update({ status: 'cancelled' });
            } else {
                mgrCallDocRef.update({ status: 'ended', endTime: Date.now() });
            }
        }

        if (reason === 'ended' && wasActive) {
            const mins = Math.max(1, Math.round(durationSec / 60));
            postCallSystemMessage('📞 ' + (mgrCallType === 'video' ? 'Video call' : 'Call') + ' ended · ' + mins + ' min');
        } else if (reason === 'cancelled') {
            postCallSystemMessage('📞 Call cancelled');
        }

        cleanupCall();
    }

    function postCallSystemMessage(text) {
        if (!mgrCallChatId || !currentUser) return;
        const now = Date.now();
        database.ref('messages/private/' + mgrCallChatId).push({
            uid: currentUser.uid,
            text: text,
            timestamp: now,
            read: false
        });
        database.ref('users/' + currentUser.uid + '/chats/' + mgrCallChatId).update({ lastMessage: text, lastTimestamp: now });
        if (mgrCallOtherUid) {
            database.ref('users/' + mgrCallOtherUid + '/chats/' + mgrCallChatId).update({ lastMessage: text, lastTimestamp: now });
        }
    }

    function cleanupCall() {
        clearTimeout(mgrRingTimeout);
        clearTimeout(mgrIceDisconnectTimer);   // NEW: clear ICE disconnect grace timer
        clearInterval(mgrTimerInterval);
        stopRingtone();

        if (mgrCallDocRef && mgrCallStatusCb) mgrCallDocRef.off('value', mgrCallStatusCb);
        if (mgrCandidatesRef && mgrCandidatesCb) mgrCandidatesRef.off('child_added', mgrCandidatesCb);
        mgrCallStatusCb = null;
        mgrCandidatesRef = null;
        mgrCandidatesCb = null;
        mgrIceDisconnectTimer = null;

        if (mgrPc) { try { mgrPc.close(); } catch (e) { /* ignore */ } }
        mgrPc = null;
        if (mgrLocalStream) mgrLocalStream.getTracks().forEach(function (t) { t.stop(); });
        mgrLocalStream = null;
        // Hook counterpart to messengerProcessLocalStream — lets a version that
        // swapped in a processed stream (e.g. a canvas-filtered one) release
        // whatever raw resources it kept alive behind the scenes.
        if (typeof window.messengerCleanupLocalStreamProcessing === 'function') {
            try { window.messengerCleanupLocalStreamProcessing(); } catch (err) { console.error('Messenger V5-A: local-stream-cleanup hook error', err); }
        }

        document.getElementById('callIncomingModal').classList.remove('active');
        document.getElementById('callOutgoingScreen').classList.remove('active');
        document.getElementById('callActiveScreen').classList.remove('active');
        const localVideo = document.getElementById('callLocalVideo');
        const remoteVideo = document.getElementById('callRemoteVideo');
        if (localVideo) { localVideo.srcObject = null; localVideo.style.opacity = '1'; }
        if (remoteVideo) remoteVideo.srcObject = null;

        // BUGFIX: null-check before accessing callTimer — if cleanupCall() is
        // called before injectCallUI() has run (unlikely but possible on very
        // fast call abort), this would throw a TypeError.
        const timerEl = document.getElementById('callTimer');
        if (timerEl) timerEl.textContent = '00:00';
        const statusLabel = document.getElementById('callStatusLabel');
        if (statusLabel) statusLabel.textContent = '';

        // Reset camera toggle button state
        const cameraBtn = document.getElementById('callCameraBtn');
        if (cameraBtn) { cameraBtn.classList.remove('active'); cameraBtn.textContent = '📹'; cameraBtn.style.display = 'none'; }

        mgrCallId = null;
        mgrCallRole = null;
        mgrCallType = null;
        mgrCallChatId = null;
        mgrCallOtherUid = null;
        mgrCallDocRef = null;
        mgrCallStartTime = null;
        mgrMuted = false;
        mgrCameraOff = false;
        mgrRemoteDescSet = false;
        mgrPendingRemoteCandidates = [];
        const muteBtn = document.getElementById('callMuteBtn');
        if (muteBtn) { muteBtn.classList.remove('active'); muteBtn.textContent = '🎙️'; }
        mgrSpeakerOn = true;
        const speakerBtn = document.getElementById('callSpeakerBtn');
        if (speakerBtn) { speakerBtn.classList.remove('active'); speakerBtn.textContent = '🔊'; }
    }

    // ============================================
    // Wire the header call buttons once messenger.html exists
    // ============================================
    let mgrHeaderWired = false;
    document.addEventListener('messenger:chatOpen', function () {
        if (mgrHeaderWired) return;
        mgrHeaderWired = true;
        document.getElementById('messengerAudioCallBtn').addEventListener('click', function () { startCall('audio'); });
        document.getElementById('messengerVideoCallBtn').addEventListener('click', function () { startCall('video'); });
    });
})();
