// ============================================================
// AmeriDex Dealer Portal - Admin Delete Feature v1.0
// File: ameridex-admin-delete.js
// Date: 2026-02-27
// ============================================================
// Adds delete buttons to admin Quotes and Customers tables.
// Only visible to admin and gm roles.
// Features:
//   - Delete buttons on each row (quotes table + customers table)
//   - Confirmation modal before deletion
//   - Undo toast notification after deletion
//   - "Recently Deleted" tab in admin panel
// ============================================================

(function () {
    'use strict';

    // ----------------------------------------------------------
    // CONFIG
    // ----------------------------------------------------------
    var UNDO_TIMEOUT_MS = 8000; // 8 seconds to undo
    var POLL_MS = 300;
    var MAX_POLLS = 400;
    var _polls = 0;
    var _initialized = false;

    // ----------------------------------------------------------
    // STYLES
    // ----------------------------------------------------------
    var style = document.createElement('style');
    style.textContent = '' +
        // Delete buttons
        '.adx-del-btn { padding:0.25rem 0.55rem; background:#fee2e2; color:#dc2626; border:none; border-radius:6px; font-size:0.75rem; font-weight:600; cursor:pointer; transition:all 0.15s; margin:0.1rem; }' +
        '.adx-del-btn:hover { background:#fecaca; color:#b91c1c; }' +
        // Confirmation modal overlay
        '#adx-confirm-overlay { display:none; position:fixed; inset:0; background:rgba(15,23,42,0.55); z-index:9999; justify-content:center; align-items:center; }' +
        '#adx-confirm-overlay.active { display:flex; }' +
        // Confirmation modal box
        '#adx-confirm-box { background:#fff; border-radius:14px; padding:2rem; max-width:420px; width:90%; box-shadow:0 25px 50px rgba(0,0,0,0.25); text-align:center; }' +
        '#adx-confirm-box h3 { margin:0 0 0.5rem; font-size:1.1rem; color:#111827; }' +
        '#adx-confirm-box p { margin:0 0 0.75rem; font-size:0.9rem; color:#6b7280; line-height:1.5; }' +
        '#adx-confirm-box .adx-warn { background:#fef3c7; color:#92400e; padding:0.6rem 0.85rem; border-radius:8px; font-size:0.82rem; margin-bottom:1rem; text-align:left; }' +
        '.adx-confirm-actions { display:flex; gap:0.75rem; justify-content:center; margin-top:1.25rem; }' +
        '.adx-confirm-cancel { padding:0.55rem 1.25rem; background:#f3f4f6; color:#374151; border:none; border-radius:8px; font-size:0.9rem; font-weight:600; cursor:pointer; }' +
        '.adx-confirm-cancel:hover { background:#e5e7eb; }' +
        '.adx-confirm-delete { padding:0.55rem 1.25rem; background:#dc2626; color:#fff; border:none; border-radius:8px; font-size:0.9rem; font-weight:600; cursor:pointer; }' +
        '.adx-confirm-delete:hover { background:#b91c1c; }' +
        // Undo toast
        '#adx-undo-toast { display:none; position:fixed; bottom:2rem; left:50%; transform:translateX(-50%); background:#1e293b; color:#fff; padding:0.85rem 1.5rem; border-radius:12px; box-shadow:0 8px 24px rgba(0,0,0,0.3); z-index:10000; font-size:0.9rem; min-width:300px; max-width:500px; }' +
        '#adx-undo-toast.active { display:flex; align-items:center; justify-content:space-between; gap:1rem; }' +
        '#adx-undo-toast .adx-undo-msg { flex:1; }' +
        '#adx-undo-toast .adx-undo-bar { height:3px; background:#475569; border-radius:2px; margin-top:0.5rem; overflow:hidden; }' +
        '#adx-undo-toast .adx-undo-bar-fill { height:100%; background:#3b82f6; transition:width linear; }' +
        '#adx-undo-toast .adx-undo-action { padding:0.4rem 0.9rem; background:#3b82f6; color:#fff; border:none; border-radius:6px; font-size:0.82rem; font-weight:700; cursor:pointer; white-space:nowrap; }' +
        '#adx-undo-toast .adx-undo-action:hover { background:#2563eb; }' +
        // Recently Deleted tab content
        '.adx-deleted-section { margin-top:0.5rem; }' +
        '.adx-deleted-section h4 { margin:0 0 0.75rem; font-size:1rem; color:#374151; }' +
        '.adx-restore-btn { padding:0.25rem 0.55rem; background:#dcfce7; color:#16a34a; border:none; border-radius:6px; font-size:0.75rem; font-weight:600; cursor:pointer; margin:0.1rem; }' +
        '.adx-restore-btn:hover { background:#bbf7d0; color:#15803d; }' +
        '.adx-perm-del-btn { padding:0.25rem 0.55rem; background:#fee2e2; color:#dc2626; border:none; border-radius:6px; font-size:0.75rem; font-weight:600; cursor:pointer; margin:0.1rem; }' +
        '.adx-perm-del-btn:hover { background:#fecaca; }' +
        '.adx-deleted-empty { text-align:center; padding:2rem; color:#9ca3af; font-size:0.9rem; }' +
        '.adx-deleted-meta { font-size:0.75rem; color:#9ca3af; }';
    document.head.appendChild(style);

    // ----------------------------------------------------------
    // CONFIRMATION MODAL (singleton)
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

    function closeConfirm() {
        confirmOverlay.classList.remove('active');
    }

    function showConfirm(opts) {
        var box = document.getElementById('adx-confirm-box');
        var html = '';
        html += '<h3>' + esc(opts.title || 'Confirm Delete') + '</h3>';
        html += '<p>' + (opts.message || 'Are you sure?') + '</p>';
        if (opts.warning) {
            html += '<div class="adx-warn">' + opts.warning + '</div>';
        }
        html += '<div class="adx-confirm-actions">';
        html += '<button class="adx-confirm-cancel" id="adx-confirm-no">Cancel</button>';
        html += '<button class="adx-confirm-delete" id="adx-confirm-yes">' + esc(opts.confirmLabel || 'Delete') + '</button>';
        html += '</div>';
        box.innerHTML = html;
        confirmOverlay.classList.add('active');

        document.getElementById('adx-confirm-no').onclick = function () { closeConfirm(); };
        document.getElementById('adx-confirm-yes').onclick = function () {
            closeConfirm();
            if (opts.onConfirm) opts.onConfirm();
        };
    }

    // ----------------------------------------------------------
    // UNDO TOAST (singleton)
    // ----------------------------------------------------------
    var undoToast = document.createElement('div');
    undoToast.id = 'adx-undo-toast';
    document.body.appendChild(undoToast);

    var _undoTimer = null;
    var _undoCallback = null;

    function showUndoToast(message, onUndo) {
        if (_undoTimer) clearTimeout(_undoTimer);

        _undoCallback = onUndo;

        undoToast.innerHTML = '' +
            '<div class="adx-undo-msg">' +
                '<div>' + esc(message) + '</div>' +
                '<div class="adx-undo-bar"><div class="adx-undo-bar-fill" id="adx-undo-fill" style="width:100%;"></div></div>' +
            '</div>' +
            '<button class="adx-undo-action" id="adx-undo-btn">Undo</button>';

        undoToast.classList.add('active');

        // Animate the progress bar
        requestAnimationFrame(function () {
            var fill = document.getElementById('adx-undo-fill');
            if (fill) {
                fill.style.transitionDuration = UNDO_TIMEOUT_MS + 'ms';
                requestAnimationFrame(function () {
                    fill.style.width = '0%';
                });
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

    function canDelete() {
        var role = getCurrentRole();
        return role === 'admin' || role === 'gm';
    }

    function isAdmin() {
        return getCurrentRole() === 'admin';
    }

    // ----------------------------------------------------------
    // INJECT DELETE BUTTONS INTO QUOTES TABLE
    // ----------------------------------------------------------
    function injectQuoteDeleteButtons() {
        if (!canDelete()) return;

        // Find the admin quotes table body
        var tables = document.querySelectorAll('table');
        tables.forEach(function (table) {
            // Look for quotes tables by checking header content
            var headers = table.querySelectorAll('th');
            var headerTexts = Array.from(headers).map(function (h) { return h.textContent.trim().toLowerCase(); });

            var isQuoteTable = headerTexts.some(function (t) { return t.includes('quote') || t.includes('quote #') || t.includes('quote number'); }) &&
                               headerTexts.some(function (t) { return t.includes('status') || t.includes('dealer'); });

            if (!isQuoteTable) return;

            // Check if we already injected
            if (table.dataset.adxDeleteInjected === 'true') return;
            table.dataset.adxDeleteInjected = 'true';

            // Add "Delete" header to the actions column if not there
            var rows = table.querySelectorAll('tbody tr');
            rows.forEach(function (row) {
                var actionCell = row.querySelector('td:last-child');
                if (!actionCell) return;
                if (actionCell.querySelector('.adx-del-btn')) return;

                // Try to find quote ID from the row
                var quoteId = row.dataset.id || row.dataset.quoteId;
                if (!quoteId) {
                    // Try to find from buttons already in the row
                    var existingBtn = actionCell.querySelector('[data-id]');
                    if (existingBtn) quoteId = existingBtn.dataset.id;
                }
                if (!quoteId) {
                    // Try data attribute on row
                    var cells = row.querySelectorAll('td');
                    if (cells.length > 0) {
                        quoteId = row.getAttribute('data-quote-id') || row.getAttribute('data-id');
                    }
                }

                if (quoteId) {
                    var delBtn = document.createElement('button');
                    delBtn.className = 'adx-del-btn';
                    delBtn.textContent = 'Delete';
                    delBtn.dataset.quoteId = quoteId;
                    delBtn.onclick = function (e) {
                        e.stopPropagation();
                        confirmDeleteQuote(quoteId, row);
                    };
                    actionCell.appendChild(delBtn);
                }
            });
        });
    }

    // ----------------------------------------------------------
    // INJECT DELETE BUTTONS INTO CUSTOMERS TABLE
    // ----------------------------------------------------------
    function injectCustomerDeleteButtons() {
        if (!canDelete()) return;

        var tbody = document.getElementById('admin-cust-tbody');
        if (!tbody) return;
        if (tbody.dataset.adxDeleteInjected === 'true') return;
        tbody.dataset.adxDeleteInjected = 'true';

        var rows = tbody.querySelectorAll('tr');
        rows.forEach(function (row) {
            var actionCell = row.querySelector('td:last-child');
            if (!actionCell) return;
            if (actionCell.querySelector('.adx-del-btn')) return;

            var custId = row.dataset.id;
            if (!custId) {
                var viewBtn = actionCell.querySelector('.cust-view-btn');
                if (viewBtn) custId = viewBtn.dataset.id;
            }

            if (custId) {
                var delBtn = document.createElement('button');
                delBtn.className = 'adx-del-btn';
                delBtn.textContent = 'Delete';
                delBtn.dataset.custId = custId;
                delBtn.onclick = function (e) {
                    e.stopPropagation();
                    confirmDeleteCustomer(custId, row);
                };
                actionCell.appendChild(delBtn);
            }
        });
    }

    // ----------------------------------------------------------
    // CONFIRM + DELETE QUOTE
    // ----------------------------------------------------------
    function confirmDeleteQuote(quoteId, row) {
        // Try to get quote info from the row
        var cells = row ? row.querySelectorAll('td') : [];
        var quoteNum = cells.length > 0 ? cells[0].textContent.trim() : quoteId;

        showConfirm({
            title: 'Delete Quote',
            message: 'Are you sure you want to delete quote <strong>' + esc(quoteNum) + '</strong>?',
            warning: 'This quote will be moved to the Recently Deleted section. You can undo this action within ' + (UNDO_TIMEOUT_MS / 1000) + ' seconds.',
            confirmLabel: 'Delete Quote',
            onConfirm: function () {
                apiCall('DELETE', '/api/admin/quotes/' + quoteId)
                    .then(function (res) {
                        // Fade out the row
                        if (row) {
                            row.style.transition = 'opacity 0.3s, background 0.3s';
                            row.style.opacity = '0.3';
                            row.style.background = '#fee2e2';
                            setTimeout(function () {
                                if (row.parentNode) row.parentNode.removeChild(row);
                            }, 400);
                        }

                        showUndoToast('Quote ' + (res.quoteNumber || quoteId) + ' deleted', function () {
                            // UNDO: restore the quote
                            apiCall('POST', '/api/admin/quotes/' + quoteId + '/restore')
                                .then(function () {
                                    // Refresh the page/table
                                    refreshAdminView();
                                })
                                .catch(function (err) {
                                    alert('Failed to restore quote: ' + err.message);
                                });
                        });
                    })
                    .catch(function (err) {
                        alert('Failed to delete quote: ' + err.message);
                    });
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
                            setTimeout(function () {
                                if (row.parentNode) row.parentNode.removeChild(row);
                            }, 400);
                        }

                        var msg = 'Customer "' + (res.customerName || custName) + '" deleted';
                        if (res.quotesDeleted > 0) {
                            msg += ' (' + res.quotesDeleted + ' quotes also removed)';
                        }

                        showUndoToast(msg, function () {
                            apiCall('POST', '/api/admin/customers/' + custId + '/restore')
                                .then(function (restoreRes) {
                                    refreshAdminView();
                                })
                                .catch(function (err) {
                                    alert('Failed to restore customer: ' + err.message);
                                });
                        });
                    })
                    .catch(function (err) {
                        alert('Failed to delete customer: ' + err.message);
                    });
            }
        });
    }

    // ----------------------------------------------------------
    // RECENTLY DELETED TAB
    // ----------------------------------------------------------
    var _deletedTabInjected = false;
    var _deletedTabBtn = null;
    var _deletedWrapper = null;

    function injectRecentlyDeletedTab() {
        if (_deletedTabInjected) return;
        if (!canDelete()) return;

        // Find the admin tab bar (same strategy as admin-customers.js)
        var allBtns = document.querySelectorAll('button');
        var tabBar = null;
        var referenceTab = null;

        for (var i = 0; i < allBtns.length; i++) {
            var btn = allBtns[i];
            var txt = btn.textContent.trim();
            if (txt === 'Dealers' || txt === 'All Dealers' || txt === 'Manage Dealers') {
                var parent = btn.parentElement;
                if (!parent) continue;
                var sibTexts = Array.from(parent.children).map(function (c) { return c.textContent.trim(); });
                var hasQuotes = sibTexts.some(function (t) { return /quotes/i.test(t); });
                if (hasQuotes) {
                    tabBar = parent;
                    referenceTab = btn;
                    break;
                }
            }
        }
        if (!tabBar || !referenceTab) return;

        // Check if already exists
        var existingTexts = Array.from(tabBar.children).map(function (c) { return c.textContent.trim().toLowerCase(); });
        if (existingTexts.includes('recently deleted')) {
            _deletedTabInjected = true;
            return;
        }

        // Clone style from reference tab
        _deletedTabBtn = document.createElement(referenceTab.tagName || 'button');
        _deletedTabBtn.className = referenceTab.className;
        _deletedTabBtn.classList.remove('active');
        if (referenceTab.getAttribute('style')) {
            _deletedTabBtn.setAttribute('style', referenceTab.getAttribute('style'));
        }
        _deletedTabBtn.textContent = 'Recently Deleted';
        _deletedTabBtn.type = 'button';
        _deletedTabBtn.id = 'admin-deleted-tab';
        _deletedTabBtn.style.color = '#dc2626';
        tabBar.appendChild(_deletedTabBtn);

        // Find or create wrapper approach
        var contentArea = tabBar.nextElementSibling;
        if (!contentArea) return;

        _deletedWrapper = document.createElement('div');
        _deletedWrapper.id = 'admin-deleted-content-wrapper';
        _deletedWrapper.style.display = 'none';
        contentArea.appendChild(_deletedWrapper);

        _deletedTabBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            showDeletedTab(tabBar, contentArea);
        });

        // Intercept other tab clicks to hide deleted wrapper
        Array.from(tabBar.children).forEach(function (tab) {
            if (tab === _deletedTabBtn) return;
            tab.addEventListener('click', function () {
                hideDeletedTab();
            }, true);
        });

        _deletedTabInjected = true;
        console.log('[ameridex-admin-delete] Recently Deleted tab injected');
    }

    function showDeletedTab(tabBar, contentArea) {
        // Hide all other content wrappers
        var origWrapper = document.getElementById('admin-original-content-wrapper');
        var custWrapper = document.getElementById('admin-customers-content-wrapper');
        if (origWrapper) origWrapper.style.display = 'none';
        if (custWrapper) custWrapper.style.display = 'none';
        _deletedWrapper.style.display = 'block';

        // Deactivate all tabs, activate ours
        Array.from(tabBar.children).forEach(function (t) { t.classList.remove('active'); });
        _deletedTabBtn.classList.add('active');

        renderDeletedContent();
    }

    function hideDeletedTab() {
        if (_deletedWrapper) _deletedWrapper.style.display = 'none';
        if (_deletedTabBtn) _deletedTabBtn.classList.remove('active');
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

        // Stats
        html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:0.75rem;margin-bottom:1.25rem;">';
        html += '<div style="background:#fff;border:1px solid #fecaca;border-radius:10px;padding:0.85rem 1rem;text-align:center;">';
        html += '<div style="font-size:1.3rem;font-weight:700;color:#dc2626;">' + deletedCustomers.length + '</div>';
        html += '<div style="font-size:0.78rem;color:#6b7280;margin-top:0.2rem;">Deleted Customers</div></div>';
        html += '<div style="background:#fff;border:1px solid #fecaca;border-radius:10px;padding:0.85rem 1rem;text-align:center;">';
        html += '<div style="font-size:1.3rem;font-weight:700;color:#dc2626;">' + deletedQuotes.length + '</div>';
        html += '<div style="font-size:0.78rem;color:#6b7280;margin-top:0.2rem;">Deleted Quotes</div></div>';
        html += '</div>';

        // Deleted Customers
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

        // Deleted Quotes
        html += '<div class="adx-deleted-section" style="margin-top:1.5rem;">';
        html += '<h4 style="color:#dc2626;">Deleted Quotes</h4>';
        if (deletedQuotes.length === 0) {
            html += '<div class="adx-deleted-empty">No deleted quotes</div>';
        } else {
            html += '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:0.88rem;">';
            html += '<thead><tr style="background:#fef2f2;">';
            ['Quote #','Dealer','Customer','Total','Status','Deleted By','Deleted At','Reason','Actions'].forEach(function (h) {
                html += '<th style="padding:0.6rem;text-align:left;border-bottom:2px solid #fecaca;font-size:0.8rem;color:#6b7280;">' + h + '</th>';
            });
            html += '</tr></thead><tbody>';
            deletedQuotes.forEach(function (q) {
                var delDate = q.deletedAt ? new Date(q.deletedAt).toLocaleString() : 'Unknown';
                var reason = q.deletedReason ? 'Cascade (customer deleted)' : 'Direct';
                html += '<tr style="border-bottom:1px solid #fef2f2;">';
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
                    // Only show restore for directly deleted quotes (not cascade)
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

        // Wire up restore buttons
        _deletedWrapper.querySelectorAll('.adx-restore-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var type = btn.dataset.type;
                var id = btn.dataset.id;
                var endpoint = type === 'customer'
                    ? '/api/admin/customers/' + id + '/restore'
                    : '/api/admin/quotes/' + id + '/restore';

                btn.textContent = 'Restoring...';
                btn.disabled = true;

                apiCall('POST', endpoint)
                    .then(function () {
                        renderDeletedContent(); // Refresh the list
                    })
                    .catch(function (err) {
                        alert('Failed to restore: ' + err.message);
                        btn.textContent = 'Restore';
                        btn.disabled = false;
                    });
            });
        });

        // Wire up permanent delete buttons (admin only)
        _deletedWrapper.querySelectorAll('.adx-perm-del-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var type = btn.dataset.type;
                var id = btn.dataset.id;
                var name = btn.dataset.name;
                var endpoint = type === 'customer'
                    ? '/api/admin/customers/' + id + '/permanent'
                    : '/api/admin/quotes/' + id + '/permanent';

                showConfirm({
                    title: 'Permanently Delete',
                    message: 'Permanently delete <strong>' + esc(name || id) + '</strong>?',
                    warning: 'This action CANNOT be undone. The data will be permanently removed from the system.',
                    confirmLabel: 'Permanently Delete',
                    onConfirm: function () {
                        apiCall('DELETE', endpoint)
                            .then(function () {
                                renderDeletedContent();
                            })
                            .catch(function (err) {
                                alert('Failed to permanently delete: ' + err.message);
                            });
                    }
                });
            });
        });
    }

    // ----------------------------------------------------------
    // REFRESH HELPER
    // ----------------------------------------------------------
    function refreshAdminView() {
        // Try to click the currently active tab to force a re-render
        var activeTab = document.querySelector('.admin-tab.active, [data-tab].active, button.active');
        if (activeTab && activeTab.id !== 'admin-deleted-tab') {
            activeTab.click();
            return;
        }

        // If on deleted tab, re-render
        if (_deletedWrapper && _deletedWrapper.style.display !== 'none') {
            renderDeletedContent();
            return;
        }

        // Fallback: try to find and click the Quotes or Customers tab
        var allBtns = document.querySelectorAll('button');
        for (var i = 0; i < allBtns.length; i++) {
            var t = allBtns[i].textContent.trim().toLowerCase();
            if (t === 'quotes' || t === 'all quotes') {
                allBtns[i].click();
                return;
            }
        }
    }

    // ----------------------------------------------------------
    // MUTATION OBSERVER - watches for table re-renders
    // ----------------------------------------------------------
    var observer = new MutationObserver(function () {
        if (!canDelete()) return;

        // Re-inject delete buttons whenever tables are re-rendered
        injectQuoteDeleteButtons();
        injectCustomerDeleteButtons();

        // Inject Recently Deleted tab if not done
        if (!_deletedTabInjected) {
            injectRecentlyDeletedTab();
        }

        // If deleted tab exists but wrappers are gone (admin re-opened), reset
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
        if (_polls > MAX_POLLS) {
            clearInterval(poller);
            return;
        }
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

    console.log('[ameridex-admin-delete] v1.0 loaded (soft delete + undo + recently deleted)');
})();
