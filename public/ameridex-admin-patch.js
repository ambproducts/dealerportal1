// ============================================================
// AmeriDex Admin Panel Patch v1.0 - Per-Dealer Pricing Migration
// Date: 2026-02-28
// ============================================================
// REQUIRES: ameridex-admin.js (v1.8+) loaded first
//
// Load order in dealer-portal.html (before </body>):
//   <script src="ameridex-patches.js"></script>
//   <script src="ameridex-api.js"></script>
//   <script src="ameridex-admin.js"></script>
//   <script src="ameridex-admin-patch.js"></script>
//
// v1.0 Phase 1 (2026-02-28):
//   - RENAME: "Pricing Tiers" tab -> "Dealer Pricing"
//   - HIDE: Pricing Tier dropdown from Add Dealer form
//   - HIDE: "Exempt from Tier Discounts" from Add/Edit Product forms
//   - REMOVE: Tier column from dealers table (MutationObserver)
//   - REMOVE: Tier Exempt column from products table (MutationObserver)
//   - REMOVE: "Tier Exempt" stat card from products stats
//   - OVERRIDE: editDealer() to skip tier prompt (capture-phase)
//   - REPLACE: Pricing tab content with placeholder pending Phase 2
//
// Phase 2 (Commit 2): Per-Dealer Pricing Editor - TBD
// ============================================================

(function () {
    'use strict';

    var _api = window.ameridexAPI;
    if (!_api) {
        console.warn('[AdminPatch] ameridexAPI not found. Patch requires ameridex-api.js loaded first.');
        return;
    }


    // ----------------------------------------------------------
    // HELPER
    // ----------------------------------------------------------
    function patchAlert(containerId, msg, type) {
        var el = document.getElementById(containerId);
        if (!el) return;
        el.innerHTML = '<div class="admin-' + (type || 'success') + '">' + msg + '</div>';
        setTimeout(function () { el.innerHTML = ''; }, 4000);
    }


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
    // The select#admin-new-tier lives inside a .admin-form-row
    // alongside an empty placeholder field. Hide the entire row.
    // The backend receives no pricingTier and defaults gracefully.
    // ----------------------------------------------------------
    var tierSelect = document.getElementById('admin-new-tier');
    if (tierSelect) {
        var tierFormRow = tierSelect.closest('.admin-form-row');
        if (tierFormRow) tierFormRow.style.display = 'none';
    }


    // ----------------------------------------------------------
    // 3. HIDE "EXEMPT FROM TIER DISCOUNTS" FROM ADD PRODUCT FORM
    // ----------------------------------------------------------
    // The select#admin-new-prod-flat sits in a .admin-form-row
    // next to the Category select. Hide only the field, not the
    // row, so Category remains visible.
    // ----------------------------------------------------------
    var flatSelect = document.getElementById('admin-new-prod-flat');
    if (flatSelect) {
        var flatField = flatSelect.closest('.admin-form-field');
        if (flatField) flatField.style.display = 'none';
    }


    // ----------------------------------------------------------
    // 4. DEALERS TABLE: Remove Tier Column (MutationObserver)
    // ----------------------------------------------------------
    // Original columns: Code | Name | Contact | Role | Tier | Status | Actions
    // After patch:      Code | Name | Contact | Role | Status | Actions
    //
    // The observer fires whenever renderDealersTable() rebuilds
    // the innerHTML. Re-entry is prevented because once the Tier
    // header is removed, subsequent calls find tierIdx === -1
    // and return immediately.
    // ----------------------------------------------------------
    function patchDealersTable() {
        var container = document.getElementById('admin-dealers-list');
        if (!container) return;
        var table = container.querySelector('.admin-table');
        if (!table) return;

        var headers = table.querySelectorAll('thead th');
        var tierIdx = -1;
        headers.forEach(function (th, i) {
            if (th.textContent.trim() === 'Tier') tierIdx = i;
        });
        if (tierIdx === -1) return;

        headers[tierIdx].remove();
        table.querySelectorAll('tbody tr').forEach(function (row) {
            var cells = row.querySelectorAll('td');
            if (cells.length > tierIdx && cells[tierIdx]) {
                cells[tierIdx].remove();
            }
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
    // The original editDealer(id) inside the IIFE prompts for:
    //   1. Dealer Name
    //   2. Pricing Tier  <-- removed
    //   3. Role
    // Our capture-phase listener fires before the IIFE's
    // bubbling-phase handler on the button. We block the
    // original via stopImmediatePropagation and run our own
    // version that only asks for name and role.
    //
    // We selectively intercept data-action="edit" only.
    // Other actions (reset-pw, toggle) pass through untouched.
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
    // Original columns: Product | ID | Category | Base Price | Unit | Tier Exempt | Status | Actions
    // After patch:      Product | ID | Category | Base Price | Unit | Status | Actions
    //
    // Also hides the "Exempt from Tier Discounts" select inside
    // any open inline edit form (rendered by editProduct()).
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

        // Hide tier exempt field inside any open inline edit form
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


    // ----------------------------------------------------------
    // 8. PRICING TAB: Placeholder Pending Phase 2
    // ----------------------------------------------------------
    // Intercepts the pricing tab click in the capture phase so
    // the IIFE's handler (which calls loadPricingTiers) never
    // fires. We handle tab switching manually and show a
    // placeholder message until the Phase 2 per-dealer pricing
    // editor is deployed.
    // ----------------------------------------------------------
    if (pricingTabBtn) {
        pricingTabBtn.addEventListener('click', function (e) {
            e.stopImmediatePropagation();

            // Manual tab switching since original handler is blocked
            document.querySelectorAll('#admin-modal .admin-tab').forEach(function (t) {
                t.classList.remove('active');
            });
            pricingTabBtn.classList.add('active');
            document.querySelectorAll('#admin-modal .admin-tab-content').forEach(function (c) {
                c.classList.remove('active');
            });
            var pricingContent = document.getElementById('admin-tab-pricing');
            if (pricingContent) pricingContent.classList.add('active');

            // Replace content with placeholder
            var list = document.getElementById('admin-pricing-list');
            if (list) {
                list.innerHTML =
                    '<div class="admin-empty" style="padding:3rem 1rem;">' +
                        '<div style="font-size:1.5rem;font-weight:700;color:#1e40af;margin-bottom:0.75rem;">' +
                            'Per-Dealer Pricing' +
                        '</div>' +
                        '<div style="color:#6b7280;max-width:30rem;margin:0 auto;line-height:1.6;font-size:0.92rem;">' +
                            'The per-dealer pricing editor is being deployed. ' +
                            'Product base prices can be managed on the <strong>Products</strong> tab. ' +
                            'Individual dealer price overrides will be configurable here shortly.' +
                        '</div>' +
                    '</div>';
            }

            // Hide the old "Save All Changes" button
            var saveBtn = document.getElementById('admin-save-pricing-btn');
            if (saveBtn) saveBtn.style.display = 'none';

            // Hide the old tier description paragraph
            if (pricingContent) {
                var desc = pricingContent.querySelector(':scope > p');
                if (desc) desc.style.display = 'none';
            }

            // Update toolbar title
            if (pricingContent) {
                var h3 = pricingContent.querySelector('.admin-toolbar h3');
                if (h3) h3.textContent = 'Dealer Pricing';
            }
        }, true);
    }


    console.log('[AdminPatch] v1.0 Phase 1 loaded: Legacy tier UI removed.');
})();
