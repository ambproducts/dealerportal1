// ============================================================
// AmeriDex Dealer Portal - Role System v1.0
// Date: 2026-02-14
// ============================================================
// Implements GM (General Manager) and Frontdesk (Frontman) roles
// at the dealer location level.
//
// ROLES:
//   gm       - Can create quotes, override prices immediately,
//              approve/reject override requests from frontdesk
//   frontdesk - Can create quotes, must REQUEST price overrides
//              (requires GM approval before submission)
//   admin    - Full access (AmeriDex internal staff)
//   dealer   - Legacy role, treated as GM equivalent
//   rep      - Internal rep, treated as GM equivalent
//
// REQUIRES: ameridex-patches.js, ameridex-api.js,
//           ameridex-pricing-fix.js, ameridex-overrides.js
//
// Load order in dealer-portal.html (before </body>):
//   <script src="ameridex-patches.js"></script>
//   <script src="ameridex-api.js"></script>
//   <script src="ameridex-pricing-fix.js"></script>
//   <script src="ameridex-overrides.js"></script>
//   <script src="ameridex-roles.js"></script>
//   <script src="ameridex-admin.js"></script>
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

    // Expose helpers globally
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
        '.override-cell{white-space:nowrap;text-align:center;min-width:90px;}'
    ].join('\n');
    document.head.appendChild(roleCSS);


    // ----------------------------------------------------------
    // 2. INJECT ROLE BADGE INTO HEADER
    // ----------------------------------------------------------
    function injectRoleBadge() {
        var user = window.getCurrentUser ? window.getCurrentUser() : null;
        if (!user) return;

        // Remove existing badge if any
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

        // Also show username in the dealer code display
        if (dealerCode && user.username) {
            var currentText = dealerCode.textContent || '';
            if (currentText.indexOf('|') !== -1 && currentText.indexOf(user.username) === -1) {
                // Already has dealer name, add username
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
        // Call previous renderDesktop (pricing-fix.js version)
        if (typeof _prevRenderDesktopForRoles === 'function') {
            _prevRenderDesktopForRoles();
        }

        // Now inject override buttons into each row
        if (typeof currentQuote === 'undefined' || !currentQuote.lineItems) return;
        var tbody = document.querySelector('#line-items tbody');
        if (!tbody) return;
        var rows = tbody.querySelectorAll('tr');

        currentQuote.lineItems.forEach(function (item, i) {
            if (!rows[i]) return;
            if (item.type === 'custom') return; // Custom items have manual pricing

            var row = rows[i];

            // Check if override button already injected
            if (row.querySelector('.line-item-override-btn')) return;

            // Find the price display area (first cell, after product info)
            var firstCell = row.cells ? row.cells[0] : null;
            if (!firstCell) return;

            // Build override button
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

            // Click handler
            overrideBtn.addEventListener('click', (function (idx, itm) {
                return function () {
                    var quoteServerId = null;
                    if (typeof savedQuotes !== 'undefined' && typeof currentQuote !== 'undefined' && currentQuote.quoteId) {
                        var match = savedQuotes.find(function (q) { return q.quoteId === currentQuote.quoteId; });
                        if (match) quoteServerId = match._serverId;
                    }

                    if (!quoteServerId) {
                        // Save first to get a server ID
                        if (typeof saveCurrentQuote === 'function') {
                            saveCurrentQuote();
                            // Retry after save
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

            // Insert the button and any override badge HTML
            var priceContainer = document.createElement('div');
            priceContainer.style.cssText = 'display:flex;align-items:center;gap:0.35rem;flex-wrap:wrap;margin-top:0.25rem;';
            priceContainer.appendChild(overrideBtn);

            // Add override price info if it exists
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

        // Find all custom item unit price inputs and disable them
        var tbody = document.querySelector('#line-items tbody');
        if (!tbody) return;

        if (typeof currentQuote === 'undefined' || !currentQuote.lineItems) return;

        currentQuote.lineItems.forEach(function (item, i) {
            if (item.type !== 'custom') return;

            // Find unit price input in this row
            var rows = tbody.querySelectorAll('tr');
            if (!rows[i]) return;

            var priceInputs = rows[i].querySelectorAll('input[type="number"]');
            priceInputs.forEach(function (input) {
                // Check if this is a unit price input (not qty)
                if (input.classList.contains('qty-input')) return;
                if (input.min === '1' && input.step !== '0.01') return;

                // Lock it
                if (!input.parentElement.classList.contains('price-field-locked')) {
                    input.readOnly = true;
                    input.parentElement.classList.add('price-field-locked');
                    input.title = 'Price changes require GM approval for your role';
                }
            });
        });
    }

    // Hook into render cycle
    var _prevRenderForLock = window.renderDesktop;
    window.renderDesktop = function () {
        if (typeof _prevRenderForLock === 'function') {
            _prevRenderForLock();
        }
        // Lock custom price fields after render
        setTimeout(lockCustomPriceFields, 50);
    };


    // ----------------------------------------------------------
    // 5. VISIBILITY CONTROL FOR GM-ONLY UI
    // ----------------------------------------------------------
    function applyRoleVisibility() {
        var role = getUserRole();

        // GM overrides widget: only visible to approvers
        var gmWidget = document.getElementById('gm-overrides-widget');
        if (gmWidget) {
            if (!isApprover()) {
                gmWidget.style.display = 'none';
            }
            // If approver, loadPendingOverrides handles visibility
        }

        // Admin button: only for admin role
        var adminBtn = document.getElementById('admin-btn');
        if (adminBtn) {
            adminBtn.style.display = (role === 'admin') ? 'inline-block' : 'none';
        }
    }


    // ----------------------------------------------------------
    // 6. PATCH ADMIN PANEL: ADD GM/FRONTDESK TO ROLE DROPDOWN
    // ----------------------------------------------------------
    function patchAdminDealerForm() {
        var roleSelect = document.getElementById('admin-new-role');
        if (!roleSelect) return;

        // Check if already patched
        if (roleSelect.querySelector('option[value="gm"]')) return;

        // Clear existing options and add new ones
        roleSelect.innerHTML =
            '<option value="gm">GM (General Manager)</option>' +
            '<option value="frontdesk">Frontdesk (Sales Rep)</option>' +
            '<option value="dealer">Dealer (Legacy)</option>' +
            '<option value="rep">Internal Rep</option>' +
            '<option value="admin">Admin</option>';
    }


    // ----------------------------------------------------------
    // 7. PATCH LOGIN WELCOME FLOW
    // ----------------------------------------------------------
    // After login, show a brief role-aware welcome message
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
    // 8. SUBMIT GATE ENHANCEMENT FOR FRONTDESK
    // ----------------------------------------------------------
    // When frontdesk tries to submit, double-check for pending
    // overrides and show a clear, role-specific message.
    // ----------------------------------------------------------
    var _prevShowReviewModal = window.showReviewModal;
    window.showReviewModal = function () {
        if (typeof _prevShowReviewModal === 'function') {
            _prevShowReviewModal();
        }

        if (isFrontdesk()) {
            // Check for pending overrides
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
    // 9. PERIODIC ROLE BADGE REFRESH
    // ----------------------------------------------------------
    // Re-inject role badge when navigating back to main app
    // ----------------------------------------------------------
    var mainApp = document.getElementById('main-app');
    if (mainApp) {
        var roleObserver = new MutationObserver(function () {
            if (!mainApp.classList.contains('app-hidden')) {
                injectRoleBadge();
                applyRoleVisibility();
                patchAdminDealerForm();
            }
        });
        roleObserver.observe(mainApp, { attributes: true, attributeFilter: ['class'] });
    }


    // ----------------------------------------------------------
    // 10. INIT
    // ----------------------------------------------------------
    function initRoles() {
        var user = window.getCurrentUser ? window.getCurrentUser() : null;
        if (!user) {
            // Not logged in yet, retry
            setTimeout(initRoles, 1000);
            return;
        }

        injectRoleBadge();
        applyRoleVisibility();
        patchAdminDealerForm();

        console.log('[Roles] v1.0 initialized for role: ' + user.role +
            ' (' + getRoleLabel(user.role) + ')' +
            ' | Approver: ' + isApprover() +
            ' | Frontdesk: ' + isFrontdesk());
    }

    // Delay init to let auth complete
    setTimeout(initRoles, 600);

    console.log('[AmeriDex Roles] v1.0 loaded: GM/Frontdesk role system active.');
})();
