// ============================================================
// AmeriDex Dealer Portal - Role-Based UI v2.0
// Date: 2026-02-16
// ============================================================
// v2.0 Changes (2026-02-16):
//   - REMOVE all user management from portal (moved to Admin Panel)
//   - GM "My Team" modal now shows READ-ONLY team list only
//   - No add/edit/delete/reset-pw in portal anymore
//   - All user CRUD is now exclusively in ameridex-admin.js Users tab
//
// v1.x Changes (prior):
//   - Role-based nav buttons (admin panel, team management)
//   - GM could manage frontdesk users from portal
// ============================================================

(function () {
    'use strict';

    // ----------------------------------------------------------
    // ROLE BUTTON INJECTION
    // ----------------------------------------------------------
    function injectRoleButtons() {
        var dealer = window.getCurrentDealer ? window.getCurrentDealer() : null;
        if (!dealer) return;

        var nav = document.querySelector('.header-actions') || document.querySelector('nav');
        if (!nav) return;

        // Remove any previously injected role buttons
        nav.querySelectorAll('.role-injected').forEach(function (el) { el.remove(); });

        // Admin: show Admin Panel button
        if (dealer.role === 'admin') {
            var adminBtn = document.createElement('button');
            adminBtn.className = 'btn btn-admin role-injected';
            adminBtn.textContent = 'Admin Panel';
            adminBtn.style.cssText = 'background:#dc2626;color:#fff;border:none;padding:0.5rem 1rem;border-radius:8px;font-weight:600;cursor:pointer;font-size:0.88rem;';
            adminBtn.addEventListener('click', function () {
                if (window.toggleAdminPanel) window.toggleAdminPanel();
            });
            nav.appendChild(adminBtn);
        }

        // GM: show My Team button (read-only view)
        if (dealer.role === 'gm') {
            var teamBtn = document.createElement('button');
            teamBtn.className = 'btn btn-team role-injected';
            teamBtn.textContent = 'My Team';
            teamBtn.style.cssText = 'background:#2563eb;color:#fff;border:none;padding:0.5rem 1rem;border-radius:8px;font-weight:600;cursor:pointer;font-size:0.88rem;';
            teamBtn.addEventListener('click', function () {
                openTeamModal(dealer);
            });
            nav.appendChild(teamBtn);
        }
    }


    // ----------------------------------------------------------
    // GM TEAM MODAL (READ-ONLY in v2.0)
    // ----------------------------------------------------------
    var teamModalStyle = document.createElement('style');
    teamModalStyle.textContent = '' +
        '#team-modal { display:none; position:fixed; inset:0; background:rgba(15,23,42,0.6); ' +
            'z-index:1500; justify-content:center; align-items:flex-start; padding:2rem 1rem; overflow-y:auto; }' +
        '#team-modal.active { display:flex; }' +
        '#team-panel { background:#fff; border-radius:14px; width:100%; max-width:640px; ' +
            'box-shadow:0 25px 50px rgba(0,0,0,0.25); max-height:80vh; display:flex; flex-direction:column; }' +
        '.team-header { background:linear-gradient(135deg,#2563eb,#1d4ed8); color:#fff; ' +
            'padding:1.25rem 1.5rem; border-radius:14px 14px 0 0; display:flex; justify-content:space-between; align-items:center; }' +
        '.team-header h2 { margin:0; font-size:1.15rem; }' +
        '.team-close { background:none; border:none; color:#fff; font-size:1.5rem; cursor:pointer; padding:0.5rem; opacity:0.8; }' +
        '.team-close:hover { opacity:1; }' +
        '.team-body { padding:1.5rem; overflow-y:auto; flex:1; }' +
        '.team-table { width:100%; border-collapse:collapse; font-size:0.88rem; }' +
        '.team-table th { background:#f9fafb; padding:0.65rem 0.75rem; text-align:left; font-weight:600; color:#4b5563; border-bottom:2px solid #e5e7eb; }' +
        '.team-table td { padding:0.65rem 0.75rem; border-bottom:1px solid #f3f4f6; }' +
        '.team-table tr:hover td { background:#f9fafb; }' +
        '.team-badge { display:inline-block; padding:0.15rem 0.55rem; border-radius:999px; font-size:0.72rem; font-weight:600; text-transform:uppercase; }' +
        '.team-badge-gm { background:#dbeafe; color:#1d4ed8; }' +
        '.team-badge-frontdesk { background:#f3f4f6; color:#374151; }' +
        '.team-badge-active { background:#dcfce7; color:#16a34a; }' +
        '.team-badge-disabled { background:#fee2e2; color:#dc2626; }' +
        '.team-empty { text-align:center; padding:2rem; color:#6b7280; }' +
        '.team-note { font-size:0.82rem; color:#6b7280; margin-top:1rem; padding:0.75rem; background:#f9fafb; border-radius:8px; border:1px solid #e5e7eb; }';
    document.head.appendChild(teamModalStyle);

    // Create modal element
    var teamModal = document.createElement('div');
    teamModal.id = 'team-modal';
    teamModal.setAttribute('role', 'dialog');
    teamModal.setAttribute('aria-modal', 'true');
    teamModal.innerHTML = '' +
        '<div id="team-panel">' +
            '<div class="team-header">' +
                '<h2>My Team</h2>' +
                '<button class="team-close" id="team-close-btn" aria-label="Close">&times;</button>' +
            '</div>' +
            '<div class="team-body">' +
                '<div id="team-list"><div class="team-empty">Loading...</div></div>' +
                '<div class="team-note">To add, edit, or remove team members, contact your AmeriDex administrator.</div>' +
            '</div>' +
        '</div>';
    document.body.appendChild(teamModal);

    document.getElementById('team-close-btn').addEventListener('click', function () {
        teamModal.classList.remove('active');
    });
    teamModal.addEventListener('click', function (e) {
        if (e.target === teamModal) teamModal.classList.remove('active');
    });

    function openTeamModal(dealer) {
        teamModal.classList.add('active');
        var container = document.getElementById('team-list');
        container.innerHTML = '<div class="team-empty">Loading team...</div>';

        var _api = window.ameridexAPI;
        if (!_api) {
            container.innerHTML = '<div class="team-empty">API not available</div>';
            return;
        }

        // Fetch users for this dealer code from the admin endpoint
        _api('GET', '/api/admin/users?dealerCode=' + encodeURIComponent(dealer.dealerCode))
            .then(function (users) {
                if (!users || users.length === 0) {
                    container.innerHTML = '<div class="team-empty">No team members found</div>';
                    return;
                }

                var html = '<table class="team-table"><thead><tr>' +
                    '<th>Name</th><th>Username</th><th>Role</th><th>Status</th><th>Email</th>' +
                    '</tr></thead><tbody>';

                users.forEach(function (u) {
                    var roleBadge = u.role === 'gm' ? 'team-badge-gm' : 'team-badge-frontdesk';
                    var statusBadge = u.status === 'active' ? 'team-badge-active' : 'team-badge-disabled';
                    html += '<tr>' +
                        '<td><strong>' + esc(u.displayName || u.username) + '</strong></td>' +
                        '<td>' + esc(u.username) + '</td>' +
                        '<td><span class="team-badge ' + roleBadge + '">' + esc(u.role) + '</span></td>' +
                        '<td><span class="team-badge ' + statusBadge + '">' + esc(u.status || 'unknown') + '</span></td>' +
                        '<td style="font-size:0.82rem;color:#6b7280;">' + esc(u.email || '-') + '</td>' +
                        '</tr>';
                });

                html += '</tbody></table>';
                container.innerHTML = html;
            })
            .catch(function (err) {
                container.innerHTML = '<div class="team-empty">Failed to load team: ' + esc(err.message) + '</div>';
            });
    }

    function esc(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }


    // ----------------------------------------------------------
    // INIT
    // ----------------------------------------------------------
    // Inject role buttons when login completes
    window.addEventListener('ameridex-login', function () {
        setTimeout(injectRoleButtons, 100);
    });

    // Also try on DOMContentLoaded in case already logged in
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            setTimeout(injectRoleButtons, 500);
        });
    } else {
        setTimeout(injectRoleButtons, 500);
    }

    console.log('[AmeriDex Roles] v2.0 loaded (read-only team view; user CRUD in Admin Panel).');
})();
