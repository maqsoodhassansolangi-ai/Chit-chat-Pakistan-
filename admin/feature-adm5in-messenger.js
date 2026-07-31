// ============================================
// feature-admin-messenger.js
// Admin Panel "Messenger" tab — Messenger Settings, Media Settings,
// Call Management, per the master spec's حصہ 7.
//
// Design: zero edits to app.js. The new .admin-tab[data-tab="messenger"]
// button and .admin-panel[data-panel="messenger"] markup already live in
// index.html (added alongside the other static admin tabs, for
// consistency with how every other admin tab/panel is defined there) —
// but since app.js's admin-tab click listener is attached ONCE at script
// load time (document.querySelectorAll('.admin-tab').forEach(...)), it
// never saw this tab exist. This file wires its own click handler that
// replicates the exact same tab/panel-switching behavior app.js's does,
// same as messenger-v1.js already had to do for the menu bar tab, and
// feature-admin-restructure.js's sidebar picks this tab up automatically
// (falls into "🗂️ Other" unless that file's TAB_GROUPS is later updated).
//
// Also enforces settings/messenger/enabled globally: hides the
// "💬 Messenger" menu-bar tab (already injected by messenger-v1.js) for
// everyone when the admin turns Messenger off.
//
// Schema (settings/messenger) — see spec حصہ 7.3:
//   enabled, maxAttachmentSize, enableVideoCall, enableBeautyFilters,
//   maxCallDuration, defaultRingtone, cloudinaryPreset,
//   maxImageResolution, enableVoiceMessages, enableLocationShare
//
// NOTE for the final rules session: reading the WHOLE calls/ collection
// (for the Active Calls count / Call History / Force End Call below)
// needs an admin-readable ".read" rule at the calls/ TOP level, not just
// at calls/$callId (which is all V5-A's per-call read/write needs) —
// please reconcile this with whatever admin-read pattern the rest of
// the project's rules already use for users/messages/logs.
// ============================================
(function () {
    'use strict';

    const DEFAULTS = {
        enabled: true,
        maxAttachmentSize: 15,
        enableVideoCall: true,
        enableBeautyFilters: true,
        maxCallDuration: 60,
        defaultRingtone: 'ringtone.mp3',
        cloudinaryPreset: 'chitchat_preset',
        maxImageResolution: 800,
        enableVoiceMessages: true,
        enableLocationShare: true
    };

    let mgrSettingsLoaded = false;
    let mgrActiveCallsRef = null;
    let mgrActiveCallsCb = null;
    let mgrActiveCallsCache = {};

    // ============================================
    // Tab switching (mirrors app.js's own admin-tab logic exactly)
    // ============================================
    function wireTab() {
        const tabBtn = document.querySelector('.admin-tab[data-tab="messenger"]');
        if (!tabBtn) return;
        tabBtn.addEventListener('click', function () {
            document.querySelectorAll('.admin-tab').forEach(function (t) { t.classList.remove('active'); });
            tabBtn.classList.add('active');
            document.querySelectorAll('.admin-panel').forEach(function (p) { p.classList.remove('active'); });
            document.querySelector('.admin-panel[data-panel="messenger"]').classList.add('active');
            if (!mgrSettingsLoaded) { loadSettingsIntoForm(); mgrSettingsLoaded = true; }
            listenActiveCalls();
            const clearLogsBtn = document.getElementById('adminClearCallLogsBtn');
            if (clearLogsBtn) clearLogsBtn.style.display = isOwner ? '' : 'none';
        });
    }

    // ============================================
    // Load current settings/messenger into the form (spec defaults if missing)
    // ============================================
    function loadSettingsIntoForm() {
        database.ref('settings/messenger').once('value').then(function (snap) {
            const s = Object.assign({}, DEFAULTS, snap.val() || {});
            document.getElementById('adminMsgEnabled').checked = !!s.enabled;
            document.getElementById('adminMsgMaxAttachmentSize').value = s.maxAttachmentSize;
            document.getElementById('adminMsgEnableVideoCall').checked = !!s.enableVideoCall;
            document.getElementById('adminMsgEnableBeautyFilters').checked = !!s.enableBeautyFilters;
            document.getElementById('adminMsgMaxCallDuration').value = s.maxCallDuration;
            document.getElementById('adminMsgDefaultRingtone').value = s.defaultRingtone;
            document.getElementById('adminMsgCloudinaryPreset').value = s.cloudinaryPreset;
            document.getElementById('adminMsgMaxImageResolution').value = s.maxImageResolution;
            document.getElementById('adminMsgEnableVoiceMessages').checked = !!s.enableVoiceMessages;
            document.getElementById('adminMsgEnableLocationShare').checked = !!s.enableLocationShare;
        }).catch(function (err) { console.error('Admin Messenger: failed to load settings', err); });
    }

    // ============================================
    // Save (each section has its own button, per spec)
    // ============================================
    function wireSaveButtons() {
        document.getElementById('adminSaveMessengerSettingsBtn').addEventListener('click', function () {
            database.ref('settings/messenger').update({
                enabled: document.getElementById('adminMsgEnabled').checked,
                maxAttachmentSize: Number(document.getElementById('adminMsgMaxAttachmentSize').value) || DEFAULTS.maxAttachmentSize,
                enableVideoCall: document.getElementById('adminMsgEnableVideoCall').checked,
                enableBeautyFilters: document.getElementById('adminMsgEnableBeautyFilters').checked,
                maxCallDuration: Number(document.getElementById('adminMsgMaxCallDuration').value) || DEFAULTS.maxCallDuration,
                defaultRingtone: document.getElementById('adminMsgDefaultRingtone').value.trim() || DEFAULTS.defaultRingtone
            }).then(function () {
                alert('Messenger settings saved.');
            }).catch(function (err) {
                console.error('Admin Messenger: save failed', err);
                alert('Could not save. Please try again.');
            });
        });

        document.getElementById('adminSaveMediaSettingsBtn').addEventListener('click', function () {
            database.ref('settings/messenger').update({
                cloudinaryPreset: document.getElementById('adminMsgCloudinaryPreset').value.trim() || DEFAULTS.cloudinaryPreset,
                maxImageResolution: Number(document.getElementById('adminMsgMaxImageResolution').value) || DEFAULTS.maxImageResolution,
                enableVoiceMessages: document.getElementById('adminMsgEnableVoiceMessages').checked,
                enableLocationShare: document.getElementById('adminMsgEnableLocationShare').checked
            }).then(function () {
                alert('Media settings saved.');
            }).catch(function (err) {
                console.error('Admin Messenger: save failed', err);
                alert('Could not save. Please try again.');
            });
        });
    }

    // ============================================
    // Enforce "Enable Messenger" globally — hides the 💬 menu-bar tab
    // that messenger-v1.js already injected
    // ============================================
    function enforceEnabledToggle() {
        database.ref('settings/messenger/enabled').on('value', function (snap) {
            const enabled = snap.val() !== false; // default true if unset
            const menuTab = document.getElementById('messengerMenuTab');
            if (menuTab) menuTab.style.display = enabled ? '' : 'none';
        }, function (err) { console.error('Admin Messenger: enabled listener error', err); });
    }

    // ============================================
    // Call Management: live Active Calls count + Force End Call dropdown
    // ============================================
    function listenActiveCalls() {
        if (mgrActiveCallsRef) return; // already listening
        mgrActiveCallsRef = database.ref('calls');
        mgrActiveCallsCb = mgrActiveCallsRef.on('value', function (snap) {
            const all = snap.val() || {};
            mgrActiveCallsCache = {};
            Object.keys(all).forEach(function (callId) {
                if (all[callId] && all[callId].status === 'active') mgrActiveCallsCache[callId] = all[callId];
            });
            renderActiveCalls();
        }, function (err) { console.error('Admin Messenger: active calls listener error', err); });
    }

    function renderActiveCalls() {
        const countEl = document.getElementById('adminActiveCallsCount');
        if (countEl) countEl.textContent = String(Object.keys(mgrActiveCallsCache).length);

        const select = document.getElementById('adminForceEndCallSelect');
        if (!select) return;
        const prevValue = select.value;
        select.innerHTML = '<option value="">Select an active call...</option>' +
            Object.keys(mgrActiveCallsCache).map(function (callId) {
                const c = mgrActiveCallsCache[callId];
                const label = (c.callerName || 'User') + ' → ' + (c.calleeUid || '') + ' (' + (c.type || 'audio') + ')';
                return '<option value="' + callId + '">' + label.replace(/</g, '&lt;') + '</option>';
            }).join('');
        if (mgrActiveCallsCache[prevValue]) select.value = prevValue;
    }

    function wireForceEndCall() {
        document.getElementById('adminForceEndCallBtn').addEventListener('click', function () {
            const callId = document.getElementById('adminForceEndCallSelect').value;
            if (!callId) { alert('Please select a call.'); return; }
            // Just mark it ended — each participant's own messenger-v5a.js is
            // already watching calls/{callId}/status and will clean up its
            // own peer connection/UI/system-message the moment this changes,
            // so we don't need to duplicate any of that cleanup logic here.
            database.ref('calls/' + callId).update({ status: 'ended', endTime: Date.now(), endedByAdmin: true })
                .catch(function (err) {
                    console.error('Admin Messenger: force-end failed', err);
                    alert('Could not end that call. Please try again.');
                });
        });
    }

    // ============================================
    // Call History modal
    // ============================================
    function wireCallHistory() {
        document.getElementById('adminViewCallHistoryBtn').addEventListener('click', function () {
            const listEl = document.getElementById('adminCallHistoryList');
            listEl.innerHTML = '<p>Loading...</p>';
            document.getElementById('adminCallHistoryModal').style.display = 'flex';
            database.ref('calls').once('value').then(function (snap) {
                const all = snap.val() || {};
                const entries = Object.entries(all).sort(function (a, b) {
                    return (b[1].createdAt || 0) - (a[1].createdAt || 0);
                });
                if (!entries.length) {
                    listEl.innerHTML = '<p>No calls yet.</p>';
                    return;
                }
                listEl.innerHTML = entries.map(function (entry) {
                    const c = entry[1];
                    const durationSec = (c.startTime && c.endTime) ? Math.max(0, Math.round((c.endTime - c.startTime) / 1000)) : 0;
                    const when = c.createdAt ? new Date(c.createdAt).toLocaleString() : '';
                    return '<div style="padding:8px 0;border-bottom:1px solid #eee;">' +
                        '<b>' + String(c.callerName || 'User').replace(/</g, '&lt;') + '</b> → ' + String(c.calleeUid || '').replace(/</g, '&lt;') +
                        ' · ' + (c.type || 'audio') + ' · ' + (c.status || '') +
                        (durationSec ? ' · ' + Math.round(durationSec / 60) + ' min' : '') +
                        '<br><span style="font-size:12px;color:#888;">' + when + '</span>' +
                        '</div>';
                }).join('');
            }).catch(function (err) {
                console.error('Admin Messenger: call history load failed', err);
                listEl.innerHTML = '<p>Could not load call history.</p>';
            });
        });

        document.getElementById('adminCallHistoryCloseBtn').addEventListener('click', function () {
            document.getElementById('adminCallHistoryModal').style.display = 'none';
        });
        document.getElementById('adminCallHistoryModal').addEventListener('click', function (e) {
            if (e.target.id === 'adminCallHistoryModal') document.getElementById('adminCallHistoryModal').style.display = 'none';
        });
    }

    // ============================================
    // Clear All Call Logs (Owner only)
    // ============================================
    function wireClearCallLogs() {
        const btn = document.getElementById('adminClearCallLogsBtn');
        if (!btn) return;
        btn.addEventListener('click', function () {
            if (!isOwner) return; // blocked even if triggered another way, matching app.js's own convention
            if (!confirm('Delete ALL call logs permanently? This cannot be undone.')) return;
            database.ref('calls').remove().then(function () {
                alert('All call logs cleared.');
            }).catch(function (err) {
                console.error('Admin Messenger: clear call logs failed', err);
                alert('Could not clear call logs. Please try again.');
            });
        });
    }

    // ============================================
    // Init — runs at script load; the admin modal markup already exists
    // statically in index.html, so no need to wait for anything
    // ============================================
    wireTab();
    wireSaveButtons();
    wireForceEndCall();
    wireCallHistory();
    wireClearCallLogs();
    enforceEnabledToggle();
})();
