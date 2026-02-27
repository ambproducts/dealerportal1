// ============================================================
// AmeriDex Dealer Portal - Admin User & Dealer Delete v1.0
// Date: 2026-02-27
// ============================================================
// Adds Delete buttons to the Users tab in the Admin Panel.
// - Delete button on each user row (hidden for current admin)
// - Delete Dealer button on each dealer group header
// - Soft-delete via backend API with confirmation prompts
//
// REQUIRES: ameridex-api.js and ameridex-admin.js loaded first
// Load AFTER ameridex-admin.js in dealer-portal.html
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
        if (!container) return;

        var currentUsername = getCurrentUsername();

        // --- 1. Add Delete button to each user row ---
        var actionCells = container.querySelectorAll('.admin-actions');
        actionCells.forEach(function (td) {
            // Skip if already injected
            if (td.querySelector('[data-action="delete-user"]')) return;

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
            if (rowUsername === currentUsername) return;

            var deleteBtn = document.createElement('button');
            deleteBtn.className = 'admin-btn admin-btn-danger admin-btn-sm';
            deleteBtn.setAttribute('data-action', 'delete-user');
            deleteBtn.setAttribute('data-id', userId);
            deleteBtn.textContent = 'Delete';
            deleteBtn.addEventListener('click', function () {
                deleteAdminUser(userId, rowUsername);
            });
            td.appendChild(deleteBtn);
        });

        // --- 2. Add Delete Dealer button to each group header ---
        var groupHeaders = container.querySelectorAll('div[style*="display:flex"][style*="align-items:center"]');
        groupHeaders.forEach(function (header) {
            // Skip if already injected
            if (header.querySelector('[data-action="delete-dealer"]')) return;

            // Get dealer code from the header text
            var codeSpan = header.querySelector('span[style*="font-weight:700"]');
            if (!codeSpan) return;
            var dealerCode = codeSpan.textContent.trim();
            if (!dealerCode || dealerCode === 'UNKNOWN') return;

            var deleteBtn = document.createElement('button');
            deleteBtn.className = 'admin-btn admin-btn-danger admin-btn-sm';
            deleteBtn.style.marginLeft = 'auto';
            deleteBtn.setAttribute('data-action', 'delete-dealer');
            deleteBtn.setAttribute('data-code', dealerCode);
            deleteBtn.textContent = 'Delete Dealer';
            deleteBtn.addEventListener('click', function () {
                deleteEntireDealer(dealerCode);
            });
            header.appendChild(deleteBtn);
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

        // Fetch user details for confirmation message
        var displayInfo = username || userId;

        if (!confirm(
            'Delete user "' + displayInfo + '"?\n\n' +
            'This will soft-delete the user. They can be restored later.'
        )) return;

        _api('DELETE', '/api/admin/users/' + userId)
            .then(function () {
                showUserAlert('User "' + esc(displayInfo) + '" deleted successfully.', 'success');
                // Reload the Users tab
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
            var groupHeaders = container.querySelectorAll('div[style*="display:flex"][style*="align-items:center"]');
            groupHeaders.forEach(function (header) {
                var codeSpan = header.querySelector('span[style*="font-weight:700"]');
                if (codeSpan && codeSpan.textContent.trim() === dealerCode) {
                    var parent = header.parentElement;
                    if (parent) {
                        var rows = parent.querySelectorAll('tbody tr');
                        userCount = rows.length;
                        rows.forEach(function (row) {
                            var un = row.querySelector('td:first-child strong');
                            var role = row.querySelector('.admin-badge');
                            if (un) {
                                userList += '\n  - ' + un.textContent.trim();
                                if (role) userList += ' (' + role.textContent.trim() + ')';
                            }
                        });
                    }
                }
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

        // Find dealer ID from the dealers API
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
        // Trigger the Users tab click to reload data
        var usersTab = document.querySelector('.admin-tab[data-tab="users"]');
        if (usersTab) {
            usersTab.click();
        }
    }

    // ----------------------------------------------------------
    // MUTATION OBSERVER - watch for Users tab re-renders
    // ----------------------------------------------------------
    var usersList = document.getElementById('admin-users-list');
    if (usersList) {
        var observer = new MutationObserver(function () {
            // Small delay to let the admin.js finish rendering
            setTimeout(injectDeleteButtons, 50);
        });
        observer.observe(usersList, { childList: true, subtree: true });
    }

    // Also inject on Users tab click
    document.addEventListener('click', function (e) {
        var tab = e.target.closest('.admin-tab[data-tab="users"]');
        if (tab) {
            // Wait for data to load and render
            setTimeout(injectDeleteButtons, 500);
        }
    });

    console.log('[AmeriDex Admin User Delete] v1.0 loaded.');
})();
