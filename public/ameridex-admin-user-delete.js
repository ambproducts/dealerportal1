// ============================================================
// AmeriDex Dealer Portal - Admin User & Dealer Delete v1.1
// Date: 2026-02-27
// ============================================================
// Adds Delete buttons to the Users tab in the Admin Panel.
// - Delete button on each user row (hidden for current admin)
// - Delete Dealer button on each dealer group header
// - Soft-delete via backend API with confirmation prompts
//
// REQUIRES: ameridex-api.js and ameridex-admin.js loaded first
// Load AFTER ameridex-admin.js in dealer-portal.html
//
// v1.1 Changes (2026-02-27):
//   - FIX: Replace MutationObserver with polling interval for
//     reliable button injection regardless of DOM timing.
//   - FIX: Use robust parent traversal instead of CSS attribute
//     selectors for group header detection (browser style
//     normalization was breaking [style*="display:flex"] matches).
//   - FIX: Increase delay and add retry logic for tab clicks.
// ============================================================

(function () {
    'use strict';

    var _api = window.ameridexAPI;

    // ----------------------------------------------------------
    // HELPERS
    // ----------------------------------------------------------
    function esc(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function getCurrentUsername() {
        var dealer = window.getCurrentDealer ? window.getCurrentDealer() : null;
        return dealer ? (dealer.username || '').toLowerCase() : '';
    }

    function showUserAlert(msg, type) {
        var el = document.getElementById('admin-user-alert');
        if (!el) return;
        el.innerHTML = '<div class="admin-' + (type || 'success') + '">' + msg + '</div>';
        setTimeout(function () { el.innerHTML = ''; }, 4000);
    }

    // ----------------------------------------------------------
    // INJECT DELETE BUTTONS
    // ----------------------------------------------------------
    function injectDeleteButtons() {
        var container = document.getElementById('admin-users-list');
        if (!container) return false;

        // Check if there are any user tables rendered yet
        var tables = container.querySelectorAll('.admin-table');
        if (tables.length === 0) return false;

        var currentUsername = getCurrentUsername();
        var injectedAny = false;

        // --- 1. Add Delete button to each user row ---
        var actionCells = container.querySelectorAll('.admin-actions');
        actionCells.forEach(function (td) {
            // Skip if already injected
            if (td.querySelector('[data-udelete="1"]')) return;

            // Find the toggle-user button to get the user ID
            var toggleBtn = td.querySelector('[data-action="toggle-user"]');
            if (!toggleBtn) return;
            var userId = toggleBtn.getAttribute('data-id');
            if (!userId) return;

            // Find the username from this row
            var row = td.closest('tr');
            if (!row) return;
            var usernameCell = row.querySelector('td:first-child strong');
            var rowUsername = usernameCell ? usernameCell.textContent.trim().toLowerCase() : '';

            // Don't show delete for the currently logged-in admin
            if (rowUsername === currentUsername) {
                injectedAny = true;
                return;
            }

            var deleteBtn = document.createElement('button');
            deleteBtn.className = 'admin-btn admin-btn-danger admin-btn-sm';
            deleteBtn.setAttribute('data-udelete', '1');
            deleteBtn.setAttribute('data-id', userId);
            deleteBtn.textContent = 'Delete';
            deleteBtn.addEventListener('click', function () {
                deleteAdminUser(userId, rowUsername);
            });
            td.appendChild(deleteBtn);
            injectedAny = true;
        });

        // --- 2. Add Delete Dealer button to each group header ---
        // The group headers are built by ameridex-admin.js as:
        //   <div style="margin-bottom:1.25rem;">
        //     <div style="display:flex;align-items:center;gap:0.5rem;...">
        //       <span style="font-weight:700;...">CODE</span>
        //       <span class="admin-badge badge-dealer">N users</span>
        //     </div>
        //     <table class="admin-table">...</table>
        //   </div>
        // Strategy: find all .admin-badge.badge-dealer spans, then go to parentElement (the header div)
        var dealerBadges = container.querySelectorAll('.admin-badge.badge-dealer');
        dealerBadges.forEach(function (badge) {
            var headerDiv = badge.parentElement;
            if (!headerDiv) return;

            // Skip if already injected
            if (headerDiv.querySelector('[data-ddelete="1"]')) return;

            // Find the dealer code from the sibling bold span
            var codeSpan = null;
            var children = headerDiv.children;
            for (var i = 0; i < children.length; i++) {
                var child = children[i];
                if (child.tagName === 'SPAN' && child !== badge) {
                    var style = child.getAttribute('style') || '';
                    if (style.indexOf('font-weight') !== -1 || child.style.fontWeight) {
                        codeSpan = child;
                        break;
                    }
                }
            }
            if (!codeSpan) return;
            var dealerCode = codeSpan.textContent.trim();
            if (!dealerCode || dealerCode === 'UNKNOWN') return;

            var deleteBtn = document.createElement('button');
            deleteBtn.className = 'admin-btn admin-btn-danger admin-btn-sm';
            deleteBtn.style.marginLeft = 'auto';
            deleteBtn.setAttribute('data-ddelete', '1');
            deleteBtn.setAttribute('data-code', dealerCode);
            deleteBtn.textContent = 'Delete Dealer';
            deleteBtn.addEventListener('click', function () {
                deleteEntireDealer(dealerCode);
            });
            headerDiv.appendChild(deleteBtn);
            injectedAny = true;
        });

        return injectedAny;
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
            'This will soft-delete the user. They can be restored later.'
        )) return;

        _api('DELETE', '/api/admin/users/' + userId)
            .then(function () {
                showUserAlert('User "' + esc(displayInfo) + '" deleted successfully.', 'success');
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

        // Count users in this dealer group from the DOM
        var container = document.getElementById('admin-users-list');
        var userCount = 0;
        var userList = '';
        if (container) {
            var dealerBadges = container.querySelectorAll('.admin-badge.badge-dealer');
            dealerBadges.forEach(function (badge) {
                var headerDiv = badge.parentElement;
                if (!headerDiv) return;
                var codeSpan = null;
                var children = headerDiv.children;
                for (var i = 0; i < children.length; i++) {
                    if (children[i].tagName === 'SPAN' && children[i] !== badge) {
                        codeSpan = children[i];
                        break;
                    }
                }
                if (!codeSpan || codeSpan.textContent.trim() !== dealerCode) return;
                var groupDiv = headerDiv.parentElement;
                if (!groupDiv) return;
                var rows = groupDiv.querySelectorAll('tbody tr');
                userCount = rows.length;
                rows.forEach(function (row) {
                    var un = row.querySelector('td:first-child strong');
                    var role = row.querySelector('.admin-badge');
                    if (un) {
                        userList += '\n  - ' + un.textContent.trim();
                        if (role) userList += ' (' + role.textContent.trim() + ')';
                    }
                });
            });
        }

        var msg = 'Delete dealer "' + dealerCode + '"';
        if (userCount > 0) {
            msg += ' and all ' + userCount + ' user(s)?' + '\n\nUsers affected:' + userList;
        } else {
            msg += '?';
        }
        msg += '\n\nThis will soft-delete the dealer. It can be restored later.';

        if (!confirm(msg)) return;

        _api('GET', '/api/admin/dealers')
            .then(function (dealers) {
                var dealer = dealers.find(function (d) { return d.dealerCode === dealerCode; });
                if (!dealer) {
                    showUserAlert('Dealer record not found for code: ' + dealerCode, 'error');
                    return;
                }
                return _api('DELETE', '/api/admin/dealers/' + dealer.id);
            })
            .then(function (result) {
                if (result !== undefined) {
                    showUserAlert('Dealer "' + esc(dealerCode) + '" and associated users deleted.', 'success');
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
    // POLLING: Check every 500ms if Users tab needs buttons
    // Much more reliable than MutationObserver for innerHTML swaps
    // ----------------------------------------------------------
    var _pollTimer = null;
    var _lastCount = 0;

    function startPolling() {
        if (_pollTimer) return;
        _pollTimer = setInterval(function () {
            var container = document.getElementById('admin-users-list');
            if (!container) return;

            // Only inject when the Users tab is visible
            var usersTabContent = document.getElementById('admin-tab-users');
            if (!usersTabContent || !usersTabContent.classList.contains('active')) return;

            // Check if tables exist and buttons haven't been injected yet
            var tables = container.querySelectorAll('.admin-table');
            var existingDeleteBtns = container.querySelectorAll('[data-udelete="1"]');
            var existingDealerBtns = container.querySelectorAll('[data-ddelete="1"]');

            // If table count changed or no delete buttons yet, inject
            var tableCount = tables.length;
            if (tableCount > 0 && (existingDeleteBtns.length === 0 && existingDealerBtns.length === 0) || tableCount !== _lastCount) {
                _lastCount = tableCount;
                injectDeleteButtons();
            }
        }, 500);
    }

    // Start polling immediately
    startPolling();

    console.log('[AmeriDex Admin User Delete] v1.1 loaded.');
})();
