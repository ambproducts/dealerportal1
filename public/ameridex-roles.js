// ============================================================
// AmeriDex Dealer Portal - Role System v2.0
// Date: 2026-02-16
// ============================================================
// Implements GM (General Manager) and Frontdesk (Frontman) roles
// at the dealer location level.
//
// ROLES:
//   gm       - Can create quotes, override prices immediately,
//              approve/reject override requests from frontdesk,
//              manage frontdesk user accounts (via Team modal)
//   frontdesk - Can create quotes, must REQUEST price overrides
//              (requires GM approval before submission)
//              NO access to user management
//   admin    - Full access (AmeriDex internal staff)
//   dealer   - Legacy role, treated as GM equivalent
//   rep      - Internal rep, treated as GM equivalent
//
// v2.0 Changes (2026-02-16):
//   - REMOVE: User management widget from main portal page
//   - ADD: GM Team panel (modal with Team tab) for managing frontdesk
//   - FIX: Frontdesk explicitly blocked from all user management UI
//   - FIX: Users categorized by dealer code in admin panel
//
// v1.2 Changes (2026-02-14):
//   - FIX: GM-created accounts are immediately active (no admin approval)
//
// REQUIRES: ameridex-patches.js, ameridex-api.js,
//           ameridex-pricing-fix.js, ameridex-overrides.js
// ============================================================

(function () {
    'use strict';

    var api = window.ameridexAPI;

    // ----------------------------------------------------------
    // ROLE HELPERS
    // ----------------------------------------------------------
    function getUserRole() {
        var user = window.getCurrentUser ? window.getCurrentUser() : null;
        if (!user) return 'frontdesk';
        return user.role || 'frontdesk';
    }

    function isApprover() {
        var role = getUserRole();
        return role === 'gm' || role === 'admin' || role === 'dealer' || role === 'rep';
    }

    function isFrontdesk() {
        return getUserRole() === 'frontdesk';
    }

    function getRoleLabel(role) {
        var labels = {
            admin: 'Admin',
            gm: 'General Manager',
            dealer: 'Manager',
            rep: 'Internal Rep',
            frontdesk: 'Sales Rep'
        };
        return labels[role] || role;
    }

    function getRoleBadgeColor(role) {
        var colors = {
            admin: { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
            gm: { bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd' },
            dealer: { bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd' },
            rep: { bg: '#f3e8ff', text: '#7c3aed', border: '#c4b5fd' },
            frontdesk: { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' }
        };
        return colors[role] || colors.frontdesk;
    }

    window.getUserRole = getUserRole;
    window.isApprover = isApprover;
    window.isFrontdesk = isFrontdesk;


    // ----------------------------------------------------------
    // 1. INJECT CSS FOR ROLE UI
    // ----------------------------------------------------------
    var roleCSS = document.createElement('style');
    roleCSS.textContent = [
        '/* Role Badge in Header */',
        '.header-role-badge{display:inline-flex;align-items:center;gap:0.3rem;padding:0.2rem 0.65rem;border-radius:999px;font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-right:0.25rem;border:1px solid;}',
        '.header-role-badge .role-dot{width:6px;height:6px;border-radius:50%;display:inline-block;}',
        '',
        '/* Override button in line items */',
        '.line-item-override-btn{font-size:0.68rem;padding:0.15rem 0.45rem;border:1px solid #d1d5db;border-radius:4px;background:#f9fafb;color:#6b7280;cursor:pointer;transition:all 0.15s;margin-left:0.5rem;vertical-align:middle;}',
        '.line-item-override-btn:hover{background:#eff6ff;border-color:#93c5fd;color:#1d4ed8;}',
        '.line-item-override-btn--pending{background:#fef3c7;border-color:#fcd34d;color:#92400e;}',
        '.line-item-override-btn--approved{background:#dcfce7;border-color:#86efac;color:#166534;}',
        '',
        '/* Custom price field lock for frontdesk */',
        '.price-field-locked{position:relative;}',
        '.price-field-locked input{background:#f3f4f6 !important;cursor:not-allowed !important;}',
        '.price-field-locked::after{content:"GM approval needed";position:absolute;right:0.5rem;top:50%;transform:translateY(-50%);font-size:0.65rem;color:#92400e;font-weight:600;pointer-events:none;}',
        '',
        '/* Welcome role announcement */',
        '.role-welcome{font-size:0.78rem;color:#6b7280;margin-top:0.15rem;}',
        '',
        '/* Override column in table */',
        '.override-cell{white-space:nowrap;text-align:center;min-width:90px;}',
        '',
        '/* --- GM Team Panel (Modal) --- */',
        '#gm-team-modal{display:none;position:fixed;inset:0;background:rgba(15,23,42,0.6);z-index:1900;justify-content:center;align-items:flex-start;padding:2rem 1rem;overflow-y:auto;}',
        '#gm-team-modal.active{display:flex;}',
        '#gm-team-panel{background:#fff;border-radius:14px;width:100%;max-width:720px;box-shadow:0 25px 50px rgba(0,0,0,0.25);max-height:90vh;display:flex;flex-direction:column;}',
        '.gm-team-header{background:linear-gradient(135deg,#0369a1,#0c4a6e);color:#fff;padding:1.25rem 1.5rem;border-radius:14px 14px 0 0;display:flex;justify-content:space-between;align-items:center;}',
        '.gm-team-header h2{margin:0;font-size:1.25rem;}',
        '.gm-team-close{background:none;border:none;color:#fff;font-size:1.5rem;cursor:pointer;padding:0.5rem;opacity:0.8;}',
        '.gm-team-close:hover{opacity:1;}',
        '.gm-team-body{padding:1.5rem;overflow-y:auto;flex:1;}',
        '',
        '/* Team button in header */',
        '.gm-team-btn{display:none;padding:0.35rem 0.75rem;border:1px solid #0ea5e9;border-radius:6px;background:#e0f2fe;color:#0369a1;font-size:0.78rem;font-weight:700;cursor:pointer;transition:all 0.15s;margin-right:0.35rem;}',
        '.gm-team-btn:hover{background:#bae6fd;}',
        '',
        '/* Reuse admin table styles for GM team */',
        '.gm-team-table{width:100%;border-collapse:collapse;font-size:0.85rem;margin-bottom:1rem;}',
        '.gm-team-table th{background:#f0f9ff;padding:0.6rem 0.7rem;text-align:left;font-weight:700;color:#0c4a6e;border-bottom:2px solid #bae6fd;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.04em;}',
        '.gm-team-table td{padding:0.55rem 0.7rem;border-bottom:1px solid #e0f2fe;vertical-align:middle;}',
        '.gm-team-table tr:hover td{background:#f0f9ff;}',
        '.gm-team-stat-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:0.75rem;margin-bottom:1rem;}',
        '.gm-team-stat{background:#f0f9ff;border-radius:8px;padding:0.75rem;text-align:center;border:1px solid #bae6fd;}',
        '.gm-team-stat-value{font-size:1.35rem;font-weight:700;color:#0369a1;}',
        '.gm-team-stat-label{font-size:0.72rem;color:#6b7280;margin-top:0.15rem;}',
        '',
        '/* Status badges */',
        '.user-status-badge{display:inline-flex;align-items:center;padding:0.12rem 0.45rem;border-radius:999px;font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;}',
        '.user-status-badge--active{background:#dcfce7;color:#166534;border:1px solid #86efac;}',
        '.user-status-badge--pending{background:#fef3c7;color:#92400e;border:1px solid #fcd34d;}',
        '.user-status-badge--disabled{background:#f3f4f6;color:#6b7280;border:1px solid #d1d5db;}',
        '.user-status-badge--rejected{background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;}',
        '',
        '/* Action buttons */',
        '.user-action-btn{font-size:0.7rem;padding:0.2rem 0.5rem;border-radius:4px;cursor:pointer;border:1px solid;transition:all 0.15s;margin-right:0.25rem;font-weight:600;}',
        '.user-action-btn--disable{background:#fff;color:#dc2626;border-color:#fca5a5;}',
        '.user-action-btn--disable:hover{background:#fee2e2;}',
        '.user-action-btn--enable{background:#fff;color:#16a34a;border-color:#86efac;}',
        '.user-action-btn--enable:hover{background:#dcfce7;}',
        '.user-action-btn--reset{background:#fff;color:#0369a1;border-color:#7dd3fc;}',
        '.user-action-btn--reset:hover{background:#e0f2fe;}',
        '',
        '/* Create user form inside GM team panel */',
        '.gm-create-user-toggle{font-size:0.82rem;padding:0.45rem 0.9rem;border:1px solid #0ea5e9;border-radius:6px;background:#fff;color:#0369a1;cursor:pointer;font-weight:600;transition:all 0.15s;}',
        '.gm-create-user-toggle:hover{background:#e0f2fe;}',
        '.gm-create-user-form{background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:1rem;margin-top:0.75rem;display:none;}',
        '.gm-create-user-form.active{display:block;}',
        '.gm-create-user-form .form-row{display:flex;gap:0.75rem;margin-bottom:0.65rem;flex-wrap:wrap;}',
        '.gm-create-user-form .form-field{flex:1;min-width:180px;}',
        '.gm-create-user-form label{display:block;font-size:0.72rem;font-weight:600;color:#374151;margin-bottom:0.2rem;}',
        '.gm-create-user-form input{width:100%;padding:0.45rem 0.6rem;border:1px solid #d1d5db;border-radius:5px;font-size:0.82rem;box-sizing:border-box;}',
        '.gm-create-user-form input:focus{outline:none;border-color:#0ea5e9;box-shadow:0 0 0 2px rgba(14,165,233,0.15);}',
        '.gm-create-user-form .form-actions{display:flex;gap:0.5rem;margin-top:0.25rem;}',
        '.gm-create-user-form .btn-create-user{padding:0.45rem 1rem;border:none;border-radius:5px;background:#0ea5e9;color:#fff;font-size:0.82rem;font-weight:600;cursor:pointer;}',
        '.gm-create-user-form .btn-create-user:disabled{opacity:0.5;cursor:not-allowed;}',
        '.gm-create-user-form .btn-cancel-create{padding:0.45rem 1rem;border:1px solid #d1d5db;border-radius:5px;background:#fff;color:#374151;font-size:0.82rem;cursor:pointer;}',
        '.gm-create-user-form .form-error{color:#dc2626;font-size:0.78rem;margin-top:0.35rem;display:none;}',
        '.gm-create-user-form .form-success{color:#16a34a;font-size:0.78rem;margin-top:0.35rem;display:none;}',
        '',
        '/* Reset password inline */',
        '.reset-pw-inline{display:inline-flex;align-items:center;gap:0.35rem;margin-top:0.25rem;}',
        '.reset-pw-inline input{width:140px;padding:0.25rem 0.4rem;border:1px solid #d1d5db;border-radius:4px;font-size:0.75rem;}',
        '.reset-pw-inline button{font-size:0.68rem;padding:0.2rem 0.45rem;border-radius:4px;border:1px solid #0ea5e9;background:#e0f2fe;color:#0369a1;cursor:pointer;font-weight:600;}',
        '',
        '@media (max-width:600px){',
        '  #gm-team-panel{max-width:100%;margin:0;border-radius:10px;}',
        '  .gm-create-user-form .form-row{flex-direction:column;}',
        '}'
    ].join('\n');
    document.head.appendChild(roleCSS);


    // ----------------------------------------------------------
    // 2. INJECT ROLE BADGE INTO HEADER
    // ----------------------------------------------------------
    function injectRoleBadge() {
        var user = window.getCurrentUser ? window.getCurrentUser() : null;
        if (!user) return;

        var existing = document.getElementById('header-role-badge');
        if (existing) existing.remove();

        var role = user.role || 'frontdesk';
        var colors = getRoleBadgeColor(role);
        var label = getRoleLabel(role);

        var badge = document.createElement('span');
        badge.id = 'header-role-badge';
        badge.className = 'header-role-badge';
        badge.style.background = colors.bg;
        badge.style.color = colors.text;
        badge.style.borderColor = colors.border;
        badge.innerHTML =
            '<span class="role-dot" style="background:' + colors.text + ';"></span>' +
            label;

        var headerActions = document.querySelector('.header-actions');
        if (headerActions) {
            var dealerCode = document.getElementById('header-dealer-code');
            if (dealerCode) {
                headerActions.insertBefore(badge, dealerCode);
            } else {
                headerActions.insertBefore(badge, headerActions.firstChild);
            }
        }

        if (typeof dealerCode !== 'undefined' && dealerCode && user.username) {
            var currentText = dealerCode.textContent || '';
            if (currentText.indexOf('|') !== -1 && currentText.indexOf(user.username) === -1) {
            } else if (currentText.indexOf(user.username) === -1) {
                dealerCode.textContent = currentText + ' | ' + user.username;
            }
        }
    }


    // ----------------------------------------------------------
    // 3. PATCH renderDesktop() TO ADD OVERRIDE BUTTONS PER ROW
    // ----------------------------------------------------------
    var _prevRenderDesktopForRoles = window.renderDesktop;
    window.renderDesktop = function () {
        if (typeof _prevRenderDesktopForRoles === 'function') {
            _prevRenderDesktopForRoles();
        }

        if (typeof currentQuote === 'undefined' || !currentQuote.lineItems) return;
        var tbody = document.querySelector('#line-items tbody');
        if (!tbody) return;
        var rows = tbody.querySelectorAll('tr');

        currentQuote.lineItems.forEach(function (item, i) {
            if (!rows[i]) return;
            if (item.type === 'custom') return;

            var row = rows[i];
            if (row.querySelector('.line-item-override-btn')) return;

            var firstCell = row.cells ? row.cells[0] : null;
            if (!firstCell) return;

            var overrideBtn = document.createElement('button');
            overrideBtn.type = 'button';
            overrideBtn.className = 'line-item-override-btn';

            if (item.priceOverride) {
                if (item.priceOverride.status === 'pending') {
                    overrideBtn.className += ' line-item-override-btn--pending';
                    overrideBtn.textContent = 'Pending';
                    overrideBtn.title = 'Override pending GM approval';
                } else if (item.priceOverride.status === 'approved') {
                    overrideBtn.className += ' line-item-override-btn--approved';
                    overrideBtn.textContent = 'Overridden';
                    overrideBtn.title = 'Price override approved';
                } else {
                    overrideBtn.textContent = 'Override';
                    overrideBtn.title = 'Request price override';
                }
            } else {
                overrideBtn.textContent = 'Override';
                overrideBtn.title = isApprover() ? 'Override price (immediate)' : 'Request price override';
            }

            overrideBtn.addEventListener('click', (function (idx, itm) {
                return function () {
                    var quoteServerId = null;
                    if (typeof savedQuotes !== 'undefined' && typeof currentQuote !== 'undefined' && currentQuote.quoteId) {
                        var match = savedQuotes.find(function (q) { return q.quoteId === currentQuote.quoteId; });
                        if (match) quoteServerId = match._serverId;
                    }

                    if (!quoteServerId) {
                        if (typeof saveCurrentQuote === 'function') {
                            saveCurrentQuote();
                            setTimeout(function () {
                                var m = savedQuotes.find(function (q) { return q.quoteId === currentQuote.quoteId; });
                                if (m && m._serverId) {
                                    var tierPrice = window.getDisplayPrice(itm);
                                    var prod = (typeof PRODUCTS !== 'undefined' && PRODUCTS[itm.type]) ? PRODUCTS[itm.type] : { name: itm.type };
                                    window._handleOverrideClick(m._serverId, idx, tierPrice, prod.name || itm.type);
                                } else {
                                    alert('Please save the quote first before requesting an override.');
                                }
                            }, 1500);
                        }
                        return;
                    }

                    var tierPrice = window.getDisplayPrice(itm);
                    var prod = (typeof PRODUCTS !== 'undefined' && PRODUCTS[itm.type]) ? PRODUCTS[itm.type] : { name: itm.type };
                    window._handleOverrideClick(quoteServerId, idx, tierPrice, prod.name || itm.type);
                };
            })(i, item));

            var priceContainer = document.createElement('div');
            priceContainer.style.cssText = 'display:flex;align-items:center;gap:0.35rem;flex-wrap:wrap;margin-top:0.25rem;';
            priceContainer.appendChild(overrideBtn);

            if (item.priceOverride && typeof window.getOverridePriceHTML === 'function') {
                var infoDiv = document.createElement('div');
                infoDiv.innerHTML = window.getOverridePriceHTML(item);
                priceContainer.appendChild(infoDiv);
            }

            firstCell.appendChild(priceContainer);
        });
    };


    // ----------------------------------------------------------
    // 4. LOCK CUSTOM ITEM UNIT PRICE FOR FRONTDESK
    // ----------------------------------------------------------
    function lockCustomPriceFields() {
        if (!isFrontdesk()) return;

        var tbody = document.querySelector('#line-items tbody');
        if (!tbody) return;
        if (typeof currentQuote === 'undefined' || !currentQuote.lineItems) return;

        currentQuote.lineItems.forEach(function (item, i) {
            if (item.type !== 'custom') return;
            var rows = tbody.querySelectorAll('tr');
            if (!rows[i]) return;

            var priceInputs = rows[i].querySelectorAll('input[type="number"]');
            priceInputs.forEach(function (input) {
                if (input.classList.contains('qty-input')) return;
                if (input.min === '1' && input.step !== '0.01') return;

                if (!input.parentElement.classList.contains('price-field-locked')) {
                    input.readOnly = true;
                    input.parentElement.classList.add('price-field-locked');
                    input.title = 'Price changes require GM approval for your role';
                }
            });
        });
    }

    var _prevRenderForLock = window.renderDesktop;
    window.renderDesktop = function () {
        if (typeof _prevRenderForLock === 'function') {
            _prevRenderForLock();
        }
        setTimeout(lockCustomPriceFields, 50);
    };


    // ----------------------------------------------------------
    // 5. VISIBILITY CONTROL FOR ROLE-BASED UI
    // ----------------------------------------------------------
    function applyRoleVisibility() {
        var role = getUserRole();

        // GM overrides widget
        var gmWidget = document.getElementById('gm-overrides-widget');
        if (gmWidget) {
            if (!isApprover()) {
                gmWidget.style.display = 'none';
            }
        }

        // Admin button: admin only
        var adminBtn = document.getElementById('admin-btn');
        if (adminBtn) {
            adminBtn.style.display = (role === 'admin') ? 'inline-block' : 'none';
        }

        // GM Team button: gm only (not frontdesk, not admin since admin has full panel)
        var teamBtn = document.getElementById('gm-team-btn');
        if (teamBtn) {
            teamBtn.style.display = (role === 'gm') ? 'inline-block' : 'none';
        }

        // Legacy users widget: hide for everyone (moved to GM Team modal / Admin panel)
        var usersWidget = document.getElementById('gm-users-widget');
        if (usersWidget) {
            usersWidget.style.display = 'none';
        }
    }


    // ----------------------------------------------------------
    // 6. GM TEAM PANEL (MODAL)
    // ----------------------------------------------------------
    var _gmTeamModalCreated = false;

    function createGMTeamModal() {
        if (_gmTeamModalCreated) return;
        if (document.getElementById('gm-team-modal')) return;

        var user = window.getCurrentUser ? window.getCurrentUser() : null;
        if (!user || user.role !== 'gm') return;

        // Create "Team" button in header
        var headerActions = document.querySelector('.header-actions');
        if (headerActions && !document.getElementById('gm-team-btn')) {
            var teamBtn = document.createElement('button');
            teamBtn.type = 'button';
            teamBtn.id = 'gm-team-btn';
            teamBtn.className = 'gm-team-btn';
            teamBtn.innerHTML = '&#128101; Team';
            teamBtn.style.display = 'inline-block';
            teamBtn.addEventListener('click', function () {
                var modal = document.getElementById('gm-team-modal');
                if (modal) {
                    modal.classList.add('active');
                    loadGMTeamUsers();
                }
            });

            var adminBtn = document.getElementById('admin-btn');
            if (adminBtn) {
                headerActions.insertBefore(teamBtn, adminBtn);
            } else {
                var logoutBtn = document.getElementById('logout-btn');
                if (logoutBtn) {
                    headerActions.insertBefore(teamBtn, logoutBtn);
                } else {
                    headerActions.appendChild(teamBtn);
                }
            }
        }

        // Create modal
        var modal = document.createElement('div');
        modal.id = 'gm-team-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.innerHTML =
            '<div id="gm-team-panel">' +
                '<div class="gm-team-header">' +
                    '<h2>&#128101; My Team</h2>' +
                    '<button class="gm-team-close" id="gm-team-close-btn" aria-label="Close">&times;</button>' +
                '</div>' +
                '<div class="gm-team-body">' +
                    '<div id="gm-team-stats" class="gm-team-stat-row"></div>' +
                    '<div id="gm-team-alert"></div>' +
                    '<div id="gm-team-table-container"></div>' +
                    '<div style="margin-top:1rem;">' +
                        '<button type="button" class="gm-create-user-toggle" id="gm-create-user-toggle">' +
                            '+ Create Frontdesk Account' +
                        '</button>' +
                    '</div>' +
                    '<div class="gm-create-user-form" id="gm-create-user-form">' +
                        '<div class="form-row">' +
                            '<div class="form-field">' +
                                '<label for="gm-new-username">Username</label>' +
                                '<input type="text" id="gm-new-username" placeholder="e.g., jsmith" autocomplete="off">' +
                            '</div>' +
                            '<div class="form-field">' +
                                '<label for="gm-new-display-name">Display Name</label>' +
                                '<input type="text" id="gm-new-display-name" placeholder="e.g., John Smith">' +
                            '</div>' +
                        '</div>' +
                        '<div class="form-row">' +
                            '<div class="form-field">' +
                                '<label for="gm-new-password">Password (min 8 chars)</label>' +
                                '<input type="password" id="gm-new-password" placeholder="Temporary password" autocomplete="new-password">' +
                            '</div>' +
                            '<div class="form-field">' +
                                '<label for="gm-new-email">Email (optional)</label>' +
                                '<input type="email" id="gm-new-email" placeholder="john@example.com">' +
                            '</div>' +
                        '</div>' +
                        '<div class="form-row">' +
                            '<div class="form-field">' +
                                '<label for="gm-new-phone">Phone (optional)</label>' +
                                '<input type="tel" id="gm-new-phone" placeholder="(555) 123-4567">' +
                            '</div>' +
                            '<div class="form-field"></div>' +
                        '</div>' +
                        '<div class="form-error" id="gm-create-error"></div>' +
                        '<div class="form-success" id="gm-create-success"></div>' +
                        '<div class="form-actions">' +
                            '<button type="button" class="btn-create-user" id="gm-create-submit">Create Account</button>' +
                            '<button type="button" class="btn-cancel-create" id="gm-create-cancel">Cancel</button>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>';

        document.body.appendChild(modal);

        // Close handlers
        document.getElementById('gm-team-close-btn').addEventListener('click', function () {
            modal.classList.remove('active');
        });
        modal.addEventListener('click', function (e) {
            if (e.target === modal) modal.classList.remove('active');
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && modal.classList.contains('active')) {
                modal.classList.remove('active');
            }
        });

        // Toggle create form
        document.getElementById('gm-create-user-toggle').addEventListener('click', function () {
            var form = document.getElementById('gm-create-user-form');
            form.classList.toggle('active');
            if (form.classList.contains('active')) {
                document.getElementById('gm-new-username').focus();
                this.style.display = 'none';
            } else {
                this.style.display = '';
            }
        });

        document.getElementById('gm-create-cancel').addEventListener('click', function () {
            var form = document.getElementById('gm-create-user-form');
            form.classList.remove('active');
            clearCreateForm();
            document.getElementById('gm-create-user-toggle').style.display = '';
        });

        document.getElementById('gm-create-submit').addEventListener('click', handleCreateUser);

        _gmTeamModalCreated = true;
    }

    // Expose toggle for external use
    window.toggleGMTeamPanel = function () {
        var user = window.getCurrentUser ? window.getCurrentUser() : null;
        if (!user || user.role !== 'gm') {
            alert('GM access required.');
            return;
        }
        var modal = document.getElementById('gm-team-modal');
        if (modal) {
            modal.classList.toggle('active');
            if (modal.classList.contains('active')) {
                loadGMTeamUsers();
            }
        }
    };


    // ----------------------------------------------------------
    // 6a. LOAD AND RENDER TEAM USERS TABLE
    // ----------------------------------------------------------
    function loadGMTeamUsers() {
        var user = window.getCurrentUser ? window.getCurrentUser() : null;
        if (!user || user.role !== 'gm') return;

        api('GET', '/api/users')
            .then(function (users) {
                renderGMTeamStats(users);
                renderGMTeamTable(users);
            })
            .catch(function (err) {
                var container = document.getElementById('gm-team-table-container');
                if (container) {
                    container.innerHTML = '<div style="color:#dc2626;font-size:0.88rem;">Failed to load team: ' + (err.message || 'Unknown error') + '</div>';
                }
            });
    }

    function renderGMTeamStats(users) {
        var statsEl = document.getElementById('gm-team-stats');
        if (!statsEl) return;

        var total = users.length;
        var active = users.filter(function (u) { return u.status === 'active'; }).length;
        var frontdeskCount = users.filter(function (u) { return u.role === 'frontdesk'; }).length;

        statsEl.innerHTML =
            '<div class="gm-team-stat"><div class="gm-team-stat-value">' + total + '</div><div class="gm-team-stat-label">Total Users</div></div>' +
            '<div class="gm-team-stat"><div class="gm-team-stat-value">' + active + '</div><div class="gm-team-stat-label">Active</div></div>' +
            '<div class="gm-team-stat"><div class="gm-team-stat-value">' + frontdeskCount + '</div><div class="gm-team-stat-label">Frontdesk</div></div>';
    }

    function getStatusBadgeHTML(status) {
        var cls = 'user-status-badge user-status-badge--' + (status || 'pending');
        var label = status || 'unknown';
        if (status === 'active') label = 'Active';
        if (status === 'pending') label = 'Pending Approval';
        if (status === 'disabled') label = 'Disabled';
        if (status === 'rejected') label = 'Rejected';
        return '<span class="' + cls + '">' + label + '</span>';
    }

    function renderGMTeamTable(users) {
        var container = document.getElementById('gm-team-table-container');
        if (!container) return;

        if (users.length === 0) {
            container.innerHTML = '<p style="color:#6b7280;font-size:0.85rem;margin:0.5rem 0;">No team members found. Create a frontdesk account below.</p>';
            return;
        }

        var currentUser = window.getCurrentUser ? window.getCurrentUser() : null;
        var escapeHTML = window.escapeHTML || function (s) { return s; };

        var html = '<table class="gm-team-table">';
        html += '<thead><tr>';
        html += '<th>Username</th>';
        html += '<th>Display Name</th>';
        html += '<th>Role</th>';
        html += '<th>Status</th>';
        html += '<th>Last Login</th>';
        html += '<th>Actions</th>';
        html += '</tr></thead>';
        html += '<tbody>';

        users.forEach(function (u) {
            var isSelf = currentUser && u.id === currentUser.id;
            var isFrontdeskUser = u.role === 'frontdesk';
            var canManage = !isSelf && isFrontdeskUser;

            html += '<tr data-user-id="' + u.id + '">';
            html += '<td><strong>' + escapeHTML(u.username) + '</strong></td>';
            html += '<td>' + escapeHTML(u.displayName || u.username) + '</td>';
            html += '<td>' + getRoleLabel(u.role) + '</td>';
            html += '<td>' + getStatusBadgeHTML(u.status) + '</td>';
            html += '<td style="font-size:0.78rem;color:#6b7280;">';
            if (u.lastLogin) {
                html += new Date(u.lastLogin).toLocaleDateString();
            } else {
                html += 'Never';
            }
            html += '</td>';
            html += '<td>';

            if (canManage) {
                if (u.status === 'active') {
                    html += '<button class="user-action-btn user-action-btn--disable" data-action="disable" data-uid="' + u.id + '" data-uname="' + escapeHTML(u.username) + '">Disable</button>';
                } else if (u.status === 'disabled' || u.status === 'rejected') {
                    html += '<button class="user-action-btn user-action-btn--enable" data-action="enable" data-uid="' + u.id + '" data-uname="' + escapeHTML(u.username) + '">Enable</button>';
                }
                html += '<button class="user-action-btn user-action-btn--reset" data-action="reset" data-uid="' + u.id + '" data-uname="' + escapeHTML(u.username) + '">Reset PW</button>';
            } else if (isSelf) {
                html += '<span style="font-size:0.72rem;color:#9ca3af;">(You)</span>';
            } else {
                html += '<span style="font-size:0.72rem;color:#9ca3af;">N/A</span>';
            }

            html += '</td>';
            html += '</tr>';
        });

        html += '</tbody></table>';
        container.innerHTML = html;

        // Wire action buttons
        container.querySelectorAll('[data-action="disable"]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                handleDisableUser(btn.getAttribute('data-uid'), btn.getAttribute('data-uname'));
            });
        });
        container.querySelectorAll('[data-action="enable"]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                handleEnableUser(btn.getAttribute('data-uid'), btn.getAttribute('data-uname'));
            });
        });
        container.querySelectorAll('[data-action="reset"]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                handleResetPassword(btn.getAttribute('data-uid'), btn.getAttribute('data-uname'), btn);
            });
        });
    }


    // ----------------------------------------------------------
    // 6b. CREATE FRONTDESK ACCOUNT
    // ----------------------------------------------------------
    function clearCreateForm() {
        document.getElementById('gm-new-username').value = '';
        document.getElementById('gm-new-display-name').value = '';
        document.getElementById('gm-new-password').value = '';
        document.getElementById('gm-new-email').value = '';
        document.getElementById('gm-new-phone').value = '';
        document.getElementById('gm-create-error').style.display = 'none';
        document.getElementById('gm-create-success').style.display = 'none';
    }

    function showCreateError(msg) {
        var el = document.getElementById('gm-create-error');
        el.textContent = msg;
        el.style.display = 'block';
        document.getElementById('gm-create-success').style.display = 'none';
    }

    function showCreateSuccess(msg) {
        var el = document.getElementById('gm-create-success');
        el.textContent = msg;
        el.style.display = 'block';
        document.getElementById('gm-create-error').style.display = 'none';
    }

    function handleCreateUser() {
        var username = document.getElementById('gm-new-username').value.trim();
        var displayName = document.getElementById('gm-new-display-name').value.trim();
        var password = document.getElementById('gm-new-password').value;
        var email = document.getElementById('gm-new-email').value.trim();
        var phone = document.getElementById('gm-new-phone').value.trim();

        if (!username || username.length < 3) {
            showCreateError('Username must be at least 3 characters.');
            document.getElementById('gm-new-username').focus();
            return;
        }
        if (/[^a-zA-Z0-9._-]/.test(username)) {
            showCreateError('Username can only contain letters, numbers, dots, hyphens, and underscores.');
            document.getElementById('gm-new-username').focus();
            return;
        }
        if (!password || password.length < 8) {
            showCreateError('Password must be at least 8 characters.');
            document.getElementById('gm-new-password').focus();
            return;
        }

        var submitBtn = document.getElementById('gm-create-submit');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating...';

        api('POST', '/api/users', {
            username: username,
            password: password,
            displayName: displayName || username,
            email: email,
            phone: phone,
            role: 'frontdesk'
        })
            .then(function (newUser) {
                showCreateSuccess(
                    'Account "' + newUser.username + '" created successfully. ' +
                    'Account is active and ready to log in.'
                );
                clearCreateForm();
                submitBtn.disabled = false;
                submitBtn.textContent = 'Create Account';
                loadGMTeamUsers();
            })
            .catch(function (err) {
                showCreateError(err.message || 'Failed to create account.');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Create Account';
            });
    }


    // ----------------------------------------------------------
    // 6c. DISABLE / ENABLE / RESET PASSWORD
    // ----------------------------------------------------------
    function showTeamAlert(msg, type) {
        var el = document.getElementById('gm-team-alert');
        if (!el) return;
        el.innerHTML = '<div style="padding:0.6rem 0.8rem;border-radius:6px;font-size:0.85rem;margin-bottom:0.75rem;' +
            (type === 'error' ? 'background:#fee2e2;color:#dc2626;' : 'background:#dcfce7;color:#16a34a;') +
            '">' + msg + '</div>';
        setTimeout(function () { el.innerHTML = ''; }, 3500);
    }

    function handleDisableUser(userId, username) {
        if (!confirm('Disable account "' + username + '"? They will not be able to log in.')) return;

        api('POST', '/api/users/' + userId + '/disable')
            .then(function () {
                showTeamAlert('Account "' + username + '" disabled.', 'success');
                loadGMTeamUsers();
            })
            .catch(function (err) {
                showTeamAlert('Failed to disable: ' + (err.message || 'Unknown error'), 'error');
            });
    }

    function handleEnableUser(userId, username) {
        if (!confirm('Enable account "' + username + '"?')) return;

        api('POST', '/api/users/' + userId + '/enable')
            .then(function () {
                showTeamAlert('Account "' + username + '" enabled.', 'success');
                loadGMTeamUsers();
            })
            .catch(function (err) {
                showTeamAlert('Failed to enable: ' + (err.message || 'Unknown error'), 'error');
            });
    }

    function handleResetPassword(userId, username, btn) {
        var row = btn.closest('tr');
        var existing = row.querySelector('.reset-pw-inline');
        if (existing) {
            existing.remove();
            return;
        }

        var actionsCell = btn.closest('td');
        var inline = document.createElement('div');
        inline.className = 'reset-pw-inline';
        inline.innerHTML =
            '<input type="password" placeholder="New password (8+ chars)" class="reset-pw-input">' +
            '<button type="button" class="reset-pw-confirm">Set</button>';

        actionsCell.appendChild(inline);
        var pwInput = inline.querySelector('.reset-pw-input');
        pwInput.focus();

        inline.querySelector('.reset-pw-confirm').addEventListener('click', function () {
            var newPassword = pwInput.value;
            if (!newPassword || newPassword.length < 8) {
                pwInput.style.borderColor = '#dc2626';
                pwInput.placeholder = 'Min 8 characters!';
                pwInput.value = '';
                pwInput.focus();
                return;
            }

            api('POST', '/api/users/' + userId + '/reset-password', {
                newPassword: newPassword
            })
                .then(function () {
                    inline.innerHTML = '<span style="color:#16a34a;font-size:0.72rem;font-weight:600;">Password reset!</span>';
                    setTimeout(function () { inline.remove(); }, 2000);
                })
                .catch(function (err) {
                    inline.innerHTML = '<span style="color:#dc2626;font-size:0.72rem;">' + (err.message || 'Failed') + '</span>';
                    setTimeout(function () { inline.remove(); }, 3000);
                });
        });

        pwInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                inline.querySelector('.reset-pw-confirm').click();
            }
        });
    }


    // ----------------------------------------------------------
    // 7. PATCH ADMIN PANEL: ADD GM/FRONTDESK TO ROLE DROPDOWN
    // ----------------------------------------------------------
    function patchAdminDealerForm() {
        var roleSelect = document.getElementById('admin-new-role');
        if (!roleSelect) return;
        if (roleSelect.querySelector('option[value="gm"]')) return;

        roleSelect.innerHTML =
            '<option value="gm">GM (General Manager)</option>' +
            '<option value="frontdesk">Frontdesk (Sales Rep)</option>' +
            '<option value="dealer">Dealer (Legacy)</option>' +
            '<option value="rep">Internal Rep</option>' +
            '<option value="admin">Admin</option>';
    }


    // ----------------------------------------------------------
    // 8. PATCH LOGIN WELCOME FLOW
    // ----------------------------------------------------------
    var _prevUpdateHeader = window.updateHeaderForDealer;
    if (typeof _prevUpdateHeader === 'function') {
        window.updateHeaderForDealer = function () {
            _prevUpdateHeader();
            injectRoleBadge();
            applyRoleVisibility();
        };
    }


    // ----------------------------------------------------------
    // 9. SUBMIT GATE ENHANCEMENT FOR FRONTDESK
    // ----------------------------------------------------------
    var _prevShowReviewModal = window.showReviewModal;
    window.showReviewModal = function () {
        if (typeof _prevShowReviewModal === 'function') {
            _prevShowReviewModal();
        }

        if (isFrontdesk()) {
            var hasPending = false;
            if (typeof currentQuote !== 'undefined' && currentQuote.lineItems) {
                hasPending = currentQuote.lineItems.some(function (li) {
                    return li.priceOverride && li.priceOverride.status === 'pending';
                });
            }

            if (hasPending) {
                var warningEl = document.getElementById('submit-block-warning');
                if (warningEl) {
                    warningEl.innerHTML =
                        '<span class="warning-icon">&#9888;</span>' +
                        '<span>You have <strong>pending price overrides</strong> on this quote. ' +
                        'Your GM must approve them before you can submit. ' +
                        'Please ask your General Manager to review the pending overrides.</span>';
                    warningEl.style.display = 'flex';
                }
            }
        }
    };


    // ----------------------------------------------------------
    // 10. PERIODIC REFRESH ON APP VISIBILITY
    // ----------------------------------------------------------
    var mainApp = document.getElementById('main-app');
    if (mainApp) {
        var roleObserver = new MutationObserver(function () {
            if (!mainApp.classList.contains('app-hidden')) {
                injectRoleBadge();
                applyRoleVisibility();
                patchAdminDealerForm();
                createGMTeamModal();
            }
        });
        roleObserver.observe(mainApp, { attributes: true, attributeFilter: ['class'] });
    }


    // ----------------------------------------------------------
    // 11. INIT
    // ----------------------------------------------------------
    function initRoles() {
        var user = window.getCurrentUser ? window.getCurrentUser() : null;
        if (!user) {
            setTimeout(initRoles, 1000);
            return;
        }

        injectRoleBadge();
        applyRoleVisibility();
        patchAdminDealerForm();

        if (user.role === 'gm') {
            createGMTeamModal();
        }

        console.log('[Roles] v2.0 initialized for role: ' + user.role +
            ' (' + getRoleLabel(user.role) + ')' +
            ' | Approver: ' + isApprover() +
            ' | Frontdesk: ' + isFrontdesk());
    }

    setTimeout(initRoles, 600);

    console.log('[AmeriDex Roles] v2.0 loaded: GM Team panel + Frontdesk restricted.');
})();
