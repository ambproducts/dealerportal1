// ============================================================
// AmeriDex Dealer Portal - Admin Panel v1.3
// Date: 2026-02-14
// ============================================================
// REQUIRES: ameridex-api.js (v2.1+) loaded first
//
// Load order in dealer-portal.html (before </body>):
//   <script src="ameridex-patches.js"></script>
//   <script src="ameridex-api.js"></script>
//   <script src="ameridex-admin.js"></script>
//
// v1.3 Changes (2026-02-14):
//   - FIX: Replace 18 placeholder products (index tabs, binders)
//     with real AmeriDex decking product catalog (7 products)
//   - FIX: Pricing tier preview now shows correct product names/prices
//   - Custom/Manual Item excluded from pricing preview (always $0)
//
// v1.2 Changes (2026-02-14):
//   - FIX: Add Dealer password field changed from type='text'
//     to type='password' so credentials are masked on screen.
//
// v1.1 Changes (2026-02-14):
//   - FIX: Pricing tier GET/PUT uses /api/admin/pricing-tiers
//   - FIX: Save pricing iterates per-tier PUT instead of bulk
//   - ADD: Pricing tab loads product catalog for computed price preview
//   - ADD: Username field in Add Dealer form
//   - ADD: Username column in dealers table
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
        '.admin-tabs { display:flex; background:#f9fafb; border-bottom:1px solid #e5e7eb; }' +
        '.admin-tab { flex:1; padding:0.85rem 1rem; border:none; background:transparent; font-size:0.9rem; ' +
            'font-weight:600; color:#6b7280; cursor:pointer; transition:all 0.15s; border-bottom:3px solid transparent; }' +
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
        '.admin-loading { text-align:center; padding:2rem; color:#6b7280; }' +
        '.admin-error { background:#fee2e2; color:#dc2626; padding:0.75rem 1rem; border-radius:8px; font-size:0.88rem; margin-bottom:1rem; }' +
        '.admin-success { background:#dcfce7; color:#16a34a; padding:0.75rem 1rem; border-radius:8px; font-size:0.88rem; margin-bottom:1rem; }' +
        '@media (max-width:768px) { ' +
            '#admin-panel { max-width:100%; margin:0; border-radius:10px; } ' +
            '.admin-form-row { grid-template-columns:1fr; } ' +
            '.admin-tier-products { grid-template-columns:1fr; } ' +
            '.admin-toolbar { flex-direction:column; align-items:stretch; } ' +
            '.admin-table { font-size:0.8rem; } ' +
            '.admin-table th, .admin-table td { padding:0.5rem; } ' +
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
                '<button class="admin-tab active" data-tab="dealers">Manage Dealers</button>' +
                '<button class="admin-tab" data-tab="quotes">All Quotes</button>' +
                '<button class="admin-tab" data-tab="pricing">Pricing Tiers</button>' +
            '</div>' +
            '<div class="admin-body">' +

                // ---- DEALERS TAB ----
                '<div class="admin-tab-content active" id="admin-tab-dealers">' +
                    '<div id="admin-dealers-stats" class="admin-stat-row"></div>' +
                    '<div id="admin-dealer-alert"></div>' +

                    // Add Dealer Form (with Username field)
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
                                    '<div style="font-size:0.75rem;color:#6b7280;margin-top:0.2rem;">Login username for General Manager. Leave blank to auto-generate from dealer code.</div>' +
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

                    // Dealers Table
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

                // ---- PRICING TAB ----
                '<div class="admin-tab-content" id="admin-tab-pricing">' +
                    '<div id="admin-pricing-alert"></div>' +
                    '<div class="admin-toolbar">' +
                        '<h3>Pricing Tiers</h3>' +
                        '<button type="button" class="admin-btn admin-btn-primary" id="admin-save-pricing-btn">Save All Changes</button>' +
                    '</div>' +
                    '<p style="font-size:0.85rem;color:#6b7280;margin-top:-0.5rem;margin-bottom:1rem;">Edit the multiplier for each tier. Product prices shown are base price &times; multiplier (preview only, computed automatically).</p>' +
                    '<div id="admin-pricing-list"><div class="admin-loading">Loading pricing...</div></div>' +
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
            if (tabName === 'pricing') loadPricingTiers();
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
    var _pricingTiers = [];
    var _baseProducts = [];

    function showAlert(containerId, msg, type) {
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

        var html = '<table class="admin-table"><thead><tr>' +
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

        html += '</tbody></table>';
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

    // Create Dealer (with username field)
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

        if (!code || code.length !== 6) {
            showAlert('admin-dealer-alert', 'Dealer code must be exactly 6 characters', 'error');
            return;
        }
        if (!pw || pw.length < 8) {
            showAlert('admin-dealer-alert', 'Password must be at least 8 characters', 'error');
            return;
        }

        var payload = {
            dealerCode: code,
            password: pw,
            dealerName: name,
            contactPerson: contact,
            email: email,
            phone: phone,
            role: role,
            pricingTier: tier
        };

        // Include username if provided (backend will use it for GM user)
        if (username) {
            payload.username = username;
        }

        _api('POST', '/api/admin/dealers', payload)
            .then(function (result) {
                // Response may include { dealer, gmUser } or just the dealer
                var gmInfo = '';
                if (result.gmUser) {
                    gmInfo = '<br>GM Login: <strong>' + esc(result.gmUser.username) + '</strong> (role: ' + esc(result.gmUser.role) + ')';
                }
                showAlert('admin-dealer-alert', 'Dealer ' + code + ' created!' + gmInfo, 'success');

                // Clear form
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
            .catch(function (err) {
                showAlert('admin-dealer-alert', 'Failed: ' + esc(err.message), 'error');
            });
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

        _api('PUT', '/api/admin/dealers/' + id, {
            dealerName: newName,
            pricingTier: newTier,
            role: newRole
        }).then(function () {
            showAlert('admin-dealer-alert', 'Dealer updated!', 'success');
            loadDealers();
        }).catch(function (err) {
            showAlert('admin-dealer-alert', 'Update failed: ' + esc(err.message), 'error');
        });
    }

    function resetDealerPassword(id) {
        var dealer = _allDealers.find(function (d) { return d.id === id; });
        if (!dealer) return;

        var newPw = prompt('New password for ' + dealer.dealerCode + ' (min 8 chars):');
        if (!newPw) return;
        if (newPw.length < 8) {
            showAlert('admin-dealer-alert', 'Password must be at least 8 characters', 'error');
            return;
        }

        _api('POST', '/api/admin/dealers/' + id + '/change-password', {
            newPassword: newPw
        }).then(function () {
            showAlert('admin-dealer-alert', 'Password reset for ' + dealer.dealerCode + '!', 'success');
        }).catch(function (err) {
            showAlert('admin-dealer-alert', 'Reset failed: ' + esc(err.message), 'error');
        });
    }

    function toggleDealerActive(id) {
        var dealer = _allDealers.find(function (d) { return d.id === id; });
        if (!dealer) return;

        var action = dealer.isActive ? 'disable' : 'enable';
        if (!confirm('Are you sure you want to ' + action + ' dealer ' + dealer.dealerCode + '?')) return;

        _api('PUT', '/api/admin/dealers/' + id, {
            isActive: !dealer.isActive
        }).then(function () {
            showAlert('admin-dealer-alert', 'Dealer ' + dealer.dealerCode + ' ' + action + 'd!', 'success');
            loadDealers();
        }).catch(function (err) {
            showAlert('admin-dealer-alert', 'Failed: ' + esc(err.message), 'error');
        });
    }


    // ----------------------------------------------------------
    // QUOTES TAB
    // ----------------------------------------------------------
    function loadAllQuotes() {
        var container = document.getElementById('admin-quotes-list');
        container.innerHTML = '<div class="admin-loading">Loading quotes...</div>';

        _api('GET', '/api/admin/quotes')
            .then(function (quotes) {
                _allQuotes = quotes;
                renderQuoteStats();
                populateDealerFilter();
                renderQuotesTable();
            })
            .catch(function (err) {
                container.innerHTML = '<div class="admin-error">Failed to load quotes: ' + esc(err.message) + '</div>';
            });
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
        var dealerCodes = [];
        _allQuotes.forEach(function (q) {
            if (q.dealerCode && dealerCodes.indexOf(q.dealerCode) === -1) {
                dealerCodes.push(q.dealerCode);
            }
        });
        select.innerHTML = '<option value="">All Dealers</option>';
        dealerCodes.sort().forEach(function (code) {
            select.innerHTML += '<option value="' + code + '">' + code + '</option>';
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
                var haystack = ((q.quoteNumber || '') + (q.customer && q.customer.name || '') +
                    (q.customer && q.customer.company || '') + (q.dealerCode || '')).toLowerCase();
                if (!haystack.includes(search)) return false;
            }
            return true;
        });

        filtered.sort(function (a, b) {
            return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
        });

        if (filtered.length === 0) {
            container.innerHTML = '<div class="admin-empty">No quotes match your filters</div>';
            return;
        }

        var html = '<table class="admin-table"><thead><tr>' +
            '<th>Quote #</th><th>Dealer</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th><th>Date</th><th>Actions</th>' +
            '</tr></thead><tbody>';

        filtered.forEach(function (q) {
            var dateStr = '';
            try { dateStr = new Date(q.updatedAt || q.createdAt).toLocaleDateString(); } catch(e) {}
            var custName = (q.customer && q.customer.name) || 'N/A';
            var custCompany = (q.customer && q.customer.company) || '';
            var itemCount = (q.lineItems || []).length;

            html += '<tr>' +
                '<td><strong>' + esc(q.quoteNumber || q.id) + '</strong></td>' +
                '<td>' + esc(q.dealerCode || 'N/A') + '</td>' +
                '<td>' + esc(custName) + (custCompany ? '<br><span style="font-size:0.78rem;color:#6b7280;">' + esc(custCompany) + '</span>' : '') + '</td>' +
                '<td style="text-align:center;">' + itemCount + '</td>' +
                '<td style="text-align:right;font-weight:600;">$' + (q.totalAmount || 0).toFixed(2) + '</td>' +
                '<td>' +
                    '<select class="admin-status-select" data-quote-id="' + q.id + '">' +
                        '<option value="draft"' + (q.status === 'draft' ? ' selected' : '') + '>Draft</option>' +
                        '<option value="submitted"' + (q.status === 'submitted' ? ' selected' : '') + '>Submitted</option>' +
                        '<option value="reviewed"' + (q.status === 'reviewed' ? ' selected' : '') + '>Reviewed</option>' +
                        '<option value="approved"' + (q.status === 'approved' ? ' selected' : '') + '>Approved</option>' +
                        '<option value="rejected"' + (q.status === 'rejected' ? ' selected' : '') + '>Rejected</option>' +
                        '<option value="revision"' + (q.status === 'revision' ? ' selected' : '') + '>Revision</option>' +
                    '</select>' +
                '</td>' +
                '<td>' + dateStr + '</td>' +
                '<td class="admin-actions">' +
                    '<button class="admin-btn admin-btn-ghost admin-btn-sm" data-action="view-quote" data-id="' + q.id + '">View</button>' +
                    '<button class="admin-btn admin-btn-danger admin-btn-sm" data-action="delete-quote" data-id="' + q.id + '">Del</button>' +
                '</td></tr>';
        });

        html += '</tbody></table>';
        container.innerHTML = html;

        container.querySelectorAll('.admin-status-select').forEach(function (sel) {
            sel.addEventListener('change', function () {
                var qId = sel.getAttribute('data-quote-id');
                updateQuoteStatus(qId, sel.value);
            });
        });

        container.querySelectorAll('[data-action]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var action = btn.getAttribute('data-action');
                var id = btn.getAttribute('data-id');
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
            .catch(function (err) {
                showAlert('admin-quote-alert', 'Update failed: ' + esc(err.message), 'error');
                loadAllQuotes();
            });
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
            lineItemsHTML = '<table class="admin-line-items-table"><thead><tr>' +
                '<th>Product</th><th>Color</th><th>Length</th><th>Qty</th><th>Subtotal</th></tr></thead><tbody>';
            q.lineItems.forEach(function (li) {
                lineItemsHTML += '<tr>' +
                    '<td>' + esc(li.type || '') + '</td>' +
                    '<td>' + esc(li.color || '-') + '</td>' +
                    '<td>' + (li.length || '-') + '</td>' +
                    '<td>' + (li.qty || 0) + '</td>' +
                    '<td>$' + (typeof getItemSubtotal === 'function' ? getItemSubtotal(li).toFixed(2) : '0.00') + '</td>' +
                    '</tr>';
            });
            lineItemsHTML += '</tbody></table>';
        } else {
            lineItemsHTML = '<div style="color:#6b7280;font-size:0.88rem;">No line items</div>';
        }

        panel.innerHTML = '' +
            '<div class="admin-quote-detail">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                    '<h4>Quote: ' + esc(q.quoteNumber || q.id) + '</h4>' +
                    '<button class="admin-btn admin-btn-ghost admin-btn-sm" id="admin-close-detail">Close</button>' +
                '</div>' +
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
                (q.shippingAddress ? '<div style="margin-top:0.5rem;"><strong style="font-size:0.85rem;">Shipping:</strong><div style="font-size:0.88rem;color:#374151;margin-top:0.25rem;">' + esc(q.shippingAddress) + '</div></div>' : '') +
                '<div style="margin-top:1rem;"><strong style="font-size:0.85rem;">Line Items</strong></div>' +
                lineItemsHTML +
            '</div>';

        panel.style.display = 'block';
        panel.scrollIntoView({ behavior: 'smooth' });

        document.getElementById('admin-close-detail').addEventListener('click', function () {
            panel.style.display = 'none';
        });
    }

    function deleteAdminQuote(quoteId) {
        var q = _allQuotes.find(function (q) { return q.id === quoteId; });
        if (!q) return;
        if (!confirm('Permanently delete quote ' + (q.quoteNumber || q.id) + '? This cannot be undone.')) return;

        _api('DELETE', '/api/admin/quotes/' + quoteId)
            .then(function () {
                showAlert('admin-quote-alert', 'Quote deleted.', 'success');
                loadAllQuotes();
            })
            .catch(function (err) {
                showAlert('admin-quote-alert', 'Delete failed: ' + esc(err.message), 'error');
            });
    }

    // CSV Export
    document.getElementById('admin-export-csv-btn').addEventListener('click', function () {
        if (_allQuotes.length === 0) {
            showAlert('admin-quote-alert', 'No quotes to export', 'error');
            return;
        }

        var csv = 'Quote Number,Dealer,Customer,Company,Email,Phone,Zip,Status,Items,Total,Special Instructions,Date\n';
        _allQuotes.forEach(function (q) {
            var custName = (q.customer && q.customer.name) || '';
            var custCompany = (q.customer && q.customer.company) || '';
            var custEmail = (q.customer && q.customer.email) || '';
            var custPhone = (q.customer && q.customer.phone) || '';
            var custZip = (q.customer && q.customer.zipCode) || '';
            var dateStr = '';
            try { dateStr = new Date(q.updatedAt || q.createdAt).toISOString().split('T')[0]; } catch(e) {}

            csv += '"' + (q.quoteNumber || q.id) + '","' + (q.dealerCode || '') + '","' +
                custName.replace(/"/g, '""') + '","' + custCompany.replace(/"/g, '""') + '","' +
                custEmail + '","' + custPhone + '","' + custZip + '","' +
                (q.status || 'draft') + '",' + (q.lineItems || []).length + ',' +
                (q.totalAmount || 0).toFixed(2) + ',"' +
                (q.specialInstructions || '').replace(/"/g, '""').replace(/\n/g, ' ') + '","' + dateStr + '"\n';
        });

        var blob = new Blob([csv], { type: 'text/csv' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'ameridex-quotes-' + new Date().toISOString().split('T')[0] + '.csv';
        a.click();
        URL.revokeObjectURL(url);
        showAlert('admin-quote-alert', 'CSV exported!', 'success');
    });


    // ----------------------------------------------------------
    // PRICING TAB (v1.3: Real AmeriDex products)
    // ----------------------------------------------------------

    // Real AmeriDex product catalog for pricing preview
    // Matches PRODUCT_CONFIG in dealer-portal.html and routes/products.js
    // Custom/Manual Item excluded (always $0.00, dealer-set pricing)
    var BASE_PRODUCTS = [
        { id: 'system',   name: 'AmeriDex System Boards (Grooved + Dexerdry)', basePrice: 8.00,   unit: '/ft'   },
        { id: 'grooved',  name: 'Grooved Deck Boards (no Dexerdry)',           basePrice: 6.00,   unit: '/ft'   },
        { id: 'solid',    name: 'Solid Edge Deck Boards',                      basePrice: 6.00,   unit: '/ft'   },
        { id: 'dexerdry', name: 'Dexerdry Seals (standalone)',                  basePrice: 2.00,   unit: '/ft'   },
        { id: 'screws',   name: 'Epoxy-Coated Screws',                         basePrice: 37.00,  unit: '/box'  },
        { id: 'plugs',    name: 'Color-Matching Plugs',                        basePrice: 33.79,  unit: '/box'  },
        { id: 'blueclaw', name: 'Dexerdry BlueClaw',                           basePrice: 150.00, unit: '/each' }
    ];

    function loadPricingTiers() {
        var container = document.getElementById('admin-pricing-list');
        container.innerHTML = '<div class="admin-loading">Loading pricing tiers...</div>';

        _api('GET', '/api/admin/pricing-tiers')
            .then(function (tiers) {
                _pricingTiers = tiers;
                renderPricingTiers();
            })
            .catch(function (err) {
                container.innerHTML = '<div class="admin-error">Failed to load pricing: ' + esc(err.message) + '</div>';
            });
    }

    function renderPricingTiers() {
        var container = document.getElementById('admin-pricing-list');

        if (!_pricingTiers || _pricingTiers.length === 0) {
            container.innerHTML = '<div class="admin-empty">No pricing tiers configured</div>';
            return;
        }

        var html = '';
        _pricingTiers.forEach(function (tier, tIdx) {
            var slug = tier.slug || tier.id || 'tier-' + tIdx;
            var mult = tier.multiplier || 1;

            html += '<div class="admin-tier-card" data-tier-idx="' + tIdx + '" data-tier-slug="' + esc(slug) + '">' +
                '<div class="admin-tier-header">' +
                    '<div>' +
                        '<span class="admin-tier-name">' + esc(tier.label || slug) + '</span>' +
                        ' <span class="admin-badge badge-' + slug + '">' + slug + '</span>' +
                    '</div>' +
                    '<div class="admin-form-inline" style="gap:0.5rem;align-items:center;">' +
                        '<label style="font-size:0.82rem;font-weight:600;color:#6b7280;">Multiplier:</label>' +
                        '<input type="number" step="0.01" min="0.01" max="2" value="' + mult + '" ' +
                            'class="tier-multiplier-input" data-tier="' + tIdx + '" data-slug="' + esc(slug) + '" ' +
                            'style="width:80px;padding:0.4rem;border:1px solid #e5e7eb;border-radius:6px;font-size:0.9rem;font-weight:600;text-align:center;">' +
                        '<span class="tier-mult-preview" data-tier="' + tIdx + '" style="font-size:0.82rem;color:#6b7280;">(' + (mult * 100).toFixed(0) + '% of base)</span>' +
                    '</div>' +
                '</div>';

            // Product price preview grid
            html += '<div style="margin-top:0.5rem;margin-bottom:0.25rem;font-size:0.8rem;font-weight:600;color:#6b7280;">Product Price Preview (base &times; ' + mult + ')</div>';
            html += '<div class="admin-tier-products">';

            BASE_PRODUCTS.forEach(function (prod) {
                var computedPrice = Math.round(prod.basePrice * mult * 100) / 100;
                var showStrike = mult !== 1;
                html += '<div class="admin-tier-product">' +
                    '<span class="admin-tier-product-name">' + esc(prod.name) + '<span class="admin-tier-product-unit">' + esc(prod.unit) + '</span></span>' +
                    '<span>' +
                        (showStrike ? '<span class="admin-tier-product-base">$' + prod.basePrice.toFixed(2) + '</span>' : '') +
                        '<span class="admin-tier-product-price tier-computed-price" data-tier="' + tIdx + '" data-base="' + prod.basePrice + '">$' + computedPrice.toFixed(2) + '</span>' +
                    '</span>' +
                '</div>';
            });

            html += '</div></div>';
        });

        container.innerHTML = html;

        // Live preview: update computed prices when multiplier changes
        container.querySelectorAll('.tier-multiplier-input').forEach(function (input) {
            input.addEventListener('input', function () {
                var tIdx = input.getAttribute('data-tier');
                var newMult = parseFloat(input.value) || 1;

                // Update percentage label
                var preview = container.querySelector('.tier-mult-preview[data-tier="' + tIdx + '"]');
                if (preview) preview.textContent = '(' + (newMult * 100).toFixed(0) + '% of base)';

                // Update all computed prices for this tier
                container.querySelectorAll('.tier-computed-price[data-tier="' + tIdx + '"]').forEach(function (el) {
                    var base = parseFloat(el.getAttribute('data-base')) || 0;
                    var computed = Math.round(base * newMult * 100) / 100;
                    el.textContent = '$' + computed.toFixed(2);
                });
            });
        });
    }

    // Save pricing: iterate per-tier PUT
    document.getElementById('admin-save-pricing-btn').addEventListener('click', function () {
        var inputs = document.querySelectorAll('.tier-multiplier-input');
        if (inputs.length === 0) {
            showAlert('admin-pricing-alert', 'No tiers to save', 'error');
            return;
        }

        var saveBtn = document.getElementById('admin-save-pricing-btn');
        saveBtn.textContent = 'Saving...';
        saveBtn.disabled = true;

        var promises = [];
        inputs.forEach(function (input) {
            var slug = input.getAttribute('data-slug');
            var tIdx = parseInt(input.getAttribute('data-tier'), 10);
            var newMult = parseFloat(input.value);

            if (isNaN(newMult) || newMult <= 0 || newMult > 2) {
                return; // skip invalid
            }

            var tier = _pricingTiers[tIdx];
            if (!tier) return;

            // Only save if changed
            if (tier.multiplier !== newMult) {
                promises.push(
                    _api('PUT', '/api/admin/pricing-tiers/' + encodeURIComponent(slug), {
                        multiplier: newMult
                    }).then(function (updated) {
                        // Update local cache
                        _pricingTiers[tIdx].multiplier = updated.multiplier || newMult;
                        return slug;
                    })
                );
            }
        });

        if (promises.length === 0) {
            saveBtn.textContent = 'Save All Changes';
            saveBtn.disabled = false;
            showAlert('admin-pricing-alert', 'No changes to save', 'success');
            return;
        }

        Promise.all(promises)
            .then(function (savedSlugs) {
                saveBtn.textContent = 'Save All Changes';
                saveBtn.disabled = false;
                showAlert('admin-pricing-alert', 'Saved ' + savedSlugs.length + ' tier(s): ' + savedSlugs.join(', '), 'success');
            })
            .catch(function (err) {
                saveBtn.textContent = 'Save All Changes';
                saveBtn.disabled = false;
                showAlert('admin-pricing-alert', 'Save failed: ' + esc(err.message), 'error');
            });
    });


    console.log('[AmeriDex Admin] v1.3 loaded.');
})();
