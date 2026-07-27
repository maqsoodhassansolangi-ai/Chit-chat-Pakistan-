// ============================================
// feature-admin-restructure.js
// Groups the flat row of .admin-tab buttons into collapsible,
// labeled categories (Dashboard/People/Content/Marketing/System),
// as agreed for the "God Panel" redesign.
//
// Design: zero edits to app.js. The original .admin-tabs bar (and
// its click listeners, permission-based show/hide, tab-content divs)
// all keep working exactly as before — we just hide the old flat bar
// visually and build a new grouped UI in front of it. Clicking a
// grouped item calls .click() on the ORIGINAL button, so every bit
// of existing logic (including the Moderator tab restrictions in
// loadAdminPanel()) is reused, not reimplemented.
//
// Future feature phases (Economy, Social, Appearance, etc.) will add
// more real .admin-tab buttons — TAB_GROUPS below just needs one new
// entry per new tab's data-tab value, no other change required. Any
// tab not yet listed automatically falls into "🗂️ Other" so nothing
// silently disappears if this file falls behind.
// ============================================

const TAB_GROUPS = [
    { key: 'support', label: '🛟 Support', tabs: ['support'] },
    { key: 'people', label: '👥 People', tabs: ['users', 'bans'] },
    { key: 'content', label: '💬 Content', tabs: ['messages', 'rooms', 'badwords', 'stickers'] },
    { key: 'economy', label: '🪙 Economy', tabs: ['requests'] },
    { key: 'marketing', label: '📢 Marketing', tabs: ['ads'] },
    { key: 'system', label: '⚙️ System', tabs: ['settings', 'logs'] }
];

let sidebarBuilt = false;

function buildAdminSidebar() {
    const oldTabBar = document.querySelector('#adminModal .admin-tabs');
    if (!oldTabBar) return;
    oldTabBar.classList.add('admin-tabs-legacy-hidden');

    const sidebar = document.createElement('div');
    sidebar.id = 'adminSidebar';
    sidebar.className = 'admin-sidebar';

    const originalButtons = Array.from(oldTabBar.querySelectorAll('.admin-tab'));
    const placedTabNames = new Set();

    TAB_GROUPS.forEach(group => {
        const groupButtons = originalButtons.filter(btn => group.tabs.includes(btn.dataset.tab));
        if (!groupButtons.length) return; // nothing in this group exists (yet) — skip it entirely

        const groupEl = document.createElement('div');
        groupEl.className = 'admin-sidebar-group';

        const header = document.createElement('div');
        header.className = 'admin-sidebar-group-header';
        header.textContent = group.label;
        header.addEventListener('click', () => groupEl.classList.toggle('open'));
        groupEl.appendChild(header);

        const itemsWrap = document.createElement('div');
        itemsWrap.className = 'admin-sidebar-group-items';
        groupButtons.forEach(origBtn => {
            placedTabNames.add(origBtn.dataset.tab);
            const item = document.createElement('button');
            item.className = 'admin-sidebar-item';
            item.textContent = origBtn.textContent;
            item.dataset.tab = origBtn.dataset.tab;
            item.addEventListener('click', () => selectAdminSidebarItem(origBtn, item));
            itemsWrap.appendChild(item);
        });
        groupEl.appendChild(itemsWrap);
        sidebar.appendChild(groupEl);
    });

    // Anything not covered by TAB_GROUPS yet (future-proofing, see header comment)
    const leftover = originalButtons.filter(btn => !placedTabNames.has(btn.dataset.tab));
    if (leftover.length) {
        const groupEl = document.createElement('div');
        groupEl.className = 'admin-sidebar-group';
        const header = document.createElement('div');
        header.className = 'admin-sidebar-group-header';
        header.textContent = '🗂️ Other';
        header.addEventListener('click', () => groupEl.classList.toggle('open'));
        groupEl.appendChild(header);
        const itemsWrap = document.createElement('div');
        itemsWrap.className = 'admin-sidebar-group-items';
        leftover.forEach(origBtn => {
            const item = document.createElement('button');
            item.className = 'admin-sidebar-item';
            item.textContent = origBtn.textContent;
            item.dataset.tab = origBtn.dataset.tab;
            item.addEventListener('click', () => selectAdminSidebarItem(origBtn, item));
            itemsWrap.appendChild(item);
        });
        groupEl.appendChild(itemsWrap);
        sidebar.appendChild(groupEl);
    }

    oldTabBar.insertAdjacentElement('afterend', sidebar);
    sidebarBuilt = true;
}

function selectAdminSidebarItem(originalButton, sidebarItem) {
    originalButton.click(); // reuses all existing tab-switch + data-load logic untouched
    document.querySelectorAll('.admin-sidebar-item').forEach(el => el.classList.remove('active'));
    sidebarItem.classList.add('active');
}

// Every time the admin panel opens, loadAdminPanel() (in app.js) shows/hides
// the ORIGINAL buttons based on Owner/Admin/Moderator permissions. We mirror
// that onto our sidebar items right after, so a Moderator never sees a
// sidebar entry for a tab they don't actually have access to.
function syncSidebarVisibility() {
    document.querySelectorAll('#adminModal .admin-tabs .admin-tab').forEach(origBtn => {
        const isVisible = origBtn.style.display !== 'none';
        const sidebarItem = document.querySelector('.admin-sidebar-item[data-tab="' + origBtn.dataset.tab + '"]');
        if (sidebarItem) sidebarItem.closest('.admin-sidebar-group')
            .querySelectorAll('.admin-sidebar-item[data-tab="' + origBtn.dataset.tab + '"]')
            .forEach(el => el.style.display = isVisible ? '' : 'none');
    });
    // Hide any group whose items are ALL hidden (e.g. every Content tab
    // hidden for a Moderator), so there's no empty expandable header.
    document.querySelectorAll('.admin-sidebar-group').forEach(groupEl => {
        const items = Array.from(groupEl.querySelectorAll('.admin-sidebar-item'));
        const anyVisible = items.some(el => el.style.display !== 'none');
        groupEl.style.display = anyVisible ? '' : 'none';
    });
    // Auto-open + select the first visible item's group so the panel never
    // opens on a blank screen.
    const firstVisibleGroup = Array.from(document.querySelectorAll('.admin-sidebar-group'))
        .find(g => g.style.display !== 'none');
    if (firstVisibleGroup && !document.querySelector('.admin-sidebar-group.open')) {
        firstVisibleGroup.classList.add('open');
    }
}

const adminModalEl = document.getElementById('adminModal');
if (adminModalEl) {
    new MutationObserver(() => {
        if (adminModalEl.style.display === 'flex' || adminModalEl.style.display === 'block') {
            if (!sidebarBuilt) buildAdminSidebar();
            setTimeout(syncSidebarVisibility, 30); // small delay — loadAdminPanel() runs its show/hide synchronously right before this, but give the DOM a tick
        }
    }).observe(adminModalEl, { attributes: true, attributeFilter: ['style'] });
}
