// ============================================================
// AmeriDex Admin Panel Patch v2.0 - Per-Dealer Pricing Migration
// Date: 2026-02-28
// ============================================================
// REQUIRES: ameridex-admin.js (v1.8+) loaded first
//
// Load order (via script-loader.js position 17):
//   ... ameridex-admin.js (position 11) ...
//   ... ameridex-admin-patch.js (position 17)
//
// v2.0 Phase 2 (2026-02-28):
//   - REPLACE: Phase 1 placeholder with full per-dealer pricing editor
//   - ADD: Dealer selector dropdown in pricing tab
//   - ADD: Editable product price table per dealer
//   - ADD: Visual diff showing base vs dealer price with % change
//   - ADD: "Pricing" button in dealers table for quick navigation
//   - ADD: Copy pricing from another dealer
//   - ADD: Reset all overrides to catalog defaults
//   - ADD: Graceful 404 fallback if backend not deployed
//   - ADD: Stats bar (total products, overrides count, avg discount)
//
// v1.0 Phase 1 (2026-02-28):
//   - RENAME: "Pricing Tiers" tab -> "Dealer Pricing"
//   - HIDE: Pricing Tier dropdown from Add Dealer form
//   - HIDE: "Exempt from Tier Discounts" from Add/Edit Product forms
//   - REMOVE: Tier column from dealers table (MutationObserver)
//   - REMOVE: Tier Exempt column from products table (MutationObserver)
//   - REMOVE: "Tier Exempt" stat card from products stats
//   - OVERRIDE: editDealer() to skip tier prompt (capture-phase)
//
// Backend endpoints consumed:
//   GET  /api/admin/dealers/:id/pricing
//   PUT  /api/admin/dealers/:id/pricing
//   POST /api/admin/dealers/:id/pricing/copy-from/:sourceId
//   POST /api/admin/dealers/:id/pricing/reset
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
        el.innerHTML = '<div class="admin-' + (type || 'success') + '">' + msg + '</div>';
        setTimeout(function () { el.innerHTML = ''; }, 4000);
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


    // ----------------------------------------------------------
    // PATCH CSS (Phase 2 additions)
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
        '';
    document.head.appendChild(patchStyle);


    // ----------------------------------------------------------
    // STATE
    // ----------------------------------------------------------
    var _patchDealers = [];
    var _patchProducts = [];
    var _selectedDealerId = null;
    var _dealerPrices = {};      // { productId: price } from backend
    var _editedPrices = {};      // { productId: price } local edits
    var _backendAvailable = null; // null=unknown, true/false after first call


    // ===========================================================
    // PHASE 1: SURGICAL REMOVALS (unchanged from v1.0)
    // ===========================================================

    // ----------------------------------------------------------
    // 1. RENAME "Pricing Tiers" TAB TO "Dealer Pricing"
    // ----------------------------------------------------------
    var pricingTabBtn = document.querySelector('.admin-tab[data-tab="pricing"]');
    if (pricingTabBtn) {
        pricingTabBtn.textContent = 'Dealer Pricing';
    }


    // ----------------------------------------------------------
    // 2. HIDE PRICING TIER DROPDOWN FROM ADD DEALER FORM
    // ----------------------------------------------------------
    var tierSelect = document.getElementById('admin-new-tier');
    if (tierSelect) {
        var tierFormRow = tierSelect.closest('.admin-form-row');
        if (tierFormRow) tierFormRow.style.display = 'none';
    }


    // ----------------------------------------------------------
    // 3. HIDE "EXEMPT FROM TIER DISCOUNTS" FROM ADD PRODUCT FORM
    // ----------------------------------------------------------
    var flatSelect = document.getElementById('admin-new-prod-flat');
    if (flatSelect) {
        var flatField = flatSelect.closest('.admin-form-field');
        if (flatField) flatField.style.display = 'none';
    }


    // ----------------------------------------------------------
    // 4. DEALERS TABLE: Remove Tier Column + Add Pricing Button
    // ----------------------------------------------------------
    function patchDealersTable() {
        var container = document.getElementById('admin-dealers-list');
        if (!container) return;
        var table = container.querySelector('.admin-table');
        if (!table) return;

        // Remove Tier column
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

        // Add Pricing button to each dealer's Actions cell if not already present
        table.querySelectorAll('tbody tr').forEach(function (row) {
            var actionsCell = row.querySelector('.admin-actions');
            if (!actionsCell) return;
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


    // ----------------------------------------------------------
    // 5. EDIT DEALER: Skip Tier Prompt (capture-phase override)
    // ----------------------------------------------------------
    if (dealersList) {
        dealersList.addEventListener('click', function (e) {
            var editBtn = e.target.closest('[data-action="edit"]');
            if (!editBtn) return;

            e.stopImmediatePropagation();
            e.preventDefault();

            var dealerId = editBtn.getAttribute('data-id');

            _api('GET', '/api/admin/dealers')
                .then(function (dealers) {
                    var dealer = dealers.find(function (d) {
                        return String(d.id) === String(dealerId);
                    });
                    if (!dealer) {
                        alert('Dealer not found');
                        return null;
                    }

                    var newName = prompt('Dealer Name:', dealer.dealerName || '');
                    if (newName === null) return null;
                    var newRole = prompt('Role (dealer, rep, admin):', dealer.role || 'dealer');
                    if (newRole === null) return null;

                    return _api('PUT', '/api/admin/dealers/' + dealerId, {
                        dealerName: newName,
                        role: newRole
                    });
                })
                .then(function (result) {
                    if (!result) return;
                    patchAlert('admin-dealer-alert', 'Dealer updated!', 'success');
                    var tab = document.querySelector('.admin-tab[data-tab="dealers"]');
                    if (tab) tab.click();
                })
                .catch(function (err) {
                    patchAlert('admin-dealer-alert',
                        'Update failed: ' + (err.message || err), 'error');
                });
        }, true);
    }


    // ----------------------------------------------------------
    // 6. PRODUCTS TABLE: Remove Tier Exempt Column + Edit Form
    // ----------------------------------------------------------
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


    // ----------------------------------------------------------
    // 7. PRODUCTS STATS: Remove "Tier Exempt" Stat Card
    // ----------------------------------------------------------
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

    // ----------------------------------------------------------
    // 8. PRICING TAB: Full Per-Dealer Pricing Editor
    // ----------------------------------------------------------
    if (pricingTabBtn) {
        pricingTabBtn.addEventListener('click', function (e) {
            e.stopImmediatePropagation();

            // Manual tab switching
            document.querySelectorAll('#admin-modal .admin-tab').forEach(function (t) {
                t.classList.remove('active');
            });
            pricingTabBtn.classList.add('active');
            document.querySelectorAll('#admin-modal .admin-tab-content').forEach(function (c) {
                c.classList.remove('active');
            });
            var pricingContent = document.getElementById('admin-tab-pricing');
            if (pricingContent) pricingContent.classList.add('active');

            // Hide old elements
            var saveBtn = document.getElementById('admin-save-pricing-btn');
            if (saveBtn) saveBtn.style.display = 'none';
            if (pricingContent) {
                var desc = pricingContent.querySelector(':scope > .admin-body > p, :scope > p');
                if (!desc) {
                    pricingContent.querySelectorAll('p').forEach(function (p) {
                        if (p.textContent.indexOf('multiplier') !== -1) desc = p;
                    });
                }
                if (desc) desc.style.display = 'none';
            }

            // Update toolbar
            if (pricingContent) {
                var toolbar = pricingContent.querySelector('.admin-toolbar');
                if (toolbar) toolbar.style.display = 'none';
            }

            loadDealerPricingEditor();
        }, true);
    }


    // ----------------------------------------------------------
    // Navigate to pricing tab for a specific dealer
    // ----------------------------------------------------------
    function openPricingForDealer(dealerId) {
        _selectedDealerId = dealerId;
        var tab = document.querySelector('.admin-tab[data-tab="pricing"]');
        if (tab) tab.click();
    }


    // ----------------------------------------------------------
    // Load and render the pricing editor
    // ----------------------------------------------------------
    function loadDealerPricingEditor() {
        var list = document.getElementById('admin-pricing-list');
        if (!list) return;
        list.innerHTML = '<div class="admin-loading">Loading pricing editor...</div>';

        // Fetch dealers and products in parallel
        Promise.all([
            _api('GET', '/api/admin/dealers'),
            _api('GET', '/api/admin/products')
        ]).then(function (results) {
            _patchDealers = (results[0] || []).filter(function (d) { return d.isActive !== false; });
            _patchProducts = (results[1] || []).filter(function (p) {
                return p.isActive !== false && p.id !== 'custom';
            });
            renderPricingEditor();

            // If a dealer was pre-selected (from Pricing button), load their prices
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


    // ----------------------------------------------------------
    // Render the editor shell (dealer selector + empty state)
    // ----------------------------------------------------------
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
                    '<button class="admin-btn admin-btn-ghost" id="dp-reset-btn" title="Reset all prices to catalog defaults">Reset to Defaults</button>' +
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

        // Wire up events
        var dealerSelect = document.getElementById('dp-dealer-select');
        if (dealerSelect) dealerSelect.addEventListener('change', onDealerSelected);

        var saveBtn = document.getElementById('dp-save-btn');
        if (saveBtn) saveBtn.addEventListener('click', saveDealerPrices);

        var resetBtn = document.getElementById('dp-reset-btn');
        if (resetBtn) resetBtn.addEventListener('click', resetDealerPrices);

        var copyBtn = document.getElementById('dp-copy-btn');
        if (copyBtn) copyBtn.addEventListener('click', copyDealerPrices);
    }


    // ----------------------------------------------------------
    // When a dealer is selected
    // ----------------------------------------------------------
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
                    '<div style="font-size:0.9rem;">Choose a dealer from the dropdown above to view and edit their pricing.</div>' +
                '</div>';
            }
            return;
        }

        if (actions) actions.style.display = 'flex';

        // Show dealer info
        var dealer = _patchDealers.find(function (d) { return String(d.id) === String(dealerId); });
        if (info && dealer) {
            info.style.display = 'flex';
            info.innerHTML = '<div>' +
                '<span class="dp-dealer-info-name">' + esc(dealer.dealerName || 'Unnamed') + '</span>' +
                '<span class="dp-dealer-info-code"> (' + esc(dealer.dealerCode) + ')</span>' +
            '</div>' +
            '<div style="font-size:0.82rem;color:#6b7280;">Contact: ' + esc(dealer.contactPerson || 'N/A') + ' | ' + esc(dealer.email || 'N/A') + '</div>';
        }

        // Try to fetch dealer-specific pricing from backend
        if (tableDiv) tableDiv.innerHTML = '<div class="admin-loading">Loading dealer prices...</div>';

        _api('GET', '/api/admin/dealers/' + dealerId + '/pricing')
            .then(function (data) {
                _backendAvailable = true;
                // data expected: { prices: { productId: price, ... } }
                if (data && data.prices) {
                    _dealerPrices = data.prices;
                } else if (data && typeof data === 'object' && !data.prices) {
                    // Maybe backend returns flat { productId: price }
                    _dealerPrices = data;
                }
                renderPriceTable();
            })
            .catch(function (err) {
                var status = err.status || err.statusCode || 0;
                var msg = (err.message || String(err)).toLowerCase();

                if (status === 404 || msg.indexOf('404') !== -1 || msg.indexOf('not found') !== -1) {
                    _backendAvailable = false;
                    // Endpoint not implemented yet. Show table with base prices as editable defaults.
                    _dealerPrices = {};
                    renderPriceTable();
                    patchAlert('dp-pricing-alert',
                        'Backend endpoint not yet deployed. Showing catalog base prices. ' +
                        'Edits will be saved once <code>GET/PUT /api/admin/dealers/:id/pricing</code> is implemented.',
                        'error');
                } else {
                    if (tableDiv) {
                        tableDiv.innerHTML = '<div class="dp-backend-error">' +
                            '<div style="font-size:1.1rem;font-weight:700;margin-bottom:0.5rem;">Failed to Load Pricing</div>' +
                            '<div>' + esc(err.message || err) + '</div>' +
                            '<div style="margin-top:0.75rem;">Expected endpoint: <code>GET /api/admin/dealers/' + esc(dealerId) + '/pricing</code></div>' +
                        '</div>';
                    }
                }
            });
    }


    // ----------------------------------------------------------
    // Render the price table for selected dealer
    // ----------------------------------------------------------
    function renderPriceTable() {
        var tableDiv = document.getElementById('dp-price-table');
        if (!tableDiv) return;

        if (_patchProducts.length === 0) {
            tableDiv.innerHTML = '<div class="admin-empty">No active products found. Add products on the Products tab first.</div>';
            return;
        }

        // Group by category
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
                    if (dealerPrice < basePrice) {
                        diffHtml = '<span class="dp-diff-down">' + pctChange + '%</span>';
                    } else {
                        diffHtml = '<span class="dp-diff-up">+' + pctChange + '%</span>';
                    }
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

        // Wire up input change handlers
        tableDiv.querySelectorAll('.dp-price-input').forEach(function (input) {
            input.addEventListener('input', function () {
                var pid = input.getAttribute('data-product-id');
                var base = parseFloat(input.getAttribute('data-base-price'));
                var val = parseFloat(input.value);

                if (isNaN(val)) return;

                _editedPrices[pid] = val;
                input.classList.add('dp-modified');

                // Update diff
                var diffCell = document.getElementById('dp-diff-' + pid);
                if (diffCell) {
                    if (val === base) {
                        diffCell.innerHTML = '<span class="dp-diff-same">0%</span>';
                    } else {
                        var pct = ((val - base) / base * 100).toFixed(1);
                        if (val < base) {
                            diffCell.innerHTML = '<span class="dp-diff-down">' + pct + '%</span>';
                        } else {
                            diffCell.innerHTML = '<span class="dp-diff-up">+' + pct + '%</span>';
                        }
                    }
                }

                updateUnsavedBar();
                updatePricingStats();
            });
        });

        updatePricingStats();
        updateUnsavedBar();
    }


    // ----------------------------------------------------------
    // Unsaved changes indicator
    // ----------------------------------------------------------
    function updateUnsavedBar() {
        var bar = document.getElementById('dp-unsaved-bar');
        if (!bar) return;
        var count = Object.keys(_editedPrices).length;
        if (count === 0) {
            bar.style.display = 'none';
            return;
        }
        bar.style.display = 'flex';
        bar.innerHTML = '<span>&#9888; ' + count + ' unsaved price change' + (count !== 1 ? 's' : '') + '</span>' +
            '<button class="admin-btn admin-btn-primary admin-btn-sm" id="dp-unsaved-save">Save Now</button>';
        var btn = document.getElementById('dp-unsaved-save');
        if (btn) btn.addEventListener('click', saveDealerPrices);
    }


    // ----------------------------------------------------------
    // Pricing stats bar
    // ----------------------------------------------------------
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
                if (base > 0) {
                    totalDiscount += ((current - base) / base * 100);
                    discountCount++;
                }
            }
        });

        var avgDiscount = discountCount > 0 ? (totalDiscount / discountCount).toFixed(1) : '0.0';

        statsDiv.innerHTML = '' +
            '<div class="admin-stat"><div class="admin-stat-value">' + totalProducts + '</div><div class="admin-stat-label">Products</div></div>' +
            '<div class="admin-stat"><div class="admin-stat-value">' + overrideCount + '</div><div class="admin-stat-label">Overrides</div></div>' +
            '<div class="admin-stat"><div class="admin-stat-value">' + avgDiscount + '%</div><div class="admin-stat-label">Avg Change</div></div>' +
            '<div class="admin-stat"><div class="admin-stat-value">' + Object.keys(_editedPrices).length + '</div><div class="admin-stat-label">Unsaved</div></div>';
    }


    // ----------------------------------------------------------
    // Save dealer prices
    // ----------------------------------------------------------
    function saveDealerPrices() {
        if (!_selectedDealerId) {
            patchAlert('dp-pricing-alert', 'No dealer selected.', 'error');
            return;
        }

        var edits = Object.keys(_editedPrices);
        if (edits.length === 0) {
            patchAlert('dp-pricing-alert', 'No changes to save.', 'error');
            return;
        }

        // Build merged prices object: existing overrides + local edits
        var mergedPrices = {};
        // Start with existing backend prices
        Object.keys(_dealerPrices).forEach(function (pid) {
            mergedPrices[pid] = Number(_dealerPrices[pid]);
        });
        // Apply local edits on top
        edits.forEach(function (pid) {
            var product = _patchProducts.find(function (p) { return p.id === pid; });
            var base = product ? product.basePrice : 0;
            // If edited back to base price, remove override
            if (_editedPrices[pid] === base) {
                delete mergedPrices[pid];
            } else {
                mergedPrices[pid] = _editedPrices[pid];
            }
        });

        var saveBtn = document.getElementById('dp-save-btn');
        if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

        _api('PUT', '/api/admin/dealers/' + _selectedDealerId + '/pricing', { prices: mergedPrices })
            .then(function () {
                _dealerPrices = mergedPrices;
                _editedPrices = {};
                renderPriceTable();
                patchAlert('dp-pricing-alert', 'Dealer prices saved! (' + edits.length + ' product' + (edits.length !== 1 ? 's' : '') + ' updated)', 'success');

                // Refresh pricing on quotes page if visible
                if (typeof window.applyTierPricing === 'function') {
                    try {
                        var p = window.applyTierPricing();
                        if (p && typeof p.catch === 'function') p.catch(function () {});
                    } catch (e) {}
                }
            })
            .catch(function (err) {
                var status = err.status || err.statusCode || 0;
                var msg = (err.message || String(err)).toLowerCase();
                if (status === 404 || msg.indexOf('404') !== -1 || msg.indexOf('not found') !== -1) {
                    patchAlert('dp-pricing-alert',
                        'Cannot save: Backend endpoint not deployed. Implement <code>PUT /api/admin/dealers/:id/pricing</code> first.',
                        'error');
                } else {
                    patchAlert('dp-pricing-alert', 'Save failed: ' + esc(err.message || err), 'error');
                }
            })
            .finally(function () {
                if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Prices'; }
            });
    }


    // ----------------------------------------------------------
    // Reset dealer prices to catalog defaults
    // ----------------------------------------------------------
    function resetDealerPrices() {
        if (!_selectedDealerId) return;

        var dealer = _patchDealers.find(function (d) { return String(d.id) === String(_selectedDealerId); });
        var label = dealer ? dealer.dealerCode : _selectedDealerId;

        if (!confirm('Reset ALL prices for ' + label + ' to catalog defaults?\n\nThis removes all custom price overrides for this dealer.')) return;

        _api('POST', '/api/admin/dealers/' + _selectedDealerId + '/pricing/reset')
            .then(function () {
                _dealerPrices = {};
                _editedPrices = {};
                renderPriceTable();
                patchAlert('dp-pricing-alert', 'Prices reset to catalog defaults for ' + esc(label) + '.', 'success');
            })
            .catch(function (err) {
                var status = err.status || err.statusCode || 0;
                var msg = (err.message || String(err)).toLowerCase();
                if (status === 404 || msg.indexOf('404') !== -1) {
                    // Fallback: just clear local state
                    _dealerPrices = {};
                    _editedPrices = {};
                    renderPriceTable();
                    patchAlert('dp-pricing-alert',
                        'Reset endpoint not yet deployed. Cleared local view. ' +
                        'Implement <code>POST /api/admin/dealers/:id/pricing/reset</code> for persistence.',
                        'error');
                } else {
                    patchAlert('dp-pricing-alert', 'Reset failed: ' + esc(err.message || err), 'error');
                }
            });
    }


    // ----------------------------------------------------------
    // Copy pricing from another dealer
    // ----------------------------------------------------------
    function copyDealerPrices() {
        if (!_selectedDealerId) return;
        var sourceSelect = document.getElementById('dp-copy-source');
        var sourceId = sourceSelect ? sourceSelect.value : '';
        if (!sourceId) {
            patchAlert('dp-pricing-alert', 'Select a source dealer to copy from.', 'error');
            return;
        }
        if (sourceId === _selectedDealerId) {
            patchAlert('dp-pricing-alert', 'Cannot copy from the same dealer.', 'error');
            return;
        }

        var sourceDealer = _patchDealers.find(function (d) { return String(d.id) === String(sourceId); });
        var sourceLabel = sourceDealer ? sourceDealer.dealerCode : sourceId;
        var targetDealer = _patchDealers.find(function (d) { return String(d.id) === String(_selectedDealerId); });
        var targetLabel = targetDealer ? targetDealer.dealerCode : _selectedDealerId;

        if (!confirm('Copy all prices from ' + sourceLabel + ' to ' + targetLabel + '?\n\nThis will overwrite current prices for ' + targetLabel + '.')) return;

        // Try backend endpoint first
        _api('POST', '/api/admin/dealers/' + _selectedDealerId + '/pricing/copy-from/' + sourceId)
            .then(function (data) {
                if (data && data.prices) _dealerPrices = data.prices;
                _editedPrices = {};
                renderPriceTable();
                patchAlert('dp-pricing-alert', 'Prices copied from ' + esc(sourceLabel) + ' to ' + esc(targetLabel) + '.', 'success');
            })
            .catch(function (err) {
                var status = err.status || err.statusCode || 0;
                var msg = (err.message || String(err)).toLowerCase();
                if (status === 404 || msg.indexOf('404') !== -1) {
                    // Fallback: fetch source dealer's pricing and apply locally
                    _api('GET', '/api/admin/dealers/' + sourceId + '/pricing')
                        .then(function (data) {
                            var sourcePrices = {};
                            if (data && data.prices) sourcePrices = data.prices;
                            else if (data && typeof data === 'object') sourcePrices = data;

                            // Apply as local edits
                            Object.keys(sourcePrices).forEach(function (pid) {
                                _editedPrices[pid] = Number(sourcePrices[pid]);
                            });
                            renderPriceTable();
                            updateUnsavedBar();
                            patchAlert('dp-pricing-alert',
                                'Prices loaded from ' + esc(sourceLabel) + ' as unsaved changes. Click Save to apply.',
                                'success');
                        })
                        .catch(function () {
                            patchAlert('dp-pricing-alert',
                                'Copy endpoint not deployed and source pricing unavailable. ' +
                                'Implement <code>POST /api/admin/dealers/:id/pricing/copy-from/:sourceId</code>.',
                                'error');
                        });
                } else {
                    patchAlert('dp-pricing-alert', 'Copy failed: ' + esc(err.message || err), 'error');
                }
            });
    }


    console.log('[AdminPatch] v2.0 loaded: Phase 1 (tier removal) + Phase 2 (per-dealer pricing editor).');
})();
