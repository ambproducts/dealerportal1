// ============================================================
// AmeriDex Dealer Portal - Role-Based UI v3.0
// Date: 2026-02-16
// ============================================================
// v3.0 Changes (2026-02-16):
//   - RESTORE full GM team management in My Team modal
//   - GM can add frontdesk users, disable/enable, reset passwords
//   - All calls go to /api/users (GM-scoped endpoints)
//   - GM can only manage frontdesk at their own dealer code
//   - Removed read-only restriction and 'contact admin' note
//   - Admin Panel button unchanged
//
// v2.0 Changes (2026-02-16):
//   - (reverted) Made My Team modal read-only
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

        // GM: show My Team button (full management)
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
    // STYLES
    // ----------------------------------------------------------
    var teamModalStyle = document.createElement('style');
    teamModalStyle.textContent = '' +
        '#team-modal { display:none; position:fixed; inset:0; background:rgba(15,23,42,0.6); ' +
            'z-index:1500; justify-content:center; align-items:flex-start; padding:2rem 1rem; overflow-y:auto; }' +
        '#team-modal.active { display:flex; }' +
        '#team-panel { background:#fff; border-radius:14px; width:100%; max-width:700px; ' +
            'box-shadow:0 25px 50px rgba(0,0,0,0.25); max-height:90vh; display:flex; flex-direction:column; }' +
        '.team-header { background:linear-gradient(135deg,#2563eb,#1d4ed8); color:#fff; ' +
            'padding:1.25rem 1.5rem; border-radius:14px 14px 0 0; display:flex; justify-content:space-between; align-items:center; }' +
        '.team-header h2 { margin:0; font-size:1.15rem; }' +
        '.team-close { background:none; border:none; color:#fff; font-size:1.5rem; cursor:pointer; padding:0.5rem; opacity:0.8; }' +
        '.team-close:hover { opacity:1; }' +
        '.team-body { padding:1.5rem; overflow-y:auto; flex:1; }' +
        '.team-table { width:100%; border-collapse:collapse; font-size:0.88rem; }' +
        '.team-table th { background:#f9fafb; padding:0.65rem 0.75rem; text-align:left; font-weight:600; color:#4b5563; border-bottom:2px solid #e5e7eb; }' +
        '.team-table td { padding:0.65rem 0.75rem; border-bottom:1px solid #f3f4f6; vertical-align:middle; }' +
        '.team-table tr:hover td { background:#f9fafb; }' +
        '.team-badge { display:inline-block; padding:0.15rem 0.55rem; border-radius:999px; font-size:0.72rem; font-weight:600; text-transform:uppercase; }' +
        '.team-badge-gm { background:#dbeafe; color:#1d4ed8; }' +
        '.team-badge-frontdesk { background:#f3f4f6; color:#374151; }' +
        '.team-badge-active { background:#dcfce7; color:#16a34a; }' +
        '.team-badge-disabled { background:#fee2e2; color:#dc2626; }' +
        '.team-badge-pending { background:#fef3c7; color:#92400e; }' +
        '.team-empty { text-align:center; padding:2rem; color:#6b7280; }' +
        '.team-alert { padding:0.75rem 1rem; border-radius:8px; font-size:0.88rem; margin-bottom:1rem; }' +
        '.team-alert-success { background:#dcfce7; color:#16a34a; }' +
        '.team-alert-error { background:#fee2e2; color:#dc2626; }' +
        '.team-stats { display:grid; grid-template-columns:repeat(3, 1fr); gap:0.75rem; margin-bottom:1.25rem; }' +
        '.team-stat { background:#f9fafb; border-radius:10px; padding:0.75rem; text-align:center; border:1px solid #e5e7eb; }' +
        '.team-stat-value { font-size:1.25rem; font-weight:700; color:#1e40af; }' +
        '.team-stat-label { font-size:0.75rem; color:#6b7280; margin-top:0.15rem; }' +
        '.team-actions { display:flex; gap:0.35rem; }' +
        '.team-btn { padding:0.3rem 0.6rem; border-radius:6px; border:none; font-size:0.75rem; font-weight:600; cursor:pointer; transition:all 0.15s; }' +
        '.team-btn-ghost { background:#f3f4f6; color:#374151; }' +
        '.team-btn-ghost:hover { background:#e5e7eb; }' +
        '.team-btn-danger { background:#fee2e2; color:#dc2626; }' +
        '.team-btn-danger:hover { background:#fecaca; }' +
        '.team-btn-success { background:#dcfce7; color:#16a34a; }' +
        '.team-btn-success:hover { background:#bbf7d0; }' +
        '.team-form { display:grid; gap:0.75rem; margin-bottom:1.25rem; }' +
        '.team-form-row { display:grid; grid-template-columns:1fr 1fr; gap:0.75rem; }' +
        '.team-form-field label { display:block; font-size:0.82rem; font-weight:600; color:#374151; margin-bottom:0.25rem; }' +
        '.team-form-field input { width:100%; padding:0.5rem 0.65rem; border:1px solid #e5e7eb; border-radius:8px; font-size:0.88rem; box-sizing:border-box; }' +
        '.team-form-field input:focus { outline:none; border-color:#2563eb; box-shadow:0 0 0 2px rgba(37,99,235,0.15); }' +
        '.team-form-actions { display:flex; gap:0.75rem; justify-content:flex-end; margin-top:0.25rem; }' +
        '.team-btn-primary { background:#2563eb; color:#fff; padding:0.45rem 0.9rem; border-radius:6px; border:none; font-size:0.82rem; font-weight:600; cursor:pointer; }' +
        '.team-btn-primary:hover { background:#1d4ed8; }' +
        '.team-divider { border:none; border-top:1px solid #e5e7eb; margin:1rem 0; }' +
        '@media (max-width:640px) { .team-form-row { grid-template-columns:1fr; } .team-stats { grid-template-columns:1fr 1fr; } }';
    document.head.appendChild(teamModalStyle);


    // ----------------------------------------------------------
    // MODAL HTML
    // ----------------------------------------------------------
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
                '<div id="team-stats" class="team-stats"></div>' +
                '<div id="team-alert"></div>' +

                // Add user form
                '<details id="team-add-details">' +
                    '<summary style="cursor:pointer;font-weight:600;color:#2563eb;margin-bottom:0.75rem;font-size:0.92rem;">+ Add Frontdesk User</summary>' +
                    '<div class="team-form" id="team-add-form">' +
                        '<div class="team-form-row">' +
                            '<div class="team-form-field">' +
                                '<label>Username (min 3 chars)</label>' +
                                '<input type="text" id="team-new-username" placeholder="e.g. jsmith" style="text-transform:lowercase;">' +
                            '</div>' +
                            '<div class="team-form-field">' +
                                '<label>Display Name</label>' +
                                '<input type="text" id="team-new-display" placeholder="John Smith">' +
                            '</div>' +
                        '</div>' +
                        '<div class="team-form-row">' +
                            '<div class="team-form-field">' +
                                '<label>Password (min 8 chars)</label>' +
                                '<input type="password" id="team-new-pw" placeholder="Temporary password">' +
                            '</div>' +
                            '<div class="team-form-field">' +
                                '<label>Email (optional)</label>' +
                                '<input type="email" id="team-new-email" placeholder="user@example.com">' +
                            '</div>' +
                        '</div>' +
                        '<div class="team-form-actions">' +
                            '<button type="button" class="team-btn-primary" id="team-create-btn">Create Frontdesk Account</button>' +
                        '</div>' +
                    '</div>' +
                '</details>' +

                '<hr class="team-divider">' +
                '<div id="team-list"><div class="team-empty">Loading...</div></div>' +
            '</div>' +
        '</div>';
    document.body.appendChild(teamModal);


    // ----------------------------------------------------------
    // MODAL OPEN/CLOSE
    // ----------------------------------------------------------
    document.getElementById('team-close-btn').addEventListener('click', function () {
        teamModal.classList.remove('active');
    });
    teamModal.addEventListener('click', function (e) {
        if (e.target === teamModal) teamModal.classList.remove('active');
    });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && teamModal.classList.contains('active')) {
            teamModal.classList.remove('active');
        }
    });


    // ----------------------------------------------------------
    // HELPERS
    // ----------------------------------------------------------
    var _api = null;
    var _teamUsers = [];
    var _currentDealer = null;

    function getApi() {
        if (!_api) _api = window.ameridexAPI;
        return _api;
    }

    function esc(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function showTeamAlert(msg, type) {
        var el = document.getElementById('team-alert');
        if (!el) return;
        el.innerHTML = '<div class="team-alert team-alert-' + (type || 'success') + '">' + msg + '</div>';
        setTimeout(function () { el.innerHTML = ''; }, 4000);
    }


    // ----------------------------------------------------------
    // OPEN MODAL + LOAD TEAM
    // ----------------------------------------------------------
    function openTeamModal(dealer) {
        _currentDealer = dealer;
        teamModal.classList.add('active');
        loadTeamUsers();
    }

    function loadTeamUsers() {
        var container = document.getElementById('team-list');
        container.innerHTML = '<div class="team-empty">Loading team...</div>';

        var api = getApi();
        if (!api) {
            container.innerHTML = '<div class="team-empty">API not available</div>';
            return;
        }

        api('GET', '/api/users')
            .then(function (users) {
                _teamUsers = users || [];
                renderTeamStats();
                renderTeamTable();
            })
            .catch(function (err) {
                container.innerHTML = '<div class="team-empty">Failed to load team: ' + esc(err.message) + '</div>';
            });
    }


    // ----------------------------------------------------------
    // STATS
    // ----------------------------------------------------------
    function renderTeamStats() {
        var total = _teamUsers.length;
        var active = _teamUsers.filter(function (u) { return u.status === 'active'; }).length;
        var frontdesk = _teamUsers.filter(function (u) { return u.role === 'frontdesk'; }).length;

        document.getElementById('team-stats').innerHTML = '' +
            '<div class="team-stat"><div class="team-stat-value">' + total + '</div><div class="team-stat-label">Total</div></div>' +
            '<div class="team-stat"><div class="team-stat-value">' + active + '</div><div class="team-stat-label">Active</div></div>' +
            '<div class="team-stat"><div class="team-stat-value">' + frontdesk + '</div><div class="team-stat-label">Frontdesk</div></div>';
    }


    // ----------------------------------------------------------
    // USER TABLE WITH ACTIONS
    // ----------------------------------------------------------
    function renderTeamTable() {
        var container = document.getElementById('team-list');

        if (_teamUsers.length === 0) {
            container.innerHTML = '<div class="team-empty">No team members yet. Add a frontdesk user above.</div>';
            return;
        }

        var html = '<table class="team-table"><thead><tr>' +
            '<th>Name</th><th>Username</th><th>Role</th><th>Status</th><th>Last Login</th><th>Actions</th>' +
            '</tr></thead><tbody>';

        _teamUsers.forEach(function (u) {
            var roleBadge = u.role === 'gm' ? 'team-badge-gm' : 'team-badge-frontdesk';
            var statusClass = u.status === 'active' ? 'team-badge-active' : (u.status === 'disabled' ? 'team-badge-disabled' : 'team-badge-pending');
            var dateStr = 'Never';
            if (u.lastLogin) { try { dateStr = new Date(u.lastLogin).toLocaleDateString(); } catch(e) {} }

            // GM can only manage frontdesk users, not themselves or other GMs
            var isFrontdesk = u.role === 'frontdesk';
            var isSelf = _currentDealer && u.username === _currentDealer.username;

            var actionsHtml = '';
            if (isFrontdesk && !isSelf) {
                actionsHtml += '<button class="team-btn team-btn-ghost" data-action="reset-pw" data-id="' + u.id + '">Reset PW</button>';
                if (u.status === 'active') {
                    actionsHtml += '<button class="team-btn team-btn-danger" data-action="disable" data-id="' + u.id + '">Disable</button>';
                } else {
                    actionsHtml += '<button class="team-btn team-btn-success" data-action="enable" data-id="' + u.id + '">Enable</button>';
                }
            } else if (isSelf) {
                actionsHtml = '<span style="font-size:0.75rem;color:#6b7280;">You</span>';
            } else {
                actionsHtml = '<span style="font-size:0.75rem;color:#6b7280;"></span>';
            }

            html += '<tr>' +
                '<td><strong>' + esc(u.displayName || u.username) + '</strong>' +
                    (u.email ? '<br><span style="font-size:0.78rem;color:#6b7280;">' + esc(u.email) + '</span>' : '') +
                '</td>' +
                '<td>' + esc(u.username) + '</td>' +
                '<td><span class="team-badge ' + roleBadge + '">' + esc(u.role) + '</span></td>' +
                '<td><span class="team-badge ' + statusClass + '">' + esc(u.status || 'unknown') + '</span></td>' +
                '<td style="font-size:0.82rem;color:#6b7280;">' + dateStr + '</td>' +
                '<td class="team-actions">' + actionsHtml + '</td>' +
                '</tr>';
        });

        html += '</tbody></table>';
        container.innerHTML = html;

        // Wire up action buttons
        container.querySelectorAll('[data-action]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var action = btn.getAttribute('data-action');
                var id = btn.getAttribute('data-id');
                if (action === 'reset-pw') resetTeamUserPassword(id);
                if (action === 'disable') disableTeamUser(id);
                if (action === 'enable') enableTeamUser(id);
            });
        });
    }


    // ----------------------------------------------------------
    // CREATE FRONTDESK USER
    // ----------------------------------------------------------
    document.getElementById('team-create-btn').addEventListener('click', function () {
        var username = document.getElementById('team-new-username').value.trim().toLowerCase();
        var displayName = document.getElementById('team-new-display').value.trim();
        var pw = document.getElementById('team-new-pw').value;
        var email = document.getElementById('team-new-email').value.trim();

        if (!username || username.length < 3) {
            showTeamAlert('Username must be at least 3 characters', 'error');
            return;
        }
        if (!pw || pw.length < 8) {
            showTeamAlert('Password must be at least 8 characters', 'error');
            return;
        }

        var api = getApi();
        if (!api) { showTeamAlert('API not available', 'error'); return; }

        api('POST', '/api/users', {
            username: username,
            displayName: displayName || username,
            password: pw,
            email: email,
            role: 'frontdesk'
        })
            .then(function (newUser) {
                showTeamAlert('Account "' + esc(newUser.username) + '" created! Active and ready to log in.', 'success');
                document.getElementById('team-new-username').value = '';
                document.getElementById('team-new-display').value = '';
                document.getElementById('team-new-pw').value = '';
                document.getElementById('team-new-email').value = '';
                document.getElementById('team-add-details').removeAttribute('open');
                loadTeamUsers();
            })
            .catch(function (err) {
                showTeamAlert('Failed: ' + esc(err.message), 'error');
            });
    });


    // ----------------------------------------------------------
    // DISABLE / ENABLE
    // ----------------------------------------------------------
    function disableTeamUser(id) {
        var user = _teamUsers.find(function (u) { return u.id === id; });
        if (!user) return;
        if (!confirm('Disable user "' + user.username + '"? They will not be able to log in.')) return;

        var api = getApi();
        api('POST', '/api/users/' + id + '/disable')
            .then(function () {
                showTeamAlert('User ' + user.username + ' disabled.', 'success');
                loadTeamUsers();
            })
            .catch(function (err) {
                showTeamAlert('Failed: ' + esc(err.message), 'error');
            });
    }

    function enableTeamUser(id) {
        var user = _teamUsers.find(function (u) { return u.id === id; });
        if (!user) return;

        var api = getApi();
        api('POST', '/api/users/' + id + '/enable')
            .then(function () {
                showTeamAlert('User ' + user.username + ' enabled.', 'success');
                loadTeamUsers();
            })
            .catch(function (err) {
                showTeamAlert('Failed: ' + esc(err.message), 'error');
            });
    }


    // ----------------------------------------------------------
    // RESET PASSWORD
    // ----------------------------------------------------------
    function resetTeamUserPassword(id) {
        var user = _teamUsers.find(function (u) { return u.id === id; });
        if (!user) return;
        var newPw = prompt('New password for ' + user.username + ' (min 8 characters):');
        if (!newPw) return;
        if (newPw.length < 8) {
            showTeamAlert('Password must be at least 8 characters', 'error');
            return;
        }

        var api = getApi();
        api('POST', '/api/users/' + id + '/reset-password', { newPassword: newPw })
            .then(function () {
                showTeamAlert('Password reset for ' + user.username + '!', 'success');
            })
            .catch(function (err) {
                showTeamAlert('Failed: ' + esc(err.message), 'error');
            });
    }


    // ----------------------------------------------------------
    // INIT
    // ----------------------------------------------------------
    window.addEventListener('ameridex-login', function () {
        setTimeout(injectRoleButtons, 100);
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            setTimeout(injectRoleButtons, 500);
        });
    } else {
        setTimeout(injectRoleButtons, 500);
    }

    console.log('[AmeriDex Roles] v3.0 loaded (GM team management restored).');
})();
