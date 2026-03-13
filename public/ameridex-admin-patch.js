// ============================================================
// AmeriDex Admin Panel Patch v2.3 - GM Account Password
// Date: 2026-03-04
// ============================================================
// REQUIRES: ameridex-admin.js (v1.8+) loaded first
//
// v2.3 Changes (2026-03-04):
//   - RENAME: "Change Password" section -> "Change GM Account Password"
//   - ADD: On dealer edit open, fetch GET /api/admin/users and display
//     all gm-role users for that dealer's dealerCode in a read-only
//     info block. If multiple GMs exist, a <select> lets admin choose
//     which account to change the password for.
//   - FIX: saveDealerPassword() now routes to
//     POST /api/admin/users/:gmUserId/reset-password (the user record)
//     instead of the legacy POST /api/admin/dealers/:id/change-password
//     (which only changed the dealer record's own passwordHash, not the
//     GM user account in users.json).
//   - REMOVE: Standalone "Reset PW" button from dealers table rows,
//     since the inline edit form now fully covers this functionality.
//
// v2.2 Changes (2026-03-04):
//   - REPLACE: Prompt-based dealer edit (section 5) with full
//     inline edit form covering all profile fields + password.
//
// v2.1 Changes (2026-02-28):
//   - FIX: Per-dealer pricing API fixes.
//
// v2.0 Phase 2 (2026-02-28):
//   - REPLACE: Pricing tab with full per-dealer pricing editor.
//
// v1.0 Phase 1 (2026-02-28):
//   - Surgical removals: tier column, tier exemption, pricing tab rename.
// ============================================================

(function () {
    'use strict';

    var _api = window.ameridexAPI;
    if (!_api) {
        console.warn('[AdminPatch] ameridexAPI not found. Patch requires ameridex-api.js loaded first.');
        return;
    }


    // ----------------------------------------------------------
    // HELPERS
    // ----------------------------------------------------------
    function patchAlert(containerId, msg, type) {
        var el = document.getElementById(containerId);
        if (!el) return;
        el.textContent = '';
        var div = document.createElement('div');
        div.className = 'admin-' + (type || 'success');
        div.textContent = msg;
        el.appendChild(div);
        setTimeout(function () { el.textContent = ''; }, 4000);
    }

    function esc(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function escAttr(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function parsePricingResponse(data) {
        var map = {};
        if (data && data.products && Array.isArray(data.products)) {
            data.products.forEach(function (p) {
                if (p.isCustomized) {
                    map[p.productId] = p.dealerPrice;
                }
            });
        } else if (data && data.pricing && typeof data.pricing === 'object') {
            Object.keys(data.pricing).forEach(function (pid) {
                map[pid] = Number(data.pricing[pid]);
            });
        }
        return map;
    }


    // ----------------------------------------------------------
    // PATCH CSS
    // ----------------------------------------------------------
    var patchStyle = document.createElement('style');
    patchStyle.textContent = '' +
        '.dp-selector-row { display:flex; gap:0.75rem; align-items:flex-end; flex-wrap:wrap; margin-bottom:1.25rem; }' +
        '.dp-selector-row .admin-form-field { min-width:220px; }' +
        '.dp-selector-row select { width:100%; }' +
        '.dp-dealer-info { background:#f0f7ff; border:1px solid #bfdbfe; border-radius:8px; padding:0.75rem 1rem; ' +
            'margin-bottom:1rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; }' +
        '.dp-dealer-info-name { font-weight:700; color:#1e40af; font-size:1rem; }' +
        '.dp-dealer-info-code { font-size:0.85rem; color:#6b7280; }' +
        '.dp-price-input { width:90px; padding:0.4rem 0.5rem; border:1px solid #e5e7eb; border-radius:6px; ' +
            'font-size:0.85rem; text-align:right; font-weight:600; }' +
        '.dp-price-input:focus { outline:none; border-color:#2563eb; box-shadow:0 0 0 2px rgba(37,99,235,0.15); }' +
        '.dp-price-input.dp-modified { border-color:#f59e0b; background:#fffbeb; }' +
        '.dp-price-input.dp-override { border-color:#2563eb; background:#eff6ff; }' +
        '.dp-diff-up { color:#dc2626; font-size:0.78rem; font-weight:600; }' +
        '.dp-diff-down { color:#16a34a; font-size:0.78rem; font-weight:600; }' +
        '.dp-diff-same { color:#9ca3af; font-size:0.78rem; }' +
        '.dp-base-price { color:#9ca3af; font-size:0.82rem; }' +
        '.dp-override-badge { display:inline-block; padding:0.1rem 0.4rem; border-radius:4px; ' +
            'font-size:0.7rem; font-weight:600; background:#dbeafe; color:#1d4ed8; margin-left:0.35rem; }' +
        '.dp-actions-bar { display:flex; gap:0.5rem; flex-wrap:wrap; }' +
        '.dp-no-dealer { text-align:center; padding:2.5rem 1rem; color:#6b7280; }' +
        '.dp-no-dealer-icon { font-size:2.5rem; margin-bottom:0.5rem; }' +
        '.dp-category-header { background:#f9fafb; padding:0.5rem 0.75rem; font-weight:700; ' +
            'font-size:0.85rem; color:#374151; border-bottom:2px solid #e5e7eb; text-transform:uppercase; letter-spacing:0.05em; }' +
        '.dp-unsaved-bar { background:#fef3c7; border:1px solid #fcd34d; border-radius:8px; ' +
            'padding:0.6rem 1rem; margin-bottom:0.75rem; display:flex; justify-content:space-between; ' +
            'align-items:center; font-size:0.88rem; font-weight:600; color:#92400e; }' +
        '.dp-backend-error { background:#fef2f2; border:1px solid #fecaca; border-radius:10px; ' +
            'padding:2rem; text-align:center; color:#991b1b; }' +
        '.dp-backend-error code { background:#fee2e2; padding:0.2rem 0.5rem; border-radius:4px; font-size:0.82rem; }' +
        // v2.2: dealer inline edit slot
        '.dealer-edit-slot { padding:0.5rem 0.75rem 0.75rem; }' +
        '.dealer-pw-section { border-top:1px solid #e5e7eb; margin-top:1rem; padding-top:1rem; }' +
        '.dealer-pw-section h5 { margin:0 0 0.75rem; font-size:0.88rem; font-weight:700; color:#374151; }' +
        // v2.3: GM user info card inside edit form
        '.dealer-gm-info { background:#f9fafb; border:1px solid #e5e7eb; border-radius:8px; ' +
            'padding:0.75rem 1rem; margin-bottom:1rem; font-size:0.85rem; }' +
        '.dealer-gm-info-title { font-weight:700; color:#374151; margin-bottom:0.5rem; font-size:0.82rem; ' +
            'text-transform:uppercase; letter-spacing:0.04em; }' +
        '.dealer-gm-row { display:flex; align-items:center; gap:1.5rem; flex-wrap:wrap; padding:0.35rem 0; ' +
            'border-bottom:1px solid #f3f4f6; }' +
        '.dealer-gm-row:last-child { border-bottom:none; }' +
        '.dealer-gm-username { font-weight:700; color:#1e40af; }' +
        '.dealer-gm-detail { color:#6b7280; font-size:0.82rem; }' +
        '.dealer-gm-status-active { color:#16a34a; font-size:0.75rem; font-weight:700; }' +
        '.dealer-gm-status-inactive { color:#dc2626; font-size:0.75rem; font-weight:700; }' +
        '.dealer-gm-no-users { color:#6b7280; font-style:italic; font-size:0.85rem; }' +
        '';
    document.head.appendChild(patchStyle);


    // ----------------------------------------------------------
    // STATE
    // ----------------------------------------------------------
    var _patchDealers = [];
    var _patchProducts = [];
    var _selectedDealerId = null;
    var _dealerPrices = {};
    var _editedPrices = {};
    var _backendAvailable = null;


    // ===========================================================
    // PHASE 1: SURGICAL REMOVALS
    // ===========================================================

    // 1. RENAME "Pricing Tiers" TAB TO "Dealer Pricing"
    var pricingTabBtn = document.querySelector('.admin-tab[data-tab="pricing"]');
    if (pricingTabBtn) {
        pricingTabBtn.textContent = 'Dealer Pricing';
    }

    // 2. HIDE PRICING TIER DROPDOWN FROM ADD DEALER FORM
    var tierSelect = document.getElementById('admin-new-tier');
    if (tierSelect) {
        var tierFormRow = tierSelect.closest('.admin-form-row');
        if (tierFormRow) tierFormRow.style.display = 'none';
    }

    // 3. HIDE "EXEMPT FROM TIER DISCOUNTS" FROM ADD PRODUCT FORM
    var flatSelect = document.getElementById('admin-new-prod-flat');
    if (flatSelect) {
        var flatField = flatSelect.closest('.admin-form-field');
        if (flatField) flatField.style.display = 'none';
    }

    // 4. DEALERS TABLE: Remove Tier Column + "Reset PW" Button + Add Pricing Button
    function patchDealersTable() {
        var container = document.getElementById('admin-dealers-list');
        if (!container) return;
        var table = container.querySelector('.admin-table');
        if (!table) return;

        // Remove Tier column header
        var headers = table.querySelectorAll('thead th');
        var tierIdx = -1;
        headers.forEach(function (th, i) {
            if (th.textContent.trim() === 'Tier') tierIdx = i;
        });
        if (tierIdx !== -1) {
            headers[tierIdx].remove();
            table.querySelectorAll('tbody tr').forEach(function (row) {
                var cells = row.querySelectorAll('td');
                if (cells.length > tierIdx && cells[tierIdx]) {
                    cells[tierIdx].remove();
                }
            });
        }

        table.querySelectorAll('tbody tr[data-dealer-id]').forEach(function (row) {
            var actionsCell = row.querySelector('.admin-actions');
            if (!actionsCell) return;

            // v2.3: Remove the standalone "Reset PW" button - now handled inside inline edit
            actionsCell.querySelectorAll('[data-action="reset-pw"]').forEach(function (btn) {
                btn.remove();
            });

            // Add Pricing button if not already present
            if (actionsCell.querySelector('[data-action="pricing"]')) return;
            var dealerId = row.getAttribute('data-dealer-id');
            if (!dealerId) return;
            var pricingBtn = document.createElement('button');
            pricingBtn.className = 'admin-btn admin-btn-primary admin-btn-sm';
            pricingBtn.setAttribute('data-action', 'pricing');
            pricingBtn.setAttribute('data-id', dealerId);
            pricingBtn.textContent = 'Pricing';
            pricingBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                openPricingForDealer(dealerId);
            });
            actionsCell.insertBefore(pricingBtn, actionsCell.firstChild);
        });
    }

    var dealersList = document.getElementById('admin-dealers-list');
    if (dealersList) {
        new MutationObserver(patchDealersTable)
            .observe(dealersList, { childList: true, subtree: true });
    }


    // ===========================================================
    // 5. INLINE DEALER EDIT (v2.3 update)
    // ===========================================================

    function getDealerEditRow(dealerRow) {
        var existingNext = dealerRow.nextElementSibling;
        if (existingNext && existingNext.classList.contains('dealer-edit-row')) {
            return existingNext;
        }
        var slotRow = document.createElement('tr');
        slotRow.className = 'dealer-edit-row';
        slotRow.style.display = 'none';
        var colCount = dealerRow.querySelectorAll('td').length || 6;
        var td = document.createElement('td');
        td.colSpan = colCount;
        td.style.padding = '0';
        td.style.borderBottom = 'none';
        slotRow.appendChild(td);
        dealerRow.parentNode.insertBefore(slotRow, dealerRow.nextSibling);
        return slotRow;
    }

    function closeAllDealerEditForms() {
        document.querySelectorAll('.dealer-edit-row').forEach(function (row) {
            row.style.display = 'none';
            var td = row.querySelector('td');
            if (td) td.innerHTML = '';
        });
    }

    // Render the GM users info block HTML.
    // gmUsers: array of user objects with role === 'gm' for this dealer.
    // eid: escaped dealer id used for input IDs.
    function buildGmUsersBlock(gmUsers, eid) {
        var html = '<div class="dealer-gm-info">' +
            '<div class="dealer-gm-info-title">GM Account' + (gmUsers.length !== 1 ? 's' : '') + ' (' + gmUsers.length + ')</div>';

        if (gmUsers.length === 0) {
            html += '<div class="dealer-gm-no-users">No GM user accounts found for this dealer code.</div>';
        } else {
            gmUsers.forEach(function (u) {
                var statusClass = u.status === 'active' ? 'dealer-gm-status-active' : 'dealer-gm-status-inactive';
                var statusLabel = (u.status || 'unknown').toUpperCase();
                var lastLogin = 'Never';
                if (u.lastLogin) {
                    try { lastLogin = new Date(u.lastLogin).toLocaleDateString(); } catch (e) {}
                }
                html += '<div class="dealer-gm-row">' +
                    '<span class="dealer-gm-username">' + esc(u.username) + '</span>' +
                    '<span class="dealer-gm-detail">' + esc(u.displayName || '') + '</span>' +
                    '<span class="dealer-gm-detail">' + esc(u.email || '') + '</span>' +
                    '<span class="dealer-gm-detail">Last login: ' + esc(lastLogin) + '</span>' +
                    '<span class="' + statusClass + '">' + statusLabel + '</span>' +
                '</div>';
            });
        }

        html += '</div>';

        // GM selector: only shown if more than one GM user exists
        // so admin can choose which account to change the password for.
        if (gmUsers.length > 1) {
            html += '<div class="admin-form-field" style="margin-bottom:0.75rem;">' +
                '<label for="de-gm-select-' + eid + '">Change password for GM account:</label>' +
                '<select id="de-gm-select-' + eid + '">';
            gmUsers.forEach(function (u) {
                html += '<option value="' + escAttr(u.id) + '">' + esc(u.username) + ' (' + esc(u.displayName || u.email || '') + ')</option>';
            });
            html += '</select></div>';
        } else if (gmUsers.length === 1) {
            // Single GM: store the user id in a hidden input
            html += '<input type="hidden" id="de-gm-select-' + eid + '" value="' + escAttr(gmUsers[0].id) + '">';
        }

        return html;
    }

    function openDealerEditForm(dealerId) {
        // Fetch fresh dealer list AND all users in parallel
        Promise.all([
            _api('GET', '/api/admin/dealers'),
            _api('GET', '/api/admin/users')
        ])
            .then(function (results) {
                var dealers = results[0];
                var allUsers = results[1];

                var dealer = dealers.find(function (d) { return String(d.id) === String(dealerId); });
                if (!dealer) {
                    patchAlert('admin-dealer-alert', 'Dealer not found.', 'error');
                    return;
                }

                // Filter to GM users for this dealer's dealerCode
                var gmUsers = allUsers.filter(function (u) {
                    return u.dealerCode === dealer.dealerCode &&
                           u.role === 'gm' &&
                           !u.isDeleted &&
                           u.status !== 'deleted';
                });

                var dealerRow = document.querySelector('tr[data-dealer-id="' + escAttr(dealerId) + '"]');
                if (!dealerRow) {
                    patchAlert('admin-dealer-alert', 'Could not locate dealer row in table.', 'error');
                    return;
                }

                closeAllDealerEditForms();

                var slotRow = getDealerEditRow(dealerRow);
                var td = slotRow.querySelector('td');
                var eid = escAttr(dealerId);

                td.innerHTML =
                    '<div class="admin-inline-edit dealer-edit-slot">' +
                        '<h4>' +
                            '<span>Editing Dealer: ' + esc(dealer.dealerCode) + '</span>' +
                            '<button class="admin-btn admin-btn-ghost admin-btn-sm" id="dealer-cancel-top-' + eid + '">Cancel</button>' +
                        '</h4>' +

                        // === PROFILE FIELDS ===
                        '<div class="admin-form">' +
                            '<div class="admin-form-row">' +
                                '<div class="admin-form-field">' +
                                    '<label for="de-name-' + eid + '">Dealer Name</label>' +
                                    '<input type="text" id="de-name-' + eid + '" value="' + escAttr(dealer.dealerName || '') + '" placeholder="Business name">' +
                                '</div>' +
                                '<div class="admin-form-field">' +
                                    '<label for="de-contact-' + eid + '">Contact Person</label>' +
                                    '<input type="text" id="de-contact-' + eid + '" value="' + escAttr(dealer.contactPerson || '') + '" placeholder="Full name">' +
                                '</div>' +
                            '</div>' +
                            '<div class="admin-form-row">' +
                                '<div class="admin-form-field">' +
                                    '<label for="de-email-' + eid + '">Email</label>' +
                                    '<input type="email" id="de-email-' + eid + '" value="' + escAttr(dealer.email || '') + '" placeholder="dealer@example.com">' +
                                '</div>' +
                                '<div class="admin-form-field">' +
                                    '<label for="de-phone-' + eid + '">Phone</label>' +
                                    '<input type="tel" id="de-phone-' + eid + '" value="' + escAttr(dealer.phone || '') + '" placeholder="555-123-4567">' +
                                '</div>' +
                            '</div>' +
                            '<div class="admin-form-row">' +
                                '<div class="admin-form-field">' +
                                    '<label for="de-role-' + eid + '">Role</label>' +
                                    '<select id="de-role-' + eid + '">' +
                                        '<option value="dealer"' + (dealer.role === 'dealer' ? ' selected' : '') + '>Dealer</option>' +
                                        '<option value="rep"' + (dealer.role === 'rep' ? ' selected' : '') + '>Internal Rep</option>' +
                                        '<option value="admin"' + (dealer.role === 'admin' ? ' selected' : '') + '>Admin</option>' +
                                    '</select>' +
                                '</div>' +
                                '<div class="admin-form-field">' +
                                    '<label for="de-active-' + eid + '">Status</label>' +
                                    '<select id="de-active-' + eid + '">' +
                                        '<option value="true"' + (dealer.isActive ? ' selected' : '') + '>Active</option>' +
                                        '<option value="false"' + (!dealer.isActive ? ' selected' : '') + '>Inactive</option>' +
                                    '</select>' +
                                '</div>' +
                            '</div>' +
                            '<div class="admin-form-actions">' +
                                '<button class="admin-btn admin-btn-ghost" id="dealer-cancel-bot-' + eid + '">Cancel</button>' +
                                '<button class="admin-btn admin-btn-primary" id="dealer-save-profile-' + eid + '">Save Profile</button>' +
                            '</div>' +
                        '</div>' +

                        // === CHANGE GM ACCOUNT PASSWORD SECTION ===
                        '<div class="dealer-pw-section">' +
                            '<h5>Change GM Account Password</h5>' +
                            buildGmUsersBlock(gmUsers, eid) +
                            (gmUsers.length > 0
                                ? '<div class="admin-form-row">' +
                                      '<div class="admin-form-field">' +
                                          '<label for="de-pw1-' + eid + '">New Password (min 8 chars)</label>' +
                                          '<input type="password" id="de-pw1-' + eid + '" placeholder="Enter new password" autocomplete="new-password">' +
                                      '</div>' +
                                      '<div class="admin-form-field">' +
                                          '<label for="de-pw2-' + eid + '">Confirm Password</label>' +
                                          '<input type="password" id="de-pw2-' + eid + '" placeholder="Repeat new password" autocomplete="new-password">' +
                                      '</div>' +
                                  '</div>' +
                                  '<div class="admin-form-actions">' +
                                      '<button class="admin-btn admin-btn-ghost" id="dealer-save-pw-' + eid + '">Set New Password</button>' +
                                  '</div>'
                                : '<div style="font-size:0.85rem;color:#6b7280;">No GM accounts available. Create a GM user for this dealer in the Users tab.</div>'
                            ) +
                        '</div>' +

                    '</div>';

                slotRow.style.display = 'table-row';
                slotRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

                // Cancel buttons
                document.getElementById('dealer-cancel-top-' + dealerId).addEventListener('click', function () { closeAllDealerEditForms(); });
                document.getElementById('dealer-cancel-bot-' + dealerId).addEventListener('click', function () { closeAllDealerEditForms(); });

                // Save Profile
                document.getElementById('dealer-save-profile-' + dealerId).addEventListener('click', function () {
                    saveDealerProfile(dealerId);
                });

                // Set GM Password (only wired if GM users exist)
                var pwBtn = document.getElementById('dealer-save-pw-' + dealerId);
                if (pwBtn) {
                    pwBtn.addEventListener('click', function () {
                        saveDealerGmPassword(dealerId);
                    });
                }
            })
            .catch(function (err) {
                patchAlert('admin-dealer-alert', 'Failed to load dealer: ' + esc(err.message || err), 'error');
            });
    }

    function saveDealerProfile(dealerId) {
        var nameEl    = document.getElementById('de-name-' + dealerId);
        var contactEl = document.getElementById('de-contact-' + dealerId);
        var emailEl   = document.getElementById('de-email-' + dealerId);
        var phoneEl   = document.getElementById('de-phone-' + dealerId);
        var roleEl    = document.getElementById('de-role-' + dealerId);
        var activeEl  = document.getElementById('de-active-' + dealerId);

        if (!nameEl) return;

        var saveBtn = document.getElementById('dealer-save-profile-' + dealerId);
        if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

        _api('PUT', '/api/admin/dealers/' + dealerId, {
            dealerName:    nameEl.value.trim(),
            contactPerson: contactEl ? contactEl.value.trim() : undefined,
            email:         emailEl ? emailEl.value.trim() : undefined,
            phone:         phoneEl ? phoneEl.value.trim() : undefined,
            role:          roleEl ? roleEl.value : undefined,
            isActive:      activeEl ? (activeEl.value === 'true') : undefined
        })
            .then(function () {
                patchAlert('admin-dealer-alert', 'Dealer profile updated!', 'success');
                closeAllDealerEditForms();
                var tab = document.querySelector('.admin-tab[data-tab="dealers"]');
                if (tab) tab.click();
            })
            .catch(function (err) {
                if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Profile'; }
                patchAlert('admin-dealer-alert', 'Update failed: ' + esc(err.message || err), 'error');
            });
    }

    // v2.3: Change password on the GM *user* record, not the dealer record.
    function saveDealerGmPassword(dealerId) {
        var gmSelect = document.getElementById('de-gm-select-' + dealerId);
        var pw1El    = document.getElementById('de-pw1-' + dealerId);
        var pw2El    = document.getElementById('de-pw2-' + dealerId);

        if (!gmSelect || !pw1El || !pw2El) return;

        var gmUserId = gmSelect.value || (gmSelect.tagName === 'INPUT' ? gmSelect.value : '');
        if (!gmUserId) {
            patchAlert('admin-dealer-alert', 'No GM account selected.', 'error');
            return;
        }

        var p1 = pw1El.value;
        var p2 = pw2El.value;

        if (!p1 || p1.length < 8) {
            patchAlert('admin-dealer-alert', 'Password must be at least 8 characters.', 'error');
            return;
        }
        if (p1 !== p2) {
            patchAlert('admin-dealer-alert', 'Passwords do not match.', 'error');
            return;
        }

        var pwBtn = document.getElementById('dealer-save-pw-' + dealerId);
        if (pwBtn) { pwBtn.disabled = true; pwBtn.textContent = 'Saving...'; }

        // Route to the user record endpoint, not the legacy dealer endpoint
        _api('POST', '/api/admin/users/' + gmUserId + '/reset-password', { newPassword: p1 })
            .then(function () {
                patchAlert('admin-dealer-alert', 'GM account password updated successfully!', 'success');
                pw1El.value = '';
                pw2El.value = '';
                if (pwBtn) { pwBtn.disabled = false; pwBtn.textContent = 'Set New Password'; }
            })
            .catch(function (err) {
                if (pwBtn) { pwBtn.disabled = false; pwBtn.textContent = 'Set New Password'; }
                patchAlert('admin-dealer-alert', 'Password change failed: ' + esc(err.message || err), 'error');
            });
    }

    // Intercept clicks on Edit buttons in the dealers table (capture phase).
    if (dealersList) {
        dealersList.addEventListener('click', function (e) {
            var editBtn = e.target.closest('[data-action="edit"]');
            if (!editBtn) return;
            e.stopImmediatePropagation();
            e.preventDefault();
            var dealerId = editBtn.getAttribute('data-id');
            openDealerEditForm(dealerId);
        }, true);
    }


    // 6. PRODUCTS TABLE: Remove Tier Exempt Column
    function patchProductsTable() {
        var container = document.getElementById('admin-products-list');
        if (!container) return;
        var table = container.querySelector('.admin-table');
        if (!table) return;

        var headers = table.querySelectorAll('thead th');
        var exemptIdx = -1;
        headers.forEach(function (th, i) {
            if (th.textContent.trim() === 'Tier Exempt') exemptIdx = i;
        });

        if (exemptIdx !== -1) {
            headers[exemptIdx].remove();
            table.querySelectorAll('tbody tr').forEach(function (row) {
                var cells = row.querySelectorAll('td');
                if (cells.length > 1 && cells.length > exemptIdx && cells[exemptIdx]) {
                    cells[exemptIdx].remove();
                }
            });
        }

        container.querySelectorAll('[id^="edit-exempt-"]').forEach(function (sel) {
            var formRow = sel.closest('.admin-form-row');
            if (formRow) formRow.style.display = 'none';
        });
    }

    var productsList = document.getElementById('admin-products-list');
    if (productsList) {
        new MutationObserver(patchProductsTable)
            .observe(productsList, { childList: true, subtree: true });
    }


    // 7. PRODUCTS STATS: Remove "Tier Exempt" Stat Card
    function patchProductStats() {
        var container = document.getElementById('admin-products-stats');
        if (!container) return;
        container.querySelectorAll('.admin-stat').forEach(function (stat) {
            var label = stat.querySelector('.admin-stat-label');
            if (label && label.textContent.trim() === 'Tier Exempt') {
                stat.remove();
            }
        });
    }

    var productsStats = document.getElementById('admin-products-stats');
    if (productsStats) {
        new MutationObserver(patchProductStats)
            .observe(productsStats, { childList: true, subtree: true });
    }


    // ===========================================================
    // PHASE 2: PER-DEALER PRICING EDITOR
    // ===========================================================

    // 8. PRICING TAB: Full Per-Dealer Pricing Editor
    if (pricingTabBtn) {
        pricingTabBtn.addEventListener('click', function (e) {
            e.stopImmediatePropagation();

            document.querySelectorAll('#admin-modal .admin-tab').forEach(function (t) {
                t.classList.remove('active');
            });
            pricingTabBtn.classList.add('active');
            document.querySelectorAll('#admin-modal .admin-tab-content').forEach(function (c) {
                c.classList.remove('active');
            });
            var pricingContent = document.getElementById('admin-tab-pricing');
            if (pricingContent) pricingContent.classList.add('active');

            var saveBtn = document.getElementById('admin-save-pricing-btn');
            if (saveBtn) saveBtn.style.display = 'none';
            if (pricingContent) {
                pricingContent.querySelectorAll('p').forEach(function (p) {
                    if (p.textContent.indexOf('multiplier') !== -1) p.style.display = 'none';
                });
                var toolbar = pricingContent.querySelector('.admin-toolbar');
                if (toolbar) toolbar.style.display = 'none';
            }

            loadDealerPricingEditor();
        }, true);
    }

    function openPricingForDealer(dealerId) {
        _selectedDealerId = dealerId;
        var tab = document.querySelector('.admin-tab[data-tab="pricing"]');
        if (tab) tab.click();
    }

    function loadDealerPricingEditor() {
        var list = document.getElementById('admin-pricing-list');
        if (!list) return;
        list.innerHTML = '<div class="admin-loading">Loading pricing editor...</div>';

        Promise.all([
            _api('GET', '/api/admin/dealers'),
            _api('GET', '/api/admin/products')
        ]).then(function (results) {
            _patchDealers = (results[0] || []).filter(function (d) { return d.isActive !== false; });
            _patchProducts = (results[1] || []).filter(function (p) {
                return p.isActive !== false && p.id !== 'custom';
            });
            renderPricingEditor();

            if (_selectedDealerId) {
                var sel = document.getElementById('dp-dealer-select');
                if (sel) {
                    sel.value = _selectedDealerId;
                    onDealerSelected();
                }
            }
        }).catch(function (err) {
            list.innerHTML = '<div class="admin-error">Failed to load data: ' + esc(err.message || err) + '</div>';
        });
    }

    function renderPricingEditor() {
        var list = document.getElementById('admin-pricing-list');
        if (!list) return;

        var dealerOptions = '<option value="">Select a dealer...</option>';
        _patchDealers.forEach(function (d) {
            dealerOptions += '<option value="' + escAttr(d.id) + '">' +
                esc(d.dealerCode) + ' / ' + esc(d.dealerName || 'Unnamed') + '</option>';
        });

        var copyOptions = '<option value="">Select source dealer...</option>';
        _patchDealers.forEach(function (d) {
            copyOptions += '<option value="' + escAttr(d.id) + '">' +
                esc(d.dealerCode) + ' / ' + esc(d.dealerName || 'Unnamed') + '</option>';
        });

        list.innerHTML = '' +
            '<div class="dp-selector-row">' +
                '<div class="admin-form-field">' +
                    '<label>Select Dealer</label>' +
                    '<select id="dp-dealer-select" class="admin-search" style="width:100%;padding:0.6rem 0.75rem;">' + dealerOptions + '</select>' +
                '</div>' +
                '<div class="dp-actions-bar" id="dp-actions" style="display:none;">' +
                    '<button class="admin-btn admin-btn-primary" id="dp-save-btn">Save Prices</button>' +
                    '<button class="admin-btn admin-btn-ghost" id="dp-reset-btn">Reset to Defaults</button>' +
                    '<details style="position:relative;">' +
                        '<summary class="admin-btn admin-btn-ghost" style="list-style:none;cursor:pointer;">Copy From...</summary>' +
                        '<div style="position:absolute;top:100%;left:0;z-index:10;background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:0.75rem;margin-top:0.25rem;box-shadow:0 4px 12px rgba(0,0,0,0.1);min-width:260px;">' +
                            '<label style="font-size:0.82rem;font-weight:600;color:#374151;display:block;margin-bottom:0.35rem;">Copy pricing from:</label>' +
                            '<select id="dp-copy-source" style="width:100%;padding:0.45rem 0.6rem;border:1px solid #e5e7eb;border-radius:6px;font-size:0.85rem;margin-bottom:0.5rem;">' + copyOptions + '</select>' +
                            '<button class="admin-btn admin-btn-primary admin-btn-sm" id="dp-copy-btn">Copy Prices</button>' +
                        '</div>' +
                    '</details>' +
                '</div>' +
            '</div>' +
            '<div id="dp-unsaved-bar" style="display:none;"></div>' +
            '<div id="dp-dealer-info" style="display:none;"></div>' +
            '<div id="dp-pricing-stats" class="admin-stat-row" style="display:none;"></div>' +
            '<div id="dp-pricing-alert"></div>' +
            '<div id="dp-price-table">' +
                '<div class="dp-no-dealer">' +
                    '<div class="dp-no-dealer-icon">&#128176;</div>' +
                    '<div style="font-size:1.1rem;font-weight:600;color:#374151;margin-bottom:0.35rem;">Select a Dealer</div>' +
                    '<div style="font-size:0.9rem;">Choose a dealer from the dropdown above to view and edit their pricing.</div>' +
                '</div>' +
            '</div>';

        var dealerSelect = document.getElementById('dp-dealer-select');
        if (dealerSelect) dealerSelect.addEventListener('change', onDealerSelected);

        var dpSaveBtn = document.getElementById('dp-save-btn');
        if (dpSaveBtn) dpSaveBtn.addEventListener('click', saveDealerPrices);

        var resetBtn = document.getElementById('dp-reset-btn');
        if (resetBtn) resetBtn.addEventListener('click', resetDealerPrices);

        var copyBtn = document.getElementById('dp-copy-btn');
        if (copyBtn) copyBtn.addEventListener('click', copyDealerPrices);
    }

    function onDealerSelected() {
        var sel = document.getElementById('dp-dealer-select');
        var dealerId = sel ? sel.value : '';
        _selectedDealerId = dealerId || null;
        _dealerPrices = {};
        _editedPrices = {};

        var actions = document.getElementById('dp-actions');
        var info = document.getElementById('dp-dealer-info');
        var stats = document.getElementById('dp-pricing-stats');
        var tableDiv = document.getElementById('dp-price-table');
        var unsaved = document.getElementById('dp-unsaved-bar');

        if (!dealerId) {
            if (actions) actions.style.display = 'none';
            if (info) info.style.display = 'none';
            if (stats) stats.style.display = 'none';
            if (unsaved) unsaved.style.display = 'none';
            if (tableDiv) {
                tableDiv.innerHTML = '<div class="dp-no-dealer">' +
                    '<div class="dp-no-dealer-icon">&#128176;</div>' +
                    '<div style="font-size:1.1rem;font-weight:600;color:#374151;margin-bottom:0.35rem;">Select a Dealer</div>' +
                    '<div style="font-size:0.9rem;">Choose a dealer from the dropdown above.</div>' +
                '</div>';
            }
            return;
        }

        if (actions) actions.style.display = 'flex';

        var dealer = _patchDealers.find(function (d) { return String(d.id) === String(dealerId); });
        if (info && dealer) {
            info.style.display = 'flex';
            info.innerHTML = '<div>' +
                '<span class="dp-dealer-info-name">' + esc(dealer.dealerName || 'Unnamed') + '</span>' +
                '<span class="dp-dealer-info-code"> (' + esc(dealer.dealerCode) + ')</span>' +
            '</div>' +
            '<div style="font-size:0.82rem;color:#6b7280;">Contact: ' + esc(dealer.contactPerson || 'N/A') + ' | ' + esc(dealer.email || 'N/A') + '</div>';
        }

        if (tableDiv) tableDiv.innerHTML = '<div class="admin-loading">Loading dealer prices...</div>';

        _api('GET', '/api/admin/dealers/' + dealerId + '/pricing')
            .then(function (data) {
                _backendAvailable = true;
                _dealerPrices = parsePricingResponse(data);
                renderPriceTable();
            })
            .catch(function (err) {
                var status = err.status || err.statusCode || 0;
                var msg = (err.message || String(err)).toLowerCase();

                if (status === 404 || msg.indexOf('404') !== -1 || msg.indexOf('not found') !== -1) {
                    _backendAvailable = false;
                    _dealerPrices = {};
                    renderPriceTable();
                    patchAlert('dp-pricing-alert',
                        'Backend endpoint not yet deployed. Showing catalog base prices.',
                        'error');
                } else {
                    if (tableDiv) {
                        tableDiv.innerHTML = '<div class="dp-backend-error">' +
                            '<div style="font-size:1.1rem;font-weight:700;margin-bottom:0.5rem;">Failed to Load Pricing</div>' +
                            '<div>' + esc(err.message || err) + '</div>' +
                        '</div>';
                    }
                }
            });
    }

    function renderPriceTable() {
        var tableDiv = document.getElementById('dp-price-table');
        if (!tableDiv) return;

        if (_patchProducts.length === 0) {
            tableDiv.innerHTML = '<div class="admin-empty">No active products found.</div>';
            return;
        }

        var categories = {};
        _patchProducts.forEach(function (p) {
            var cat = p.category || 'other';
            if (!categories[cat]) categories[cat] = [];
            categories[cat].push(p);
        });

        var catOrder = ['decking', 'sealing', 'fasteners', 'hardware', 'other'];
        var sortedCats = Object.keys(categories).sort(function (a, b) {
            return (catOrder.indexOf(a) === -1 ? 99 : catOrder.indexOf(a)) -
                   (catOrder.indexOf(b) === -1 ? 99 : catOrder.indexOf(b));
        });

        var html = '<table class="admin-table">' +
            '<thead><tr>' +
                '<th>Product</th>' +
                '<th style="text-align:right;">Base Price</th>' +
                '<th style="text-align:right;">Dealer Price</th>' +
                '<th style="text-align:center;">Diff</th>' +
                '<th>Unit</th>' +
                '<th style="text-align:center;">Status</th>' +
            '</tr></thead><tbody>';

        sortedCats.forEach(function (cat) {
            var catLabel = cat.charAt(0).toUpperCase() + cat.slice(1);
            if (cat === 'sealing') catLabel = 'Sealing & Protection';
            if (cat === 'fasteners') catLabel = 'Fasteners & Hardware';

            html += '<tr><td colspan="6" class="dp-category-header">' + esc(catLabel) + '</td></tr>';

            categories[cat].forEach(function (p) {
                var basePrice = p.basePrice || 0;
                var dealerPrice = _dealerPrices[p.id] !== undefined ? Number(_dealerPrices[p.id]) : basePrice;
                var isOverride = _dealerPrices[p.id] !== undefined && Number(_dealerPrices[p.id]) !== basePrice;

                var diffHtml = '';
                if (dealerPrice === basePrice) {
                    diffHtml = '<span class="dp-diff-same">0%</span>';
                } else {
                    var pctChange = ((dealerPrice - basePrice) / basePrice * 100).toFixed(1);
                    diffHtml = dealerPrice < basePrice
                        ? '<span class="dp-diff-down">' + pctChange + '%</span>'
                        : '<span class="dp-diff-up">+' + pctChange + '%</span>';
                }

                html += '<tr data-product-id="' + escAttr(p.id) + '">' +
                    '<td><strong>' + esc(p.name) + '</strong></td>' +
                    '<td style="text-align:right;"><span class="dp-base-price">$' + basePrice.toFixed(2) + '</span></td>' +
                    '<td style="text-align:right;">' +
                        '<input type="number" step="0.01" min="0" ' +
                            'class="dp-price-input' + (isOverride ? ' dp-override' : '') + '" ' +
                            'id="dp-price-' + escAttr(p.id) + '" ' +
                            'data-product-id="' + escAttr(p.id) + '" ' +
                            'data-base-price="' + basePrice.toFixed(2) + '" ' +
                            'value="' + dealerPrice.toFixed(2) + '">' +
                    '</td>' +
                    '<td style="text-align:center;" id="dp-diff-' + escAttr(p.id) + '">' + diffHtml + '</td>' +
                    '<td>/' + esc(p.unit || 'each') + '</td>' +
                    '<td style="text-align:center;">' +
                        (isOverride ? '<span class="dp-override-badge">OVERRIDE</span>' : '<span style="color:#9ca3af;font-size:0.78rem;">Default</span>') +
                    '</td>' +
                '</tr>';
            });
        });

        html += '</tbody></table>';
        tableDiv.innerHTML = html;

        tableDiv.querySelectorAll('.dp-price-input').forEach(function (input) {
            input.addEventListener('input', function () {
                var pid = input.getAttribute('data-product-id');
                var base = parseFloat(input.getAttribute('data-base-price'));
                var val = parseFloat(input.value);
                if (isNaN(val)) return;
                _editedPrices[pid] = val;
                input.classList.add('dp-modified');
                var diffCell = document.getElementById('dp-diff-' + pid);
                if (diffCell) {
                    if (val === base) {
                        diffCell.innerHTML = '<span class="dp-diff-same">0%</span>';
                    } else {
                        var pct = ((val - base) / base * 100).toFixed(1);
                        diffCell.innerHTML = val < base
                            ? '<span class="dp-diff-down">' + pct + '%</span>'
                            : '<span class="dp-diff-up">+' + pct + '%</span>';
                    }
                }
                updateUnsavedBar();
                updatePricingStats();
            });
        });

        updatePricingStats();
        updateUnsavedBar();
    }

    function updateUnsavedBar() {
        var bar = document.getElementById('dp-unsaved-bar');
        if (!bar) return;
        var count = Object.keys(_editedPrices).length;
        if (count === 0) { bar.style.display = 'none'; return; }
        bar.style.display = 'flex';
        bar.innerHTML = '<span>&#9888; ' + count + ' unsaved price change' + (count !== 1 ? 's' : '') + '</span>' +
            '<button class="admin-btn admin-btn-primary admin-btn-sm" id="dp-unsaved-save">Save Now</button>';
        var btn = document.getElementById('dp-unsaved-save');
        if (btn) btn.addEventListener('click', saveDealerPrices);
    }

    function updatePricingStats() {
        var statsDiv = document.getElementById('dp-pricing-stats');
        if (!statsDiv) return;
        statsDiv.style.display = 'grid';
        var totalProducts = _patchProducts.length;
        var overrideCount = 0;
        var totalDiscount = 0;
        var discountCount = 0;
        _patchProducts.forEach(function (p) {
            var base = p.basePrice || 0;
            var edited = _editedPrices[p.id];
            var dealer = _dealerPrices[p.id];
            var current = edited !== undefined ? edited : (dealer !== undefined ? Number(dealer) : base);
            if (current !== base) {
                overrideCount++;
                if (base > 0) { totalDiscount += ((current - base) / base * 100); discountCount++; }
            }
        });
        var avgDiscount = discountCount > 0 ? (totalDiscount / discountCount).toFixed(1) : '0.0';
        statsDiv.innerHTML =
            '<div class="admin-stat"><div class="admin-stat-value">' + totalProducts + '</div><div class="admin-stat-label">Products</div></div>' +
            '<div class="admin-stat"><div class="admin-stat-value">' + overrideCount + '</div><div class="admin-stat-label">Overrides</div></div>' +
            '<div class="admin-stat"><div class="admin-stat-value">' + avgDiscount + '%</div><div class="admin-stat-label">Avg Change</div></div>' +
            '<div class="admin-stat"><div class="admin-stat-value">' + Object.keys(_editedPrices).length + '</div><div class="admin-stat-label">Unsaved</div></div>';
    }

    function saveDealerPrices() {
        if (!_selectedDealerId) { patchAlert('dp-pricing-alert', 'No dealer selected.', 'error'); return; }
        var edits = Object.keys(_editedPrices);
        if (edits.length === 0) { patchAlert('dp-pricing-alert', 'No changes to save.', 'error'); return; }

        var mergedPrices = {};
        Object.keys(_dealerPrices).forEach(function (pid) { mergedPrices[pid] = Number(_dealerPrices[pid]); });
        edits.forEach(function (pid) {
            var product = _patchProducts.find(function (p) { return p.id === pid; });
            var base = product ? product.basePrice : 0;
            if (_editedPrices[pid] === base) { delete mergedPrices[pid]; } else { mergedPrices[pid] = _editedPrices[pid]; }
        });

        var saveBtn = document.getElementById('dp-save-btn');
        if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

        _api('PUT', '/api/admin/dealers/' + _selectedDealerId + '/pricing', { pricing: mergedPrices })
            .then(function () {
                _dealerPrices = mergedPrices;
                _editedPrices = {};
                renderPriceTable();
                patchAlert('dp-pricing-alert', 'Dealer prices saved! (' + edits.length + ' product' + (edits.length !== 1 ? 's' : '') + ' updated)', 'success');
                if (typeof window.applyTierPricing === 'function') {
                    try { var p = window.applyTierPricing(); if (p && typeof p.catch === 'function') p.catch(function () {}); } catch (e) {}
                }
            })
            .catch(function (err) {
                var status = err.status || err.statusCode || 0;
                var msg = (err.message || String(err)).toLowerCase();
                if (status === 404 || msg.indexOf('404') !== -1) {
                    patchAlert('dp-pricing-alert', 'Cannot save: Backend endpoint not deployed.', 'error');
                } else {
                    patchAlert('dp-pricing-alert', 'Save failed: ' + esc(err.message || err), 'error');
                }
            })
            .finally(function () {
                if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Prices'; }
            });
    }

    function resetDealerPrices() {
        if (!_selectedDealerId) return;
        var dealer = _patchDealers.find(function (d) { return String(d.id) === String(_selectedDealerId); });
        var label = dealer ? dealer.dealerCode : _selectedDealerId;
        if (!confirm('Reset ALL prices for ' + label + ' to catalog defaults?')) return;
        _api('POST', '/api/admin/dealers/' + _selectedDealerId + '/pricing/reset')
            .then(function () {
                _dealerPrices = {}; _editedPrices = {}; renderPriceTable();
                patchAlert('dp-pricing-alert', 'Prices reset to catalog defaults for ' + esc(label) + '.', 'success');
            })
            .catch(function (err) {
                var status = err.status || err.statusCode || 0;
                var msg = (err.message || String(err)).toLowerCase();
                if (status === 404 || msg.indexOf('404') !== -1) {
                    _dealerPrices = {}; _editedPrices = {}; renderPriceTable();
                    patchAlert('dp-pricing-alert', 'Reset endpoint not deployed. Cleared local view.', 'error');
                } else {
                    patchAlert('dp-pricing-alert', 'Reset failed: ' + esc(err.message || err), 'error');
                }
            });
    }

    function copyDealerPrices() {
        if (!_selectedDealerId) return;
        var sourceSelect = document.getElementById('dp-copy-source');
        var sourceId = sourceSelect ? sourceSelect.value : '';
        if (!sourceId) { patchAlert('dp-pricing-alert', 'Select a source dealer to copy from.', 'error'); return; }
        if (sourceId === _selectedDealerId) { patchAlert('dp-pricing-alert', 'Cannot copy from the same dealer.', 'error'); return; }

        var sourceDealer = _patchDealers.find(function (d) { return String(d.id) === String(sourceId); });
        var sourceLabel = sourceDealer ? sourceDealer.dealerCode : sourceId;
        var targetDealer = _patchDealers.find(function (d) { return String(d.id) === String(_selectedDealerId); });
        var targetLabel = targetDealer ? targetDealer.dealerCode : _selectedDealerId;

        if (!confirm('Copy all prices from ' + sourceLabel + ' to ' + targetLabel + '?')) return;

        _api('POST', '/api/admin/dealers/' + _selectedDealerId + '/pricing/copy-from/' + sourceId)
            .then(function () {
                return _api('GET', '/api/admin/dealers/' + _selectedDealerId + '/pricing');
            })
            .then(function (data) {
                _dealerPrices = parsePricingResponse(data); _editedPrices = {}; renderPriceTable();
                patchAlert('dp-pricing-alert', 'Prices copied from ' + esc(sourceLabel) + ' to ' + esc(targetLabel) + '.', 'success');
            })
            .catch(function (err) {
                var status = err.status || err.statusCode || 0;
                var msg = (err.message || String(err)).toLowerCase();
                if (status === 404 || msg.indexOf('404') !== -1) {
                    _api('GET', '/api/admin/dealers/' + sourceId + '/pricing')
                        .then(function (data) {
                            var sourcePrices = parsePricingResponse(data);
                            Object.keys(sourcePrices).forEach(function (pid) { _editedPrices[pid] = Number(sourcePrices[pid]); });
                            renderPriceTable(); updateUnsavedBar();
                            patchAlert('dp-pricing-alert', 'Prices loaded from ' + esc(sourceLabel) + ' as unsaved changes.', 'success');
                        })
                        .catch(function () {
                            patchAlert('dp-pricing-alert', 'Copy endpoint not deployed and source pricing unavailable.', 'error');
                        });
                } else {
                    patchAlert('dp-pricing-alert', 'Copy failed: ' + esc(err.message || err), 'error');
                }
            });
    }


    console.log('[AdminPatch] v2.3 loaded: GM account password section + GM user display.');
})();
