// ============================================================
// AmeriDex Dealer Portal - Admin Delete Feature v1.1
// File: ameridex-admin-delete.js
// Date: 2026-03-04
// ============================================================
// v1.1 Changes (2026-03-04):
//   - FIX: showDeletedTab() now hides .admin-tab-content divs
//     correctly instead of targeting non-existent wrapper IDs.
//   - FIX: hideDeletedTab() now restores the previously active
//     .admin-tab-content div so other tabs are never lost.
//   - FIX: Other-tab intercept moved from capture-phase to bubble
//     phase and only hides the deleted wrapper — it no longer
//     interferes with the native tab-switch logic in ameridex-admin.js.
//   - FIX: Modal close resets all deleted-tab state (active class,
//     display, wrapper visibility) so the panel is always clean on
//     next login.
//   - FIX: _deletedTabInjected / _deletedTabBtn / _deletedWrapper
//     reset when the admin modal is closed, preventing stale state
//     from persisting across logout/login cycles.
// ============================================================

(function () {
    'use strict';

    // ----------------------------------------------------------
    // CONFIG
    // ----------------------------------------------------------
    var UNDO_TIMEOUT_MS = 8000;
    var POLL_MS = 300;
    var MAX_POLLS = 400;
    var _polls = 0;

    // ----------------------------------------------------------
    // STYLES
    // ----------------------------------------------------------
    var style = document.createElement('style');
    style.textContent = '' +
        '.adx-del-btn { padding:0.25rem 0.55rem; background:#fee2e2; color:#dc2626; border:none; border-radius:6px; font-size:0.75rem; font-weight:600; cursor:pointer; transition:all 0.15s; margin:0.1rem; }' +
        '.adx-del-btn:hover { background:#fecaca; color:#b91c1c; }' +
        '#adx-confirm-overlay { display:none; position:fixed; inset:0; background:rgba(15,23,42,0.55); z-index:9999; justify-content:center; align-items:center; }' +
        '#adx-confirm-overlay.active { display:flex; }' +
        '#adx-confirm-box { background:#fff; border-radius:14px; padding:2rem; max-width:420px; width:90%; box-shadow:0 25px 50px rgba(0,0,0,0.25); text-align:center; }' +
        '#adx-confirm-box h3 { margin:0 0 0.5rem; font-size:1.1rem; color:#111827; }' +
        '#adx-confirm-box p { margin:0 0 0.75rem; font-size:0.9rem; color:#6b7280; line-height:1.5; }' +
        '#adx-confirm-box .adx-warn { background:#fef3c7; color:#92400e; padding:0.6rem 0.85rem; border-radius:8px; font-size:0.82rem; margin-bottom:1rem; text-align:left; }' +
        '.adx-confirm-actions { display:flex; gap:0.75rem; justify-content:center; margin-top:1.25rem; }' +
        '.adx-confirm-cancel { padding:0.55rem 1.25rem; background:#f3f4f6; color:#374151; border:none; border-radius:8px; font-size:0.9rem; font-weight:600; cursor:pointer; }' +
        '.adx-confirm-cancel:hover { background:#e5e7eb; }' +
        '.adx-confirm-delete { padding:0.55rem 1.25rem; background:#dc2626; color:#fff; border:none; border-radius:8px; font-size:0.9rem; font-weight:600; cursor:pointer; }' +
        '.adx-confirm-delete:hover { background:#b91c1c; }' +
        '#adx-undo-toast { display:none; position:fixed; bottom:2rem; left:50%; transform:translateX(-50%); background:#1e293b; color:#fff; padding:0.85rem 1.5rem; border-radius:12px; box-shadow:0 8px 24px rgba(0,0,0,0.3); z-index:10000; font-size:0.9rem; min-width:300px; max-width:500px; }' +
        '#adx-undo-toast.active { display:flex; align-items:center; justify-content:space-between; gap:1rem; }' +
        '#adx-undo-toast .adx-undo-msg { flex:1; }' +
        '#adx-undo-toast .adx-undo-bar { height:3px; background:#475569; border-radius:2px; margin-top:0.5rem; overflow:hidden; }' +
        '#adx-undo-toast .adx-undo-bar-fill { height:100%; background:#3b82f6; transition:width linear; }' +
        '#adx-undo-toast .adx-undo-action { padding:0.4rem 0.9rem; background:#3b82f6; color:#fff; border:none; border-radius:6px; font-size:0.82rem; font-weight:700; cursor:pointer; white-space:nowrap; }' +
        '#adx-undo-toast .adx-undo-action:hover { background:#2563eb; }' +
        '.adx-deleted-section { margin-top:0.5rem; }' +
        '.adx-deleted-section h4 { margin:0 0 0.75rem; font-size:1rem; color:#374151; }' +
        '.adx-restore-btn { padding:0.25rem 0.55rem; background:#dcfce7; color:#16a34a; border:none; border-radius:6px; font-size:0.75rem; font-weight:600; cursor:pointer; margin:0.1rem; }' +
        '.adx-restore-btn:hover { background:#bbf7d0; color:#15803d; }' +
        '.adx-perm-del-btn { padding:0.25rem 0.55rem; background:#fee2e2; color:#dc2626; border:none; border-radius:6px; font-size:0.75rem; font-weight:600; cursor:pointer; margin:0.1rem; }' +
        '.adx-perm-del-btn:hover { background:#fecaca; }' +
        '.adx-deleted-empty { text-align:center; padding:2rem; color:#9ca3af; font-size:0.9rem; }' +
        '.adx-deleted-meta { font-size:0.75rem; color:#9ca3af; }' +
        '.adx-bulk-bar { display:flex; align-items:center; gap:0.75rem; margin-bottom:0.75rem; flex-wrap:wrap; }' +
        '.adx-bulk-bar .adx-selected-count { font-size:0.85rem; color:#6b7280; }' +
        '.adx-bulk-del-btn { padding:0.4rem 0.85rem; background:#dc2626; color:#fff; border:none; border-radius:6px; font-size:0.82rem; font-weight:600; cursor:pointer; display:none; }' +
        '.adx-bulk-del-btn:hover { background:#b91c1c; }' +
        '.adx-bulk-del-btn.visible { display:inline-block; }' +
        '.adx-chk { width:16px; height:16px; cursor:pointer; accent-color:#dc2626; }';
    document.head.appendChild(style);

    // ----------------------------------------------------------
    // CONFIRMATION MODAL
    // ----------------------------------------------------------
    var confirmOverlay = document.createElement('div');
    confirmOverlay.id = 'adx-confirm-overlay';
    confirmOverlay.innerHTML = '<div id="adx-confirm-box"></div>';
    document.body.appendChild(confirmOverlay);

    confirmOverlay.addEventListener('click', function (e) {
        if (e.target === confirmOverlay) closeConfirm();
    });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && confirmOverlay.classList.contains('active')) closeConfirm();
    });

    function closeConfirm() { confirmOverlay.classList.remove('active'); }

    function showConfirm(opts) {
        var box = document.getElementById('adx-confirm-box');
        var html = '<h3>' + esc(opts.title || 'Confirm Delete') + '</h3>';
        html += '<p>' + (opts.message || 'Are you sure?') + '</p>';
        if (opts.warning) html += '<div class="adx-warn">' + opts.warning + '</div>';
        html += '<div class="adx-confirm-actions">';
        html += '<button class="adx-confirm-cancel" id="adx-confirm-no">Cancel</button>';
        html += '<button class="adx-confirm-delete" id="adx-confirm-yes">' + esc(opts.confirmLabel || 'Delete') + '</button>';
        html += '</div>';
        box.innerHTML = html;
        confirmOverlay.classList.add('active');
        document.getElementById('adx-confirm-no').onclick = closeConfirm;
        document.getElementById('adx-confirm-yes').onclick = function () {
            closeConfirm();
            if (opts.onConfirm) opts.onConfirm();
        };
    }

    // ----------------------------------------------------------
    // UNDO TOAST
    // ----------------------------------------------------------
    var undoToast = document.createElement('div');
    undoToast.id = 'adx-undo-toast';
    document.body.appendChild(undoToast);

    var _undoTimer = null;
    var _undoCallback = null;

    function showUndoToast(message, onUndo) {
        if (_undoTimer) clearTimeout(_undoTimer);
        _undoCallback = onUndo;
        undoToast.innerHTML =
            '<div class="adx-undo-msg">' +
                '<div>' + esc(message) + '</div>' +
                '<div class="adx-undo-bar"><div class="adx-undo-bar-fill" id="adx-undo-fill" style="width:100%;"></div></div>' +
            '</div>' +
            '<button class="adx-undo-action" id="adx-undo-btn">Undo</button>';
        undoToast.classList.add('active');
        requestAnimationFrame(function () {
            var fill = document.getElementById('adx-undo-fill');
            if (fill) {
                fill.style.transitionDuration = UNDO_TIMEOUT_MS + 'ms';
                requestAnimationFrame(function () { fill.style.width = '0%'; });
            }
        });
        document.getElementById('adx-undo-btn').onclick = function () {
            if (_undoTimer) clearTimeout(_undoTimer);
            undoToast.classList.remove('active');
            if (_undoCallback) _undoCallback();
            _undoCallback = null;
        };
        _undoTimer = setTimeout(function () {
            undoToast.classList.remove('active');
            _undoCallback = null;
        }, UNDO_TIMEOUT_MS);
    }

    // ----------------------------------------------------------
    // API HELPER
    // ----------------------------------------------------------
    function apiCall(method, url, body) {
        var api = window.ameridexAPI;
        if (api) return api(method, url, body);
        return Promise.reject(new Error('ameridexAPI not available'));
    }

    // ----------------------------------------------------------
    // ROLE CHECK
    // ----------------------------------------------------------
    function getCurrentRole() {
        var dealer = window.getCurrentDealer ? window.getCurrentDealer() : null;
        return dealer ? dealer.role : null;
    }
    function canDelete() { var r = getCurrentRole(); return r === 'admin' || r === 'gm'; }
    function isAdmin() { return getCurrentRole() === 'admin'; }

    // ----------------------------------------------------------
    // INJECT DELETE BUTTONS — QUOTES TABLE
    // ----------------------------------------------------------
    function injectQuoteDeleteButtons() {
        if (!canDelete()) return;
        var tables = document.querySelectorAll('table');
        tables.forEach(function (table) {
            var headers = table.querySelectorAll('th');
            var headerTexts = Array.from(headers).map(function (h) { return h.textContent.trim().toLowerCase(); });
            var isQuoteTable = headerTexts.some(function (t) { return t.includes('quote'); }) &&
                               headerTexts.some(function (t) { return t.includes('status') || t.includes('dealer'); });
            if (!isQuoteTable) return;
            if (table.dataset.adxDeleteInjected === 'true') return;
            table.dataset.adxDeleteInjected = 'true';
            table.querySelectorAll('tbody tr').forEach(function (row) {
                var actionCell = row.querySelector('td:last-child');
                if (!actionCell || actionCell.querySelector('.adx-del-btn')) return;
                var quoteId = row.dataset.id || row.dataset.quoteId;
                if (!quoteId) { var b = actionCell.querySelector('[data-id]'); if (b) quoteId = b.dataset.id; }
                if (!quoteId) quoteId = row.getAttribute('data-quote-id') || row.getAttribute('data-id');
                if (quoteId) {
                    var delBtn = document.createElement('button');
                    delBtn.className = 'adx-del-btn';
                    delBtn.textContent = 'Delete';
                    delBtn.dataset.quoteId = quoteId;
                    delBtn.onclick = function (e) { e.stopPropagation(); confirmDeleteQuote(quoteId, row); };
                    actionCell.appendChild(delBtn);
                }
            });
        });
    }

    // ----------------------------------------------------------
    // INJECT DELETE BUTTONS — CUSTOMERS TABLE
    // ----------------------------------------------------------
    function injectCustomerDeleteButtons() {
        if (!canDelete()) return;
        var tbody = document.getElementById('admin-cust-tbody');
        if (!tbody || tbody.dataset.adxDeleteInjected === 'true') return;
        tbody.dataset.adxDeleteInjected = 'true';
        tbody.querySelectorAll('tr').forEach(function (row) {
            var actionCell = row.querySelector('td:last-child');
            if (!actionCell || actionCell.querySelector('.adx-del-btn')) return;
            var custId = row.dataset.id;
            if (!custId) { var vb = actionCell.querySelector('.cust-view-btn'); if (vb) custId = vb.dataset.id; }
            if (custId) {
                var delBtn = document.createElement('button');
                delBtn.className = 'adx-del-btn';
                delBtn.textContent = 'Delete';
                delBtn.dataset.custId = custId;
                delBtn.onclick = function (e) { e.stopPropagation(); confirmDeleteCustomer(custId, row); };
                actionCell.appendChild(delBtn);
            }
        });
    }

    // ----------------------------------------------------------
    // CONFIRM + DELETE QUOTE
    // ----------------------------------------------------------
    function confirmDeleteQuote(quoteId, row) {
        var cells = row ? row.querySelectorAll('td') : [];
        var quoteNum = cells.length > 0 ? cells[0].textContent.trim() : quoteId;
        showConfirm({
            title: 'Delete Quote',
            message: 'Are you sure you want to delete quote <strong>' + esc(quoteNum) + '</strong>?',
            warning: 'This quote will be moved to Recently Deleted. You can undo within ' + (UNDO_TIMEOUT_MS / 1000) + ' seconds.',
            confirmLabel: 'Delete Quote',
            onConfirm: function () {
                apiCall('DELETE', '/api/admin/quotes/' + quoteId)
                    .then(function (res) {
                        if (row) {
                            row.style.transition = 'opacity 0.3s, background 0.3s';
                            row.style.opacity = '0.3';
                            row.style.background = '#fee2e2';
                            setTimeout(function () { if (row.parentNode) row.parentNode.removeChild(row); }, 400);
                        }
                        showUndoToast('Quote ' + (res.quoteNumber || quoteId) + ' deleted', function () {
                            apiCall('POST', '/api/admin/quotes/' + quoteId + '/restore')
                                .then(refreshAdminView)
                                .catch(function (err) { alert('Failed to restore quote: ' + err.message); });
                        });
                    })
                    .catch(function (err) { alert('Failed to delete quote: ' + err.message); });
            }
        });
    }

    // ----------------------------------------------------------
    // CONFIRM + DELETE CUSTOMER
    // ----------------------------------------------------------
    function confirmDeleteCustomer(custId, row) {
        var cells = row ? row.querySelectorAll('td') : [];
        var custName = cells.length > 0 ? cells[0].textContent.trim() : custId;
        var quoteCount = cells.length > 6 ? cells[6].textContent.trim() : '0';
        var warningMsg = 'This customer will be moved to Recently Deleted. You can undo within ' + (UNDO_TIMEOUT_MS / 1000) + ' seconds.';
        if (parseInt(quoteCount) > 0) {
            warningMsg += '<br><br><strong>Note:</strong> This will also delete <strong>' + quoteCount + ' quote(s)</strong> associated with this customer.';
        }
        showConfirm({
            title: 'Delete Customer',
            message: 'Are you sure you want to delete customer <strong>' + esc(custName) + '</strong>?',
            warning: warningMsg,
            confirmLabel: 'Delete Customer',
            onConfirm: function () {
                apiCall('DELETE', '/api/admin/customers/' + custId)
                    .then(function (res) {
                        if (row) {
                            row.style.transition = 'opacity 0.3s, background 0.3s';
                            row.style.opacity = '0.3';
                            row.style.background = '#fee2e2';
                            setTimeout(function () { if (row.parentNode) row.parentNode.removeChild(row); }, 400);
                        }
                        var msg = 'Customer "' + (res.customerName || custName) + '" deleted';
                        if (res.quotesDeleted > 0) msg += ' (' + res.quotesDeleted + ' quotes also removed)';
                        showUndoToast(msg, function () {
                            apiCall('POST', '/api/admin/customers/' + custId + '/restore')
                                .then(refreshAdminView)
                                .catch(function (err) { alert('Failed to restore customer: ' + err.message); });
                        });
                    })
                    .catch(function (err) { alert('Failed to delete customer: ' + err.message); });
            }
        });
    }

    // ----------------------------------------------------------
    // RECENTLY DELETED TAB
    // ----------------------------------------------------------
    var _deletedTabInjected = false;
    var _deletedTabBtn = null;
    var _deletedWrapper = null;

    // ---- RESET: called every time the admin modal closes ----
    function resetDeletedTabState() {
        if (_deletedWrapper) {
            _deletedWrapper.style.display = 'none';
            _deletedWrapper.innerHTML = '';
        }
        if (_deletedTabBtn) _deletedTabBtn.classList.remove('active');

        // Ensure the first real tab (Dealers) is active again
        var firstTab = document.querySelector('.admin-tab[data-tab="dealers"]');
        var firstContent = document.getElementById('admin-tab-dealers');
        if (firstTab && firstContent) {
            document.querySelectorAll('.admin-tab').forEach(function (t) { t.classList.remove('active'); });
            document.querySelectorAll('.admin-tab-content').forEach(function (c) { c.classList.remove('active'); });
            firstTab.classList.add('active');
            firstContent.classList.add('active');
        }
    }

    // Hook into the admin-close button and backdrop click to reset state
    function hookModalClose() {
        var closeBtn = document.getElementById('admin-close-btn');
        var adminModal = document.getElementById('admin-modal');
        if (closeBtn && !closeBtn.dataset.adxCloseHooked) {
            closeBtn.dataset.adxCloseHooked = 'true';
            closeBtn.addEventListener('click', resetDeletedTabState);
        }
        if (adminModal && !adminModal.dataset.adxBackdropHooked) {
            adminModal.dataset.adxBackdropHooked = 'true';
            adminModal.addEventListener('click', function (e) {
                if (e.target === adminModal) resetDeletedTabState();
            });
        }
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') resetDeletedTabState();
        });
    }

    function injectRecentlyDeletedTab() {
        if (_deletedTabInjected) return;
        if (!canDelete()) return;

        var tabBar = document.querySelector('.admin-tabs');
        if (!tabBar) return;

        // Avoid duplicates
        if (document.getElementById('admin-deleted-tab')) {
            _deletedTabInjected = true;
            return;
        }

        // Build the tab button matching the existing tab style
        _deletedTabBtn = document.createElement('button');
        _deletedTabBtn.className = 'admin-tab';
        _deletedTabBtn.type = 'button';
        _deletedTabBtn.id = 'admin-deleted-tab';
        _deletedTabBtn.setAttribute('data-tab', 'deleted');
        _deletedTabBtn.style.color = '#dc2626';
        _deletedTabBtn.textContent = 'Recently Deleted';
        tabBar.appendChild(_deletedTabBtn);

        // Build the content div matching .admin-tab-content structure
        _deletedWrapper = document.createElement('div');
        _deletedWrapper.id = 'admin-tab-deleted';
        _deletedWrapper.className = 'admin-tab-content';
        // Insert into .admin-body
        var adminBody = document.querySelector('.admin-body');
        if (!adminBody) return;
        adminBody.appendChild(_deletedWrapper);

        // Click handler: show Recently Deleted, hide all other tab-content
        _deletedTabBtn.addEventListener('click', function () {
            // Deactivate all native tabs + content
            document.querySelectorAll('.admin-tab').forEach(function (t) { t.classList.remove('active'); });
            document.querySelectorAll('.admin-tab-content').forEach(function (c) { c.classList.remove('active'); });
            // Activate ours
            _deletedTabBtn.classList.add('active');
            _deletedWrapper.classList.add('active');
            renderDeletedContent();
        });

        // Intercept native tab clicks: just ensure our wrapper is hidden (bubble phase only)
        document.querySelectorAll('.admin-tab:not(#admin-deleted-tab)').forEach(function (tab) {
            tab.addEventListener('click', function () {
                if (_deletedWrapper) _deletedWrapper.classList.remove('active');
                if (_deletedTabBtn) _deletedTabBtn.classList.remove('active');
            });
        });

        hookModalClose();

        _deletedTabInjected = true;
        console.log('[ameridex-admin-delete] v1.1 Recently Deleted tab injected');
    }

    async function renderDeletedContent() {
        if (!_deletedWrapper) return;
        _deletedWrapper.innerHTML = '<div style="text-align:center;padding:3rem;color:#6b7280;">Loading recently deleted items...</div>';

        var deletedCustomers = [];
        var deletedQuotes = [];

        try {
            var results = await Promise.allSettled([
                apiCall('GET', '/api/admin/customers/deleted'),
                apiCall('GET', '/api/admin/quotes/deleted')
            ]);
            deletedCustomers = results[0].status === 'fulfilled' ? results[0].value : [];
            deletedQuotes = results[1].status === 'fulfilled' ? results[1].value : [];
            if (!Array.isArray(deletedCustomers)) deletedCustomers = [];
            if (!Array.isArray(deletedQuotes)) deletedQuotes = [];
        } catch (e) {
            _deletedWrapper.innerHTML = '<div style="text-align:center;padding:3rem;color:#dc2626;">Failed to load deleted items: ' + esc(e.message) + '</div>';
            return;
        }

        var html = '';

        // Stats row
        html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:0.75rem;margin-bottom:1.25rem;">';
        html += '<div style="background:#fff;border:1px solid #fecaca;border-radius:10px;padding:0.85rem 1rem;text-align:center;">';
        html += '<div style="font-size:1.3rem;font-weight:700;color:#dc2626;">' + deletedCustomers.length + '</div>';
        html += '<div style="font-size:0.78rem;color:#6b7280;margin-top:0.2rem;">Deleted Customers</div></div>';
        html += '<div style="background:#fff;border:1px solid #fecaca;border-radius:10px;padding:0.85rem 1rem;text-align:center;">';
        html += '<div style="font-size:1.3rem;font-weight:700;color:#dc2626;">' + deletedQuotes.length + '</div>';
        html += '<div style="font-size:0.78rem;color:#6b7280;margin-top:0.2rem;">Deleted Quotes</div></div>';
        html += '</div>';

        // Deleted Customers table
        html += '<div class="adx-deleted-section">';
        html += '<h4 style="color:#dc2626;">Deleted Customers</h4>';
        if (deletedCustomers.length === 0) {
            html += '<div class="adx-deleted-empty">No deleted customers</div>';
        } else {
            html += '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:0.88rem;">';
            html += '<thead><tr style="background:#fef2f2;">';
            ['Name','Email','Company','Deleted By','Deleted At','Actions'].forEach(function (h) {
                html += '<th style="padding:0.6rem;text-align:left;border-bottom:2px solid #fecaca;font-size:0.8rem;color:#6b7280;">' + h + '</th>';
            });
            html += '</tr></thead><tbody>';
            deletedCustomers.forEach(function (c) {
                var delDate = c.deletedAt ? new Date(c.deletedAt).toLocaleString() : 'Unknown';
                html += '<tr style="border-bottom:1px solid #fef2f2;">';
                html += '<td style="padding:0.6rem;font-weight:600;">' + esc(c.name || '') + '</td>';
                html += '<td style="padding:0.6rem;color:#6b7280;">' + esc(c.email || '') + '</td>';
                html += '<td style="padding:0.6rem;">' + esc(c.company || '') + '</td>';
                html += '<td style="padding:0.6rem;"><span style="font-weight:600;">' + esc(c.deletedBy || '') + '</span> <span class="adx-deleted-meta">(' + esc(c.deletedByRole || '') + ')</span></td>';
                html += '<td style="padding:0.6rem;font-size:0.82rem;color:#6b7280;">' + delDate + '</td>';
                html += '<td style="padding:0.6rem;">';
                html += '<button class="adx-restore-btn" data-type="customer" data-id="' + (c.id || '') + '">Restore</button>';
                if (isAdmin()) {
                    html += '<button class="adx-perm-del-btn" data-type="customer" data-id="' + (c.id || '') + '" data-name="' + esc(c.name || '') + '">Permanent Delete</button>';
                }
                html += '</td></tr>';
            });
            html += '</tbody></table></div>';
        }
        html += '</div>';

        // Deleted Quotes table
        html += '<div class="adx-deleted-section" style="margin-top:1.5rem;">';
        html += '<h4 style="color:#dc2626;">Deleted Quotes</h4>';
        if (deletedQuotes.length === 0) {
            html += '<div class="adx-deleted-empty">No deleted quotes</div>';
        } else {
            if (isAdmin()) {
                html += '<div class="adx-bulk-bar" id="adx-quote-bulk-bar">';
                html += '<label style="display:flex;align-items:center;gap:0.4rem;cursor:pointer;font-size:0.85rem;color:#374151;font-weight:600;"><input type="checkbox" class="adx-chk" id="adx-quote-select-all"> Select All</label>';
                html += '<span class="adx-selected-count" id="adx-quote-selected-count"></span>';
                html += '<button class="adx-bulk-del-btn" id="adx-quote-bulk-delete">Permanently Delete Selected</button>';
                html += '</div>';
            }
            html += '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:0.88rem;" id="adx-deleted-quotes-table">';
            html += '<thead><tr style="background:#fef2f2;">';
            if (isAdmin()) {
                html += '<th style="padding:0.6rem;text-align:center;border-bottom:2px solid #fecaca;width:40px;"></th>';
            }
            ['Quote #','Dealer','Customer','Total','Status','Deleted By','Deleted At','Reason','Actions'].forEach(function (h) {
                html += '<th style="padding:0.6rem;text-align:left;border-bottom:2px solid #fecaca;font-size:0.8rem;color:#6b7280;">' + h + '</th>';
            });
            html += '</tr></thead><tbody>';
            deletedQuotes.forEach(function (q) {
                var delDate = q.deletedAt ? new Date(q.deletedAt).toLocaleString() : 'Unknown';
                var reason = q.deletedReason ? 'Cascade (customer deleted)' : 'Direct';
                html += '<tr style="border-bottom:1px solid #fef2f2;">';
                if (isAdmin()) {
                    html += '<td style="padding:0.6rem;text-align:center;"><input type="checkbox" class="adx-chk adx-quote-chk" data-id="' + (q.id || '') + '" data-name="' + esc(q.quoteNumber || 'N/A') + '"></td>';
                }
                html += '<td style="padding:0.6rem;font-weight:600;color:#2563eb;">' + esc(q.quoteNumber || 'N/A') + '</td>';
                html += '<td style="padding:0.6rem;">' + esc(q.dealerCode || '') + '</td>';
                html += '<td style="padding:0.6rem;">' + esc((q.customer && q.customer.name) || '') + '</td>';
                html += '<td style="padding:0.6rem;font-weight:600;">$' + (q.totalAmount || 0).toFixed(2) + '</td>';
                html += '<td style="padding:0.6rem;">' + esc(q.status || 'draft') + '</td>';
                html += '<td style="padding:0.6rem;"><span style="font-weight:600;">' + esc(q.deletedBy || '') + '</span> <span class="adx-deleted-meta">(' + esc(q.deletedByRole || '') + ')</span></td>';
                html += '<td style="padding:0.6rem;font-size:0.82rem;color:#6b7280;">' + delDate + '</td>';
                html += '<td style="padding:0.6rem;font-size:0.82rem;">' + reason + '</td>';
                html += '<td style="padding:0.6rem;">';
                if (!q.deletedReason) {
                    html += '<button class="adx-restore-btn" data-type="quote" data-id="' + (q.id || '') + '">Restore</button>';
                }
                if (isAdmin()) {
                    html += '<button class="adx-perm-del-btn" data-type="quote" data-id="' + (q.id || '') + '" data-name="' + esc(q.quoteNumber || '') + '">Permanent Delete</button>';
                }
                html += '</td></tr>';
            });
            html += '</tbody></table></div>';
        }
        html += '</div>';

        _deletedWrapper.innerHTML = html;

        // Wire restore buttons
        _deletedWrapper.querySelectorAll('.adx-restore-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var type = btn.dataset.type, id = btn.dataset.id;
                var endpoint = type === 'customer'
                    ? '/api/admin/customers/' + id + '/restore'
                    : '/api/admin/quotes/' + id + '/restore';
                btn.textContent = 'Restoring...';
                btn.disabled = true;
                apiCall('POST', endpoint)
                    .then(renderDeletedContent)
                    .catch(function (err) {
                        alert('Failed to restore: ' + err.message);
                        btn.textContent = 'Restore';
                        btn.disabled = false;
                    });
            });
        });

        // Wire permanent delete buttons (admin only)
        _deletedWrapper.querySelectorAll('.adx-perm-del-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var type = btn.dataset.type, id = btn.dataset.id, name = btn.dataset.name;
                var endpoint = type === 'customer'
                    ? '/api/admin/customers/' + id + '/permanent'
                    : '/api/admin/quotes/' + id + '/permanent';
                showConfirm({
                    title: 'Permanently Delete',
                    message: 'Permanently delete <strong>' + esc(name || id) + '</strong>?',
                    warning: 'This action CANNOT be undone. The data will be permanently removed.',
                    confirmLabel: 'Permanently Delete',
                    onConfirm: function () {
                        apiCall('DELETE', endpoint)
                            .then(renderDeletedContent)
                            .catch(function (err) { alert('Failed to permanently delete: ' + err.message); });
                    }
                });
            });
        });

        // Wire quote checkbox selection (admin only)
        wireQuoteCheckboxes();
    }

    // ----------------------------------------------------------
    // CHECKBOX BULK-DELETE FOR QUOTES
    // ----------------------------------------------------------
    function wireQuoteCheckboxes() {
        var selectAll = document.getElementById('adx-quote-select-all');
        var bulkBtn = document.getElementById('adx-quote-bulk-delete');
        var countLabel = document.getElementById('adx-quote-selected-count');
        if (!selectAll || !bulkBtn) return;

        function getCheckboxes() {
            return _deletedWrapper.querySelectorAll('.adx-quote-chk');
        }

        function updateBulkUI() {
            var boxes = getCheckboxes();
            var checked = Array.from(boxes).filter(function (cb) { return cb.checked; });
            var count = checked.length;
            if (count > 0) {
                bulkBtn.classList.add('visible');
                countLabel.textContent = count + ' of ' + boxes.length + ' selected';
            } else {
                bulkBtn.classList.remove('visible');
                countLabel.textContent = '';
            }
            // Update select-all state
            selectAll.checked = boxes.length > 0 && checked.length === boxes.length;
            selectAll.indeterminate = count > 0 && count < boxes.length;
        }

        selectAll.addEventListener('change', function () {
            var checked = selectAll.checked;
            getCheckboxes().forEach(function (cb) { cb.checked = checked; });
            updateBulkUI();
        });

        getCheckboxes().forEach(function (cb) {
            cb.addEventListener('change', updateBulkUI);
        });

        bulkBtn.addEventListener('click', function () {
            var checked = Array.from(getCheckboxes()).filter(function (cb) { return cb.checked; });
            if (checked.length === 0) return;

            var names = checked.map(function (cb) { return cb.dataset.name; });
            var preview = names.length <= 5
                ? names.map(function (n) { return '<strong>' + esc(n) + '</strong>'; }).join(', ')
                : names.slice(0, 5).map(function (n) { return '<strong>' + esc(n) + '</strong>'; }).join(', ') + ' and ' + (names.length - 5) + ' more';

            showConfirm({
                title: 'Permanently Delete ' + checked.length + ' Quote' + (checked.length > 1 ? 's' : ''),
                message: 'Permanently delete ' + preview + '?',
                warning: 'This action CANNOT be undone. All ' + checked.length + ' quote(s) will be permanently removed.',
                confirmLabel: 'Delete ' + checked.length + ' Quote' + (checked.length > 1 ? 's' : ''),
                onConfirm: function () {
                    var ids = checked.map(function (cb) { return cb.dataset.id; });
                    bulkBtn.textContent = 'Deleting...';
                    bulkBtn.disabled = true;

                    var chain = Promise.resolve();
                    ids.forEach(function (id) {
                        chain = chain.then(function () {
                            return apiCall('DELETE', '/api/admin/quotes/' + id + '/permanent');
                        });
                    });
                    chain
                        .then(renderDeletedContent)
                        .catch(function (err) {
                            alert('Some deletions may have failed: ' + err.message);
                            renderDeletedContent();
                        });
                }
            });
        });
    }

    // ----------------------------------------------------------
    // REFRESH HELPER
    // ----------------------------------------------------------
    function refreshAdminView() {
        var activeTab = document.querySelector('.admin-tab.active');
        if (activeTab && activeTab.id !== 'admin-deleted-tab') {
            activeTab.click();
            return;
        }
        if (_deletedWrapper && _deletedWrapper.classList.contains('active')) {
            renderDeletedContent();
            return;
        }
        var allBtns = document.querySelectorAll('button');
        for (var i = 0; i < allBtns.length; i++) {
            var t = allBtns[i].textContent.trim().toLowerCase();
            if (t === 'quotes' || t === 'all quotes') { allBtns[i].click(); return; }
        }
    }

    // ----------------------------------------------------------
    // MUTATION OBSERVER
    // ----------------------------------------------------------
    var observer = new MutationObserver(function () {
        if (!canDelete()) return;
        injectQuoteDeleteButtons();
        injectCustomerDeleteButtons();
        if (!_deletedTabInjected) injectRecentlyDeletedTab();
        // If the modal was removed from DOM, reset state
        if (_deletedTabInjected && _deletedWrapper && !document.body.contains(_deletedWrapper)) {
            _deletedTabInjected = false;
            _deletedTabBtn = null;
            _deletedWrapper = null;
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // ----------------------------------------------------------
    // POLLING FALLBACK
    // ----------------------------------------------------------
    var poller = setInterval(function () {
        _polls++;
        if (_polls > MAX_POLLS) { clearInterval(poller); return; }
        if (!canDelete()) return;
        injectQuoteDeleteButtons();
        injectCustomerDeleteButtons();
        if (!_deletedTabInjected) injectRecentlyDeletedTab();
    }, POLL_MS);

    // ----------------------------------------------------------
    // HELPERS
    // ----------------------------------------------------------
    function esc(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    console.log('[ameridex-admin-delete] v1.1 loaded');
})();
