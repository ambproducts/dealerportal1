// ============================================================
// AmeriDex Dealer Portal - Admin Panel v2.3
// Date: 2026-03-16
// ============================================================
// REQUIRES: ameridex-api.js (v2.1+) loaded first
//
// Load order in dealer-portal.html (before </body>):
//   <script src="ameridex-patches.js"></script>
//   <script src="ameridex-api.js"></script>
//   <script src="ameridex-admin.js"></script>
//
// v2.3 Changes (2026-03-16):
//   - ADD: Sales Rep (Territory) role in create/edit user role dropdowns
//   - ADD: Assigned Dealers multi-select checkbox UI for salesrep users
//   - ADD: Salesrep filter option in role filter dropdown
//   - ADD: Salesrep count in Users tab stats
//   - ADD: Rep Pricing modal (Pricing button) for salesrep users
//        Uses GET/PUT /api/admin/rep-pricing/:userId endpoints
//   - ADD: .badge-salesrep CSS for purple salesrep badges
//   - FIX: Create/edit user hides dealer code field for salesrep,
//          shows assigned dealers checkboxes instead
//
// v2.2 Changes (2026-03-05):
//   - FIX: saveEditProduct() now checks for result.cascade from
//     the server (Fix 1 added cascade data to PUT /api/admin/products/:id
//     response) and displays feedback about how many dealers were
//     updated vs. skipped when a base price change occurs.
//   - Example alert: 'Product "Grooved Boards" updated! Cascade:
//     12 dealers updated to $6.50, 3 skipped (custom pricing).'
//
// v2.1 Changes (2026-03-05):
//   - FIX: syncProductGlobals() now calls
//     window.refreshAllPickerLabels() (exposed by
//     ameridex-inline-item-picker.js v2.2) after writing
//     the updated name/price/unit to PRODUCTS and
//     PRODUCT_CONFIG. Previously, existing .aip-picker
//     widgets kept showing the old product name in their
//     trigger label and option list until a page reload.
//     Now the label refreshes instantly on Save.
//
// v2.0 Changes (2026-03-05):
//   - FIX: Product name/price/unit edits in the admin panel now
//     instantly update the in-memory PRODUCTS and PRODUCT_CONFIG
//     globals via new syncProductGlobals() helper. The quote
//     builder dropdown reflects admin changes without a page reload.
//
// v1.9 Changes (2026-03-01):
//   - FIX: Admin Panel tab bar is now horizontally scrollable on
//     mobile. .admin-tabs gets overflow-x:auto, white-space:nowrap,
//     and -webkit-overflow-scrolling:touch so all 5 tabs (Dealers,
//     Quotes, Products, Pricing Tiers, Users) are reachable on
//     small screens without wrapping or clipping.
//   - FIX: .admin-tab flex:1 removed on mobile so tabs stay their
//     natural width inside the scrollable container.
//
// v1.8 Changes (2026-02-26):
//   - ADD: refreshPricingNow() helper to trigger applyTierPricing()
//     after product and pricing tier changes. This ensures dealer
//     quotes page immediately reflects updated prices without reload.
//   - FIX: Product saves, toggles, creates, and tier updates now
//     refresh pricing on the quotes page in real-time.
//
// v1.7 Changes (2026-02-25):
//   - REPLACE: editProduct() prompt() chain with full inline edit form.
//     Clicking "Edit" on a product row now expands an inline form directly
//     below the row with fields for Name, Base Price, Unit, Category, and
//     Tier Exempt toggle. Only one product edit form is open at a time.
//   - ADD: cancelEditProduct() and saveEditProduct() functions.
//   - ADD: CSS for .admin-inline-edit card styling.
//   - FIX: Edit button uses primary blue for better visibility.
//
// v1.6 Changes (2026-02-25):
//   - FIX: toggleProduct() boolean logic made explicit.
//     Normalizes prod.isActive to a boolean (currentlyActive)
//     before using it, instead of relying on fragile double-
//     negation with strict equality (prod.isActive === false).
//     Undefined/null isActive is now explicitly treated as active
//     via prod.isActive !== false. Matches toggleDealerActive style.
//
// v1.5 Changes (2026-02-16):
//   - ADD: Users tab in admin panel with full CRUD
//   - ADD: Users grouped/filterable by dealer code
//   - ADD: Admin can create users at any dealer with any role
//   - ADD: Inline edit, disable/enable, reset password for all users
//
// v1.4 Changes (2026-02-14):
//   - ADD: Products tab in admin panel (full CRUD)
//   - ADD: Per-product tier override support (e.g. BlueClaw stays flat)
//   - ADD: Admin can add, edit base price, rename, change unit/category,
//     toggle active/inactive, and delete products
//   - FIX: Pricing tier preview now reads live product catalog from API
//   - FIX: Custom/Manual Item excluded from pricing preview
//
// v1.3 Changes (2026-02-14):
//   - FIX: Replace placeholder products with real AmeriDex catalog
//
// v1.2 Changes (2026-02-14):
//   - FIX: Add Dealer password field type='password'
//
// v1.1 Changes (2026-02-14):
//   - FIX: Pricing tier GET/PUT uses /api/admin/pricing-tiers
//   - ADD: Pricing tab loads product catalog for computed price preview
//   - ADD: Username field in Add Dealer form
// ============================================================

(function () {
    'use strict';

    // ----------------------------------------------------------
    // STYLES
    // ----------------------------------------------------------
    var style = document.createElement('style');
    style.textContent = '' +
        '#admin-modal { display:none; position:fixed; inset:0; background:rgba(15,23,42,0.6); ' +
            'z-index:2000; justify-content:center; align-items:flex-start; padding:2rem 1rem; overflow-y:auto; }' +
        '#admin-modal.active { display:flex; }' +
        '#admin-panel { background:#fff; border-radius:14px; width:100%; max-width:960px; ' +
            'box-shadow:0 25px 50px rgba(0,0,0,0.25); max-height:90vh; display:flex; flex-direction:column; }' +
        '.admin-header { background:linear-gradient(135deg,#dc2626,#991b1b); color:#fff; ' +
            'padding:1.25rem 1.5rem; border-radius:14px 14px 0 0; display:flex; justify-content:space-between; align-items:center; }' +
        '.admin-header h2 { margin:0; font-size:1.25rem; }' +
        '.admin-close { background:none; border:none; color:#fff; font-size:1.5rem; cursor:pointer; padding:0.5rem; opacity:0.8; }' +
        '.admin-close:hover { opacity:1; }' +
        '.admin-tabs { display:flex; background:#f9fafb; border-bottom:1px solid #e5e7eb; ' +
            'overflow-x:auto; white-space:nowrap; -webkit-overflow-scrolling:touch; ' +
            'scrollbar-width:none; }' +
        '.admin-tabs::-webkit-scrollbar { display:none; }' +
        '.admin-tab { flex:1; padding:0.85rem 1rem; border:none; background:transparent; font-size:0.9rem; ' +
            'font-weight:600; color:#6b7280; cursor:pointer; transition:all 0.15s; border-bottom:3px solid transparent; ' +
            'white-space:nowrap; flex-shrink:0; }' +
        '.admin-tab:hover { color:#374151; background:#f3f4f6; }' +
        '.admin-tab.active { color:#dc2626; border-bottom-color:#dc2626; background:#fff; }' +
        '.admin-body { padding:1.5rem; overflow-y:auto; flex:1; }' +
        '.admin-tab-content { display:none; }' +
        '.admin-tab-content.active { display:block; }' +
        '.admin-toolbar { display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; flex-wrap:wrap; gap:0.75rem; }' +
        '.admin-toolbar h3 { margin:0; font-size:1.05rem; color:#374151; }' +
        '.admin-search { padding:0.55rem 0.85rem; border:1px solid #e5e7eb; border-radius:8px; font-size:0.9rem; width:220px; }' +
        '.admin-search:focus { outline:none; border-color:#2563eb; box-shadow:0 0 0 2px rgba(37,99,235,0.15); }' +
        '.admin-table { width:100%; border-collapse:collapse; font-size:0.88rem; }' +
        '.admin-table th { background:#f9fafb; padding:0.65rem 0.75rem; text-align:left; font-weight:600; ' +
            'color:#4b5563; border-bottom:2px solid #e5e7eb; white-space:nowrap; }' +
        '.admin-table td { padding:0.65rem 0.75rem; border-bottom:1px solid #f3f4f6; vertical-align:middle; }' +
        '.admin-table tr:hover td { background:#f9fafb; }' +
        '.admin-badge { display:inline-block; padding:0.15rem 0.55rem; border-radius:999px; ' +
            'font-size:0.72rem; font-weight:600; text-transform:uppercase; letter-spacing:0.04em; }' +
        '.badge-active { background:#dcfce7; color:#16a34a; }' +
        '.badge-inactive { background:#fee2e2; color:#dc2626; }' +
        '.badge-admin { background:#fef3c7; color:#92400e; }' +
        '.badge-dealer { background:#dbeafe; color:#1d4ed8; }' +
        '.badge-rep { background:#f3e8ff; color:#7c3aed; }' +
        '.badge-salesrep { background:#fdf4ff; color:#a21caf; }' +
        '.badge-gm { background:#dbeafe; color:#1d4ed8; }' +
        '.badge-frontdesk { background:#f3f4f6; color:#374151; }' +
        '.badge-draft { background:#f3f4f6; color:#374151; }' +
        '.badge-submitted { background:#dbeafe; color:#1d4ed8; }' +
        '.badge-reviewed { background:#fef3c7; color:#92400e; }' +
        '.badge-approved { background:#dcfce7; color:#16a34a; }' +
        '.badge-rejected { background:#fee2e2; color:#dc2626; }' +
        '.badge-revision { background:#fee2e2; color:#dc2626; }' +
        '.badge-standard { background:#f3f4f6; color:#374151; }' +
        '.badge-preferred { background:#dcfce7; color:#16a34a; }' +
        '.badge-vip { background:#fef3c7; color:#92400e; }' +
        '.badge-decking { background:#dbeafe; color:#1d4ed8; }' +
        '.badge-sealing { background:#e0e7ff; color:#4338ca; }' +
        '.badge-fasteners { background:#fef3c7; color:#92400e; }' +
        '.badge-hardware { background:#f3f4f6; color:#374151; }' +
        '.badge-custom { background:#f5f3ff; color:#7c3aed; }' +
        '.badge-other { background:#f3f4f6; color:#6b7280; }' +
        '.badge-solid { background:#f3f4f6; color:#374151; }' +
        '.badge-variegated { background:#fef3c7; color:#92400e; }' +
        '.admin-btn { padding:0.4rem 0.85rem; border-radius:6px; border:none; font-size:0.8rem; ' +
            'font-weight:600; cursor:pointer; transition:all 0.15s; }' +
        '.admin-btn-primary { background:#2563eb; color:#fff; }' +
        '.admin-btn-primary:hover { background:#1d4ed8; }' +
        '.admin-btn-danger { background:#fee2e2; color:#dc2626; }' +
        '.admin-btn-danger:hover { background:#fecaca; }' +
        '.admin-btn-success { background:#dcfce7; color:#16a34a; }' +
        '.admin-btn-success:hover { background:#bbf7d0; }' +
        '.admin-btn-ghost { background:#f3f4f6; color:#374151; }' +
        '.admin-btn-ghost:hover { background:#e5e7eb; }' +
        '.admin-btn-sm { padding:0.3rem 0.6rem; font-size:0.75rem; }' +
        '.admin-actions { display:flex; gap:0.35rem; }' +
        '.admin-empty { text-align:center; padding:2.5rem 1rem; color:#6b7280; font-size:0.95rem; }' +
        '.admin-stat-row { display:grid; grid-template-columns:repeat(auto-fit, minmax(140px,1fr)); gap:1rem; margin-bottom:1.25rem; }' +
        '.admin-stat { background:#f9fafb; border-radius:10px; padding:1rem; text-align:center; border:1px solid #e5e7eb; }' +
        '.admin-stat-value { font-size:1.5rem; font-weight:700; color:#1e40af; }' +
        '.admin-stat-label { font-size:0.78rem; color:#6b7280; margin-top:0.25rem; }' +
        '.admin-form { display:grid; gap:0.85rem; margin-bottom:1rem; }' +
        '.admin-form-row { display:grid; grid-template-columns:1fr 1fr; gap:0.85rem; }' +
        '.admin-form-field label { display:block; font-size:0.85rem; font-weight:600; color:#374151; margin-bottom:0.3rem; }' +
        '.admin-form-field input, .admin-form-field select { width:100%; padding:0.6rem 0.75rem; ' +
            'border:1px solid #e5e7eb; border-radius:8px; font-size:0.9rem; }' +
        '.admin-form-field input:focus, .admin-form-field select:focus { outline:none; border-color:#2563eb; ' +
            'box-shadow:0 0 0 2px rgba(37,99,235,0.15); }' +
        '.admin-form-actions { display:flex; gap:0.75rem; justify-content:flex-end; margin-top:0.5rem; }' +
        '.admin-divider { border:none; border-top:1px solid #e5e7eb; margin:1.25rem 0; }' +
        '.admin-form-inline { display:flex; gap:0.5rem; align-items:flex-end; }' +
        '.admin-form-inline .admin-form-field { flex:1; }' +
        '.admin-quote-detail { background:#f9fafb; border-radius:10px; padding:1rem 1.25rem; margin-top:1rem; border:1px solid #e5e7eb; }' +
        '.admin-quote-detail h4 { margin:0 0 0.75rem; color:#1e40af; font-size:0.95rem; }' +
        '.admin-detail-row { display:flex; justify-content:space-between; margin-bottom:0.4rem; font-size:0.88rem; }' +
        '.admin-detail-label { color:#6b7280; font-weight:600; }' +
        '.admin-detail-value { color:#111827; }' +
        '.admin-line-items-table { width:100%; border-collapse:collapse; font-size:0.82rem; margin-top:0.75rem; }' +
        '.admin-line-items-table th { background:#e5e7eb; padding:0.5rem; text-align:left; }' +
        '.admin-line-items-table td { padding:0.5rem; border-bottom:1px solid #f3f4f6; }' +
        '.admin-status-select { padding:0.35rem 0.5rem; border-radius:6px; border:1px solid #e5e7eb; font-size:0.82rem; font-weight:600; }' +
        '.admin-tier-card { background:#fff; border:2px solid #e5e7eb; border-radius:10px; padding:1.25rem; margin-bottom:1rem; }' +
        '.admin-tier-card.editing { border-color:#2563eb; box-shadow:0 0 0 3px rgba(37,99,235,0.12); }' +
        '.admin-tier-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem; }' +
        '.admin-tier-name { font-size:1.05rem; font-weight:700; color:#374151; }' +
        '.admin-tier-multiplier { font-size:0.9rem; color:#2563eb; font-weight:600; }' +
        '.admin-tier-products { display:grid; grid-template-columns:1fr 1fr; gap:0.5rem 1.5rem; font-size:0.85rem; }' +
        '.admin-tier-product { display:flex; justify-content:space-between; padding:0.35rem 0; border-bottom:1px solid #f9fafb; }' +
        '.admin-tier-product-name { color:#6b7280; }' +
        '.admin-tier-product-price { font-weight:600; color:#111827; }' +
        '.admin-tier-product-base { font-size:0.78rem; color:#9ca3af; text-decoration:line-through; margin-right:0.5rem; }' +
        '.admin-tier-product-unit { font-size:0.75rem; color:#9ca3af; margin-left:0.25rem; }' +
        '.admin-tier-product-locked { font-size:0.7rem; color:#dc2626; margin-left:0.35rem; font-weight:600; }' +
        '.admin-loading { text-align:center; padding:2rem; color:#6b7280; }' +
        '.admin-error { background:#fee2e2; color:#dc2626; padding:0.75rem 1rem; border-radius:8px; font-size:0.88rem; margin-bottom:1rem; }' +
        '.admin-success { background:#dcfce7; color:#16a34a; padding:0.75rem 1rem; border-radius:8px; font-size:0.88rem; margin-bottom:1rem; }' +
        '.admin-inline-edit { background:#f0f7ff; border:2px solid #2563eb; border-radius:10px; ' +
            'padding:1.25rem; margin:0.5rem 0; }' +
        '.admin-inline-edit h4 { margin:0 0 1rem; font-size:0.95rem; color:#1e40af; display:flex; ' +
            'justify-content:space-between; align-items:center; }' +
        '.admin-inline-edit .admin-form { margin-bottom:0; }' +
        '.admin-inline-edit .admin-form-field input, .admin-inline-edit .admin-form-field select { ' +
            'background:#fff; }' +
        '@media (max-width:767px) { ' +
            '#admin-modal { padding:0.5rem !important; } ' +
            '#admin-panel { max-width:100% !important; margin:0; border-radius:10px; max-height:95vh !important; } ' +
            '.admin-header { padding:1rem !important; } ' +
            '.admin-header h2 { font-size:1.05rem !important; } ' +
            '.admin-body { padding:0.75rem !important; } ' +
            '.admin-tab { flex:none; min-height:44px; } ' +
            '.admin-form-row { grid-template-columns:1fr !important; } ' +
            '.admin-tier-products { grid-template-columns:1fr !important; } ' +
            '.admin-toolbar { flex-direction:column; align-items:stretch; } ' +
            '.admin-search { width:100% !important; font-size:16px !important; } ' +
            '.admin-table { font-size:0.78rem !important; } ' +
            '.admin-table th, .admin-table td { padding:0.4rem 0.35rem !important; } ' +
            '.admin-actions { flex-wrap:wrap; } ' +
            '.admin-btn { min-height:44px !important; min-width:44px !important; padding:0.5rem 0.75rem !important; } ' +
            '.admin-btn-sm { min-height:44px !important; min-width:44px !important; } ' +
            '.admin-stat-row { grid-template-columns:repeat(2,1fr) !important; gap:0.5rem !important; } ' +
            '.admin-quote-detail { padding:0.75rem !important; } ' +
            '.admin-detail-row { flex-direction:column; gap:0.15rem; } ' +
            '.admin-form-field input, .admin-form-field select { font-size:16px !important; } ' +
            '.admin-status-select { font-size:16px !important; min-height:44px; } ' +
            '.admin-form-inline { flex-direction:column; } ' +
            '.rep-price-input { width:100% !important; font-size:16px !important; min-height:44px; } ' +
        '} ' +
        '@media (min-width:768px) and (max-width:1024px) { ' +
            '#admin-panel { max-width:95vw !important; } ' +
            '.admin-body { padding:1rem !important; } ' +
            '.admin-btn { min-height:44px !important; } ' +
            '.admin-btn-sm { min-height:44px !important; } ' +
            '.admin-table { font-size:0.84rem; } ' +
            '.admin-stat-row { grid-template-columns:repeat(3,1fr) !important; } ' +
            '.admin-form-field input, .admin-form-field select { font-size:16px !important; } ' +
        '}';
    document.head.appendChild(style);


    // ----------------------------------------------------------
    // MODAL HTML
    // ----------------------------------------------------------
    var modal = document.createElement('div');
    modal.id = 'admin-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = '' +
        '<div id="admin-panel">' +
            '<div class="admin-header">' +
                '<h2>Admin Panel</h2>' +
                '<button class="admin-close" id="admin-close-btn" aria-label="Close">&times;</button>' +
            '</div>' +
            '<div class="admin-tabs">' +
                '<button class="admin-tab active" data-tab="dealers">Dealers</button>' +
                '<button class="admin-tab" data-tab="quotes">Quotes</button>' +
                '<button class="admin-tab" data-tab="products">Products</button>' +
                '<button class="admin-tab" data-tab="pricing">Pricing Tiers</button>' +
                '<button class="admin-tab" data-tab="users">Users</button>' +
                '<button class="admin-tab" data-tab="colors">Colors</button>' +
                '<button class="admin-tab" data-tab="categories">Categories</button>' +
            '</div>' +
            '<div class="admin-body">' +

                // ---- DEALERS TAB ----
                '<div class="admin-tab-content active" id="admin-tab-dealers">' +
                    '<div id="admin-dealers-stats" class="admin-stat-row"></div>' +
                    '<div id="admin-dealer-alert"></div>' +
                    '<details id="admin-add-dealer-details">' +
                        '<summary style="cursor:pointer;font-weight:600;color:#2563eb;margin-bottom:1rem;font-size:0.95rem;">+ Add New Dealer</summary>' +
                        '<div class="admin-form" id="admin-add-dealer-form">' +
                            '<div class="admin-form-row">' +
                                '<div class="admin-form-field">' +
                                    '<label>Dealer Code (6 chars)</label>' +
                                    '<input type="text" id="admin-new-code" maxlength="6" placeholder="ABC123" style="text-transform:uppercase;">' +
                                '</div>' +
                                '<div class="admin-form-field">' +
                                    '<label>GM Username</label>' +
                                    '<input type="text" id="admin-new-username" placeholder="e.g. john.smith" style="text-transform:lowercase;">' +
                                    '<div style="font-size:0.75rem;color:#6b7280;margin-top:0.2rem;">Login username for General Manager. Leave blank to auto-generate.</div>' +
                                '</div>' +
                            '</div>' +
                            '<div class="admin-form-row">' +
                                '<div class="admin-form-field">' +
                                    '<label>Password</label>' +
                                    '<input type="password" id="admin-new-pw" placeholder="Min 8 characters">' +
                                '</div>' +
                                '<div class="admin-form-field">' +
                                    '<label>Dealer Name</label>' +
                                    '<input type="text" id="admin-new-name" placeholder="Business name">' +
                                '</div>' +
                            '</div>' +
                            '<div class="admin-form-row">' +
                                '<div class="admin-form-field">' +
                                    '<label>Contact Person</label>' +
                                    '<input type="text" id="admin-new-contact" placeholder="Full name">' +
                                '</div>' +
                                '<div class="admin-form-field">' +
                                    '<label>Email</label>' +
                                    '<input type="email" id="admin-new-email" placeholder="dealer@example.com">' +
                                '</div>' +
                            '</div>' +
                            '<div class="admin-form-row">' +
                                '<div class="admin-form-field">' +
                                    '<label>Phone</label>' +
                                    '<input type="tel" id="admin-new-phone" placeholder="555-123-4567">' +
                                '</div>' +
                                '<div class="admin-form-field">' +
                                    '<label>User Role</label>' +
                                    '<select id="admin-new-role">' +
                                        '<option value="dealer">Dealer</option>' +
                                        '<option value="rep">Internal Rep</option>' +
                                        '<option value="admin">Admin</option>' +
                                    '</select>' +
                                '</div>' +
                            '</div>' +
                            '<div class="admin-form-row">' +
                                '<div class="admin-form-field">' +
                                    '<label>Pricing Tier</label>' +
                                    '<select id="admin-new-tier">' +
                                        '<option value="standard">Standard (1.0x)</option>' +
                                        '<option value="preferred">Preferred (0.95x)</option>' +
                                        '<option value="vip">VIP (0.90x)</option>' +
                                    '</select>' +
                                '</div>' +
                                '<div class="admin-form-field"></div>' +
                            '</div>' +
                            '<div class="admin-form-actions">' +
                                '<button type="button" class="admin-btn admin-btn-primary" id="admin-create-dealer-btn">Create Dealer</button>' +
                            '</div>' +
                        '</div>' +
                    '</details>' +
                    '<hr class="admin-divider">' +
                    '<div class="admin-toolbar">' +
                        '<h3>Active Dealers</h3>' +
                        '<input type="text" class="admin-search" id="admin-dealer-search" placeholder="Search dealers...">' +
                    '</div>' +
                    '<div id="admin-dealers-list"><div class="admin-loading">Loading dealers...</div></div>' +
                '</div>' +

                // ---- QUOTES TAB ----
                '<div class="admin-tab-content" id="admin-tab-quotes">' +
                    '<div id="admin-quotes-stats" class="admin-stat-row"></div>' +
                    '<div id="admin-quote-alert"></div>' +
                    '<div class="admin-toolbar">' +
                        '<h3>All Quotes</h3>' +
                        '<div style="display:flex;gap:0.5rem;flex-wrap:wrap;">' +
                            '<select id="admin-quote-status-filter" class="admin-search" style="width:auto;">' +
                                '<option value="">All Statuses</option>' +
                                '<option value="draft">Draft</option>' +
                                '<option value="submitted">Submitted</option>' +
                                '<option value="reviewed">Reviewed</option>' +
                                '<option value="approved">Approved</option>' +
                                '<option value="rejected">Rejected</option>' +
                                '<option value="revision">Revision</option>' +
                            '</select>' +
                            '<select id="admin-quote-dealer-filter" class="admin-search" style="width:auto;">' +
                                '<option value="">All Dealers</option>' +
                            '</select>' +
                            '<input type="text" class="admin-search" id="admin-quote-search" placeholder="Search quotes...">' +
                            '<button type="button" class="admin-btn admin-btn-ghost" id="admin-export-csv-btn">Export CSV</button>' +
                        '</div>' +
                    '</div>' +
                    '<div id="admin-quotes-list"><div class="admin-loading">Loading quotes...</div></div>' +
                    '<div id="admin-quote-detail-panel" style="display:none;"></div>' +
                '</div>' +

                // ---- PRODUCTS TAB ----
                '<div class="admin-tab-content" id="admin-tab-products">' +
                    '<div id="admin-products-stats" class="admin-stat-row"></div>' +
                    '<div id="admin-product-alert"></div>' +
                    '<details id="admin-add-product-details">' +
                        '<summary style="cursor:pointer;font-weight:600;color:#2563eb;margin-bottom:1rem;font-size:0.95rem;">+ Add New Product</summary>' +
                        '<div class="admin-form" id="admin-add-product-form">' +
                            '<div class="admin-form-row">' +
                                '<div class="admin-form-field">' +
                                    '<label>Product Name</label>' +
                                    '<input type="text" id="admin-new-prod-name" placeholder="e.g. Fascia Board">' +
                                '</div>' +
                                '<div class="admin-form-field">' +
                                    '<label>Product ID (optional, auto-generated)</label>' +
                                    '<input type="text" id="admin-new-prod-id" placeholder="e.g. fascia" style="text-transform:lowercase;">' +
                                '</div>' +
                            '</div>' +
                            '<div class="admin-form-row">' +
                                '<div class="admin-form-field">' +
                                    '<label>Base Price ($)</label>' +
                                    '<input type="number" step="0.01" min="0" id="admin-new-prod-price" placeholder="0.00">' +
                                '</div>' +
                                '<div class="admin-form-field">' +
                                    '<label>Unit</label>' +
                                    '<select id="admin-new-prod-unit">' +
                                        '<option value="ft">per foot (ft)</option>' +
                                        '<option value="box">per box</option>' +
                                        '<option value="each">each</option>' +
                                        '<option value="pack">per pack</option>' +
                                        '<option value="sqft">per sq ft</option>' +
                                    '</select>' +
                                '</div>' +
                            '</div>' +
                            '<div class="admin-form-row">' +
                                '<div class="admin-form-field">' +
                                    '<label>Category</label>' +
                                    '<select id="admin-new-prod-cat"></select>' +
                                '</div>' +
                                '<div class="admin-form-field">' +
                                    '<label>Exempt from Tier Discounts?</label>' +
                                    '<select id="admin-new-prod-flat">' +
                                        '<option value="no">No (apply tier multiplier normally)</option>' +
                                        '<option value="yes">Yes (same price for all tiers)</option>' +
                                    '</select>' +
                                '</div>' +
                            '</div>' +
                            '<div class="admin-form-actions">' +
                                '<button type="button" class="admin-btn admin-btn-primary" id="admin-create-product-btn">Add Product</button>' +
                            '</div>' +
                        '</div>' +
                    '</details>' +
                    '<hr class="admin-divider">' +
                    '<div class="admin-toolbar">' +
                        '<h3>Product Catalog</h3>' +
                        '<input type="text" class="admin-search" id="admin-product-search" placeholder="Search products...">' +
                    '</div>' +
                    '<div id="admin-products-list"><div class="admin-loading">Loading products...</div></div>' +
                '</div>' +

                // ---- PRICING TAB ----
                '<div class="admin-tab-content" id="admin-tab-pricing">' +
                    '<div id="admin-pricing-alert"></div>' +
                    '<div class="admin-toolbar">' +
                        '<h3>Pricing Tiers</h3>' +
                        '<button type="button" class="admin-btn admin-btn-primary" id="admin-save-pricing-btn">Save All Changes</button>' +
                    '</div>' +
                    '<p style="font-size:0.85rem;color:#6b7280;margin-top:-0.5rem;margin-bottom:1rem;">Edit the multiplier for each tier. Product prices are base &times; multiplier. Products marked as tier-exempt stay at base price. Custom/Manual Items are excluded (always $0.00).</p>' +
                    '<div id="admin-pricing-list"><div class="admin-loading">Loading pricing...</div></div>' +
                '</div>' +

                // ---- USERS TAB ----
                '<div class="admin-tab-content" id="admin-tab-users">' +
                    '<div id="admin-users-stats" class="admin-stat-row"></div>' +
                    '<div id="admin-user-alert"></div>' +
                    '<details id="admin-add-user-details">' +
                        '<summary style="cursor:pointer;font-weight:600;color:#2563eb;margin-bottom:1rem;font-size:0.95rem;">+ Add New User</summary>' +
                        '<div class="admin-form" id="admin-add-user-form">' +
                            '<div class="admin-form-row">' +
                                '<div class="admin-form-field">' +
                                    '<label>Dealer Code</label>' +
                                    '<select id="admin-new-user-dealer" style="text-transform:uppercase;"></select>' +
                                '</div>' +
                                '<div class="admin-form-field">' +
                                    '<label>Role</label>' +
                                    '<select id="admin-new-user-role">' +
                                        '<option value="frontdesk">Frontdesk (Sales Rep)</option>' +
                                        '<option value="gm">GM (General Manager)</option>' +
                                        '<option value="salesrep">Sales Rep (Territory)</option>' +
                                        '<option value="dealer">Dealer (Legacy)</option>' +
                                        '<option value="rep">Internal Rep</option>' +
                                        '<option value="admin">Admin</option>' +
                                    '</select>' +
                                '</div>' +
                            '</div>' +
                            '<div class="admin-form-row" id="admin-new-user-assigned-dealers-row" style="display:none;">' +
                                '<div class="admin-form-field" style="grid-column:1/-1;">' +
                                    '<label>Assigned Dealers <span style="font-weight:400;color:#6b7280;">(select territories)</span></label>' +
                                    '<div id="admin-new-user-assigned-dealers" style="display:flex;flex-wrap:wrap;gap:0.5rem;padding:0.5rem;border:1px solid #e5e7eb;border-radius:8px;min-height:40px;"></div>' +
                                '</div>' +
                            '</div>' +
                            '<div class="admin-form-row">' +
                                '<div class="admin-form-field">' +
                                    '<label>Username</label>' +
                                    '<input type="text" id="admin-new-user-username" placeholder="e.g. jsmith" style="text-transform:lowercase;">' +
                                '</div>' +
                                '<div class="admin-form-field">' +
                                    '<label>Display Name</label>' +
                                    '<input type="text" id="admin-new-user-display" placeholder="John Smith">' +
                                '</div>' +
                            '</div>' +
                            '<div class="admin-form-row">' +
                                '<div class="admin-form-field">' +
                                    '<label>Password (min 8 chars)</label>' +
                                    '<input type="password" id="admin-new-user-pw" placeholder="Temporary password">' +
                                '</div>' +
                                '<div class="admin-form-field">' +
                                    '<label>Email (optional)</label>' +
                                    '<input type="email" id="admin-new-user-email" placeholder="user@example.com">' +
                                '</div>' +
                            '</div>' +
                            '<div class="admin-form-row">' +
                                '<div class="admin-form-field">' +
                                    '<label>Phone (optional)</label>' +
                                    '<input type="tel" id="admin-new-user-phone" placeholder="555-123-4567">' +
                                '</div>' +
                                '<div class="admin-form-field"></div>' +
                            '</div>' +
                            '<div class="admin-form-actions">' +
                                '<button type="button" class="admin-btn admin-btn-primary" id="admin-create-user-btn">Create User</button>' +
                            '</div>' +
                        '</div>' +
                    '</details>' +
                    '<hr class="admin-divider">' +
                    '<div class="admin-toolbar">' +
                        '<h3>All Users</h3>' +
                        '<div style="display:flex;gap:0.5rem;flex-wrap:wrap;">' +
                            '<select id="admin-user-dealer-filter" class="admin-search" style="width:auto;">' +
                                '<option value="">All Dealer Codes</option>' +
                            '</select>' +
                            '<select id="admin-user-role-filter" class="admin-search" style="width:auto;">' +
                                '<option value="">All Roles</option>' +
                                '<option value="admin">Admin</option>' +
                                '<option value="gm">GM</option>' +
                                '<option value="frontdesk">Frontdesk</option>' +
                                '<option value="salesrep">Sales Rep</option>' +
                                '<option value="dealer">Dealer</option>' +
                                '<option value="rep">Rep</option>' +
                            '</select>' +
                            '<select id="admin-user-status-filter" class="admin-search" style="width:auto;">' +
                                '<option value="">All Statuses</option>' +
                                '<option value="active">Active</option>' +
                                '<option value="disabled">Disabled</option>' +
                                '<option value="pending">Pending</option>' +
                            '</select>' +
                            '<input type="text" class="admin-search" id="admin-user-search" placeholder="Search users...">' +
                        '</div>' +
                    '</div>' +
                    '<div id="admin-users-list"><div class="admin-loading">Loading users...</div></div>' +
                '</div>' +

                // ---- COLORS TAB ----
                '<div class="admin-tab-content" id="admin-tab-colors">' +
                    '<div id="admin-colors-alert"></div>' +
                    '<div class="admin-toolbar">' +
                        '<h3>Color Management</h3>' +
                        '<input type="text" class="admin-search" id="admin-color-search" placeholder="Search colors...">' +
                    '</div>' +
                    '<div id="admin-colors-list"><div class="admin-loading">Loading colors...</div></div>' +
                    '<div style="margin-top:1rem;">' +
                        '<h4 style="font-size:0.95rem;color:#374151;margin-bottom:0.5rem;">Add New Color</h4>' +
                        '<div class="admin-form-row">' +
                            '<input type="text" class="admin-input" id="new-color-name" placeholder="Color name (e.g. Walnut)" style="padding:0.55rem 0.85rem;border:1px solid #e5e7eb;border-radius:8px;font-size:0.9rem;">' +
                            '<input type="text" class="admin-input" id="new-color-image" placeholder="Image filename (e.g. Walnut.png)" style="padding:0.55rem 0.85rem;border:1px solid #e5e7eb;border-radius:8px;font-size:0.9rem;">' +
                            '<select class="admin-input" id="new-color-tier" style="padding:0.55rem 0.85rem;border:1px solid #e5e7eb;border-radius:8px;font-size:0.9rem;"><option value="solid">Solid</option><option value="variegated">Variegated</option></select>' +
                            '<button class="admin-btn admin-btn-primary" id="add-color-btn">Add Color</button>' +
                        '</div>' +
                    '</div>' +
                '</div>' +

                // ---- CATEGORIES TAB ----
                '<div class="admin-tab-content" id="admin-tab-categories">' +
                    '<div id="admin-categories-alert"></div>' +
                    '<div class="admin-toolbar">' +
                        '<h3>Category Management</h3>' +
                    '</div>' +
                    '<div id="admin-categories-list"><div class="admin-loading">Loading categories...</div></div>' +
                    '<div style="margin-top:1rem;">' +
                        '<h4 style="font-size:0.95rem;color:#374151;margin-bottom:0.5rem;">Add New Category</h4>' +
                        '<div class="admin-form-row">' +
                            '<input type="text" class="admin-input" id="new-cat-slug" placeholder="Slug (e.g. railing)" style="padding:0.55rem 0.85rem;border:1px solid #e5e7eb;border-radius:8px;font-size:0.9rem;">' +
                            '<input type="text" class="admin-input" id="new-cat-label" placeholder="Label (e.g. Railing & Posts)" style="padding:0.55rem 0.85rem;border:1px solid #e5e7eb;border-radius:8px;font-size:0.9rem;">' +
                            '<button class="admin-btn admin-btn-primary" id="add-cat-btn">Add Category</button>' +
                        '</div>' +
                    '</div>' +
                '</div>' +

            '</div>' +
        '</div>';
    document.body.appendChild(modal);


    // ----------------------------------------------------------
    // TAB SWITCHING
    // ----------------------------------------------------------
    var tabs = modal.querySelectorAll('.admin-tab');
    tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
            tabs.forEach(function (t) { t.classList.remove('active'); });
            tab.classList.add('active');
            modal.querySelectorAll('.admin-tab-content').forEach(function (c) { c.classList.remove('active'); });
            document.getElementById('admin-tab-' + tab.getAttribute('data-tab')).classList.add('active');

            var tabName = tab.getAttribute('data-tab');
            if (tabName === 'dealers') loadDealers();
            if (tabName === 'quotes') loadAllQuotes();
            if (tabName === 'products') loadProducts();
            if (tabName === 'pricing') loadPricingTiers();
            if (tabName === 'users') loadAdminUsers();
            if (tabName === 'colors') loadColors();
            if (tabName === 'categories') loadCategories();
        });
    });


    // ----------------------------------------------------------
    // OPEN / CLOSE
    // ----------------------------------------------------------
    window.toggleAdminPanel = function () {
        var dealer = window.getCurrentDealer ? window.getCurrentDealer() : null;
        if (!dealer || dealer.role !== 'admin') {
            alert('Admin access required.');
            return;
        }
        modal.classList.toggle('active');
        if (modal.classList.contains('active')) {
            loadDealers();
        }
    };

    document.getElementById('admin-close-btn').addEventListener('click', function () {
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


    // ----------------------------------------------------------
    // HELPERS
    // ----------------------------------------------------------
    var _api = window.ameridexAPI;
    var _allDealers = [];
    var _allQuotes = [];
    var _allProducts = [];
    var _pricingTiers = [];

    function refreshPricingNow() {
        if (typeof window.applyTierPricing === 'function') {
            try {
                var p = window.applyTierPricing();
                if (p && typeof p.catch === 'function') p.catch(function () {});
            } catch (e) {}
        }
    }

    function showAlert(containerId, msg, type) {
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


    // ----------------------------------------------------------
    // DEALERS TAB
    // ----------------------------------------------------------
    function loadDealers() {
        var container = document.getElementById('admin-dealers-list');
        container.innerHTML = '<div class="admin-loading">Loading dealers...</div>';

        _api('GET', '/api/admin/dealers')
            .then(function (dealers) {
                _allDealers = dealers;
                renderDealerStats();
                renderDealersTable();
            })
            .catch(function (err) {
                container.innerHTML = '<div class="admin-error">Failed to load dealers: ' + esc(err.message) + '</div>';
            });
    }

    function renderDealerStats() {
        var active = _allDealers.filter(function (d) { return d.isActive; }).length;
        var admins = _allDealers.filter(function (d) { return d.role === 'admin'; }).length;
        var reps = _allDealers.filter(function (d) { return d.role === 'rep'; }).length;

        document.getElementById('admin-dealers-stats').innerHTML = '' +
            '<div class="admin-stat"><div class="admin-stat-value">' + _allDealers.length + '</div><div class="admin-stat-label">Total Dealers</div></div>' +
            '<div class="admin-stat"><div class="admin-stat-value">' + active + '</div><div class="admin-stat-label">Active</div></div>' +
            '<div class="admin-stat"><div class="admin-stat-value">' + admins + '</div><div class="admin-stat-label">Admins</div></div>' +
            '<div class="admin-stat"><div class="admin-stat-value">' + reps + '</div><div class="admin-stat-label">Reps</div></div>';
    }

    function renderDealersTable(filter) {
        var container = document.getElementById('admin-dealers-list');
        var search = (filter || document.getElementById('admin-dealer-search').value || '').toLowerCase();

        var filtered = _allDealers.filter(function (d) {
            if (!search) return true;
            return (d.dealerCode || '').toLowerCase().includes(search)
                || (d.dealerName || '').toLowerCase().includes(search)
                || (d.contactPerson || '').toLowerCase().includes(search)
                || (d.email || '').toLowerCase().includes(search);
        });

        if (filtered.length === 0) {
            container.innerHTML = '<div class="admin-empty">No dealers found</div>';
            return;
        }

        var html = '<div class="admin-table-wrap" style="overflow-x:auto;-webkit-overflow-scrolling:touch"><table class="admin-table"><thead><tr>' +
            '<th>Code</th><th>Name</th><th>Contact</th><th>Role</th><th>Tier</th><th>Status</th><th>Actions</th>' +
            '</tr></thead><tbody>';

        filtered.forEach(function (d) {
            html += '<tr data-dealer-id="' + d.id + '">' +
                '<td><strong>' + esc(d.dealerCode) + '</strong></td>' +
                '<td>' + esc(d.dealerName || '-') + '</td>' +
                '<td>' + esc(d.contactPerson || '-') + '<br><span style="font-size:0.78rem;color:#6b7280;">' + esc(d.email || '') + '</span></td>' +
                '<td><span class="admin-badge badge-' + d.role + '">' + d.role + '</span></td>' +
                '<td><span class="admin-badge badge-' + (d.pricingTier || 'standard') + '">' + (d.pricingTier || 'standard') + '</span></td>' +
                '<td><span class="admin-badge ' + (d.isActive ? 'badge-active' : 'badge-inactive') + '">' + (d.isActive ? 'Active' : 'Inactive') + '</span></td>' +
                '<td class="admin-actions">' +
                    '<button class="admin-btn admin-btn-ghost admin-btn-sm" data-action="edit" data-id="' + d.id + '">Edit</button>' +
                    '<button class="admin-btn admin-btn-ghost admin-btn-sm" data-action="reset-pw" data-id="' + d.id + '">Reset PW</button>' +
                    '<button class="admin-btn ' + (d.isActive ? 'admin-btn-danger' : 'admin-btn-success') + ' admin-btn-sm" ' +
                        'data-action="toggle" data-id="' + d.id + '">' + (d.isActive ? 'Disable' : 'Enable') + '</button>' +
                '</td></tr>';
        });

        html += '</tbody></table></div>';
        container.innerHTML = html;

        container.querySelectorAll('[data-action]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var action = btn.getAttribute('data-action');
                var id = btn.getAttribute('data-id');
                if (action === 'edit') editDealer(id);
                if (action === 'reset-pw') resetDealerPassword(id);
                if (action === 'toggle') toggleDealerActive(id);
            });
        });
    }

    document.getElementById('admin-dealer-search').addEventListener('input', function () {
        renderDealersTable();
    });

    document.getElementById('admin-create-dealer-btn').addEventListener('click', function () {
        var code = document.getElementById('admin-new-code').value.trim().toUpperCase();
        var username = document.getElementById('admin-new-username').value.trim().toLowerCase();
        var pw = document.getElementById('admin-new-pw').value;
        var name = document.getElementById('admin-new-name').value.trim();
        var contact = document.getElementById('admin-new-contact').value.trim();
        var email = document.getElementById('admin-new-email').value.trim();
        var phone = document.getElementById('admin-new-phone').value.trim();
        var role = document.getElementById('admin-new-role').value;
        var tier = document.getElementById('admin-new-tier').value;

        if (!code || code.length !== 6) { showAlert('admin-dealer-alert', 'Dealer code must be exactly 6 characters', 'error'); return; }
        if (!pw || pw.length < 8) { showAlert('admin-dealer-alert', 'Password must be at least 8 characters', 'error'); return; }

        var payload = { dealerCode: code, password: pw, dealerName: name, contactPerson: contact, email: email, phone: phone, role: role, pricingTier: tier };
        if (username) payload.username = username;

        _api('POST', '/api/admin/dealers', payload)
            .then(function (result) {
                var gmInfo = '';
                if (result.gmUser) gmInfo = '<br>GM Login: <strong>' + esc(result.gmUser.username) + '</strong>';
                showAlert('admin-dealer-alert', 'Dealer ' + code + ' created!' + gmInfo, 'success');
                document.getElementById('admin-new-code').value = '';
                document.getElementById('admin-new-username').value = '';
                document.getElementById('admin-new-pw').value = '';
                document.getElementById('admin-new-name').value = '';
                document.getElementById('admin-new-contact').value = '';
                document.getElementById('admin-new-email').value = '';
                document.getElementById('admin-new-phone').value = '';
                document.getElementById('admin-new-role').value = 'dealer';
                document.getElementById('admin-new-tier').value = 'standard';
                document.getElementById('admin-add-dealer-details').removeAttribute('open');
                loadDealers();
            })
            .catch(function (err) { showAlert('admin-dealer-alert', 'Failed: ' + esc(err.message), 'error'); });
    });

    function editDealer(id) {
        var dealer = _allDealers.find(function (d) { return d.id === id; });
        if (!dealer) return;
        var newName = prompt('Dealer Name:', dealer.dealerName || '');
        if (newName === null) return;
        var newTier = prompt('Pricing Tier (standard, preferred, vip):', dealer.pricingTier || 'standard');
        if (newTier === null) return;
        var newRole = prompt('Role (dealer, rep, admin):', dealer.role || 'dealer');
        if (newRole === null) return;

        _api('PUT', '/api/admin/dealers/' + id, { dealerName: newName, pricingTier: newTier, role: newRole })
            .then(function () { showAlert('admin-dealer-alert', 'Dealer updated!', 'success'); loadDealers(); })
            .catch(function (err) { showAlert('admin-dealer-alert', 'Update failed: ' + esc(err.message), 'error'); });
    }

    function resetDealerPassword(id) {
        var dealer = _allDealers.find(function (d) { return d.id === id; });
        if (!dealer) return;
        var newPw = prompt('New password for ' + dealer.dealerCode + ' (min 8 chars):');
        if (!newPw) return;
        if (newPw.length < 8) { showAlert('admin-dealer-alert', 'Password must be at least 8 characters', 'error'); return; }

        _api('POST', '/api/admin/dealers/' + id + '/change-password', { newPassword: newPw })
            .then(function () { showAlert('admin-dealer-alert', 'Password reset for ' + dealer.dealerCode + '!', 'success'); })
            .catch(function (err) { showAlert('admin-dealer-alert', 'Reset failed: ' + esc(err.message), 'error'); });
    }

    function toggleDealerActive(id) {
        var dealer = _allDealers.find(function (d) { return d.id === id; });
        if (!dealer) return;
        var action = dealer.isActive ? 'disable' : 'enable';
        if (!confirm('Are you sure you want to ' + action + ' dealer ' + dealer.dealerCode + '?')) return;

        _api('PUT', '/api/admin/dealers/' + id, { isActive: !dealer.isActive })
            .then(function () { showAlert('admin-dealer-alert', 'Dealer ' + dealer.dealerCode + ' ' + action + 'd!', 'success'); loadDealers(); })
            .catch(function (err) { showAlert('admin-dealer-alert', 'Failed: ' + esc(err.message), 'error'); });
    }


    // ----------------------------------------------------------
    // QUOTES TAB
    // ----------------------------------------------------------
    function loadAllQuotes() {
        var container = document.getElementById('admin-quotes-list');
        container.innerHTML = '<div class="admin-loading">Loading quotes...</div>';
        _api('GET', '/api/admin/quotes')
            .then(function (quotes) { _allQuotes = quotes; renderQuoteStats(); populateDealerFilter(); renderQuotesTable(); })
            .catch(function (err) { container.innerHTML = '<div class="admin-error">Failed to load quotes: ' + esc(err.message) + '</div>'; });
    }

    function renderQuoteStats() {
        var submitted = _allQuotes.filter(function (q) { return q.status === 'submitted'; }).length;
        var approved = _allQuotes.filter(function (q) { return q.status === 'approved'; }).length;
        var totalValue = _allQuotes.reduce(function (sum, q) { return sum + (q.totalAmount || 0); }, 0);
        document.getElementById('admin-quotes-stats').innerHTML = '' +
            '<div class="admin-stat"><div class="admin-stat-value">' + _allQuotes.length + '</div><div class="admin-stat-label">Total Quotes</div></div>' +
            '<div class="admin-stat"><div class="admin-stat-value">' + submitted + '</div><div class="admin-stat-label">Pending Review</div></div>' +
            '<div class="admin-stat"><div class="admin-stat-value">' + approved + '</div><div class="admin-stat-label">Approved</div></div>' +
            '<div class="admin-stat"><div class="admin-stat-value">$' + totalValue.toFixed(2) + '</div><div class="admin-stat-label">Total Value</div></div>';
    }

    function populateDealerFilter() {
        var select = document.getElementById('admin-quote-dealer-filter');
        var codes = [];
        _allQuotes.forEach(function (q) { if (q.dealerCode && codes.indexOf(q.dealerCode) === -1) codes.push(q.dealerCode); });
        select.innerHTML = '<option value="">All Dealers</option>';
        codes.sort().forEach(function (c) {
            var opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            select.appendChild(opt);
        });
    }

    function renderQuotesTable() {
        var container = document.getElementById('admin-quotes-list');
        var statusFilter = document.getElementById('admin-quote-status-filter').value;
        var dealerFilter = document.getElementById('admin-quote-dealer-filter').value;
        var search = (document.getElementById('admin-quote-search').value || '').toLowerCase();

        var filtered = _allQuotes.filter(function (q) {
            if (statusFilter && q.status !== statusFilter) return false;
            if (dealerFilter && q.dealerCode !== dealerFilter) return false;
            if (search) {
                var hay = ((q.quoteNumber || '') + (q.customer && q.customer.name || '') + (q.customer && q.customer.company || '') + (q.dealerCode || '')).toLowerCase();
                if (!hay.includes(search)) return false;
            }
            return true;
        });
        filtered.sort(function (a, b) { return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0); });

        if (filtered.length === 0) { container.innerHTML = '<div class="admin-empty">No quotes match your filters</div>'; return; }

        var html = '<div class="admin-table-wrap" style="overflow-x:auto;-webkit-overflow-scrolling:touch"><table class="admin-table"><thead><tr><th>Quote #</th><th>Dealer</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead><tbody>';
        filtered.forEach(function (q) {
            var dateStr = ''; try { dateStr = new Date(q.updatedAt || q.createdAt).toLocaleDateString(); } catch(e) {}
            var custName = (q.customer && q.customer.name) || 'N/A';
            var custCompany = (q.customer && q.customer.company) || '';
            html += '<tr><td><strong>' + esc(q.quoteNumber || q.id) + '</strong></td>' +
                '<td>' + esc(q.dealerCode || 'N/A') + '</td>' +
                '<td>' + esc(custName) + (custCompany ? '<br><span style="font-size:0.78rem;color:#6b7280;">' + esc(custCompany) + '</span>' : '') + '</td>' +
                '<td style="text-align:center;">' + (q.lineItems || []).length + '</td>' +
                '<td style="text-align:right;font-weight:600;">$' + (q.totalAmount || 0).toFixed(2) + '</td>' +
                '<td><select class="admin-status-select" data-quote-id="' + q.id + '">' +
                    '<option value="draft"' + (q.status==='draft'?' selected':'') + '>Draft</option>' +
                    '<option value="submitted"' + (q.status==='submitted'?' selected':'') + '>Submitted</option>' +
                    '<option value="reviewed"' + (q.status==='reviewed'?' selected':'') + '>Reviewed</option>' +
                    '<option value="approved"' + (q.status==='approved'?' selected':'') + '>Approved</option>' +
                    '<option value="rejected"' + (q.status==='rejected'?' selected':'') + '>Rejected</option>' +
                    '<option value="revision"' + (q.status==='revision'?' selected':'') + '>Revision</option>' +
                '</select></td>' +
                '<td>' + dateStr + '</td>' +
                '<td class="admin-actions">' +
                    '<button class="admin-btn admin-btn-ghost admin-btn-sm" data-action="view-quote" data-id="' + q.id + '">View</button>' +
                    '<button class="admin-btn admin-btn-danger admin-btn-sm" data-action="delete-quote" data-id="' + q.id + '">Del</button>' +
                '</td></tr>';
        });
        html += '</tbody></table></div>';
        container.innerHTML = html;

        container.querySelectorAll('.admin-status-select').forEach(function (sel) {
            sel.addEventListener('change', function () { updateQuoteStatus(sel.getAttribute('data-quote-id'), sel.value); });
        });
        container.querySelectorAll('[data-action]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var action = btn.getAttribute('data-action'), id = btn.getAttribute('data-id');
                if (action === 'view-quote') viewQuoteDetail(id);
                if (action === 'delete-quote') deleteAdminQuote(id);
            });
        });
    }

    document.getElementById('admin-quote-status-filter').addEventListener('change', renderQuotesTable);
    document.getElementById('admin-quote-dealer-filter').addEventListener('change', renderQuotesTable);
    document.getElementById('admin-quote-search').addEventListener('input', renderQuotesTable);

    function updateQuoteStatus(quoteId, newStatus) {
        _api('PUT', '/api/admin/quotes/' + quoteId + '/status', { status: newStatus })
            .then(function () {
                var q = _allQuotes.find(function (q) { return q.id === quoteId; });
                if (q) q.status = newStatus;
                renderQuoteStats();
                showAlert('admin-quote-alert', 'Status updated to ' + newStatus, 'success');
            })
            .catch(function (err) { showAlert('admin-quote-alert', 'Update failed: ' + esc(err.message), 'error'); loadAllQuotes(); });
    }

    function viewQuoteDetail(quoteId) {
        var q = _allQuotes.find(function (q) { return q.id === quoteId; });
        if (!q) return;
        var panel = document.getElementById('admin-quote-detail-panel');
        var custName = (q.customer && q.customer.name) || 'N/A';
        var custEmail = (q.customer && q.customer.email) || 'N/A';
        var custZip = (q.customer && q.customer.zipCode) || 'N/A';
        var custCompany = (q.customer && q.customer.company) || '';
        var custPhone = (q.customer && q.customer.phone) || '';

        var lineItemsHTML = '';
        if (q.lineItems && q.lineItems.length > 0) {
            lineItemsHTML = '<table class="admin-line-items-table"><thead><tr><th>Product</th><th>Color</th><th>Length</th><th>Qty</th><th>Subtotal</th></tr></thead><tbody>';
            q.lineItems.forEach(function (li) {
                lineItemsHTML += '<tr><td>' + esc(li.type || '') + '</td><td>' + esc(li.color || '-') + '</td><td>' + (li.length || '-') + '</td><td>' + (li.qty || 0) + '</td><td>$' + (typeof getItemSubtotal === 'function' ? getItemSubtotal(li).toFixed(2) : '0.00') + '</td></tr>';
            });
            lineItemsHTML += '</tbody></table>';
        } else { lineItemsHTML = '<div style="color:#6b7280;font-size:0.88rem;">No line items</div>'; }

        panel.innerHTML = '<div class="admin-quote-detail">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;"><h4>Quote: ' + esc(q.quoteNumber || q.id) + '</h4><button class="admin-btn admin-btn-ghost admin-btn-sm" id="admin-close-detail">Close</button></div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem 2rem;">' +
                '<div class="admin-detail-row"><span class="admin-detail-label">Customer</span><span class="admin-detail-value">' + esc(custName) + '</span></div>' +
                '<div class="admin-detail-row"><span class="admin-detail-label">Email</span><span class="admin-detail-value">' + esc(custEmail) + '</span></div>' +
                '<div class="admin-detail-row"><span class="admin-detail-label">Company</span><span class="admin-detail-value">' + esc(custCompany || '-') + '</span></div>' +
                '<div class="admin-detail-row"><span class="admin-detail-label">Phone</span><span class="admin-detail-value">' + esc(custPhone || '-') + '</span></div>' +
                '<div class="admin-detail-row"><span class="admin-detail-label">Zip</span><span class="admin-detail-value">' + esc(custZip) + '</span></div>' +
                '<div class="admin-detail-row"><span class="admin-detail-label">Dealer</span><span class="admin-detail-value">' + esc(q.dealerCode || 'N/A') + '</span></div>' +
                '<div class="admin-detail-row"><span class="admin-detail-label">Status</span><span class="admin-detail-value"><span class="admin-badge badge-' + (q.status || 'draft') + '">' + (q.status || 'draft') + '</span></span></div>' +
                '<div class="admin-detail-row"><span class="admin-detail-label">Total</span><span class="admin-detail-value" style="font-weight:700;color:#1e40af;">$' + (q.totalAmount || 0).toFixed(2) + '</span></div>' +
            '</div>' +
            (q.specialInstructions ? '<div style="margin-top:0.75rem;"><strong style="font-size:0.85rem;">Special Instructions:</strong><div style="font-size:0.88rem;color:#374151;margin-top:0.25rem;">' + esc(q.specialInstructions) + '</div></div>' : '') +
            (q.internalNotes ? '<div style="margin-top:0.5rem;"><strong style="font-size:0.85rem;">Internal Notes:</strong><div style="font-size:0.88rem;color:#374151;margin-top:0.25rem;">' + esc(q.internalNotes) + '</div></div>' : '') +
            '<div style="margin-top:1rem;"><strong style="font-size:0.85rem;">Line Items</strong></div>' + lineItemsHTML +
            '</div>';
        panel.style.display = 'block';
        panel.scrollIntoView({ behavior: 'smooth' });
        document.getElementById('admin-close-detail').addEventListener('click', function () { panel.style.display = 'none'; });
    }

    function deleteAdminQuote(quoteId) {
        var q = _allQuotes.find(function (q) { return q.id === quoteId; });
        if (!q) return;
        if (!confirm('Permanently delete quote ' + (q.quoteNumber || q.id) + '?')) return;
        _api('DELETE', '/api/admin/quotes/' + quoteId)
            .then(function () { showAlert('admin-quote-alert', 'Quote deleted.', 'success'); loadAllQuotes(); })
            .catch(function (err) { showAlert('admin-quote-alert', 'Delete failed: ' + esc(err.message), 'error'); });
    }

    document.getElementById('admin-export-csv-btn').addEventListener('click', function () {
        if (_allQuotes.length === 0) { showAlert('admin-quote-alert', 'No quotes to export', 'error'); return; }
        var csv = 'Quote Number,Dealer,Customer,Company,Email,Phone,Zip,Status,Items,Total,Special Instructions,Date\n';
        _allQuotes.forEach(function (q) {
            var cn = (q.customer && q.customer.name) || '', cc = (q.customer && q.customer.company) || '';
            var ce = (q.customer && q.customer.email) || '', cp = (q.customer && q.customer.phone) || '', cz = (q.customer && q.customer.zipCode) || '';
            var ds = ''; try { ds = new Date(q.updatedAt || q.createdAt).toISOString().split('T')[0]; } catch(e) {}
            csv += '"' + (q.quoteNumber||q.id) + '","' + (q.dealerCode||'') + '","' + cn.replace(/"/g,'""') + '","' + cc.replace(/"/g,'""') + '","' + ce + '","' + cp + '","' + cz + '","' + (q.status||'draft') + '",' + (q.lineItems||[]).length + ',' + (q.totalAmount||0).toFixed(2) + ',"' + (q.specialInstructions||'').replace(/"/g,'""').replace(/\n/g,' ') + '","' + ds + '"\n';
        });
        var blob = new Blob([csv], { type: 'text/csv' }); var url = URL.createObjectURL(blob);
        var a = document.createElement('a'); a.href = url; a.download = 'ameridex-quotes-' + new Date().toISOString().split('T')[0] + '.csv'; a.click(); URL.revokeObjectURL(url);
        showAlert('admin-quote-alert', 'CSV exported!', 'success');
    });


    // ----------------------------------------------------------
    // PRODUCTS TAB
    // ----------------------------------------------------------
    var _productCategories = [
        { slug: 'decking', label: 'Decking' },
        { slug: 'sealing', label: 'Sealing & Protection' },
        { slug: 'fasteners', label: 'Fasteners & Hardware' },
        { slug: 'hardware', label: 'Hardware' },
        { slug: 'other', label: 'Other' }
    ];

    function buildCategoryOptions(selectedSlug) {
        var html = '';
        _productCategories.forEach(function (c) {
            html += '<option value="' + escAttr(c.slug) + '"' + (c.slug === selectedSlug ? ' selected' : '') + '>' + esc(c.label) + '</option>';
        });
        return html;
    }

    function populateNewProductCatDropdown() {
        var sel = document.getElementById('admin-new-prod-cat');
        if (sel) sel.innerHTML = buildCategoryOptions('decking');
    }

    function loadProducts() {
        var container = document.getElementById('admin-products-list');
        container.innerHTML = '<div class="admin-loading">Loading products...</div>';

        // Load categories first (if not already loaded), then products
        _api('GET', '/api/admin/categories')
            .then(function (cats) {
                if (cats && cats.length > 0) {
                    _productCategories = cats.map(function (c) { return { slug: c.slug, label: c.label }; });
                    // Also add 'other' if not present
                    if (!_productCategories.find(function (c) { return c.slug === 'other'; })) {
                        _productCategories.push({ slug: 'other', label: 'Other' });
                    }
                }
                populateNewProductCatDropdown();
            })
            .catch(function () { populateNewProductCatDropdown(); });

        _api('GET', '/api/admin/products')
            .then(function (products) { _allProducts = products; renderProductStats(); renderProductsTable(); })
            .catch(function (err) { container.innerHTML = '<div class="admin-error">Failed to load products: ' + esc(err.message) + '</div>'; });
    }

    // Populate add-product category dropdown on initial load
    populateNewProductCatDropdown();

    function renderProductStats() {
        var active = _allProducts.filter(function (p) { return p.isActive !== false; }).length;
        var inactive = _allProducts.length - active;
        var exemptCount = _allProducts.filter(function (p) { return p.tierOverrides && Object.keys(p.tierOverrides).length > 0; }).length;
        document.getElementById('admin-products-stats').innerHTML = '' +
            '<div class="admin-stat"><div class="admin-stat-value">' + _allProducts.length + '</div><div class="admin-stat-label">Total Products</div></div>' +
            '<div class="admin-stat"><div class="admin-stat-value">' + active + '</div><div class="admin-stat-label">Active</div></div>' +
            '<div class="admin-stat"><div class="admin-stat-value">' + inactive + '</div><div class="admin-stat-label">Inactive</div></div>' +
            '<div class="admin-stat"><div class="admin-stat-value">' + exemptCount + '</div><div class="admin-stat-label">Tier Exempt</div></div>';
    }

    function renderProductsTable() {
        var container = document.getElementById('admin-products-list');
        var search = (document.getElementById('admin-product-search').value || '').toLowerCase();

        var filtered = _allProducts.filter(function (p) {
            if (!search) return true;
            return (p.name || '').toLowerCase().includes(search) || (p.id || '').toLowerCase().includes(search) || (p.category || '').toLowerCase().includes(search);
        });

        if (filtered.length === 0) { container.innerHTML = '<div class="admin-empty">No products found</div>'; return; }

        var html = '<div class="admin-table-wrap" style="overflow-x:auto;-webkit-overflow-scrolling:touch"><table class="admin-table"><thead><tr>' +
            '<th>Product</th><th>ID</th><th>Category</th><th>Base Price</th><th>Unit</th><th>Tier Exempt</th><th>Status</th><th>Actions</th>' +
            '</tr></thead><tbody>';

        filtered.forEach(function (p) {
            var isExempt = p.tierOverrides && Object.keys(p.tierOverrides).length > 0;
            var isCustom = p.id === 'custom';
            html += '<tr id="prod-row-' + esc(p.id) + '">' +
                '<td><strong>' + esc(p.name) + '</strong></td>' +
                '<td><code style="font-size:0.78rem;background:#f3f4f6;padding:0.15rem 0.4rem;border-radius:4px;">' + esc(p.id) + '</code></td>' +
                '<td><span class="admin-badge badge-' + (p.category || 'other') + '">' + esc(p.category || 'other') + '</span></td>' +
                '<td style="text-align:right;font-weight:600;">$' + (p.basePrice || 0).toFixed(2) + '</td>' +
                '<td>/' + esc(p.unit || 'each') + '</td>' +
                '<td style="text-align:center;">' + (isExempt ? '<span style="color:#dc2626;font-weight:600;">Yes</span>' : '<span style="color:#6b7280;">No</span>') + '</td>' +
                '<td><span class="admin-badge ' + (p.isActive !== false ? 'badge-active' : 'badge-inactive') + '">' + (p.isActive !== false ? 'Active' : 'Inactive') + '</span></td>' +
                '<td class="admin-actions">' +
                    '<button class="admin-btn admin-btn-primary admin-btn-sm" data-action="edit-product" data-id="' + esc(p.id) + '">Edit</button>' +
                    '<button class="admin-btn ' + (p.isActive !== false ? 'admin-btn-danger' : 'admin-btn-success') + ' admin-btn-sm" data-action="toggle-product" data-id="' + esc(p.id) + '">' + (p.isActive !== false ? 'Disable' : 'Enable') + '</button>' +
                    (isCustom ? '' : '<button class="admin-btn admin-btn-danger admin-btn-sm" data-action="delete-product" data-id="' + esc(p.id) + '">Del</button>') +
                '</td></tr>' +
                '<tr id="prod-edit-row-' + esc(p.id) + '" style="display:none;"><td colspan="8" style="padding:0;border-bottom:none;"></td></tr>';
        });

        html += '</tbody></table></div>';
        container.innerHTML = html;

        container.querySelectorAll('[data-action]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var action = btn.getAttribute('data-action'), id = btn.getAttribute('data-id');
                if (action === 'edit-product') editProduct(id);
                if (action === 'toggle-product') toggleProduct(id);
                if (action === 'delete-product') deleteProduct(id);
            });
        });
    }

    document.getElementById('admin-product-search').addEventListener('input', renderProductsTable);

    document.getElementById('admin-create-product-btn').addEventListener('click', function () {
        var name = document.getElementById('admin-new-prod-name').value.trim();
        var id = document.getElementById('admin-new-prod-id').value.trim().toLowerCase();
        var price = document.getElementById('admin-new-prod-price').value;
        var unit = document.getElementById('admin-new-prod-unit').value;
        var cat = document.getElementById('admin-new-prod-cat').value;
        var flat = document.getElementById('admin-new-prod-flat').value;

        if (!name) { showAlert('admin-product-alert', 'Product name is required', 'error'); return; }
        if (!price || isNaN(Number(price))) { showAlert('admin-product-alert', 'Valid base price is required', 'error'); return; }

        var tierOverrides = {};
        if (flat === 'yes') {
            tierOverrides = { preferred: { multiplier: 1.0 }, vip: { multiplier: 1.0 } };
        }

        var payload = { name: name, basePrice: Number(price), unit: unit, category: cat, tierOverrides: tierOverrides };
        if (id) payload.id = id;

        _api('POST', '/api/admin/products', payload)
            .then(function (prod) {
                showAlert('admin-product-alert', 'Product "' + esc(prod.name) + '" added (ID: ' + esc(prod.id) + ')', 'success');
                document.getElementById('admin-new-prod-name').value = '';
                document.getElementById('admin-new-prod-id').value = '';
                document.getElementById('admin-new-prod-price').value = '';
                document.getElementById('admin-new-prod-unit').value = 'ft';
                document.getElementById('admin-new-prod-cat').value = 'decking';
                document.getElementById('admin-new-prod-flat').value = 'no';
                document.getElementById('admin-add-product-details').removeAttribute('open');
                loadProducts();
                refreshPricingNow();
            })
            .catch(function (err) { showAlert('admin-product-alert', 'Failed: ' + esc(err.message), 'error'); });
    });

    function editProduct(id) {
        var prod = _allProducts.find(function (p) { return p.id === id; });
        if (!prod) return;

        // If decking product and we don't have colors yet, fetch them first
        if (prod.category === 'decking' && _allColors.length === 0) {
            _api('GET', '/api/admin/colors').then(function(colors) {
                _allColors = colors;
                _renderEditProduct(id, prod);
            });
        } else {
            _renderEditProduct(id, prod);
        }
    }

    function _renderEditProduct(id, prod) {
        document.querySelectorAll('[id^="prod-edit-row-"]').forEach(function (row) {
            row.style.display = 'none';
            row.querySelector('td').innerHTML = '';
        });

        var editRow = document.getElementById('prod-edit-row-' + id);
        if (!editRow) return;
        var cell = editRow.querySelector('td');

        var isExempt = prod.tierOverrides && Object.keys(prod.tierOverrides).length > 0;

        // Color Pricing section (decking products only)
        var colorPricingHtml = '';
        if (prod.category === 'decking' && _allColors.length > 0) {
            var activeColors = _allColors.filter(function(c) { return c.isActive !== false; })
                .sort(function(a, b) { return (a.sortOrder || 99) - (b.sortOrder || 99); });

            colorPricingHtml = '<div class="admin-form-row" style="grid-column:1/-1;">' +
                '<div class="admin-form-field" style="grid-column:1/-1;">' +
                    '<label>Color Pricing <span style="font-weight:400;color:#6b7280;font-size:0.82rem;">(per-unit price by color)</span></label>' +
                    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:0.5rem;margin-top:0.5rem;">';

            activeColors.forEach(function(c) {
                var currentPrice = (prod.colorPricing && prod.colorPricing[c.id] !== undefined)
                    ? prod.colorPricing[c.id]
                    : prod.basePrice;
                var tierBadge = c.tier === 'solid' ? 'solid' : 'variegated';
                colorPricingHtml += '<div style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0.6rem;background:#f9fafb;border-radius:6px;border:1px solid #e5e7eb;">' +
                    '<span style="font-size:0.85rem;font-weight:600;min-width:80px;">' + esc(c.name) + '</span>' +
                    '<span class="admin-badge badge-' + tierBadge + '" style="font-size:0.65rem;">' + esc(c.tier) + '</span>' +
                    '<span style="color:#6b7280;font-size:0.85rem;">$</span>' +
                    '<input type="number" step="0.01" min="0" ' +
                        'id="edit-cp-' + escAttr(id) + '-' + escAttr(c.id) + '" ' +
                        'value="' + currentPrice.toFixed(2) + '" ' +
                        'style="width:100px;padding:0.3rem 0.4rem;border:1px solid #e5e7eb;border-radius:4px;font-size:0.85rem;text-align:right;">' +
                '</div>';
            });

            colorPricingHtml += '</div></div></div>';
        }

        cell.innerHTML =
            '<div class="admin-inline-edit">' +
                '<h4>' +
                    '<span>Editing: ' + esc(prod.name) + '</span>' +
                    '<button class="admin-btn admin-btn-ghost admin-btn-sm" id="cancel-edit-' + escAttr(id) + '">Cancel</button>' +
                '</h4>' +
                '<div class="admin-form">' +
                    '<div class="admin-form-row">' +
                        '<div class="admin-form-field">' +
                            '<label>Product Name</label>' +
                            '<input type="text" id="edit-name-' + escAttr(id) + '" value="' + escAttr(prod.name || '') + '">' +
                        '</div>' +
                        '<div class="admin-form-field">' +
                            '<label>Base Price ($)</label>' +
                            '<input type="number" step="0.01" min="0" id="edit-price-' + escAttr(id) + '" value="' + (prod.basePrice || 0).toFixed(2) + '">' +
                        '</div>' +
                    '</div>' +
                    '<div class="admin-form-row">' +
                        '<div class="admin-form-field">' +
                            '<label>Unit</label>' +
                            '<select id="edit-unit-' + escAttr(id) + '">' +
                                '<option value="ft"' + (prod.unit === 'ft' ? ' selected' : '') + '>per foot (ft)</option>' +
                                '<option value="box"' + (prod.unit === 'box' ? ' selected' : '') + '>per box</option>' +
                                '<option value="each"' + (prod.unit === 'each' ? ' selected' : '') + '>each</option>' +
                                '<option value="pack"' + (prod.unit === 'pack' ? ' selected' : '') + '>per pack</option>' +
                                '<option value="sqft"' + (prod.unit === 'sqft' ? ' selected' : '') + '>per sq ft</option>' +
                            '</select>' +
                        '</div>' +
                        '<div class="admin-form-field">' +
                            '<label>Category</label>' +
                            '<select id="edit-cat-' + escAttr(id) + '">' + buildCategoryOptions(prod.category) + '</select>' +
                        '</div>' +
                    '</div>' +
                    '<div class="admin-form-row">' +
                        '<div class="admin-form-field">' +
                            '<label>Exempt from Tier Discounts?</label>' +
                            '<select id="edit-exempt-' + escAttr(id) + '">' +
                                '<option value="no"' + (!isExempt ? ' selected' : '') + '>No (apply tier multiplier normally)</option>' +
                                '<option value="yes"' + (isExempt ? ' selected' : '') + '>Yes (same price for all tiers)</option>' +
                            '</select>' +
                        '</div>' +
                        '<div class="admin-form-field"></div>' +
                    '</div>' +
                    colorPricingHtml +
                    '<div class="admin-form-actions">' +
                        '<button class="admin-btn admin-btn-ghost" id="cancel-edit2-' + escAttr(id) + '">Cancel</button>' +
                        '<button class="admin-btn admin-btn-primary" id="save-edit-' + escAttr(id) + '">Save Changes</button>' +
                    '</div>' +
                '</div>' +
            '</div>';

        editRow.style.display = 'table-row';
        editRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        document.getElementById('cancel-edit-' + id).addEventListener('click', function () { cancelEditProduct(id); });
        document.getElementById('cancel-edit2-' + id).addEventListener('click', function () { cancelEditProduct(id); });
        document.getElementById('save-edit-' + id).addEventListener('click', function () { saveEditProduct(id); });
    }

    function cancelEditProduct(id) {
        var editRow = document.getElementById('prod-edit-row-' + id);
        if (editRow) {
            editRow.style.display = 'none';
            editRow.querySelector('td').innerHTML = '';
        }
    }

    // ----------------------------------------------------------
    // SYNC PRODUCT GLOBALS (v2.1)
    // After a successful product save, update the in-memory
    // PRODUCTS and PRODUCT_CONFIG globals so the quote builder
    // dropdown reflects the new name/price/unit immediately
    // without requiring a full page reload.
    //
    // v2.1 addition: calls window.refreshAllPickerLabels() (from
    // ameridex-inline-item-picker.js v2.2) so any already-rendered
    // .aip-picker trigger labels and option text nodes are also
    // updated to show the new product name instantly.
    // ----------------------------------------------------------
    function syncProductGlobals(productId, newName, newBasePrice, newUnit, newCategory) {
        if (typeof PRODUCTS !== 'undefined' && PRODUCTS[productId]) {
            if (newName !== undefined)       PRODUCTS[productId].name      = newName;
            if (newBasePrice !== undefined)  PRODUCTS[productId].basePrice = newBasePrice;
            if (newUnit !== undefined) {
                PRODUCTS[productId].unit = newUnit;
                PRODUCTS[productId].isFt = (newUnit === 'ft');
            }
        }

        if (typeof PRODUCT_CONFIG !== 'undefined' && PRODUCT_CONFIG.categories) {
            Object.keys(PRODUCT_CONFIG.categories).forEach(function (catKey) {
                var cat = PRODUCT_CONFIG.categories[catKey];
                if (cat.products && cat.products[productId]) {
                    if (newName !== undefined)       cat.products[productId].name      = newName;
                    if (newBasePrice !== undefined)  cat.products[productId].basePrice = newBasePrice;
                    if (newUnit !== undefined)       cat.products[productId].unit      = newUnit;
                }
            });
        }

        // Refresh live picker labels so trigger buttons and option text
        // immediately reflect the updated product name (v2.1 fix).
        if (typeof window.refreshAllPickerLabels === 'function') {
            window.refreshAllPickerLabels();
        }

        // Re-render the active quote if it has line items
        if (typeof window.currentQuote !== 'undefined' && window.currentQuote && window.currentQuote.lineItems && window.currentQuote.lineItems.length > 0) {
            if (typeof render === 'function') render();
            if (typeof updateTotalAndFasteners === 'function') updateTotalAndFasteners();
        }

        console.log('[Admin v2.1] syncProductGlobals: id="' + productId + '" name="' + newName + '" basePrice=' + newBasePrice + ' unit=' + newUnit);
    }

    // ----------------------------------------------------------
    // SAVE EDIT PRODUCT (v2.2)
    //
    // v2.2 FIX: Check for result.cascade in the server response.
    // If present, it means Fix 1 cascaded the base price change to
    // dealers. Display feedback about how many dealers were updated
    // vs. skipped (custom pricing).
    // ----------------------------------------------------------
    function saveEditProduct(id) {
        var nameEl = document.getElementById('edit-name-' + id);
        var priceEl = document.getElementById('edit-price-' + id);
        var unitEl = document.getElementById('edit-unit-' + id);
        var catEl = document.getElementById('edit-cat-' + id);
        var exemptEl = document.getElementById('edit-exempt-' + id);

        if (!nameEl || !priceEl) return;

        var newName = nameEl.value.trim();
        var newPrice = priceEl.value;
        var newUnit = unitEl.value;
        var newCat = catEl.value;
        var exemptVal = exemptEl.value;

        if (!newName) { showAlert('admin-product-alert', 'Product name is required', 'error'); return; }
        if (!newPrice || isNaN(Number(newPrice))) { showAlert('admin-product-alert', 'Valid base price is required', 'error'); return; }
        if (Number(newPrice) < 0) { showAlert('admin-product-alert', 'Price cannot be negative', 'error'); return; }

        var tierOverrides = {};
        if (exemptVal === 'yes') {
            tierOverrides = { preferred: { multiplier: 1.0 }, vip: { multiplier: 1.0 } };
        }

        var colorPricing = null;
        var prod = _allProducts.find(function(p) { return p.id === id; });
        if (prod && prod.category === 'decking' && _allColors.length > 0) {
            colorPricing = {};
            _allColors.filter(function(c) { return c.isActive !== false; }).forEach(function(c) {
                var el = document.getElementById('edit-cp-' + id + '-' + c.id);
                if (el) {
                    colorPricing[c.id] = parseFloat(el.value) || 0;
                }
            });
        }

        var saveBtn = document.getElementById('save-edit-' + id);
        if (saveBtn) { saveBtn.textContent = 'Saving...'; saveBtn.disabled = true; }

        _api('PUT', '/api/admin/products/' + encodeURIComponent(id), {
            name: newName,
            basePrice: Number(newPrice),
            unit: newUnit,
            category: newCat,
            tierOverrides: tierOverrides,
            colorPricing: colorPricing
        })
            .then(function (result) {
                syncProductGlobals(id, newName, Number(newPrice), newUnit, newCat);

                // v2.2: Build success message with cascade info if present
                var msg = 'Product "' + esc(newName) + '" updated successfully!';
                if (result && result.cascade) {
                    var c = result.cascade;
                    msg += ' <strong>Cascade:</strong> ' + c.dealersUpdated + ' dealer(s) updated to $' +
                           c.newBasePrice.toFixed(2) + ', ' + c.dealersSkipped + ' skipped (custom pricing).';
                }

                showAlert('admin-product-alert', msg, 'success');
                loadProducts();
                refreshPricingNow();
            })
            .catch(function (err) {
                if (saveBtn) { saveBtn.textContent = 'Save Changes'; saveBtn.disabled = false; }
                showAlert('admin-product-alert', 'Update failed: ' + esc(err.message), 'error');
            });
    }

    function toggleProduct(id) {
        var prod = _allProducts.find(function (p) { return p.id === id; });
        if (!prod) return;
        var currentlyActive = prod.isActive !== false;
        var action = currentlyActive ? 'disable' : 'enable';
        if (!confirm('Are you sure you want to ' + action + ' "' + prod.name + '"?')) return;

        _api('PUT', '/api/admin/products/' + encodeURIComponent(id), { isActive: !currentlyActive })
            .then(function () {
                showAlert('admin-product-alert', 'Product ' + action + 'd!', 'success');
                loadProducts();
                refreshPricingNow();
            })
            .catch(function (err) { showAlert('admin-product-alert', 'Failed: ' + esc(err.message), 'error'); });
    }

    function deleteProduct(id) {
        var prod = _allProducts.find(function (p) { return p.id === id; });
        if (!prod) return;
        if (!confirm('Permanently delete "' + prod.name + '"? This cannot be undone.')) return;

        _api('DELETE', '/api/admin/products/' + encodeURIComponent(id))
            .then(function () { showAlert('admin-product-alert', 'Product deleted.', 'success'); loadProducts(); })
            .catch(function (err) { showAlert('admin-product-alert', 'Delete failed: ' + esc(err.message), 'error'); });
    }


    // ----------------------------------------------------------
    // PRICING TAB
    // ----------------------------------------------------------
    function loadPricingTiers() {
        var container = document.getElementById('admin-pricing-list');
        container.innerHTML = '<div class="admin-loading">Loading pricing tiers...</div>';

        Promise.all([
            _api('GET', '/api/admin/pricing-tiers'),
            _api('GET', '/api/admin/products')
        ])
            .then(function (results) {
                _pricingTiers = results[0];
                _allProducts = results[1];
                renderPricingTiers();
            })
            .catch(function (err) {
                container.innerHTML = '<div class="admin-error">Failed to load pricing: ' + esc(err.message) + '</div>';
            });
    }

    function renderPricingTiers() {
        var container = document.getElementById('admin-pricing-list');
        if (!_pricingTiers || _pricingTiers.length === 0) { container.innerHTML = '<div class="admin-empty">No pricing tiers configured</div>'; return; }

        var previewProducts = _allProducts.filter(function (p) {
            return p.isActive !== false && p.id !== 'custom';
        });

        var html = '';
        _pricingTiers.forEach(function (tier, tIdx) {
            var slug = tier.slug || tier.id || 'tier-' + tIdx;
            var mult = tier.multiplier || 1;

            html += '<div class="admin-tier-card" data-tier-idx="' + tIdx + '" data-tier-slug="' + esc(slug) + '">' +
                '<div class="admin-tier-header">' +
                    '<div><span class="admin-tier-name">' + esc(tier.label || slug) + '</span> <span class="admin-badge badge-' + slug + '">' + slug + '</span></div>' +
                    '<div class="admin-form-inline" style="gap:0.5rem;align-items:center;">' +
                        '<label style="font-size:0.82rem;font-weight:600;color:#6b7280;">Multiplier:</label>' +
                        '<input type="number" step="0.01" min="0.01" max="2" value="' + mult + '" class="tier-multiplier-input" data-tier="' + tIdx + '" data-slug="' + esc(slug) + '" style="width:80px;padding:0.4rem;border:1px solid #e5e7eb;border-radius:6px;font-size:0.9rem;font-weight:600;text-align:center;">' +
                        '<span class="tier-mult-preview" data-tier="' + tIdx + '" style="font-size:0.82rem;color:#6b7280;">(' + (mult * 100).toFixed(0) + '% of base)</span>' +
                    '</div>' +
                '</div>';

            html += '<div style="margin-top:0.5rem;margin-bottom:0.25rem;font-size:0.8rem;font-weight:600;color:#6b7280;">Product Price Preview</div>';
            html += '<div class="admin-tier-products">';

            previewProducts.forEach(function (prod) {
                var prodMult = mult;
                var isLocked = false;
                if (prod.tierOverrides && prod.tierOverrides[slug] && prod.tierOverrides[slug].multiplier !== undefined) {
                    prodMult = prod.tierOverrides[slug].multiplier;
                    isLocked = true;
                }
                var computedPrice = Math.round(prod.basePrice * prodMult * 100) / 100;
                var showStrike = prodMult !== 1;

                html += '<div class="admin-tier-product">' +
                    '<span class="admin-tier-product-name">' + esc(prod.name) + '<span class="admin-tier-product-unit">/' + esc(prod.unit || 'each') + '</span>' +
                        (isLocked ? '<span class="admin-tier-product-locked">(FIXED)</span>' : '') +
                    '</span>' +
                    '<span>' +
                        (showStrike ? '<span class="admin-tier-product-base">$' + prod.basePrice.toFixed(2) + '</span>' : '') +
                        '<span class="admin-tier-product-price tier-computed-price" data-tier="' + tIdx + '" data-base="' + prod.basePrice + '" data-locked="' + (isLocked ? '1' : '0') + '" data-locked-mult="' + prodMult + '">$' + computedPrice.toFixed(2) + '</span>' +
                    '</span>' +
                '</div>';
            });

            html += '</div></div>';
        });

        container.innerHTML = html;

        container.querySelectorAll('.tier-multiplier-input').forEach(function (input) {
            input.addEventListener('input', function () {
                var tIdx = input.getAttribute('data-tier');
                var newMult = parseFloat(input.value) || 1;
                var preview = container.querySelector('.tier-mult-preview[data-tier="' + tIdx + '"]');
                if (preview) preview.textContent = '(' + (newMult * 100).toFixed(0) + '% of base)';

                container.querySelectorAll('.tier-computed-price[data-tier="' + tIdx + '"]').forEach(function (el) {
                    var base = parseFloat(el.getAttribute('data-base')) || 0;
                    var locked = el.getAttribute('data-locked') === '1';
                    var effectiveMult = locked ? parseFloat(el.getAttribute('data-locked-mult')) : newMult;
                    var computed = Math.round(base * effectiveMult * 100) / 100;
                    el.textContent = '$' + computed.toFixed(2);
                });
            });
        });
    }

    document.getElementById('admin-save-pricing-btn').addEventListener('click', function () {
        var inputs = document.querySelectorAll('.tier-multiplier-input');
        if (inputs.length === 0) { showAlert('admin-pricing-alert', 'No tiers to save', 'error'); return; }

        var saveBtn = document.getElementById('admin-save-pricing-btn');
        saveBtn.textContent = 'Saving...'; saveBtn.disabled = true;

        var promises = [];
        inputs.forEach(function (input) {
            var slug = input.getAttribute('data-slug');
            var tIdx = parseInt(input.getAttribute('data-tier'), 10);
            var newMult = parseFloat(input.value);
            if (isNaN(newMult) || newMult <= 0 || newMult > 2) return;
            var tier = _pricingTiers[tIdx];
            if (!tier) return;
            if (tier.multiplier !== newMult) {
                promises.push(_api('PUT', '/api/admin/pricing-tiers/' + encodeURIComponent(slug), { multiplier: newMult })
                    .then(function (updated) { _pricingTiers[tIdx].multiplier = updated.multiplier || newMult; return slug; }));
            }
        });

        if (promises.length === 0) {
            saveBtn.textContent = 'Save All Changes';
            saveBtn.disabled = false;
            showAlert('admin-pricing-alert', 'No changes to save', 'success');
            return;
        }

        Promise.all(promises)
            .then(function (saved) {
                saveBtn.textContent = 'Save All Changes';
                saveBtn.disabled = false;
                showAlert('admin-pricing-alert', 'Saved ' + saved.length + ' tier(s): ' + saved.join(', '), 'success');
                refreshPricingNow();
            })
            .catch(function (err) {
                saveBtn.textContent = 'Save All Changes';
                saveBtn.disabled = false;
                showAlert('admin-pricing-alert', 'Save failed: ' + esc(err.message), 'error');
            });
    });


    // ----------------------------------------------------------
    // USERS TAB
    // ----------------------------------------------------------
    var _allUsers = [];

    function loadAdminUsers() {
        var container = document.getElementById('admin-users-list');
        container.innerHTML = '<div class="admin-loading">Loading users...</div>';

        Promise.all([
            _api('GET', '/api/admin/users'),
            _api('GET', '/api/admin/dealers')
        ])
            .then(function (results) {
                _allUsers = results[0];
                var dealers = results[1];
                populateUserDealerFilters(dealers);
                renderAdminUsersStats();
                renderAdminUsersTable();
            })
            .catch(function (err) {
                container.innerHTML = '<div class="admin-error">Failed to load users: ' + esc(err.message) + '</div>';
            });
    }

    function populateUserDealerFilters(dealers) {
        var codes = [];
        dealers.forEach(function (d) {
            if (d.dealerCode && codes.indexOf(d.dealerCode) === -1) codes.push(d.dealerCode);
        });
        _allUsers.forEach(function (u) {
            if (u.dealerCode && codes.indexOf(u.dealerCode) === -1) codes.push(u.dealerCode);
        });
        codes.sort();

        var filterSelect = document.getElementById('admin-user-dealer-filter');
        filterSelect.innerHTML = '<option value="">All Dealer Codes</option>';
        codes.forEach(function (c) {
            var opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            filterSelect.appendChild(opt);
        });

        var createSelect = document.getElementById('admin-new-user-dealer');
        createSelect.innerHTML = '';
        codes.forEach(function (c) {
            var opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            createSelect.appendChild(opt);
        });
    }

    function renderAdminUsersStats() {
        var total = _allUsers.length;
        var active = _allUsers.filter(function (u) { return u.status === 'active'; }).length;
        var gms = _allUsers.filter(function (u) { return u.role === 'gm'; }).length;
        var frontdesk = _allUsers.filter(function (u) { return u.role === 'frontdesk'; }).length;
        var salesreps = _allUsers.filter(function (u) { return u.role === 'salesrep'; }).length;
        var dealerCodes = [];
        _allUsers.forEach(function (u) {
            if (u.dealerCode && dealerCodes.indexOf(u.dealerCode) === -1) dealerCodes.push(u.dealerCode);
        });

        document.getElementById('admin-users-stats').innerHTML = '' +
            '<div class="admin-stat"><div class="admin-stat-value">' + total + '</div><div class="admin-stat-label">Total Users</div></div>' +
            '<div class="admin-stat"><div class="admin-stat-value">' + active + '</div><div class="admin-stat-label">Active</div></div>' +
            '<div class="admin-stat"><div class="admin-stat-value">' + gms + '</div><div class="admin-stat-label">GMs</div></div>' +
            '<div class="admin-stat"><div class="admin-stat-value">' + frontdesk + '</div><div class="admin-stat-label">Frontdesk</div></div>' +
            '<div class="admin-stat"><div class="admin-stat-value">' + salesreps + '</div><div class="admin-stat-label">Sales Reps</div></div>' +
            '<div class="admin-stat"><div class="admin-stat-value">' + dealerCodes.length + '</div><div class="admin-stat-label">Dealers</div></div>';
    }

    function renderAdminUsersTable() {
        var container = document.getElementById('admin-users-list');
        var dealerFilter = document.getElementById('admin-user-dealer-filter').value;
        var roleFilter = document.getElementById('admin-user-role-filter').value;
        var statusFilter = document.getElementById('admin-user-status-filter').value;
        var search = (document.getElementById('admin-user-search').value || '').toLowerCase();

        var filtered = _allUsers.filter(function (u) {
            if (dealerFilter && u.dealerCode !== dealerFilter) return false;
            if (roleFilter && u.role !== roleFilter) return false;
            if (statusFilter && u.status !== statusFilter) return false;
            if (search) {
                var hay = ((u.username || '') + (u.displayName || '') + (u.email || '') + (u.dealerCode || '')).toLowerCase();
                if (!hay.includes(search)) return false;
            }
            return true;
        });

        if (filtered.length === 0) {
            container.innerHTML = '<div class="admin-empty">No users match your filters</div>';
            return;
        }

        var grouped = {};
        filtered.forEach(function (u) {
            var code = u.dealerCode || 'UNKNOWN';
            if (!grouped[code]) grouped[code] = [];
            grouped[code].push(u);
        });

        var dealerKeys = Object.keys(grouped).sort();
        var html = '';

        dealerKeys.forEach(function (code) {
            var users = grouped[code];

            html += '<div style="margin-bottom:1.25rem;">';
            html += '<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;">';
            html += '<span style="font-weight:700;font-size:0.95rem;color:#1e40af;">' + esc(code) + '</span>';
            html += '<span class="admin-badge badge-dealer" style="font-size:0.68rem;">' + users.length + ' user' + (users.length !== 1 ? 's' : '') + '</span>';
            html += '</div>';

            html += '<div class="admin-table-wrap" style="overflow-x:auto;-webkit-overflow-scrolling:touch"><table class="admin-table"><thead><tr>' +
                '<th>Username</th><th>Display Name</th><th>Role</th><th>Status</th><th>Email</th><th>Last Login</th><th>Actions</th>' +
                '</tr></thead><tbody>';

            users.forEach(function (u) {
                var roleBadge = 'badge-' + (u.role || 'frontdesk');
                var statusBadge = u.status === 'active' ? 'badge-active' : (u.status === 'disabled' ? 'badge-inactive' : 'badge-draft');
                var dateStr = '';
                if (u.lastLogin) { try { dateStr = new Date(u.lastLogin).toLocaleDateString(); } catch(e) {} }
                else { dateStr = 'Never'; }

                var roleLabel = esc(u.role);
                if (u.role === 'salesrep' && u.assignedDealers && u.assignedDealers.length > 0) {
                    roleLabel += ' <span style="font-size:0.68rem;color:#6b7280;">(' + u.assignedDealers.length + ' dealer' + (u.assignedDealers.length !== 1 ? 's' : '') + ')</span>';
                }

                var repPricingBtn = '';
                if (u.role === 'salesrep') {
                    repPricingBtn = '<button class="admin-btn admin-btn-ghost admin-btn-sm" data-action="rep-pricing" data-id="' + u.id + '" style="color:#a21caf;">Pricing</button>';
                }

                html += '<tr>' +
                    '<td><strong>' + esc(u.username) + '</strong></td>' +
                    '<td>' + esc(u.displayName || u.username) + '</td>' +
                    '<td><span class="admin-badge ' + roleBadge + '">' + roleLabel + '</span></td>' +
                    '<td><span class="admin-badge ' + statusBadge + '">' + esc(u.status || 'unknown') + '</span></td>' +
                    '<td style="font-size:0.82rem;color:#6b7280;">' + esc(u.email || '-') + '</td>' +
                    '<td style="font-size:0.82rem;color:#6b7280;">' + dateStr + '</td>' +
                    '<td class="admin-actions">' +
                        '<button class="admin-btn admin-btn-ghost admin-btn-sm" data-action="edit-user" data-id="' + u.id + '">Edit</button>' +
                        repPricingBtn +
                        '<button class="admin-btn admin-btn-ghost admin-btn-sm" data-action="reset-user-pw" data-id="' + u.id + '">Reset PW</button>' +
                        '<button class="admin-btn ' + (u.status === 'active' ? 'admin-btn-danger' : 'admin-btn-success') + ' admin-btn-sm" ' +
                            'data-action="toggle-user" data-id="' + u.id + '">' + (u.status === 'active' ? 'Disable' : 'Enable') + '</button>' +
                    '</td></tr>';
            });

            html += '</tbody></table></div></div>';
        });

        container.innerHTML = html;

        container.querySelectorAll('[data-action]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var action = btn.getAttribute('data-action');
                var id = btn.getAttribute('data-id');
                if (action === 'edit-user') editAdminUser(id);
                if (action === 'rep-pricing') openRepPricing(id);
                if (action === 'reset-user-pw') resetAdminUserPassword(id);
                if (action === 'toggle-user') toggleAdminUser(id);
            });
        });
    }

    document.getElementById('admin-user-dealer-filter').addEventListener('change', renderAdminUsersTable);
    document.getElementById('admin-user-role-filter').addEventListener('change', renderAdminUsersTable);
    document.getElementById('admin-user-status-filter').addEventListener('change', renderAdminUsersTable);
    document.getElementById('admin-user-search').addEventListener('input', renderAdminUsersTable);

    // Salesrep role toggle: show/hide dealer code & assigned dealers
    document.getElementById('admin-new-user-role').addEventListener('change', function () {
        var isSalesrep = this.value === 'salesrep';
        var dealerRow = document.getElementById('admin-new-user-dealer').closest('.admin-form-row');
        var assignedRow = document.getElementById('admin-new-user-assigned-dealers-row');
        if (dealerRow) dealerRow.style.display = isSalesrep ? 'none' : '';
        if (assignedRow) assignedRow.style.display = isSalesrep ? '' : 'none';
        if (isSalesrep) populateAssignedDealerCheckboxes('admin-new-user-assigned-dealers', []);
    });

    function populateAssignedDealerCheckboxes(containerId, selected) {
        var container = document.getElementById(containerId);
        if (!container) return;
        var createSelect = document.getElementById('admin-new-user-dealer');
        var codes = [];
        if (createSelect) {
            for (var i = 0; i < createSelect.options.length; i++) {
                var c = createSelect.options[i].value;
                if (c && c !== 'SALESREP') codes.push(c);
            }
        }
        var html = '';
        codes.forEach(function (code) {
            var checked = selected.indexOf(code) !== -1 ? ' checked' : '';
            html += '<label style="display:inline-flex;align-items:center;gap:0.25rem;padding:0.25rem 0.5rem;background:#f3f4f6;border-radius:6px;font-size:0.82rem;cursor:pointer;">' +
                '<input type="checkbox" value="' + esc(code) + '"' + checked + ' style="margin:0;">' +
                '<span>' + esc(code) + '</span></label>';
        });
        if (codes.length === 0) html = '<span style="color:#6b7280;font-size:0.82rem;">No dealers available</span>';
        container.innerHTML = html;
    }

    function getCheckedDealers(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return [];
        var checked = [];
        container.querySelectorAll('input[type="checkbox"]:checked').forEach(function (cb) {
            checked.push(cb.value);
        });
        return checked;
    }

    document.getElementById('admin-create-user-btn').addEventListener('click', function () {
        var role = document.getElementById('admin-new-user-role').value;
        var isSalesrep = role === 'salesrep';
        var dealerCode = isSalesrep ? '' : document.getElementById('admin-new-user-dealer').value;
        var username = document.getElementById('admin-new-user-username').value.trim().toLowerCase();
        var displayName = document.getElementById('admin-new-user-display').value.trim();
        var pw = document.getElementById('admin-new-user-pw').value;
        var email = document.getElementById('admin-new-user-email').value.trim();
        var phone = document.getElementById('admin-new-user-phone').value.trim();

        if (!isSalesrep && !dealerCode) { showAlert('admin-user-alert', 'Please select a dealer code', 'error'); return; }
        if (!username || username.length < 3) { showAlert('admin-user-alert', 'Username must be at least 3 characters', 'error'); return; }
        if (!pw || pw.length < 8) { showAlert('admin-user-alert', 'Password must be at least 8 characters', 'error'); return; }

        var payload = {
            dealerCode: dealerCode,
            role: role,
            username: username,
            displayName: displayName || username,
            password: pw,
            email: email,
            phone: phone
        };

        if (isSalesrep) {
            payload.assignedDealers = getCheckedDealers('admin-new-user-assigned-dealers');
        }

        _api('POST', '/api/admin/users', payload)
            .then(function (newUser) {
                showAlert('admin-user-alert', 'User "' + esc(newUser.username) + '" created' + (isSalesrep ? ' as Sales Rep' : ' for ' + esc(newUser.dealerCode)) + '!', 'success');
                document.getElementById('admin-new-user-username').value = '';
                document.getElementById('admin-new-user-display').value = '';
                document.getElementById('admin-new-user-pw').value = '';
                document.getElementById('admin-new-user-email').value = '';
                document.getElementById('admin-new-user-phone').value = '';
                document.getElementById('admin-new-user-role').value = 'frontdesk';
                document.getElementById('admin-new-user-assigned-dealers-row').style.display = 'none';
                var dealerRow = document.getElementById('admin-new-user-dealer').closest('.admin-form-row');
                if (dealerRow) dealerRow.style.display = '';
                document.getElementById('admin-add-user-details').removeAttribute('open');
                loadAdminUsers();
            })
            .catch(function (err) { showAlert('admin-user-alert', 'Failed: ' + esc(err.message), 'error'); });
    });

    function editAdminUser(id) {
        var user = _allUsers.find(function (u) { return u.id === id; });
        if (!user) return;

        var isSalesrep = user.role === 'salesrep';

        // Build dealer code options from the create-user dropdown
        var dealerOpts = '';
        var allCodes = [];
        var createSelect = document.getElementById('admin-new-user-dealer');
        if (createSelect) {
            for (var i = 0; i < createSelect.options.length; i++) {
                var code = createSelect.options[i].value;
                if (code) allCodes.push(code);
                dealerOpts += '<option value="' + esc(code) + '"' + (code === user.dealerCode ? ' selected' : '') + '>' + esc(code) + '</option>';
            }
        }

        var roleOptions = [
            { value: 'frontdesk', label: 'Frontdesk (Sales Rep)' },
            { value: 'gm', label: 'GM (General Manager)' },
            { value: 'salesrep', label: 'Sales Rep (Territory)' },
            { value: 'dealer', label: 'Dealer (Legacy)' },
            { value: 'rep', label: 'Internal Rep' },
            { value: 'admin', label: 'Admin' }
        ];
        var roleOpts = '';
        roleOptions.forEach(function (r) {
            roleOpts += '<option value="' + r.value + '"' + (r.value === user.role ? ' selected' : '') + '>' + r.label + '</option>';
        });

        // Build assigned dealers checkboxes
        var currentAssigned = (user.assignedDealers || []);
        var assignedHtml = '';
        allCodes.forEach(function (c) {
            if (c === 'SALESREP') return;
            var checked = currentAssigned.indexOf(c) !== -1 ? ' checked' : '';
            assignedHtml += '<label style="display:inline-flex;align-items:center;gap:0.25rem;padding:0.25rem 0.5rem;background:#f3f4f6;border-radius:6px;font-size:0.82rem;cursor:pointer;">' +
                '<input type="checkbox" class="edit-user-assigned-cb" value="' + esc(c) + '"' + checked + ' style="margin:0;">' +
                '<span>' + esc(c) + '</span></label>';
        });

        // Create modal overlay
        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
        overlay.innerHTML =
            '<div style="background:#fff;border-radius:12px;padding:1.5rem;max-width:480px;width:90%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">' +
                '<h3 style="margin:0 0 1rem;color:#1e40af;">Edit User: ' + esc(user.username) + '</h3>' +
                '<div style="display:grid;gap:0.75rem;">' +
                    '<div id="edit-user-dealer-row"' + (isSalesrep ? ' style="display:none;"' : '') + '><label style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:0.25rem;">Dealer Code</label>' +
                        '<select id="edit-user-dealer" style="width:100%;padding:0.4rem;border:1px solid #d1d5db;border-radius:6px;text-transform:uppercase;">' + dealerOpts + '</select></div>' +
                    '<div><label style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:0.25rem;">Role</label>' +
                        '<select id="edit-user-role" style="width:100%;padding:0.4rem;border:1px solid #d1d5db;border-radius:6px;">' + roleOpts + '</select></div>' +
                    '<div id="edit-user-assigned-row"' + (isSalesrep ? '' : ' style="display:none;"') + '>' +
                        '<label style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:0.25rem;">Assigned Dealers</label>' +
                        '<div id="edit-user-assigned-dealers" style="display:flex;flex-wrap:wrap;gap:0.5rem;padding:0.5rem;border:1px solid #e5e7eb;border-radius:8px;min-height:40px;">' + assignedHtml + '</div>' +
                    '</div>' +
                    '<div><label style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:0.25rem;">Username</label>' +
                        '<input type="text" id="edit-user-username" value="' + esc(user.username || '') + '" style="width:100%;padding:0.4rem;border:1px solid #d1d5db;border-radius:6px;box-sizing:border-box;"></div>' +
                    '<div><label style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:0.25rem;">Display Name</label>' +
                        '<input type="text" id="edit-user-display" value="' + esc(user.displayName || '') + '" style="width:100%;padding:0.4rem;border:1px solid #d1d5db;border-radius:6px;box-sizing:border-box;"></div>' +
                    '<div><label style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:0.25rem;">Password <span style="font-weight:400;color:#6b7280;">(leave blank to keep existing)</span></label>' +
                        '<input type="password" id="edit-user-pw" placeholder="New password (min 8 chars)" style="width:100%;padding:0.4rem;border:1px solid #d1d5db;border-radius:6px;box-sizing:border-box;"></div>' +
                    '<div><label style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:0.25rem;">Email <span style="font-weight:400;color:#6b7280;">(optional)</span></label>' +
                        '<input type="email" id="edit-user-email" value="' + esc(user.email || '') + '" style="width:100%;padding:0.4rem;border:1px solid #d1d5db;border-radius:6px;box-sizing:border-box;"></div>' +
                    '<div><label style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:0.25rem;">Phone <span style="font-weight:400;color:#6b7280;">(optional)</span></label>' +
                        '<input type="tel" id="edit-user-phone" value="' + esc(user.phone || '') + '" style="width:100%;padding:0.4rem;border:1px solid #d1d5db;border-radius:6px;box-sizing:border-box;"></div>' +
                '</div>' +
                '<div style="display:flex;gap:0.75rem;justify-content:flex-end;margin-top:1.25rem;">' +
                    '<button id="edit-user-cancel" style="padding:0.5rem 1rem;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;">Cancel</button>' +
                    '<button id="edit-user-save" style="padding:0.5rem 1rem;border:none;border-radius:6px;background:#2563eb;color:#fff;cursor:pointer;font-weight:600;">Save Changes</button>' +
                '</div>' +
            '</div>';

        document.body.appendChild(overlay);

        // Toggle dealer code / assigned dealers when role changes
        document.getElementById('edit-user-role').addEventListener('change', function () {
            var sr = this.value === 'salesrep';
            document.getElementById('edit-user-dealer-row').style.display = sr ? 'none' : '';
            document.getElementById('edit-user-assigned-row').style.display = sr ? '' : 'none';
        });

        // Close on overlay click (outside modal)
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) document.body.removeChild(overlay);
        });

        document.getElementById('edit-user-cancel').addEventListener('click', function () {
            document.body.removeChild(overlay);
        });

        document.getElementById('edit-user-save').addEventListener('click', function () {
            var pw = document.getElementById('edit-user-pw').value;
            var username = document.getElementById('edit-user-username').value.trim().toLowerCase();
            var editRole = document.getElementById('edit-user-role').value;
            var editIsSalesrep = editRole === 'salesrep';

            if (!username || username.length < 3) {
                showAlert('admin-user-alert', 'Username must be at least 3 characters', 'error');
                return;
            }
            if (pw && pw.length < 8) {
                showAlert('admin-user-alert', 'Password must be at least 8 characters', 'error');
                return;
            }

            var payload = {
                role: editRole,
                username: username,
                displayName: document.getElementById('edit-user-display').value.trim(),
                email: document.getElementById('edit-user-email').value.trim(),
                phone: document.getElementById('edit-user-phone').value.trim()
            };

            if (editIsSalesrep) {
                var checked = [];
                overlay.querySelectorAll('.edit-user-assigned-cb:checked').forEach(function (cb) {
                    checked.push(cb.value);
                });
                payload.assignedDealers = checked;
            } else {
                payload.dealerCode = document.getElementById('edit-user-dealer').value;
            }

            if (pw) payload.password = pw;

            _api('PUT', '/api/admin/users/' + id, payload)
                .then(function () {
                    document.body.removeChild(overlay);
                    showAlert('admin-user-alert', 'User updated!', 'success');
                    loadAdminUsers();
                })
                .catch(function (err) {
                    showAlert('admin-user-alert', 'Update failed: ' + esc(err.message), 'error');
                });
        });
    }

    function resetAdminUserPassword(id) {
        var user = _allUsers.find(function (u) { return u.id === id; });
        if (!user) return;
        var newPw = prompt('New password for ' + user.username + ' (min 8 chars):');
        if (!newPw) return;
        if (newPw.length < 8) { showAlert('admin-user-alert', 'Password must be at least 8 characters', 'error'); return; }

        _api('POST', '/api/admin/users/' + id + '/reset-password', { newPassword: newPw })
            .then(function () { showAlert('admin-user-alert', 'Password reset for ' + user.username + '!', 'success'); })
            .catch(function (err) { showAlert('admin-user-alert', 'Reset failed: ' + esc(err.message), 'error'); });
    }

    function toggleAdminUser(id) {
        var user = _allUsers.find(function (u) { return u.id === id; });
        if (!user) return;
        var action = user.status === 'active' ? 'disable' : 'enable';
        if (!confirm('Are you sure you want to ' + action + ' user "' + user.username + '" (' + user.dealerCode + ')?')) return;

        _api('POST', '/api/admin/users/' + id + '/' + action)
            .then(function () { showAlert('admin-user-alert', 'User ' + user.username + ' ' + action + 'd!', 'success'); loadAdminUsers(); })
            .catch(function (err) { showAlert('admin-user-alert', 'Failed: ' + esc(err.message), 'error'); });
    }


    // ----------------------------------------------------------
    // REP PRICING MODAL
    // ----------------------------------------------------------
    function openRepPricing(userId) {
        var user = _allUsers.find(function (u) { return u.id === userId; });
        if (!user || user.role !== 'salesrep') return;

        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
        overlay.innerHTML =
            '<div style="background:#fff;border-radius:12px;padding:1.5rem;max-width:640px;width:90%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">' +
                '<h3 style="margin:0 0 0.25rem;color:#a21caf;">Rep Pricing: ' + esc(user.displayName || user.username) + '</h3>' +
                '<p style="margin:0 0 1rem;font-size:0.82rem;color:#6b7280;">Set custom pricing for direct sales. Leave at base price for no override.</p>' +
                '<div id="rep-pricing-body" style="min-height:100px;"><div class="admin-loading">Loading products...</div></div>' +
                '<div id="rep-pricing-alert" style="margin-top:0.5rem;"></div>' +
                '<div style="display:flex;gap:0.75rem;justify-content:flex-end;margin-top:1.25rem;">' +
                    '<button id="rep-pricing-cancel" style="padding:0.5rem 1rem;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;">Cancel</button>' +
                    '<button id="rep-pricing-reset" style="padding:0.5rem 1rem;border:1px solid #d1d5db;border-radius:6px;background:#fef3c7;cursor:pointer;font-weight:600;color:#92400e;">Reset All to Base</button>' +
                    '<button id="rep-pricing-save" style="padding:0.5rem 1rem;border:none;border-radius:6px;background:#a21caf;color:#fff;cursor:pointer;font-weight:600;">Save Pricing</button>' +
                '</div>' +
            '</div>';

        document.body.appendChild(overlay);

        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) document.body.removeChild(overlay);
        });
        document.getElementById('rep-pricing-cancel').addEventListener('click', function () {
            document.body.removeChild(overlay);
        });

        // Load pricing data
        _api('GET', '/api/admin/rep-pricing/' + userId)
            .then(function (data) {
                var body = document.getElementById('rep-pricing-body');
                if (!data.products || data.products.length === 0) {
                    body.innerHTML = '<div class="admin-empty">No products available</div>';
                    return;
                }
                var html = '<div class="admin-table-wrap" style="overflow-x:auto;-webkit-overflow-scrolling:touch"><table class="admin-table"><thead><tr>' +
                    '<th>Product</th><th>Category</th><th>Base Price</th><th>Rep Price</th><th>Custom?</th>' +
                    '</tr></thead><tbody>';
                data.products.forEach(function (p) {
                    var customClass = p.hasCustomPrice ? 'style="background:#fdf4ff;"' : '';
                    html += '<tr ' + customClass + '>' +
                        '<td><strong>' + esc(p.productName) + '</strong></td>' +
                        '<td><span class="admin-badge badge-' + (p.category || 'other').toLowerCase() + '">' + esc(p.category || '-') + '</span></td>' +
                        '<td style="color:#6b7280;">$' + Number(p.basePrice).toFixed(2) + '</td>' +
                        '<td><input type="number" class="rep-price-input" data-product="' + esc(p.productId) + '" ' +
                            'data-base="' + p.basePrice + '" ' +
                            'value="' + Number(p.repPrice).toFixed(2) + '" ' +
                            'step="0.01" min="0" ' +
                            'style="width:90px;padding:0.3rem 0.5rem;border:1px solid #d1d5db;border-radius:6px;font-size:0.85rem;text-align:right;"></td>' +
                        '<td>' + (p.hasCustomPrice ? '<span style="color:#a21caf;font-weight:600;font-size:0.78rem;">CUSTOM</span>' : '<span style="color:#9ca3af;font-size:0.78rem;">base</span>') + '</td>' +
                        '</tr>';
                });
                html += '</tbody></table></div>';
                body.innerHTML = html;

                // Highlight changes from base
                body.querySelectorAll('.rep-price-input').forEach(function (inp) {
                    inp.addEventListener('input', function () {
                        var base = parseFloat(inp.getAttribute('data-base'));
                        var val = parseFloat(inp.value);
                        if (!isNaN(val) && Math.abs(val - base) > 0.001) {
                            inp.style.borderColor = '#a21caf';
                            inp.style.background = '#fdf4ff';
                        } else {
                            inp.style.borderColor = '#d1d5db';
                            inp.style.background = '';
                        }
                    });
                });
            })
            .catch(function (err) {
                document.getElementById('rep-pricing-body').innerHTML = '<div class="admin-error">Failed to load pricing: ' + esc(err.message) + '</div>';
            });

        // Reset all to base price
        document.getElementById('rep-pricing-reset').addEventListener('click', function () {
            overlay.querySelectorAll('.rep-price-input').forEach(function (inp) {
                inp.value = Number(inp.getAttribute('data-base')).toFixed(2);
                inp.style.borderColor = '#d1d5db';
                inp.style.background = '';
            });
        });

        // Save pricing
        document.getElementById('rep-pricing-save').addEventListener('click', function () {
            var inputs = overlay.querySelectorAll('.rep-price-input');
            var pricing = {};
            var hasError = false;
            inputs.forEach(function (inp) {
                var val = parseFloat(inp.value);
                if (isNaN(val) || val < 0) {
                    hasError = true;
                    inp.style.borderColor = '#dc2626';
                } else {
                    pricing[inp.getAttribute('data-product')] = Math.round(val * 100) / 100;
                }
            });
            if (hasError) {
                showAlert('rep-pricing-alert', 'Please fix invalid prices (highlighted in red)', 'error');
                return;
            }

            _api('PUT', '/api/admin/rep-pricing/' + userId, { pricing: pricing })
                .then(function (result) {
                    document.body.removeChild(overlay);
                    showAlert('admin-user-alert', 'Pricing updated for ' + esc(user.displayName || user.username) + ' (' + (result.productCount || Object.keys(pricing).length) + ' products)', 'success');
                })
                .catch(function (err) {
                    showAlert('rep-pricing-alert', 'Save failed: ' + esc(err.message), 'error');
                });
        });
    }


    // ----------------------------------------------------------
    // COLORS TAB
    // ----------------------------------------------------------
    var _allColors = [];
    var _systemBoardPricing = null;

    function loadColors() {
        var container = document.getElementById('admin-colors-list');
        container.innerHTML = '<div class="admin-loading">Loading colors...</div>';

        var promises = [_api('GET', '/api/admin/colors')];
        if (!_systemBoardPricing) {
            promises.push(_api('GET', '/api/admin/products'));
        }

        Promise.all(promises).then(function(results) {
            _allColors = results[0];
            if (results[1]) {
                var system = results[1].find(function(p) { return p.id === 'system'; });
                _systemBoardPricing = (system && system.colorPricing) ? system.colorPricing : {};
            }
            renderColorsTable();
        }).catch(function(err) {
            container.innerHTML = '<div class="admin-error">Failed: ' + esc(err.message) + '</div>';
        });
    }

    function renderColorsTable() {
        var container = document.getElementById('admin-colors-list');
        var search = (document.getElementById('admin-color-search').value || '').toLowerCase();
        var filtered = _allColors.filter(function (c) {
            return (c.name || '').toLowerCase().indexOf(search) !== -1 || (c.tier || '').toLowerCase().indexOf(search) !== -1;
        });
        if (filtered.length === 0) { container.innerHTML = '<div class="admin-empty">No colors found</div>'; return; }

        var html = '<div class="admin-table-wrap" style="overflow-x:auto;-webkit-overflow-scrolling:touch"><table class="admin-table"><thead><tr>' +
            '<th>Color Name</th><th>Image</th><th>Tier</th><th>System Price</th><th>Status</th><th>Sort Order</th><th>Actions</th></tr></thead><tbody>';

        filtered.forEach(function (c) {
            var sysPrice = (_systemBoardPricing && _systemBoardPricing[c.id] !== undefined)
                ? '$' + Number(_systemBoardPricing[c.id]).toFixed(2) + '/ft'
                : 'N/A';
            html += '<tr>' +
                '<td><strong>' + esc(c.name) + '</strong></td>' +
                '<td><img src="colors/' + esc(c.image) + '" style="width:40px;height:30px;border-radius:4px;object-fit:cover;" onerror="this.style.display=\'none\'"></td>' +
                '<td><span class="admin-badge badge-' + (c.tier === 'variegated' ? 'variegated' : 'solid') + '">' + esc(c.tier) + '</span></td>' +
                '<td style="font-weight:600;color:#1e40af;">' + sysPrice + '</td>' +
                '<td><span class="admin-badge badge-' + (c.isActive ? 'active' : 'inactive') + '">' + (c.isActive ? 'Active' : 'Inactive') + '</span></td>' +
                '<td>' + (c.sortOrder || 0) + '</td>' +
                '<td class="admin-actions">' +
                    '<button class="admin-btn admin-btn-ghost admin-btn-sm" data-action="edit-color" data-id="' + escAttr(c.id) + '">Edit</button>' +
                    '<button class="admin-btn admin-btn-danger admin-btn-sm" data-action="delete-color" data-id="' + escAttr(c.id) + '">Delete</button>' +
                '</td></tr>';
        });

        html += '</tbody></table></div>';
        container.innerHTML = html;

        container.querySelectorAll('[data-action]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var action = btn.getAttribute('data-action');
                var id = btn.getAttribute('data-id');
                if (action === 'edit-color') editColor(id);
                if (action === 'delete-color') deleteColor(id);
            });
        });
    }

    document.getElementById('admin-color-search').addEventListener('input', renderColorsTable);

    document.getElementById('add-color-btn').addEventListener('click', function () {
        var name = document.getElementById('new-color-name').value.trim();
        var image = document.getElementById('new-color-image').value.trim();
        var tier = document.getElementById('new-color-tier').value;
        if (!name) { showAlert('admin-colors-alert', 'Color name required', 'error'); return; }
        if (!image) image = name + '.png';
        _api('POST', '/api/admin/colors', { name: name, image: image, tier: tier, sortOrder: _allColors.length + 1 })
            .then(function () {
                document.getElementById('new-color-name').value = '';
                document.getElementById('new-color-image').value = '';
                showAlert('admin-colors-alert', 'Color "' + name + '" added', 'success');
                loadColors();
            })
            .catch(function (err) { showAlert('admin-colors-alert', err.message, 'error'); });
    });

    function editColor(id) {
        var color = _allColors.find(function (c) { return c.id === id; });
        if (!color) return;
        var newName = prompt('Color name:', color.name);
        if (newName === null) return;
        var newTier = prompt('Tier (solid or variegated):', color.tier);
        if (newTier === null) return;
        var newImage = prompt('Image filename:', color.image);
        if (newImage === null) return;
        _api('PUT', '/api/admin/colors/' + encodeURIComponent(id), { name: newName.trim(), tier: newTier.trim(), image: newImage.trim() })
            .then(function () { showAlert('admin-colors-alert', 'Color updated', 'success'); loadColors(); })
            .catch(function (err) { showAlert('admin-colors-alert', err.message, 'error'); });
    }

    function deleteColor(id) {
        if (!confirm('Delete this color? This will remove it from all products.')) return;
        _api('DELETE', '/api/admin/colors/' + encodeURIComponent(id))
            .then(function () { showAlert('admin-colors-alert', 'Color deleted', 'success'); loadColors(); })
            .catch(function (err) { showAlert('admin-colors-alert', err.message, 'error'); });
    }


    // ----------------------------------------------------------
    // CATEGORIES TAB
    // ----------------------------------------------------------
    var _allCategories = [];

    function loadCategories() {
        var container = document.getElementById('admin-categories-list');
        container.innerHTML = '<div class="admin-loading">Loading categories...</div>';
        _api('GET', '/api/admin/categories')
            .then(function (cats) { _allCategories = cats; renderCategoriesTable(); })
            .catch(function (err) { container.innerHTML = '<div class="admin-error">Failed: ' + esc(err.message) + '</div>'; });
    }

    function renderCategoriesTable() {
        var container = document.getElementById('admin-categories-list');
        if (_allCategories.length === 0) { container.innerHTML = '<div class="admin-empty">No categories found</div>'; return; }

        var html = '<div class="admin-table-wrap" style="overflow-x:auto;-webkit-overflow-scrolling:touch"><table class="admin-table"><thead><tr>' +
            '<th>Slug</th><th>Label</th><th>Sort Order</th><th>Status</th><th>Actions</th></tr></thead><tbody>';

        _allCategories.forEach(function (c) {
            html += '<tr>' +
                '<td><code>' + esc(c.slug) + '</code></td>' +
                '<td>' + esc(c.label) + '</td>' +
                '<td>' + (c.sortOrder || 0) + '</td>' +
                '<td><span class="admin-badge badge-' + (c.isActive !== false ? 'active' : 'inactive') + '">' + (c.isActive !== false ? 'Active' : 'Inactive') + '</span></td>' +
                '<td class="admin-actions">' +
                    '<button class="admin-btn admin-btn-ghost admin-btn-sm" data-action="edit-cat" data-slug="' + escAttr(c.slug) + '">Edit</button>' +
                    (c.slug !== 'custom' ? '<button class="admin-btn admin-btn-danger admin-btn-sm" data-action="delete-cat" data-slug="' + escAttr(c.slug) + '">Delete</button>' : '') +
                '</td></tr>';
        });

        html += '</tbody></table></div>';
        container.innerHTML = html;

        container.querySelectorAll('[data-action]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var action = btn.getAttribute('data-action');
                var slug = btn.getAttribute('data-slug');
                if (action === 'edit-cat') editCategory(slug);
                if (action === 'delete-cat') deleteCategory(slug);
            });
        });
    }

    document.getElementById('add-cat-btn').addEventListener('click', function () {
        var slug = document.getElementById('new-cat-slug').value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
        var label = document.getElementById('new-cat-label').value.trim();
        if (!slug || !label) { showAlert('admin-categories-alert', 'Slug and label required', 'error'); return; }
        _api('POST', '/api/admin/categories', { slug: slug, label: label, sortOrder: _allCategories.length + 1 })
            .then(function () {
                document.getElementById('new-cat-slug').value = '';
                document.getElementById('new-cat-label').value = '';
                showAlert('admin-categories-alert', 'Category "' + label + '" added', 'success');
                loadCategories();
            })
            .catch(function (err) { showAlert('admin-categories-alert', err.message, 'error'); });
    });

    function editCategory(slug) {
        var cat = _allCategories.find(function (c) { return c.slug === slug; });
        if (!cat) return;
        var newLabel = prompt('Category label:', cat.label);
        if (newLabel === null) return;
        _api('PUT', '/api/admin/categories/' + encodeURIComponent(slug), { label: newLabel.trim() })
            .then(function () { showAlert('admin-categories-alert', 'Category updated', 'success'); loadCategories(); })
            .catch(function (err) { showAlert('admin-categories-alert', err.message, 'error'); });
    }

    function deleteCategory(slug) {
        if (!confirm('Delete category "' + slug + '"? Only works if no products use it.')) return;
        _api('DELETE', '/api/admin/categories/' + encodeURIComponent(slug))
            .then(function () { showAlert('admin-categories-alert', 'Category deleted', 'success'); loadCategories(); })
            .catch(function (err) { showAlert('admin-categories-alert', err.message, 'error'); });
    }


    console.log('[AmeriDex Admin] v2.4 loaded - colors and categories tabs added.');
})();
