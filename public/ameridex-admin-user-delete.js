// ============================================================
// AmeriDex Dealer Portal - Admin User & Dealer Delete v1.2
// Date: 2026-02-27
// ============================================================
// Adds Delete buttons to the Users tab in the Admin Panel.
// - Delete button on each user row (hidden for current admin)
// - Delete Dealer button on each dealer group header
// - Soft-delete via backend API with confirmation prompts
//
// REQUIRES: ameridex-api.js and ameridex-admin.js loaded first
// Load AFTER ameridex-admin-delete.js in script-loader.js
//
// v1.2 Changes (2026-02-27):
//   - FIX: Lazy-resolve window.ameridexAPI inside apiCall() wrapper.
//   - FIX: Observe document.body (not specific container) + 300ms poll.
//   - FIX: Matches patterns from working ameridex-admin-delete.js.
// ============================================================

(function () {
    'use strict';

    // ----------------------------------------------------------
    // CONFIG
    // ----------------------------------------------------------
    var POLL_MS = 300;
    var MAX_POLLS = 400;
    var _polls = 0;

    // ----------------------------------------------------------
    // API HELPER (lazy resolve - do NOT cache at top)
    // ----------------------------------------------------------
    function apiCall(method, url, body) {
        var api = window.ameridexAPI;
        if (api) return api(method, url, body);
        return Promise.reject(new Error('ameridexAPI not available'));
    }

    // ----------------------------------------------------------
    // HELPERS
    // ----------------------------------------------------------
    function esc(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function getCurrentDealer() {
        return window.getCurrentDealer ? window.getCurrentDealer() : null;
    }

    function getCurrentUsername() {
        var dealer = getCurrentDealer();
        return dealer ? (dealer.username || '').toLowerCase() : '';
    }

    function getCurrentRole() {
        var dealer = getCurrentDealer();
        return dealer ? dealer.role : null;
    }

    function canDelete() {
        var role = getCurrentRole();
        return role === 'admin' || role === 'gm';
    }

    function showUserAlert(msg, type) {
        var el = document.getElementById('admin-user-alert');
        if (!el) return;
        el.innerHTML = '<div class="admin-' + (type || 'success') + '">' + msg + '</div>';
        setTimeout(function () { el.innerHTML = ''; }, 4000);
    }

    // ----------------------------------------------------------
    // INJECT DELETE BUTTONS INTO USERS TABLE
    // ----------------------------------------------------------
    function injectUserDeleteButtons() {
        if (!canDelete()) return;

        var container = document.getElementById('admin-users-list');
        if (!container) return;

        var currentUsername = getCurrentUsername();

        // Find all tables inside the users list
        var tables = container.querySelectorAll('table');
        if (tables.length === 0) return;

        tables.forEach(function (table) {
            // Skip if already processed
            if (table.dataset.adxUserDelInjected === 'true') return;

            var rows = table.querySelectorAll('tbody tr');
            if (rows.length === 0) return;

            // Mark as processed
            table.dataset.adxUserDelInjected = 'true';

            rows.forEach(function (row) {
                // Find the actions cell (last td, or td with admin-actions class)
                var actionCell = row.querySelector('.admin-actions') || row.querySelector('td:last-child');
                if (!actionCell) return;
                if (actionCell.querySelector('.adx-user-del-btn')) return;

                // Get user ID from toggle-user button
                var toggleBtn = actionCell.querySelector('[data-action="toggle-user"]');
                if (!toggleBtn) return;
                var userId = toggleBtn.getAttribute('data-id');
                if (!userId) return;

                // Get username from first cell
                var firstCell = row.querySelector('td:first-child');
                var usernameEl = firstCell ? firstCell.querySelector('strong') : null;
                var rowUsername = usernameEl ? usernameEl.textContent.trim().toLowerCase() : '';

                // Don't show delete for the currently logged-in admin
                if (rowUsername === currentUsername && currentUsername !== '') return;

                var deleteBtn = document.createElement('button');
                deleteBtn.className = 'admin-btn admin-btn-danger admin-btn-sm adx-user-del-btn';
                deleteBtn.textContent = 'Delete';
                deleteBtn.style.marginLeft = '0.2rem';
                deleteBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    deleteAdminUser(userId, rowUsername);
                });
                actionCell.appendChild(deleteBtn);
            });
        });
    }

    // ----------------------------------------------------------
    // INJECT DELETE DEALER BUTTONS INTO GROUP HEADERS
    // ----------------------------------------------------------
    function injectDealerDeleteButtons() {
        if (!canDelete()) return;

        var container = document.getElementById('admin-users-list');
        if (!container) return;

        // Strategy: find .admin-badge.badge-dealer spans ("N users" badges)
        // Their parent div is the group header flex container
        var badges = container.querySelectorAll('.admin-badge.badge-dealer');
        if (badges.length === 0) return;

        badges.forEach(function (badge) {
            var headerDiv = badge.parentElement;
            if (!headerDiv) return;

            // Skip if already injected
            if (headerDiv.querySelector('.adx-dealer-del-btn')) return;

            // Find dealer code span (sibling span with font-weight in style)
            var dealerCode = '';
            var children = headerDiv.children;
            for (var i = 0; i < children.length; i++) {
                var child = children[i];
                if (child === badge) continue;
                if (child.tagName === 'SPAN') {
                    var st = child.getAttribute('style') || '';
                    if (st.indexOf('font-weight') !== -1) {
                        dealerCode = child.textContent.trim();
                        break;
                    }
                }
            }

            // Fallback: try first span that is not the badge
            if (!dealerCode) {
                for (var j = 0; j < children.length; j++) {
                    if (children[j] !== badge && children[j].tagName === 'SPAN') {
                        dealerCode = children[j].textContent.trim();
                        break;
                    }
                }
            }

            if (!dealerCode || dealerCode === 'UNKNOWN') return;

            var deleteBtn = document.createElement('button');
            deleteBtn.className = 'admin-btn admin-btn-danger admin-btn-sm adx-dealer-del-btn';
            deleteBtn.textContent = 'Delete Dealer';
            deleteBtn.style.marginLeft = 'auto';
            deleteBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                deleteEntireDealer(dealerCode);
            });
            headerDiv.appendChild(deleteBtn);
        });
    }

    // ----------------------------------------------------------
    // DELETE USER (soft delete)
    // ----------------------------------------------------------
    function deleteAdminUser(userId, username) {
        var currentUsername = getCurrentUsername();
        if (username && username.toLowerCase() === currentUsername) {
            showUserAlert('You cannot delete your own account.', 'error');
            return;
        }

        var displayInfo = username || userId;

        if (!confirm(
            'Delete user "' + displayInfo + '"?\n\n' +
            'This will soft-delete the user.'
        )) return;

        apiCall('DELETE', '/api/admin/users/' + userId)
            .then(function () {
                showUserAlert('User "' + esc(displayInfo) + '" deleted.', 'success');
                reloadUsersTab();
            })
            .catch(function (err) {
                showUserAlert('Delete failed: ' + esc(err.message), 'error');
            });
    }

    // ----------------------------------------------------------
    // DELETE ENTIRE DEALER (soft delete + cascade)
    // ----------------------------------------------------------
    function deleteEntireDealer(dealerCode) {
        if (!dealerCode) return;

        if (!confirm(
            'Delete dealer "' + dealerCode + '" and ALL its users?\n\n' +
            'This will soft-delete the dealer and all associated users.'
        )) return;

        apiCall('GET', '/api/admin/dealers')
            .then(function (dealers) {
                var dealer = dealers.find(function (d) { return d.dealerCode === dealerCode; });
                if (!dealer) {
                    showUserAlert('Dealer not found: ' + dealerCode, 'error');
                    return;
                }
                return apiCall('DELETE', '/api/admin/dealers/' + dealer.id);
            })
            .then(function (result) {
                if (result !== undefined) {
                    showUserAlert('Dealer "' + esc(dealerCode) + '" deleted.', 'success');
                    reloadUsersTab();
                }
            })
            .catch(function (err) {
                showUserAlert('Delete failed: ' + esc(err.message), 'error');
            });
    }

    // ----------------------------------------------------------
    // RELOAD USERS TAB
    // ----------------------------------------------------------
    function reloadUsersTab() {
        var usersTab = document.querySelector('.admin-tab[data-tab="users"]');
        if (usersTab) {
            usersTab.click();
        }
    }

    // ----------------------------------------------------------
    // RUN ALL INJECTIONS
    // ----------------------------------------------------------
    function runInjections() {
        if (!canDelete()) return;
        injectUserDeleteButtons();
        injectDealerDeleteButtons();
    }

    // ----------------------------------------------------------
    // MUTATION OBSERVER on document.body (proven pattern)
    // ----------------------------------------------------------
    var observer = new MutationObserver(function () {
        runInjections();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // ----------------------------------------------------------
    // POLLING FALLBACK (proven pattern from admin-delete.js)
    // ----------------------------------------------------------
    var poller = setInterval(function () {
        _polls++;
        if (_polls > MAX_POLLS) {
            clearInterval(poller);
            return;
        }
        runInjections();
    }, POLL_MS);

    console.log('[ameridex-admin-user-delete] v1.2 loaded');
})();
