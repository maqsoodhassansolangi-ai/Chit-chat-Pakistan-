// ============================================
// ChitChat Pakistan — Messenger V4-B: Media (Image/Video/Voice/Location)
// ============================================
// Self-contained: does NOT modify app.js. Reuses app.js's EXISTING global
// uploadToCloudinary(file, resourceType) — the same helper Room chat
// attachments already use — so no new upload code / no new Cloudinary
// config is introduced here.
//
// Sends its own messages (bypassing V1's text-only sendMessage(), same
// pattern V3-B's Forward already used) since these aren't typed text:
// mirrors the same lastMessage/lastTimestamp/unreadCount bookkeeping so
// the inbox preview stays correct (e.g. "📷 Photo" instead of raw url).
//
// DB additions (V4-B), all under messages/private/{chatId}/{msgKey}:
//   type: 'image' | 'video' | 'voice' | 'location'
//   url: <Cloudinary secure_url>                     (image/video/voice)
//   duration: <seconds>                               (voice only)
//   url: <Google Maps link>                            (location)
// ============================================
(function () {
    'use strict';

    let mgrChatId = null;
    let mgrOtherUid = null;
    let mgrMessages = {};
    let mgrAddedRef = null;
    let mgrAddedCallback = null;
    let mgrV4bWired = false;

    // voice recording state
    let mgrMediaRecorder = null;
    let mgrRecordedChunks = [];
    let mgrRecordStartTime = 0;
    let mgrRecordTimerInterval = null;
    let mgrRecordStream = null;
    let mgrRecordLocked = false;      // slid up past the lock threshold — finger can be released
    let mgrRecordCancelled = false;   // slid left past the cancel threshold, or trash tapped
    let mgrRecordStartX = 0;
    let mgrRecordStartY = 0;
    let mgrRecordPointerActive = false;
    const LOCK_THRESHOLD_PX = 80;   // drag up this far to lock
    const CANCEL_THRESHOLD_PX = 100; // drag left this far to cancel

    // ============================================
    // Lifecycle
    // ============================================
    document.addEventListener('messenger:chatOpen', function (e) {
        resetState();
        wireV4bUIOnce();
        mgrChatId = e.detail.chatId;
        mgrOtherUid = e.detail.otherUid;
        listenMessages();
    });

    document.addEventListener('messenger:chatClose', function () {
        resetState();
    });

    function resetState() {
        if (mgrAddedRef && mgrAddedCallback) mgrAddedRef.off('child_added', mgrAddedCallback);
        mgrAddedRef = null;
        mgrAddedCallback = null;
        mgrChatId = null;
        mgrOtherUid = null;
        mgrMessages = {};
        cancelRecording();
    }

    // ============================================
    // Bubble decoration for media messages
    // ============================================
    function listenMessages() {
        const ref = database.ref('messages/private/' + mgrChatId);
        mgrAddedRef = ref;
        mgrAddedCallback = ref.on('child_added', function (snap) {
            mgrMessages[snap.key] = snap.val();
            decorateBubbleWhenReady(snap.key);
        }, function (err) { console.error('Messenger V4-B: message listener error', err); });
    }

    function decorateBubbleWhenReady(key, attempt) {
        attempt = attempt || 0;
        const msgsEl = document.getElementById('messengerChatMessages');
        const el = msgsEl && msgsEl.querySelector('[data-msg-key="' + key + '"]');
        if (!el) {
            if (attempt < 10) setTimeout(function () { decorateBubbleWhenReady(key, attempt + 1); }, 50);
            return;
        }
        if (el.dataset.v4bWired) return;
        el.dataset.v4bWired = '1';
        const msg = mgrMessages[key];
        if (!msg || !msg.type || msg.type === 'text') return;

        let mediaEl = null;
        if (msg.type === 'image') {
            mediaEl = document.createElement('img');
            mediaEl.className = 'messenger-media-image';
            mediaEl.src = msg.url;
            mediaEl.alt = 'Photo';
            mediaEl.addEventListener('click', function () { openMediaViewer(msg.url); });
        } else if (msg.type === 'video') {
            mediaEl = document.createElement('video');
            mediaEl.className = 'messenger-media-video';
            mediaEl.src = msg.url;
            mediaEl.controls = true;
        } else if (msg.type === 'voice') {
            mediaEl = document.createElement('audio');
            mediaEl.className = 'messenger-media-voice';
            mediaEl.src = msg.url;
            mediaEl.controls = true;
        } else if (msg.type === 'location') {
            mediaEl = document.createElement('a');
            mediaEl.className = 'messenger-media-location';
            mediaEl.href = msg.url;
            mediaEl.target = '_blank';
            mediaEl.rel = 'noopener';
            mediaEl.innerHTML = '📍 <span>Location shared — tap to view</span>';
        }
        if (mediaEl) el.insertBefore(mediaEl, el.firstChild);
    }

    function openMediaViewer(url) {
        const viewer = document.getElementById('messengerMediaViewer');
        const img = document.getElementById('messengerMediaViewerImg');
        if (!viewer || !img) return;
        img.src = url;
        viewer.classList.add('active');
    }

    function closeMediaViewer() {
        const viewer = document.getElementById('messengerMediaViewer');
        if (viewer) viewer.classList.remove('active');
    }

    // ============================================
    // Sending a media message (own send path, same bookkeeping as V1/V3-B)
    // ============================================
    function sendMediaMessage(fields, previewText) {
        if (!mgrChatId || !currentUser) return;
        const chatId = mgrChatId;
        const otherUid = mgrOtherUid;
        const now = Date.now();
        const msgData = Object.assign({ uid: currentUser.uid, text: '', timestamp: now, read: false }, fields);

        database.ref('messages/private/' + chatId).push(msgData).then(function () {
            database.ref('users/' + currentUser.uid + '/chats/' + chatId).update({
                lastMessage: previewText,
                lastTimestamp: now
            });
            if (otherUid) {
                const theirRef = database.ref('users/' + otherUid + '/chats/' + chatId);
                theirRef.update({ lastMessage: previewText, lastTimestamp: now });
                theirRef.child('unreadCount').transaction(function (v) { return (v || 0) + 1; });
            }
        }).catch(function (err) {
            console.error('Messenger V4-B: failed to send media message', err);
            alert('Could not send. Please try again.');
        });
    }

    // ============================================
    // Image / Video attach
    // ============================================
    const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB, generous unsigned-upload sanity cap

    function handleFileSelected(file) {
        if (!file) return;
        if (file.size > MAX_FILE_BYTES) {
            alert('File is too large. Please choose something under 15MB.');
            return;
        }
        const isVideo = file.type.startsWith('video/');
        const input = document.getElementById('messengerMsgInput');
        const originalPlaceholder = input.placeholder;
        input.placeholder = 'Uploading...';
        input.disabled = true;

        uploadToCloudinary(file, 'auto').then(function (url) {
            sendMediaMessage(
                { type: isVideo ? 'video' : 'image', url: url },
                isVideo ? '🎥 Video' : '📷 Photo'
            );
        }).catch(function (err) {
            console.error('Messenger V4-B: upload failed', err);
            alert('Upload failed. Please check your connection and try again.');
        }).finally(function () {
            input.placeholder = originalPlaceholder;
            input.disabled = false;
        });
    }

    // ============================================
    // Voice recording — WhatsApp-style press/hold/slide gesture
    // ============================================
    function startRecording() {
        if (mgrMediaRecorder || !mgrChatId) return;
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert('Voice recording is not supported on this device/browser.');
            return;
        }
        mgrRecordLocked = false;
        mgrRecordCancelled = false;
        navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
            if (!mgrRecordPointerActive) { stream.getTracks().forEach(function (t) { t.stop(); }); return; } // released before mic permission resolved
            mgrRecordStream = stream;
            mgrRecordedChunks = [];
            mgrMediaRecorder = new MediaRecorder(stream);
            mgrMediaRecorder.ondataavailable = function (e) { if (e.data && e.data.size > 0) mgrRecordedChunks.push(e.data); };
            mgrMediaRecorder.onstop = onRecordingStopped;
            mgrMediaRecorder.start();
            mgrRecordStartTime = Date.now();
            showRecordingBar();
        }).catch(function (err) {
            console.error('Messenger V4-B: mic access failed', err);
            alert('Could not access the microphone. Please allow microphone permission.');
        });
    }

    // Called on finger/mouse release. If locked, recording keeps going
    // (the locked bar has its own Send/Delete buttons instead).
    function finishPressHold() {
        mgrRecordPointerActive = false;
        if (mgrRecordLocked) return; // stays recording — locked bar controls it now
        if (mgrRecordCancelled) { cancelRecording(); return; }
        stopAndSend();
    }

    function stopAndSend() {
        if (mgrMediaRecorder && mgrMediaRecorder.state !== 'inactive') {
            mgrMediaRecorder.stop();
        }
        hideRecordingUI();
    }

    function cancelRecording() {
        if (mgrMediaRecorder && mgrMediaRecorder.state !== 'inactive') {
            mgrMediaRecorder.onstop = null; // discard, don't upload
            mgrMediaRecorder.stop();
        }
        if (mgrRecordStream) mgrRecordStream.getTracks().forEach(function (t) { t.stop(); });
        mgrMediaRecorder = null;
        mgrRecordStream = null;
        mgrRecordedChunks = [];
        hideRecordingUI();
    }

    function onRecordingStopped() {
        const durationSec = Math.round((Date.now() - mgrRecordStartTime) / 1000);
        const chunks = mgrRecordedChunks;
        if (mgrRecordStream) mgrRecordStream.getTracks().forEach(function (t) { t.stop(); });
        mgrMediaRecorder = null;
        mgrRecordStream = null;
        mgrRecordedChunks = [];

        if (durationSec < 1 || !chunks.length) return; // too short / accidental tap
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const file = new File([blob], 'voice-' + Date.now() + '.webm', { type: 'audio/webm' });

        uploadToCloudinary(file, 'auto').then(function (url) {
            sendMediaMessage({ type: 'voice', url: url, duration: durationSec }, '🎤 Voice message');
        }).catch(function (err) {
            console.error('Messenger V4-B: voice upload failed', err);
            alert('Could not send the voice message. Please try again.');
        });
    }

    // ---- UI state: input bar -> recording bar -> (optionally) locked bar ----
    function showRecordingBar() {
        document.getElementById('messengerInputBar').style.display = 'none';
        const bar = document.getElementById('messengerRecordingBar');
        bar.style.display = 'flex';
        bar.style.transform = '';
        document.getElementById('messengerSlideCancelHint').style.opacity = '1';
        document.getElementById('messengerRecordLock').style.transform = '';
        updateRecordingTimer('messengerRecordingTimer');
        mgrRecordTimerInterval = setInterval(function () {
            updateRecordingTimer('messengerRecordingTimer');
            updateRecordingTimer('messengerLockedTimer');
        }, 500);
    }

    function showLockedBar() {
        document.getElementById('messengerRecordingBar').style.display = 'none';
        document.getElementById('messengerLockedRecordBar').style.display = 'flex';
    }

    function hideRecordingUI() {
        clearInterval(mgrRecordTimerInterval);
        mgrRecordTimerInterval = null;
        document.getElementById('messengerRecordingBar').style.display = 'none';
        document.getElementById('messengerLockedRecordBar').style.display = 'none';
        document.getElementById('messengerInputBar').style.display = 'flex';
        mgrRecordLocked = false;
        mgrRecordCancelled = false;
    }

    function updateRecordingTimer(elId) {
        const el = document.getElementById(elId);
        if (!el) return;
        const secs = Math.floor((Date.now() - mgrRecordStartTime) / 1000);
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        el.textContent = m + ':' + (s < 10 ? '0' : '') + s;
    }

    // ---- Drag gesture: slide left to cancel, slide up to lock ----
    function handlePressStart(x, y) {
        startRecording();
        mgrRecordStartX = x;
        mgrRecordStartY = y;
        mgrRecordPointerActive = true;
    }

    function handlePressMove(x, y) {
        if (!mgrRecordPointerActive || mgrRecordLocked || !mgrMediaRecorder) return;
        const dx = x - mgrRecordStartX;
        const dy = y - mgrRecordStartY;

        // Slide left -> fade + move the "slide to cancel" hint with the finger
        const cancelProgress = Math.min(1, Math.max(0, -dx / CANCEL_THRESHOLD_PX));
        const bar = document.getElementById('messengerRecordingBar');
        if (bar) bar.style.transform = 'translateX(' + Math.min(0, dx) + 'px)';
        const hint = document.getElementById('messengerSlideCancelHint');
        if (hint) hint.style.opacity = String(1 - cancelProgress);
        if (-dx > CANCEL_THRESHOLD_PX) {
            mgrRecordCancelled = true;
            cancelRecording();
            return;
        }

        // Slide up -> move the lock icon with the finger, lock past threshold
        const lockEl = document.getElementById('messengerRecordLock');
        const liftPx = Math.min(0, dy);
        if (lockEl) lockEl.style.transform = 'translateY(' + Math.max(-LOCK_THRESHOLD_PX, liftPx) + 'px)';
        if (-dy > LOCK_THRESHOLD_PX) {
            mgrRecordLocked = true;
            showLockedBar();
        }
    }

    // ============================================
    // Location share
    // ============================================
    function shareLocation() {
        if (!mgrChatId) return;
        if (!navigator.geolocation) {
            alert('Location is not supported on this device/browser.');
            return;
        }
        navigator.geolocation.getCurrentPosition(function (pos) {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const url = 'https://maps.google.com/?q=' + lat + ',' + lng;
            sendMediaMessage({ type: 'location', url: url }, '📍 Location');
        }, function (err) {
            console.error('Messenger V4-B: geolocation failed', err);
            alert('Could not get your location. Please allow location permission and try again.');
        }, { timeout: 10000 });
    }

    // ============================================
    // Wire V4-B UI elements once (guaranteed to exist by first chatOpen)
    // ============================================
    function wireV4bUIOnce() {
        if (mgrV4bWired) return;
        mgrV4bWired = true;

        const attachInput = document.getElementById('messengerAttachInput');
        const cameraInput = document.getElementById('messengerCameraInput');
        attachInput.addEventListener('change', function () {
            const file = attachInput.files && attachInput.files[0];
            attachInput.value = '';
            handleFileSelected(file);
        });
        cameraInput.addEventListener('change', function () {
            const file = cameraInput.files && cameraInput.files[0];
            cameraInput.value = '';
            handleFileSelected(file);
        });

        // ---- Attach menu popup (📎 -> Gallery / Camera / Location) ----
        const attachBtn = document.getElementById('messengerAttachBtn');
        const attachMenu = document.getElementById('messengerAttachMenu');
        const attachBackdrop = document.getElementById('messengerAttachMenuBackdrop');
        function openAttachMenu() {
            attachMenu.style.display = 'flex';
            attachBackdrop.style.display = 'block';
        }
        function closeAttachMenu() {
            attachMenu.style.display = 'none';
            attachBackdrop.style.display = 'none';
        }
        attachBtn.addEventListener('click', openAttachMenu);
        attachBackdrop.addEventListener('click', closeAttachMenu);
        document.getElementById('messengerAttachGalleryBtn').addEventListener('click', function () {
            closeAttachMenu();
            attachInput.click();
        });
        document.getElementById('messengerAttachCameraBtn').addEventListener('click', function () {
            closeAttachMenu();
            cameraInput.click();
        });
        document.getElementById('messengerAttachLocationBtn').addEventListener('click', function () {
            closeAttachMenu();
            shareLocation();
        });

        // ---- Voice recording — press & hold the mic, WhatsApp-style ----
        // The same button doubles as Send once there's text (see messenger-v1.js,
        // which owns the click-to-send behavior and the 🎤/➤ icon swap) — so the
        // press-and-hold recording gesture here only ever starts when the input
        // is empty (mic mode), never while it's showing the send arrow.
        const voiceBtn = document.getElementById('messengerVoiceSendBtn');
        const msgInput = document.getElementById('messengerMsgInput');

        function onPressStart(x, y) {
            if (msgInput.value.trim()) return; // send-arrow mode — let the click-to-send handler own this tap
            handlePressStart(x, y);
        }
        voiceBtn.addEventListener('mousedown', function (e) { onPressStart(e.clientX, e.clientY); });
        voiceBtn.addEventListener('touchstart', function (e) {
            if (msgInput.value.trim()) return;
            e.preventDefault();
            const t = e.touches[0];
            onPressStart(t.clientX, t.clientY);
        }, { passive: false });

        document.addEventListener('mousemove', function (e) { handlePressMove(e.clientX, e.clientY); });
        document.addEventListener('touchmove', function (e) {
            if (!mgrRecordPointerActive) return;
            e.preventDefault();
            const t = e.touches[0];
            handlePressMove(t.clientX, t.clientY);
        }, { passive: false });

        document.addEventListener('mouseup', function () { if (mgrRecordPointerActive) finishPressHold(); });
        document.addEventListener('touchend', function () { if (mgrRecordPointerActive) finishPressHold(); });

        document.getElementById('messengerRecordDeleteBtn').addEventListener('click', cancelRecording);
        document.getElementById('messengerLockedDeleteBtn').addEventListener('click', cancelRecording);
        document.getElementById('messengerLockedSendBtn').addEventListener('click', stopAndSend);

        document.getElementById('messengerMediaViewerCloseBtn').addEventListener('click', closeMediaViewer);
        document.getElementById('messengerMediaViewer').addEventListener('click', function (e) {
            if (e.target.id === 'messengerMediaViewer') closeMediaViewer();
        });
    }
})();
