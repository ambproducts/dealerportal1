// ============================================================
// AmeriDex Dealer Portal - Admin Panel Customers Tab v1.0
// Date: 2026-02-13
// ============================================================
// This file patches ameridex-admin.js to add a 4th tab: Customers
//
// USAGE: Add this script AFTER ameridex-admin.js in dealer-portal.html:
//   <script src="ameridex-admin.js"></script>
//   <script src="ameridex-admin-customers.js"></script>
// ============================================================

(function () {
    'use strict';

    // Wait for the admin panel to be built, then inject the Customers tab
    const _origOpenAdmin = window.AmeriDexAdmin ? window.AmeriDexAdmin.open : null;

    // We need to patch the admin panel after it is first created
    let _customersTabInjected = false;

    function injectCustomersTab() {
        if (_customersTabInjected) return;

        const tabBar = document.querySelector('.admin-tab-bar');
        const tabContent = document.querySelector('.admin-tab-content');
        if (!tabBar || !tabContent) return;

        // -------------------------------------------------------
        // ADD TAB BUTTON
        // -------------------------------------------------------
        const custTabBtn = document.createElement('button');
        custTabBtn.className = 'admin-tab';
        custTabBtn.dataset.tab = 'customers';
        custTabBtn.textContent = 'Customers';

        // Insert before the last tab (Pricing)
        const pricingTab = tabBar.querySelector('[data-tab="pricing"]');
        if (pricingTab) {
            tabBar.insertBefore(custTabBtn, pricingTab);
        } else {
            tabBar.appendChild(custTabBtn);
        }

        // Wire up tab click
        custTabBtn.addEventListener('click', () => {
            tabBar.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
            custTabBtn.classList.add('active');
            tabContent.innerHTML = '';
            renderCustomersTab(tabContent);
        });

        _customersTabInjected = true;
    }

    // -------------------------------------------------------
    // OBSERVE DOM for admin panel creation
    // -------------------------------------------------------
    const observer = new MutationObserver(() => {
        if (document.querySelector('.admin-tab-bar') && !_customersTabInjected) {
            injectCustomersTab();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });


    // -------------------------------------------------------
    // CUSTOMERS TAB RENDERER
    // -------------------------------------------------------
    async function renderCustomersTab(container) {
        container.innerHTML = '<div style="text-align:center;padding:3rem;color:#6b7280;">Loading customers...</div>';

        let customers = [];
        let quotes = [];
        let dealers = [];

        try {
            const token = localStorage.getItem('ameridex-auth-token');
            const headers = { 'Authorization': 'Bearer ' + token };

            const [custRes, quotesRes, dealersRes] = await Promise.all([
                fetch('/api/admin/customers', { headers }),
                fetch('/api/admin/quotes', { headers }),
                fetch('/api/admin/dealers', { headers })
            ]);

            if (custRes.ok) customers = await custRes.json();
            if (quotesRes.ok) quotes = await quotesRes.json();
            if (dealersRes.ok) dealers = await dealersRes.json();
        } catch (e) {
            container.innerHTML = '<div style="text-align:center;padding:3rem;color:#dc2626;">Failed to load customer data: ' + e.message + '</div>';
            return;
        }

        // Build dealer lookup
        const dealerMap = {};
        dealers.forEach(d => { dealerMap[d.dealerCode] = d.dealerName || d.dealerCode; });

        // Enrich customers with quote data
        customers.forEach(c => {
            c._quotes = quotes.filter(q => q.customerId === c.id);
            c._quoteCount = c._quotes.length || c.quoteCount || 0;
            c._totalValue = c._quotes.reduce((sum, q) => sum + (q.totalAmount || 0), 0) || c.totalValue || 0;
        });

        // -------------------------------------------------------
        // STATS ROW
        // -------------------------------------------------------
        const totalCustomers = customers.length;
        const activeCustomers = customers.filter(c => c._quoteCount > 0).length;
        const totalLifetimeValue = customers.reduce((sum, c) => sum + c._totalValue, 0);
        const multiDealerCustomers = customers.filter(c => c.dealers && c.dealers.length > 1).length;

        // Unique zip codes for geographic spread
        const uniqueZips = new Set(customers.map(c => c.zipCode).filter(Boolean)).size;

        let html = '';

        // Stats
        html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:0.75rem;margin-bottom:1.25rem;">';
        html += statCard('Total Customers', totalCustomers, '#2563eb');
        html += statCard('With Quotes', activeCustomers, '#16a34a');
        html += statCard('Multi-Dealer', multiDealerCustomers, '#7c3aed');
        html += statCard('Lifetime Value', '$' + totalLifetimeValue.toFixed(2), '#ea580c');
        html += statCard('Zip Codes', uniqueZips, '#0891b2');
        html += '</div>';

        // -------------------------------------------------------
        // FILTERS + SEARCH
        // -------------------------------------------------------
        html += '<div style="display:flex;gap:0.75rem;margin-bottom:1rem;flex-wrap:wrap;align-items:center;">';
        html += '<input type="text" id="admin-cust-search" placeholder="Search name, email, company, zip..." style="flex:1;min-width:200px;padding:0.6rem 0.85rem;border:1px solid #e5e7eb;border-radius:8px;font-size:0.9rem;">';

        // Dealer filter
        html += '<select id="admin-cust-dealer-filter" style="padding:0.6rem 0.85rem;border:1px solid #e5e7eb;border-radius:8px;font-size:0.9rem;">';
        html += '<option value="">All Dealers</option>';
        const dealerCodes = [...new Set(customers.flatMap(c => c.dealers || []))].sort();
        dealerCodes.forEach(dc => {
            html += '<option value="' + dc + '">' + dc + (dealerMap[dc] && dealerMap[dc] !== dc ? ' (' + dealerMap[dc] + ')' : '') + '</option>';
        });
        html += '</select>';

        // Sort
        html += '<select id="admin-cust-sort" style="padding:0.6rem 0.85rem;border:1px solid #e5e7eb;border-radius:8px;font-size:0.9rem;">';
        html += '<option value="recent">Most Recent</option>';
        html += '<option value="name">Name A-Z</option>';
        html += '<option value="value-desc">Highest Value</option>';
        html += '<option value="quotes-desc">Most Quotes</option>';
        html += '<option value="zip">Zip Code</option>';
        html += '</select>';

        // Export button
        html += '<button id="admin-cust-export" style="padding:0.6rem 1rem;background:#16a34a;color:white;border:none;border-radius:8px;font-size:0.85rem;font-weight:600;cursor:pointer;">Export CSV</button>';
        html += '</div>';

        // -------------------------------------------------------
        // CUSTOMER TABLE
        // -------------------------------------------------------
        html += '<div style="overflow-x:auto;">';
        html += '<table id="admin-cust-table" style="width:100%;border-collapse:collapse;font-size:0.88rem;">';
        html += '<thead><tr style="background:#f9fafb;">';
        html += '<th style="padding:0.65rem;text-align:left;border-bottom:2px solid #e5e7eb;font-size:0.8rem;color:#6b7280;">Name</th>';
        html += '<th style="padding:0.65rem;text-align:left;border-bottom:2px solid #e5e7eb;font-size:0.8rem;color:#6b7280;">Email</th>';
        html += '<th style="padding:0.65rem;text-align:left;border-bottom:2px solid #e5e7eb;font-size:0.8rem;color:#6b7280;">Company</th>';
        html += '<th style="padding:0.65rem;text-align:left;border-bottom:2px solid #e5e7eb;font-size:0.8rem;color:#6b7280;">Phone</th>';
        html += '<th style="padding:0.65rem;text-align:left;border-bottom:2px solid #e5e7eb;font-size:0.8rem;color:#6b7280;">Zip</th>';
        html += '<th style="padding:0.65rem;text-align:center;border-bottom:2px solid #e5e7eb;font-size:0.8rem;color:#6b7280;">Dealers</th>';
        html += '<th style="padding:0.65rem;text-align:center;border-bottom:2px solid #e5e7eb;font-size:0.8rem;color:#6b7280;">Quotes</th>';
        html += '<th style="padding:0.65rem;text-align:right;border-bottom:2px solid #e5e7eb;font-size:0.8rem;color:#6b7280;">Value</th>';
        html += '<th style="padding:0.65rem;text-align:left;border-bottom:2px solid #e5e7eb;font-size:0.8rem;color:#6b7280;">Last Contact</th>';
        html += '<th style="padding:0.65rem;text-align:center;border-bottom:2px solid #e5e7eb;font-size:0.8rem;color:#6b7280;">Actions</th>';
        html += '</tr></thead>';
        html += '<tbody id="admin-cust-tbody"></tbody>';
        html += '</table>';
        html += '</div>';

        // -------------------------------------------------------
        // CUSTOMER DETAIL PANEL (hidden by default)
        // -------------------------------------------------------
        html += '<div id="admin-cust-detail" style="display:none;margin-top:1rem;background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:1.25rem;"></div>';

        container.innerHTML = html;

        // -------------------------------------------------------
        // RENDER TABLE ROWS
        // -------------------------------------------------------
        function renderRows() {
            const search = (document.getElementById('admin-cust-search').value || '').toLowerCase();
            const dealerFilter = document.getElementById('admin-cust-dealer-filter').value;
            const sort = document.getElementById('admin-cust-sort').value;

            let filtered = customers.filter(c => {
                if (dealerFilter && (!c.dealers || !c.dealers.includes(dealerFilter))) return false;
                if (search) {
                    const haystack = [c.name, c.email, c.company, c.phone, c.zipCode, ...(c.dealers || [])].join(' ').toLowerCase();
                    return haystack.includes(search);
                }
                return true;
            });

            // Sort
            filtered.sort((a, b) => {
                switch (sort) {
                    case 'name': return (a.name || '').localeCompare(b.name || '');
                    case 'value-desc': return (b._totalValue || 0) - (a._totalValue || 0);
                    case 'quotes-desc': return (b._quoteCount || 0) - (a._quoteCount || 0);
                    case 'zip': return (a.zipCode || '').localeCompare(b.zipCode || '');
                    case 'recent':
                    default: return (b.lastContact || b.updatedAt || '').localeCompare(a.lastContact || a.updatedAt || '');
                }
            });

            const tbody = document.getElementById('admin-cust-tbody');
            if (filtered.length === 0) {
                tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:2rem;color:#6b7280;">No customers found</td></tr>';
                return;
            }

            tbody.innerHTML = filtered.map(c => {
                const dealerBadges = (c.dealers || []).map(d =>
                    '<span style="display:inline-block;background:#eff6ff;color:#2563eb;padding:0.15rem 0.45rem;border-radius:4px;font-size:0.75rem;font-weight:600;margin:0.1rem;">' + escHtml(d) + '</span>'
                ).join(' ');

                const lastContactDate = c.lastContact ? new Date(c.lastContact).toLocaleDateString() : 'N/A';

                return '<tr style="border-bottom:1px solid #f3f4f6;" data-id="' + c.id + '">'
                    + '<td style="padding:0.6rem;font-weight:600;">' + escHtml(c.name || '') + '</td>'
                    + '<td style="padding:0.6rem;color:#6b7280;font-size:0.85rem;">' + escHtml(c.email || '') + '</td>'
                    + '<td style="padding:0.6rem;">' + escHtml(c.company || '') + '</td>'
                    + '<td style="padding:0.6rem;font-size:0.85rem;">' + escHtml(c.phone || '') + '</td>'
                    + '<td style="padding:0.6rem;font-size:0.85rem;">' + escHtml(c.zipCode || '') + '</td>'
                    + '<td style="padding:0.6rem;text-align:center;">' + dealerBadges + '</td>'
                    + '<td style="padding:0.6rem;text-align:center;font-weight:600;">' + (c._quoteCount || 0) + '</td>'
                    + '<td style="padding:0.6rem;text-align:right;font-weight:600;color:#16a34a;">$' + (c._totalValue || 0).toFixed(2) + '</td>'
                    + '<td style="padding:0.6rem;font-size:0.8rem;color:#6b7280;">' + lastContactDate + '</td>'
                    + '<td style="padding:0.6rem;text-align:center;">'
                    + '<button class="cust-view-btn" data-id="' + c.id + '" style="padding:0.3rem 0.6rem;background:#eff6ff;color:#2563eb;border:none;border-radius:6px;font-size:0.78rem;font-weight:600;cursor:pointer;margin:0.1rem;" title="View details">View</button>'
                    + '<button class="cust-edit-btn" data-id="' + c.id + '" style="padding:0.3rem 0.6rem;background:#f0fdf4;color:#16a34a;border:none;border-radius:6px;font-size:0.78rem;font-weight:600;cursor:pointer;margin:0.1rem;" title="Edit customer">Edit</button>'
                    + '<button class="cust-delete-btn" data-id="' + c.id + '" style="padding:0.3rem 0.6rem;background:#fef2f2;color:#dc2626;border:none;border-radius:6px;font-size:0.78rem;font-weight:600;cursor:pointer;margin:0.1rem;" title="Delete customer">Del</button>'
                    + '</td>'
                    + '</tr>';
            }).join('');

            // Attach row actions
            tbody.querySelectorAll('.cust-view-btn').forEach(btn => {
                btn.onclick = () => showCustomerDetail(btn.dataset.id);
            });
            tbody.querySelectorAll('.cust-edit-btn').forEach(btn => {
                btn.onclick = () => showEditCustomer(btn.dataset.id);
            });
            tbody.querySelectorAll('.cust-delete-btn').forEach(btn => {
                btn.onclick = () => deleteCustomer(btn.dataset.id);
            });
        }

        renderRows();

        // Filters
        document.getElementById('admin-cust-search').addEventListener('input', renderRows);
        document.getElementById('admin-cust-dealer-filter').addEventListener('change', renderRows);
        document.getElementById('admin-cust-sort').addEventListener('change', renderRows);

        // Export CSV
        document.getElementById('admin-cust-export').addEventListener('click', () => {
            exportCustomersCSV(customers);
        });

        // -------------------------------------------------------
        // VIEW CUSTOMER DETAIL
        // -------------------------------------------------------
        function showCustomerDetail(id) {
            const c = customers.find(x => x.id === id);
            if (!c) return;

            const panel = document.getElementById('admin-cust-detail');
            const custQuotes = c._quotes || [];

            let dhtml = '';

            // Header
            dhtml += '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:1rem;margin-bottom:1rem;">';
            dhtml += '<div>';
            dhtml += '<h3 style="margin:0 0 0.25rem;font-size:1.15rem;color:#111827;">' + escHtml(c.name || 'Unknown') + '</h3>';
            if (c.company) dhtml += '<div style="font-size:0.9rem;color:#6b7280;">' + escHtml(c.company) + '</div>';
            dhtml += '</div>';
            dhtml += '<button id="admin-cust-detail-close" style="padding:0.4rem 0.8rem;background:#f3f4f6;border:none;border-radius:6px;cursor:pointer;font-size:0.85rem;font-weight:600;">Close</button>';
            dhtml += '</div>';

            // Info grid
            dhtml += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem;margin-bottom:1.25rem;">';
            dhtml += detailField('Email', c.email);
            dhtml += detailField('Phone', c.phone);
            dhtml += detailField('Zip Code', c.zipCode);
            dhtml += detailField('Dealers', (c.dealers || []).join(', '));
            dhtml += detailField('First Contact', c.firstContact ? new Date(c.firstContact).toLocaleDateString() : 'N/A');
            dhtml += detailField('Last Contact', c.lastContact ? new Date(c.lastContact).toLocaleDateString() : 'N/A');
            dhtml += detailField('Total Quotes', String(c._quoteCount || 0));
            dhtml += detailField('Lifetime Value', '$' + (c._totalValue || 0).toFixed(2));
            dhtml += '</div>';

            // Notes
            dhtml += '<div style="margin-bottom:1.25rem;">';
            dhtml += '<label style="font-size:0.85rem;font-weight:600;color:#374151;display:block;margin-bottom:0.3rem;">Admin Notes</label>';
            dhtml += '<textarea id="admin-cust-notes" rows="2" style="width:100%;padding:0.6rem;border:1px solid #e5e7eb;border-radius:8px;font-size:0.9rem;resize:vertical;">' + escHtml(c.notes || '') + '</textarea>';
            dhtml += '<button id="admin-cust-save-notes" style="margin-top:0.4rem;padding:0.35rem 0.85rem;background:#2563eb;color:white;border:none;border-radius:6px;font-size:0.8rem;font-weight:600;cursor:pointer;">Save Notes</button>';
            dhtml += '</div>';

            // Quote history table
            if (custQuotes.length > 0) {
                dhtml += '<h4 style="margin:0 0 0.5rem;font-size:0.95rem;color:#374151;">Quote History</h4>';
                dhtml += '<div style="overflow-x:auto;">';
                dhtml += '<table style="width:100%;border-collapse:collapse;font-size:0.85rem;">';
                dhtml += '<thead><tr style="background:#f3f4f6;">';
                dhtml += '<th style="padding:0.5rem;text-align:left;border-bottom:1px solid #e5e7eb;">Quote #</th>';
                dhtml += '<th style="padding:0.5rem;text-align:left;border-bottom:1px solid #e5e7eb;">Dealer</th>';
                dhtml += '<th style="padding:0.5rem;text-align:center;border-bottom:1px solid #e5e7eb;">Items</th>';
                dhtml += '<th style="padding:0.5rem;text-align:right;border-bottom:1px solid #e5e7eb;">Total</th>';
                dhtml += '<th style="padding:0.5rem;text-align:center;border-bottom:1px solid #e5e7eb;">Status</th>';
                dhtml += '<th style="padding:0.5rem;text-align:left;border-bottom:1px solid #e5e7eb;">Date</th>';
                dhtml += '</tr></thead><tbody>';

                custQuotes.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).forEach(q => {
                    const statusColors = {
                        draft: '#6b7280', submitted: '#2563eb', reviewed: '#7c3aed',
                        approved: '#16a34a', rejected: '#dc2626', revision: '#f59e0b'
                    };
                    const sc = statusColors[q.status] || '#6b7280';
                    dhtml += '<tr style="border-bottom:1px solid #f3f4f6;">';
                    dhtml += '<td style="padding:0.5rem;font-weight:600;color:#2563eb;">' + escHtml(q.quoteNumber || q.quoteId || 'N/A') + '</td>';
                    dhtml += '<td style="padding:0.5rem;">' + escHtml(q.dealerCode || '') + '</td>';
                    dhtml += '<td style="padding:0.5rem;text-align:center;">' + (q.lineItems ? q.lineItems.length : 0) + '</td>';
                    dhtml += '<td style="padding:0.5rem;text-align:right;font-weight:600;">$' + (q.totalAmount || 0).toFixed(2) + '</td>';
                    dhtml += '<td style="padding:0.5rem;text-align:center;"><span style="background:' + sc + '22;color:' + sc + ';padding:0.15rem 0.5rem;border-radius:999px;font-size:0.75rem;font-weight:600;text-transform:capitalize;">' + (q.status || 'draft') + '</span></td>';
                    dhtml += '<td style="padding:0.5rem;font-size:0.8rem;color:#6b7280;">' + (q.createdAt ? new Date(q.createdAt).toLocaleDateString() : 'N/A') + '</td>';
                    dhtml += '</tr>';
                });

                dhtml += '</tbody></table></div>';
            } else {
                dhtml += '<div style="text-align:center;padding:1rem;color:#6b7280;font-size:0.9rem;">No quotes linked to this customer yet.</div>';
            }

            panel.innerHTML = dhtml;
            panel.style.display = 'block';
            panel.scrollIntoView({ behavior: 'smooth', block: 'start' });

            // Close
            document.getElementById('admin-cust-detail-close').onclick = () => {
                panel.style.display = 'none';
            };

            // Save notes
            document.getElementById('admin-cust-save-notes').onclick = async () => {
                const notes = document.getElementById('admin-cust-notes').value;
                try {
                    const token = localStorage.getItem('ameridex-auth-token');
                    const res = await fetch('/api/admin/customers/' + id, {
                        method: 'PUT',
                        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ notes })
                    });
                    if (res.ok) {
                        c.notes = notes;
                        const btn = document.getElementById('admin-cust-save-notes');
                        btn.textContent = 'Saved!';
                        btn.style.background = '#16a34a';
                        setTimeout(() => { btn.textContent = 'Save Notes'; btn.style.background = '#2563eb'; }, 1500);
                    }
                } catch (e) {
                    alert('Failed to save notes: ' + e.message);
                }
            };
        }


        // -------------------------------------------------------
        // EDIT CUSTOMER (inline modal)
        // -------------------------------------------------------
        function showEditCustomer(id) {
            const c = customers.find(x => x.id === id);
            if (!c) return;

            const panel = document.getElementById('admin-cust-detail');

            let ehtml = '';
            ehtml += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">';
            ehtml += '<h3 style="margin:0;font-size:1.05rem;color:#2563eb;">Edit Customer</h3>';
            ehtml += '<button id="admin-cust-edit-cancel" style="padding:0.4rem 0.8rem;background:#f3f4f6;border:none;border-radius:6px;cursor:pointer;font-size:0.85rem;font-weight:600;">Cancel</button>';
            ehtml += '</div>';

            ehtml += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;">';
            ehtml += editField('edit-cust-name', 'Name', c.name);
            ehtml += editField('edit-cust-email', 'Email', c.email);
            ehtml += editField('edit-cust-company', 'Company', c.company);
            ehtml += editField('edit-cust-phone', 'Phone', c.phone);
            ehtml += editField('edit-cust-zip', 'Zip Code', c.zipCode);
            ehtml += '</div>';

            ehtml += '<div style="margin-top:1rem;">';
            ehtml += '<label style="font-size:0.85rem;font-weight:600;color:#374151;display:block;margin-bottom:0.3rem;">Admin Notes</label>';
            ehtml += '<textarea id="edit-cust-notes" rows="2" style="width:100%;padding:0.6rem;border:1px solid #e5e7eb;border-radius:8px;font-size:0.9rem;resize:vertical;">' + escHtml(c.notes || '') + '</textarea>';
            ehtml += '</div>';

            ehtml += '<div style="display:flex;gap:0.75rem;margin-top:1rem;">';
            ehtml += '<button id="admin-cust-edit-save" style="padding:0.5rem 1.25rem;background:#2563eb;color:white;border:none;border-radius:8px;font-size:0.9rem;font-weight:600;cursor:pointer;">Save Changes</button>';
            ehtml += '<button id="admin-cust-edit-cancel2" style="padding:0.5rem 1.25rem;background:#f3f4f6;color:#374151;border:none;border-radius:8px;font-size:0.9rem;font-weight:600;cursor:pointer;">Cancel</button>';
            ehtml += '</div>';

            panel.innerHTML = ehtml;
            panel.style.display = 'block';
            panel.scrollIntoView({ behavior: 'smooth', block: 'start' });

            const closeEdit = () => { panel.style.display = 'none'; };
            document.getElementById('admin-cust-edit-cancel').onclick = closeEdit;
            document.getElementById('admin-cust-edit-cancel2').onclick = closeEdit;

            document.getElementById('admin-cust-edit-save').onclick = async () => {
                const updates = {
                    name: document.getElementById('edit-cust-name').value.trim(),
                    email: document.getElementById('edit-cust-email').value.trim(),
                    company: document.getElementById('edit-cust-company').value.trim(),
                    phone: document.getElementById('edit-cust-phone').value.trim(),
                    zipCode: document.getElementById('edit-cust-zip').value.trim(),
                    notes: document.getElementById('edit-cust-notes').value
                };

                if (!updates.name || !updates.email) {
                    alert('Name and email are required.');
                    return;
                }

                try {
                    const token = localStorage.getItem('ameridex-auth-token');
                    const res = await fetch('/api/admin/customers/' + id, {
                        method: 'PUT',
                        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
                        body: JSON.stringify(updates)
                    });
                    if (res.ok) {
                        const updated = await res.json();
                        // Update local data
                        Object.assign(c, updated);
                        panel.style.display = 'none';
                        renderRows();
                        alert('Customer updated.');
                    } else {
                        const err = await res.json();
                        alert('Error: ' + (err.error || 'Unknown error'));
                    }
                } catch (e) {
                    alert('Failed to update: ' + e.message);
                }
            };
        }


        // -------------------------------------------------------
        // DELETE CUSTOMER
        // -------------------------------------------------------
        async function deleteCustomer(id) {
            const c = customers.find(x => x.id === id);
            if (!c) return;

            const msg = 'Delete customer "' + (c.name || 'Unknown') + '"?\n\nThis will NOT delete their quotes, but will unlink the customer record.';
            if (!confirm(msg)) return;

            try {
                const token = localStorage.getItem('ameridex-auth-token');
                const res = await fetch('/api/admin/customers/' + id, {
                    method: 'DELETE',
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                if (res.ok) {
                    customers.splice(customers.indexOf(c), 1);
                    renderRows();
                    document.getElementById('admin-cust-detail').style.display = 'none';
                } else {
                    const err = await res.json();
                    alert('Error: ' + (err.error || 'Failed to delete'));
                }
            } catch (e) {
                alert('Failed to delete: ' + e.message);
            }
        }


        // -------------------------------------------------------
        // EXPORT CSV
        // -------------------------------------------------------
        function exportCustomersCSV(data) {
            const headers = ['Name', 'Email', 'Company', 'Phone', 'Zip Code', 'Dealers', 'Quote Count', 'Lifetime Value', 'First Contact', 'Last Contact', 'Notes'];
            const rows = data.map(c => [
                c.name || '',
                c.email || '',
                c.company || '',
                c.phone || '',
                c.zipCode || '',
                (c.dealers || []).join('; '),
                c._quoteCount || 0,
                (c._totalValue || 0).toFixed(2),
                c.firstContact ? new Date(c.firstContact).toLocaleDateString() : '',
                c.lastContact ? new Date(c.lastContact).toLocaleDateString() : '',
                (c.notes || '').replace(/"/g, '""')
            ]);

            let csv = headers.map(h => '"' + h + '"').join(',') + '\n';
            rows.forEach(row => {
                csv += row.map(cell => '"' + String(cell).replace(/"/g, '""') + '"').join(',') + '\n';
            });

            const blob = new Blob([csv], { type: 'text/csv' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'ameridex-customers-' + new Date().toISOString().split('T')[0] + '.csv';
            a.click();
        }
    }


    // -------------------------------------------------------
    // HELPER FUNCTIONS
    // -------------------------------------------------------
    function statCard(label, value, color) {
        return '<div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:0.85rem 1rem;text-align:center;">'
            + '<div style="font-size:1.3rem;font-weight:700;color:' + color + ';">' + value + '</div>'
            + '<div style="font-size:0.78rem;color:#6b7280;margin-top:0.2rem;">' + label + '</div>'
            + '</div>';
    }

    function detailField(label, value) {
        return '<div>'
            + '<div style="font-size:0.78rem;color:#6b7280;font-weight:600;margin-bottom:0.15rem;">' + label + '</div>'
            + '<div style="font-size:0.92rem;color:#111827;">' + escHtml(value || 'N/A') + '</div>'
            + '</div>';
    }

    function editField(id, label, value) {
        return '<div>'
            + '<label for="' + id + '" style="font-size:0.85rem;font-weight:600;color:#374151;display:block;margin-bottom:0.25rem;">' + label + '</label>'
            + '<input type="text" id="' + id + '" value="' + escHtml(value || '') + '" style="width:100%;padding:0.55rem 0.75rem;border:1px solid #e5e7eb;border-radius:8px;font-size:0.9rem;">'
            + '</div>';
    }

    function escHtml(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }

})();
