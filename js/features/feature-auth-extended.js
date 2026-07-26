// ============================================
// feature-auth-extended.js
// Phase 0 (part 2): extended signup fields, mandatory
// Guest setup, and Google "Complete Your Profile" flow.
//
// Design: this file never touches app.js. It works by:
//  1. Adding its OWN capture-phase listener on #signupForm
//     that validates the new fields (incl. 13+ age gate)
//     BEFORE app.js's own submit handler runs. If invalid,
//     it stops the event so app.js's handler never fires.
//     If valid, it just stashes the extra fields and lets
//     the event continue — app.js creates the account as
//     it always did.
//  2. Registering its OWN auth.onAuthStateChanged listener
//     (Firebase supports multiple) to: write the stashed
//     signup extras once the account exists, show the Guest
//     Setup modal for anonymous users who haven't completed
//     it yet, and show the Google Complete-Profile modal for
//     Google sign-ins missing the extra fields.
// ============================================

const MIN_SIGNUP_AGE = 13;
const GUEST_AVATAR_COLORS = ['#075E54', '#128C7E', '#25D366', '#34B7F1', '#FF8C00', '#DC143C', '#9370DB', '#546E7A'];

let pendingSignupExtras = null;
let selectedGuestAvatarColor = GUEST_AVATAR_COLORS[0];

function calculateAgeFromDob(dobStr) {
    const dob = new Date(dobStr);
    if (isNaN(dob.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
    return age;
}

function generateGuestId() {
    return 'Guest#' + Math.floor(10000 + Math.random() * 90000);
}

// ===== 1. Extended signup field collection + age gate =====
// Registered on `document` with capture:true so this runs during the
// capturing phase — BEFORE the event reaches #signupForm itself. This
// matters because app.js's own submit listener is already registered
// directly on the form (and registered first, since app.js loads
// first) — a capture listener added later on the SAME element would
// still fire after it. Capturing on an ancestor is what actually lets
// us run first and veto an invalid submission.
document.addEventListener('submit', function(e) {
    if (e.target.id !== 'signupForm') return;

    const gender = document.getElementById('signupGender').value;
    const dob = document.getElementById('signupDob').value;
    const country = document.getElementById('signupCountry').value;
    const phone = document.getElementById('signupPhone').value.trim();
    const language = document.getElementById('signupLanguage').value;
    const interests = Array.from(document.querySelectorAll('.signupInterest:checked')).map(el => el.value);

    if (!gender || !dob || !country) {
        alert('Please fill Gender, Date of Birth and Country.');
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
    }
    const age = calculateAgeFromDob(dob);
    if (age === null) {
        alert('Please enter a valid date of birth.');
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
    }
    if (age < MIN_SIGNUP_AGE) {
        alert('You must be at least ' + MIN_SIGNUP_AGE + ' years old to sign up.');
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
    }

    // Valid — stash for writing after account creation, and let
    // app.js's own handler run normally (we don't touch the event).
    pendingSignupExtras = { gender, dob, age, country, phone, language, interests, profileCompleted: true };
}, true); // capture: true on document — runs before app.js's form-level listener

// ===== 2. Guest Setup Modal =====
const guestSetupModal = document.getElementById('guestSetupModal');
const guestIdDisplay = document.getElementById('guestIdDisplay');
const guestAvatarColorWrap = document.getElementById('guestAvatarColorWrap');
const guestSetupConfirmBtn = document.getElementById('guestSetupConfirmBtn');
let currentGuestId = null;

GUEST_AVATAR_COLORS.forEach((color, i) => {
    const sw = document.createElement('div');
    sw.className = 'guest-avatar-swatch' + (i === 0 ? ' selected' : '');
    sw.style.background = color;
    sw.addEventListener('click', () => {
        selectedGuestAvatarColor = color;
        guestAvatarColorWrap.querySelectorAll('.guest-avatar-swatch').forEach(s => s.classList.remove('selected'));
        sw.classList.add('selected');
    });
    guestAvatarColorWrap.appendChild(sw);
});

function showGuestSetupModal() {
    currentGuestId = generateGuestId();
    guestIdDisplay.textContent = currentGuestId;
    guestSetupModal.style.display = 'flex';
}

guestSetupConfirmBtn.addEventListener('click', function() {
    const username = document.getElementById('guestUsername').value.trim();
    const gender = document.getElementById('guestGender').value;
    if (!username) return alert('Please choose a display name.');
    if (username.length < 2) return alert('Display name is too short.');
    if (!gender) return alert('Please select a gender.');
    const user = auth.currentUser;
    if (!user) return;

    database.ref('users/' + user.uid).update({
        isGuest: true,
        guestId: currentGuestId,
        profile: {
            displayName: username,
            gender: gender,
            avatarColor: selectedGuestAvatarColor,
            motto: '',
            photoURL: 'default-avatar.png',
            profileCompleted: true
        }
    }).then(() => {
        if (typeof currentUser !== 'undefined' && currentUser) {
            currentUser.updateProfile({ displayName: username }).catch(() => {});
        }
        guestSetupModal.style.display = 'none';
    }).catch(err => alert('Error: ' + err.message));
});

// ===== 3. Google "Complete Your Profile" Modal =====
const googleCompleteModal = document.getElementById('googleCompleteModal');
const googleCompleteConfirmBtn = document.getElementById('googleCompleteConfirmBtn');

function showGoogleCompleteModal() {
    googleCompleteModal.style.display = 'flex';
}

googleCompleteConfirmBtn.addEventListener('click', function() {
    const gender = document.getElementById('googleGender').value;
    const dob = document.getElementById('googleDob').value;
    const country = document.getElementById('googleCountry').value;
    const phone = document.getElementById('googlePhone').value.trim();
    const language = document.getElementById('googleLanguage').value;

    if (!gender || !dob || !country) return alert('Please fill Gender, Date of Birth and Country.');
    const age = calculateAgeFromDob(dob);
    if (age === null) return alert('Please enter a valid date of birth.');
    if (age < MIN_SIGNUP_AGE) return alert('You must be at least ' + MIN_SIGNUP_AGE + ' years old to use this app.');

    const user = auth.currentUser;
    if (!user) return;
    database.ref('users/' + user.uid + '/profile').update({
        gender, dob, age, country, phone, language, profileCompleted: true
    }).then(() => {
        googleCompleteModal.style.display = 'none';
    }).catch(err => alert('Error: ' + err.message));
});

// ===== 4. Orchestration: separate auth listener =====
auth.onAuthStateChanged(function(user) {
    if (!user) {
        pendingSignupExtras = null;
        return;
    }

    // Email/password signup just completed — write the stashed extras.
    if (pendingSignupExtras && !user.isAnonymous) {
        const extras = pendingSignupExtras;
        pendingSignupExtras = null;
        database.ref('users/' + user.uid + '/profile').update(extras).catch(() => {});
        return; // this user's profile is now complete, no further modal needed
    }

    // Guest (anonymous) — force the setup modal if not done yet.
    if (user.isAnonymous) {
        database.ref('users/' + user.uid + '/profile/profileCompleted').once('value', snap => {
            if (!snap.val()) showGuestSetupModal();
        });
        return;
    }

    // Google sign-in — force "complete profile" if the extra fields
    // (gender/dob/country) are missing, i.e. not written yet.
    const isGoogleUser = user.providerData.some(p => p.providerId === 'google.com');
    if (isGoogleUser) {
        database.ref('users/' + user.uid + '/profile/profileCompleted').once('value', snap => {
            if (!snap.val()) showGoogleCompleteModal();
        });
    }
});
