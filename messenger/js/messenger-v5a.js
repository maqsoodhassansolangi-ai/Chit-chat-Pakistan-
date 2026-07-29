// ============================================
// ChitChat Pakistan — Messenger V5-A: WebRTC Call Core
// ============================================
// Self-contained: does NOT modify app.js. The call UI (incoming/outgoing/
// active screens) is injected into <body> directly by THIS file's JS
// (not fetched from messenger.html) — a call must be receivable even if
// the person has never opened Messenger yet. It's still styled from
// messenger.css, which always loads on page load regardless.
//
// ICE: free public Google STUN only (stun:stun.l.google.com:19302), no
// account/API key needed, per the master spec. NOTE for later: pure STUN
// won't connect 100% of the time behind strict/symmetric NATs (e.g. some
// mobile carriers) — a TURN relay fixes that but needs a paid or
// signed-up TURN provider. Not required to ship V5-A; flagging so it's
// a known, deliberate scope boundary, not a bug if a rare call fails to
// connect.
//
// Assumption made beyond the letter of the spec: the spec's bullet only
// shows a 📹 Video Call button, but the section is titled "Audio + Video
// Call" — so this adds BOTH a 📞 audio-call and a 📹 video-call button.
//
// DB (calls/{callId}, auto-push id):
//   callerUid, calleeUid, callerName, callerPhoto, chatId, type:'audio'|'video',
//   createdAt, offer:{type,sdp}, answer:{type,sdp}?, status:'ringing'|'active'|
//   'ended'|'rejected'|'missed'|'cancelled', startTime?, endTime?,
//   callerCandidates/{pushId}, calleeCandidates/{pushId}
// Needs a .indexOn:["calleeUid"] hint under calls/ (works without it, just
// less efficient) — to be added in the later full-rules-merge session.
// ============================================
(function () {
    'use strict';

    const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
    const RING_TIMEOUT_MS = 45000;

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

    let mgrIncomingRef = null;
    let mgrIncomingCb = null;
    let mgrHandledCallIds = {};

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
            '  <div class="call-info-bar"><span id="callPeerName"></span><span id="callTimer">00:00</span></div>' +
            '  <div class="call-controls">' +
            '    <button id="callMuteBtn" class="call-control-btn" title="Mute">🎙️</button>' +
            '    <button id="callEndBtn" class="call-control-btn call-end" title="End call">📞</button>' +
            '  </div>' +
            '</div>' +
            '<audio id="callRingtone" loop></audio>';
        const wrap = document.createElement('div');
        wrap.innerHTML = html;
        while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
        wireCallUI();
    }

    function wireCallUI() {
        document.getElementById('callAcceptBtn').addEventListener('click', acceptIncomingCall);
        document.getElementById('callRejectBtn').addEventListener('click', function () { endCall('rejected'); });
        document.getElementById('callCancelBtn').addEventListener('click', function () { endCall('cancelled'); });
        document.getElementById('callEndBtn').addEventListener('click', function () { endCall('ended'); });
        document.getElementById('callMuteBtn').addEventListener('click', toggleMute);
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
        if (!user) return;

        injectCallUI();
        loadSettings();

        mgrIncomingRef = database.ref('calls').orderByChild('calleeUid').equalTo(user.uid);
        mgrIncomingCb = mgrIncomingRef.on('child_added', function (snap) {
            const call = snap.val();
            const callId = snap.key;
            if (!call || mgrHandledCallIds[callId]) return;
            mgrHandledCallIds[callId] = true;
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

            database.ref('users/' + currentUser.uid + '/profile').once('value').then(function (mySnap) {
                const myProfile = mySnap.val() || {};
                const myName = myProfile.displayName || currentUser.displayName || 'User';
                const myPhoto = myProfile.photoURL || 'default-avatar.png';
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
                    mgrPc.setRemoteDescription(new RTCSessionDescription(call.answer)).catch(function (err) {
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
            if (c.status === 'cancelled' || c.status === 'ended') cleanupCall();
        });
    }

    function acceptIncomingCall() {
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

            mgrCallDocRef.once('value').then(function (snap) {
                const call = snap.val();
                if (!call || !call.offer) throw new Error('offer missing');
                return mgrPc.setRemoteDescription(new RTCSessionDescription(call.offer))
                    .then(function () { return mgrPc.createAnswer(); })
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
        return pc;
    }

    function listenRemoteCandidates(childName) {
        mgrCandidatesRef = mgrCallDocRef.child(childName);
        mgrCandidatesCb = mgrCandidatesRef.on('child_added', function (snap) {
            if (mgrPc) {
                mgrPc.addIceCandidate(new RTCIceCandidate(snap.val())).catch(function (err) {
                    console.error('Messenger V5-A: addIceCandidate failed', err);
                });
            }
        });
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
    // Mute
    // ============================================
    function toggleMute() {
        if (!mgrLocalStream) return;
        mgrMuted = !mgrMuted;
        mgrLocalStream.getAudioTracks().forEach(function (t) { t.enabled = !mgrMuted; });
        const btn = document.getElementById('callMuteBtn');
        if (btn) {
            btn.classList.toggle('active', mgrMuted);
            btn.textContent = mgrMuted ? '🔇' : '🎙️';
        }
    }

    // ============================================
    // Ringtone
    // ============================================
    function playRingtone() {
        const el = document.getElementById('callRingtone');
        if (el) el.play().catch(function () { /* autoplay may be blocked until user gesture — harmless */ });
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
        clearInterval(mgrTimerInterval);
        stopRingtone();

        if (mgrCallDocRef && mgrCallStatusCb) mgrCallDocRef.off('value', mgrCallStatusCb);
        if (mgrCandidatesRef && mgrCandidatesCb) mgrCandidatesRef.off('child_added', mgrCandidatesCb);
        mgrCallStatusCb = null;
        mgrCandidatesRef = null;
        mgrCandidatesCb = null;

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
        if (localVideo) localVideo.srcObject = null;
        if (remoteVideo) remoteVideo.srcObject = null;
        document.getElementById('callTimer').textContent = '00:00';

        mgrCallId = null;
        mgrCallRole = null;
        mgrCallType = null;
        mgrCallChatId = null;
        mgrCallOtherUid = null;
        mgrCallDocRef = null;
        mgrCallStartTime = null;
        mgrMuted = false;
        const muteBtn = document.getElementById('callMuteBtn');
        if (muteBtn) { muteBtn.classList.remove('active'); muteBtn.textContent = '🎙️'; }
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
