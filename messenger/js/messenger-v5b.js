// ============================================
// ChitChat Pakistan — Messenger V5-B: Beauty Filters
// ============================================
// Self-contained: does NOT modify app.js. Plugs into V5-A via the two
// small hooks added there for this purpose:
//   window.messengerProcessLocalStream(stream, callType) -> MediaStream
//   window.messengerCleanupLocalStreamProcessing()
//
// Implementation note / deliberate deviation from the spec's own example:
// the spec's sample code just does `localVideo.style.filter = '...'`, but
// a CSS filter on a <video> element only changes what that ONE browser
// renders locally — it does NOT change the actual video frames in the
// MediaStreamTrack, so the other person on the call would never see it,
// contradicting the spec's own stated goal ("پروسیس شدہ سٹریم کو WebRTC
// میں بھیجیں" — send the processed stream over WebRTC). To actually
// fulfil that, this draws each frame onto a <canvas> with the SAME
// filter string the spec gave, then uses canvas.captureStream() to
// produce a real MediaStream whose track IS what gets sent — so the
// filter is visible to the other party, not just to the female user.
//
// Reads users/{uid}/profile/isFemale and settings/messenger/
// enableBeautyFilters once at login (own independent read, safe default
// enableBeautyFilters=true since the Admin Messenger tab (session 9)
// doesn't exist yet). Male users / video-off audio calls / filters
// disabled by admin -> passes the raw stream through unchanged.
// ============================================
(function () {
    'use strict';

    const FILTER_CSS = 'brightness(1.1) contrast(1.2) saturate(1.1) blur(0.5px)';
    const CANVAS_FPS = 24;

    let mgrIsFemale = false;
    let mgrFiltersEnabled = true;
    let mgrRafId = null;
    let mgrHelperVideo = null;
    let mgrRawStream = null; // kept alive as the canvas draw loop's source; stopped on cleanup

    auth.onAuthStateChanged(function (user) {
        mgrIsFemale = false;
        if (!user) return;
        Promise.all([
            database.ref('users/' + user.uid + '/profile/isFemale').once('value'),
            database.ref('settings/messenger/enableBeautyFilters').once('value')
        ]).then(function (results) {
            mgrIsFemale = results[0].val() === true;
            mgrFiltersEnabled = results[1].val() !== false;
        }).catch(function (err) { console.error('Messenger V5-B: profile/settings read failed', err); });
    });

    // ============================================
    // The hook V5-A calls right after getUserMedia, for both caller and callee
    // ============================================
    window.messengerProcessLocalStream = function (stream, callType) {
        if (callType !== 'video' || !mgrIsFemale || !mgrFiltersEnabled) return stream;
        const videoTrack = stream.getVideoTracks()[0];
        if (!videoTrack) return stream;

        mgrRawStream = stream;
        mgrHelperVideo = document.createElement('video');
        mgrHelperVideo.muted = true;
        mgrHelperVideo.playsInline = true;
        mgrHelperVideo.srcObject = new MediaStream([videoTrack]);
        mgrHelperVideo.play().catch(function () { /* autoplay quirks — harmless, draw() just waits for videoWidth */ });

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        function draw() {
            if (mgrHelperVideo && mgrHelperVideo.videoWidth) {
                if (canvas.width !== mgrHelperVideo.videoWidth) canvas.width = mgrHelperVideo.videoWidth;
                if (canvas.height !== mgrHelperVideo.videoHeight) canvas.height = mgrHelperVideo.videoHeight;
                ctx.filter = FILTER_CSS;
                ctx.drawImage(mgrHelperVideo, 0, 0, canvas.width, canvas.height);
            }
            mgrRafId = requestAnimationFrame(draw);
        }
        draw();

        const canvasStream = canvas.captureStream(CANVAS_FPS);
        const combined = new MediaStream();
        canvasStream.getVideoTracks().forEach(function (t) { combined.addTrack(t); });
        stream.getAudioTracks().forEach(function (t) { combined.addTrack(t); });
        return combined;
    };

    // ============================================
    // The hook V5-A calls during cleanupCall() — releases what
    // messengerProcessLocalStream kept alive outside mgrLocalStream
    // (the raw camera track + the canvas draw loop + the helper video)
    // ============================================
    window.messengerCleanupLocalStreamProcessing = function () {
        if (mgrRafId) { cancelAnimationFrame(mgrRafId); mgrRafId = null; }
        if (mgrHelperVideo) { mgrHelperVideo.pause(); mgrHelperVideo.srcObject = null; mgrHelperVideo = null; }
        if (mgrRawStream) {
            mgrRawStream.getTracks().forEach(function (t) { t.stop(); });
            mgrRawStream = null;
        }
    };
})();
