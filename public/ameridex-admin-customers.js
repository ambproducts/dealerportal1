// ============================================================
// AmeriDex Dealer Portal - Admin Panel Customers Tab v2.0
// REWRITE: Resilient DOM detection - no hardcoded class names
// Date: 2026-02-13
// ============================================================
// Drop-in script. Loads AFTER ameridex-admin.js.
// Finds the admin tab bar by scanning for buttons whose text
// contains "Dealers", "Quotes", or "Pricing", then injects
// a "Customers" tab using the exact same element types,
// classes, and inline styles as the siblings it finds.
// ============================================================

(function () {
    'use strict';

    let _injected = false;
    let _attempts = 0;
    const MAX_ATTEMPTS = 200;       // ~10 seconds at 50ms
    const POLL_MS = 50;

    // -------------------------------------------------------
    // 1. FIND THE TAB BAR (class-agnostic)
    // -------------------------------------------------------
    function findAdminTabBar() {
        // Strategy A: find any button whose text is "Dealers" inside
        // a visible modal / overlay that also contains "Quotes"
        const allBtns = document.querySelectorAll('button');
        for (const btn of allBtns) {
            const txt = btn.textContent.trim();
            if (txt === 'Dealers' || txt === 'All Dealers') {
                const parent = btn.parentElement;
                if (!parent) continue;
                // Verify siblings contain "Quotes" or "Pricing"
                const sibTexts = Array.from(parent.children).map(c => c.textContent.trim());
                const hasQuotes = sibTexts.some(t => /quotes/i.test(t));
                const hasPricing = sibTexts.some(t => /pricing/i.test(t));
                if (hasQuotes || hasPricing) {
                    return { tabBar: parent, referenceTab: btn };
                }
            }
        }

        // Strategy B: look for [data-tab] attributes
        const dataTabs = document.querySelectorAll('[data-tab]');
        if (dataTabs.length >= 2) {
            const tabValues = Array.from(dataTabs).map(el => (el.dataset.tab || '').toLowerCase());
            if (tabValues.includes('dealers') || tabValues.includes('quotes')) {
                const first = dataTabs[0];
                return { tabBar: first.parentElement, referenceTab: first };
            }
        }

        // Strategy C: scan for elements with class containing "tab"
        // whose children are buttons with admin-ish labels
        const candidates = document.querySelectorAll('[class*="tab"]');
        for (const el of candidates) {
            const kids = Array.from(el.children);
            if (kids.length < 2) continue;
            const texts = kids.map(k => k.textContent.trim().toLowerCase());
            if (texts.some(t => t.includes('dealer')) && texts.some(t => t.includes('quot') || t.includes('pric'))) {
                return { tabBar: el, referenceTab: kids[0] };
            }
        }

        return null;
    }

    // Find the content area (sibling or next element after tab bar)
    function findTabContent(tabBar) {
        // Usually the very next sibling
        let el = tabBar.nextElementSibling;
        if (el) return el;

        // Or the parent's next child after tabBar
        const parent = tabBar.parentElement;
        if (parent) {
            const children = Array.from(parent.children);
            const idx = children.indexOf(tabBar);
            if (idx >= 0 && idx < children.length - 1) {
                return children[idx + 1];
            }
        }
        return null;
    }

    // -------------------------------------------------------
    // 2. CLONE TAB STYLE FROM EXISTING TABS
    // -------------------------------------------------------
    function cloneTabButton(referenceTab, label) {
        const btn = document.createElement(referenceTab.tagName || 'button');
        // Copy all classes
        btn.className = referenceTab.className;
        // Remove any "active" class
        btn.classList.remove('active');
        // Copy inline style if any
        if (referenceTab.getAttribute('style')) {
            btn.setAttribute('style', referenceTab.getAttribute('style'));
        }
        // Copy data-tab pattern if used
        if (referenceTab.dataset.tab) {
            btn.dataset.tab = 'customers';
        }
        btn.textContent = label;
        btn.type = 'button';
        return btn;
    }

    // -------------------------------------------------------
    // 3. INJECT THE TAB
    // -------------------------------------------------------
    function inject() {
        if (_injected) return;

        const found = findAdminTabBar();
        if (!found) return false;

        const { tabBar, referenceTab } = found;
        const tabContent = findTabContent(tabBar);
        if (!tabContent) return false;

        // Check if already injected (idempotent)
        const existingTexts = Array.from(tabBar.children).map(c => c.textContent.trim().toLowerCase());
        if (existingTexts.includes('customers')) {
            _injected = true;
            return true;
        }

        // Create button cloned from existing tab style
        const custBtn = cloneTabButton(referenceTab, 'Customers');
        custBtn.id = 'admin-customers-tab';

        // Find insertion point: before the Pricing tab, or at end
        const pricingTab = Array.from(tabBar.children).find(c => /pricing/i.test(c.textContent.trim()));
        if (pricingTab) {
            tabBar.insertBefore(custBtn, pricingTab);
        } else {
            tabBar.appendChild(custBtn);
        }

        // Wire click
        custBtn.addEventListener('click', () => {
            // Deactivate all sibling tabs
            Array.from(tabBar.children).forEach(t => {
                t.classList.remove('active');
                // Also handle inline style active states
                if (t.style.background && t !== custBtn) {
                    // Reset non-active look from reference
                }
            });
            custBtn.classList.add('active');
            renderCustomersTab(tabContent);
        });

        _injected = true;
        console.log('[ameridex-admin-customers] Customers tab injected successfully');
        return true;
    }

    // -------------------------------------------------------
    // 4. POLLING + MUTATION OBSERVER (belt and suspenders)
    // -------------------------------------------------------
    // MutationObserver for when admin modal opens
    const observer = new MutationObserver(() => {
        if (!_injected) inject();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Also poll in case MutationObserver misses it
    const poller = setInterval(() => {
        _attempts++;
        if (_injected || _attempts > MAX_ATTEMPTS) {
            clearInterval(poller);
            return;
        }
        inject();
    }, POLL_MS);

    // -------------------------------------------------------
    // 5. CUSTOMERS TAB CONTENT RENDERER
    // -------------------------------------------------------
    async function renderCustomersTab(container) {
        container.innerHTML = '<div style="text-align:center;padding:3rem;color:#6b7280;">Loading customers...</div>';

        let customers = [];
        let quotes = [];
        let dealers = [];

        try {
            const token = localStorage.getItem('ameridex-auth-token');
            const headers = token ? { 'Authorization': 'Bearer ' + token } : {};

            const results = await Promise.allSettled([
                fetch('/api/admin/customers', { headers }).then(r => r.ok ? r.json() : []),
                fetch('/api/admin/quotes', { headers }).then(r => r.ok ? r.json() : []),
                fetch('/api/admin/dealers', { headers }).then(r => r.ok ? r.json() : [])
            ]);

            customers = results[0].status === 'fulfilled' ? results[0].value : [];
            quotes    = results[1].status === 'fulfilled' ? results[1].value : [];
            dealers   = results[2].status === 'fulfilled' ? results[2].value : [];

            // Normalize: ensure customers is always an array
            if (!Array.isArray(customers)) customers = customers.customers || customers.data || [];
            if (!Array.isArray(quotes)) quotes = quotes.quotes || quotes.data || [];
            if (!Array.isArray(dealers)) dealers = dealers.dealers || dealers.data || [];

        } catch (e) {
            container.innerHTML = '<div style="text-align:center;padding:3rem;color:#dc2626;">'
                + 'Failed to load customer data. '
                + '<button id="admin-cust-retry" style="margin-top:0.5rem;padding:0.4rem 1rem;background:#2563eb;color:white;border:none;border-radius:6px;cursor:pointer;">Retry</button>'
                + '<br><span style="font-size:0.8rem;color:#6b7280;margin-top:0.5rem;display:block;">' + esc(e.message) + '</span>'
                + '</div>';
            const retryBtn = document.getElementById('admin-cust-retry');
            if (retryBtn) retryBtn.onclick = () => renderCustomersTab(container);
            return;
        }

        // Build dealer lookup
        const dealerMap = {};
        dealers.forEach(d => {
            const code = d.dealerCode || d.code || d.id;
            dealerMap[code] = d.dealerName || d.name || code;
        });

        // Enrich customers with quote data
        customers.forEach(c => {
            c._quotes = quotes.filter(q =>
                q.customerId === c.id ||
                q.customerId === c._id ||
                (q.customerEmail && c.email && q.customerEmail.toLowerCase() === c.email.toLowerCase()) ||
                (q.customer && q.customer.email && c.email && q.customer.email.toLowerCase() === c.email.toLowerCase())
            );
            c._quoteCount = c._quotes.length || c.quoteCount || 0;
            c._totalValue = c._quotes.reduce((sum, q) => sum + (q.totalAmount || q.total || 0), 0) || c.totalValue || 0;
        });

        // ---- Metrics ----
        const totalCustomers = customers.length;
        const activeCustomers = customers.filter(c => c._quoteCount > 0).length;
        const totalLifetimeValue = customers.reduce((sum, c) => sum + c._totalValue, 0);
        const uniqueZips = new Set(customers.map(c => c.zipCode || c.zip).filter(Boolean)).size;

        let html = '';

        // Stats row
        html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:0.75rem;margin-bottom:1.25rem;">';
        html += statCard('Total Customers', totalCustomers, '#2563eb');
        html += statCard('With Quotes', activeCustomers, '#16a34a');
        html += statCard('Lifetime Value', '$' + totalLifetimeValue.toFixed(2), '#ea580c');
        html += statCard('Zip Codes', uniqueZips, '#0891b2');
        html += '</div>';

        // Filters
        html += '<div style="display:flex;gap:0.75rem;margin-bottom:1rem;flex-wrap:wrap;align-items:center;">';
        html += '<input type="text" id="admin-cust-search" placeholder="Search name, email, company, zip..." '
              + 'style="flex:1;min-width:200px;padding:0.6rem 0.85rem;border:1px solid #e5e7eb;border-radius:8px;font-size:0.9rem;">';

        // Dealer filter
        html += '<select id="admin-cust-dealer-filter" style="padding:0.6rem 0.85rem;border:1px solid #e5e7eb;border-radius:8px;font-size:0.9rem;">';
        html += '<option value="">All Dealers</option>';
        const dealerCodes = [...new Set(customers.flatMap(c => c.dealers || (c.dealerCode ? [c.dealerCode] : [])))].sort();
        dealerCodes.forEach(dc => {
            const name = dealerMap[dc] && dealerMap[dc] !== dc ? ' (' + dealerMap[dc] + ')' : '';
            html += '<option value="' + esc(dc) + '">' + esc(dc) + name + '</option>';
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

        // Export
        html += '<button id="admin-cust-export" style="padding:0.6rem 1rem;background:#16a34a;color:white;border:none;border-radius:8px;font-size:0.85rem;font-weight:600;cursor:pointer;">Export CSV</button>';
        html += '</div>';

        // Count badge
        html += '<div id="admin-cust-count" style="font-size:0.8rem;color:#6b7280;margin-bottom:0.5rem;">Showing ' + customers.length + ' of ' + customers.length + ' customers</div>';

        // Table
        html += '<div style="overflow-x:auto;">';
        html += '<table id="admin-cust-table" style="width:100%;border-collapse:collapse;font-size:0.88rem;">';
        html += '<thead><tr style="background:#f9fafb;">';
        ['Name','Email','Company','Phone','Zip','Dealers','Quotes','Value','Last Contact','Actions'].forEach(h => {
            const align = h === 'Value' ? 'right' : (h === 'Quotes' || h === 'Dealers' || h === 'Actions' ? 'center' : 'left');
            html += '<th style="padding:0.65rem;text-align:' + align + ';border-bottom:2px solid #e5e7eb;font-size:0.8rem;color:#6b7280;">' + h + '</th>';
        });
        html += '</tr></thead>';
        html += '<tbody id="admin-cust-tbody"></tbody>';
        html += '</table>';
        html += '</div>';

        // Detail panel
        html += '<div id="admin-cust-detail" style="display:none;margin-top:1rem;background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:1.25rem;"></div>';

        container.innerHTML = html;

        // ---- Table Rendering ----
        function renderRows() {
            const search = (document.getElementById('admin-cust-search').value || '').toLowerCase();
            const dealerFilter = document.getElementById('admin-cust-dealer-filter').value;
            const sort = document.getElementById('admin-cust-sort').value;

            let filtered = customers.filter(c => {
                const dList = c.dealers || (c.dealerCode ? [c.dealerCode] : []);
                if (dealerFilter && !dList.includes(dealerFilter)) return false;
                if (search) {
                    const hay = [c.name, c.email, c.company, c.phone, c.zipCode, c.zip, ...dList].join(' ').toLowerCase();
                    return hay.includes(search);
                }
                return true;
            });

            filtered.sort((a, b) => {
                switch (sort) {
                    case 'name': return (a.name || '').localeCompare(b.name || '');
                    case 'value-desc': return (b._totalValue || 0) - (a._totalValue || 0);
                    case 'quotes-desc': return (b._quoteCount || 0) - (a._quoteCount || 0);
                    case 'zip': return (a.zipCode || a.zip || '').localeCompare(b.zipCode || b.zip || '');
                    default: return (b.lastContact || b.updatedAt || '').localeCompare(a.lastContact || a.updatedAt || '');
                }
            });

            // Update count
            const countEl = document.getElementById('admin-cust-count');
            if (countEl) countEl.textContent = 'Showing ' + filtered.length + ' of ' + customers.length + ' customers';

            const tbody = document.getElementById('admin-cust-tbody');
            if (!filtered.length) {
                tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:2rem;color:#6b7280;">No customers found</td></tr>';
                return;
            }

            tbody.innerHTML = filtered.map(c => {
                const dList = c.dealers || (c.dealerCode ? [c.dealerCode] : []);
                const dealerBadges = dList.map(d =>
                    '<span style="display:inline-block;background:#eff6ff;color:#2563eb;padding:0.15rem 0.45rem;border-radius:4px;font-size:0.75rem;font-weight:600;margin:0.1rem;">' + esc(d) + '</span>'
                ).join(' ');
                const lastDate = c.lastContact || c.updatedAt;
                const lastStr = lastDate ? new Date(lastDate).toLocaleDateString() : 'N/A';
                const cid = c.id || c._id || '';

                return '<tr style="border-bottom:1px solid #f3f4f6;" data-id="' + cid + '">'
                    + '<td style="padding:0.6rem;font-weight:600;">' + esc(c.name || '') + '</td>'
                    + '<td style="padding:0.6rem;color:#6b7280;font-size:0.85rem;">' + esc(c.email || '') + '</td>'
                    + '<td style="padding:0.6rem;">' + esc(c.company || '') + '</td>'
                    + '<td style="padding:0.6rem;font-size:0.85rem;">' + esc(c.phone || '') + '</td>'
                    + '<td style="padding:0.6rem;font-size:0.85rem;">' + esc(c.zipCode || c.zip || '') + '</td>'
                    + '<td style="padding:0.6rem;text-align:center;">' + (dealerBadges || 'N/A') + '</td>'
                    + '<td style="padding:0.6rem;text-align:center;font-weight:600;">' + (c._quoteCount || 0) + '</td>'
                    + '<td style="padding:0.6rem;text-align:right;font-weight:600;color:#16a34a;">$' + (c._totalValue || 0).toFixed(2) + '</td>'
                    + '<td style="padding:0.6rem;font-size:0.8rem;color:#6b7280;">' + lastStr + '</td>'
                    + '<td style="padding:0.6rem;text-align:center;">'
                    + '<button class="cust-view-btn" data-id="' + cid + '" style="padding:0.3rem 0.6rem;background:#eff6ff;color:#2563eb;border:none;border-radius:6px;font-size:0.78rem;font-weight:600;cursor:pointer;margin:0.1rem;">View</button>'
                    + '<button class="cust-edit-btn" data-id="' + cid + '" style="padding:0.3rem 0.6rem;background:#f0fdf4;color:#16a34a;border:none;border-radius:6px;font-size:0.78rem;font-weight:600;cursor:pointer;margin:0.1rem;">Edit</button>'
                    + '</td></tr>';
            }).join('');

            // Attach handlers
            tbody.querySelectorAll('.cust-view-btn').forEach(btn => {
                btn.onclick = () => showDetail(btn.dataset.id);
            });
            tbody.querySelectorAll('.cust-edit-btn').forEach(btn => {
                btn.onclick = () => showEdit(btn.dataset.id);
            });
        }

        renderRows();

        // Filter listeners
        document.getElementById('admin-cust-search').addEventListener('input', renderRows);
        document.getElementById('admin-cust-dealer-filter').addEventListener('change', renderRows);
        document.getElementById('admin-cust-sort').addEventListener('change', renderRows);

        // CSV Export
        document.getElementById('admin-cust-export').addEventListener('click', () => {
            const hdrs = ['Name','Email','Company','Phone','Zip','Dealers','Quotes','Value','Last Contact','Notes'];
            const rows = customers.map(c => [
                c.name || '', c.email || '', c.company || '', c.phone || '',
                c.zipCode || c.zip || '',
                (c.dealers || (c.dealerCode ? [c.dealerCode] : [])).join('; '),
                c._quoteCount || 0,
                (c._totalValue || 0).toFixed(2),
                c.lastContact ? new Date(c.lastContact).toLocaleDateString() : '',
                (c.notes || '').replace(/"/g, '""')
            ]);
            let csv = hdrs.map(h => '"' + h + '"').join(',') + '\n';
            rows.forEach(r => { csv += r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',') + '\n'; });
            const blob = new Blob([csv], { type: 'text/csv' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'ameridex-customers-' + new Date().toISOString().split('T')[0] + '.csv';
            a.click();
        });

        // ---- Detail View ----
        function showDetail(id) {
            const c = customers.find(x => (x.id || x._id) === id);
            if (!c) return;
            const panel = document.getElementById('admin-cust-detail');
            const cq = c._quotes || [];

            let d = '';
            d += '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:1rem;margin-bottom:1rem;">';
            d += '<div><h3 style="margin:0 0 0.25rem;font-size:1.15rem;color:#111827;">' + esc(c.name || 'Unknown') + '</h3>';
            if (c.company) d += '<div style="font-size:0.9rem;color:#6b7280;">' + esc(c.company) + '</div>';
            d += '</div>';
            d += '<button id="admin-cust-detail-close" style="padding:0.4rem 0.8rem;background:#f3f4f6;border:none;border-radius:6px;cursor:pointer;font-size:0.85rem;font-weight:600;">Close</button>';
            d += '</div>';

            d += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:1rem;margin-bottom:1.25rem;">';
            d += infoField('Email', c.email);
            d += infoField('Phone', c.phone);
            d += infoField('Zip', c.zipCode || c.zip);
            d += infoField('Dealers', (c.dealers || (c.dealerCode ? [c.dealerCode] : [])).join(', '));
            d += infoField('First Contact', c.firstContact ? new Date(c.firstContact).toLocaleDateString() : 'N/A');
            d += infoField('Last Contact', c.lastContact ? new Date(c.lastContact).toLocaleDateString() : 'N/A');
            d += infoField('Total Quotes', String(c._quoteCount || 0));
            d += infoField('Lifetime Value', '$' + (c._totalValue || 0).toFixed(2));
            d += '</div>';

            // Notes
            d += '<div style="margin-bottom:1.25rem;">';
            d += '<label style="font-size:0.85rem;font-weight:600;color:#374151;display:block;margin-bottom:0.3rem;">Admin Notes</label>';
            d += '<textarea id="admin-cust-notes" rows="2" style="width:100%;padding:0.6rem;border:1px solid #e5e7eb;border-radius:8px;font-size:0.9rem;resize:vertical;">' + esc(c.notes || '') + '</textarea>';
            d += '<button id="admin-cust-save-notes" style="margin-top:0.4rem;padding:0.35rem 0.85rem;background:#2563eb;color:white;border:none;border-radius:6px;font-size:0.8rem;font-weight:600;cursor:pointer;">Save Notes</button>';
            d += '</div>';

            // Quote history
            if (cq.length) {
                d += '<h4 style="margin:0 0 0.5rem;font-size:0.95rem;color:#374151;">Quote History</h4>';
                d += '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:0.85rem;">';
                d += '<thead><tr style="background:#f3f4f6;">';
                d += '<th style="padding:0.5rem;text-align:left;border-bottom:1px solid #e5e7eb;">Quote #</th>';
                d += '<th style="padding:0.5rem;text-align:left;border-bottom:1px solid #e5e7eb;">Dealer</th>';
                d += '<th style="padding:0.5rem;text-align:center;border-bottom:1px solid #e5e7eb;">Items</th>';
                d += '<th style="padding:0.5rem;text-align:right;border-bottom:1px solid #e5e7eb;">Total</th>';
                d += '<th style="padding:0.5rem;text-align:center;border-bottom:1px solid #e5e7eb;">Status</th>';
                d += '<th style="padding:0.5rem;text-align:left;border-bottom:1px solid #e5e7eb;">Date</th>';
                d += '</tr></thead><tbody>';

                cq.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).forEach(q => {
                    const sc = { draft:'#6b7280', submitted:'#2563eb', reviewed:'#7c3aed', approved:'#16a34a', rejected:'#dc2626', revision:'#f59e0b' };
                    const color = sc[q.status] || '#6b7280';
                    d += '<tr style="border-bottom:1px solid #f3f4f6;">';
                    d += '<td style="padding:0.5rem;font-weight:600;color:#2563eb;">' + esc(q.quoteNumber || q.quoteId || 'N/A') + '</td>';
                    d += '<td style="padding:0.5rem;">' + esc(q.dealerCode || '') + '</td>';
                    d += '<td style="padding:0.5rem;text-align:center;">' + (q.lineItems ? q.lineItems.length : 0) + '</td>';
                    d += '<td style="padding:0.5rem;text-align:right;font-weight:600;">$' + (q.totalAmount || q.total || 0).toFixed(2) + '</td>';
                    d += '<td style="padding:0.5rem;text-align:center;"><span style="background:' + color + '22;color:' + color + ';padding:0.15rem 0.5rem;border-radius:999px;font-size:0.75rem;font-weight:600;text-transform:capitalize;">' + (q.status || 'draft') + '</span></td>';
                    d += '<td style="padding:0.5rem;font-size:0.8rem;color:#6b7280;">' + (q.createdAt ? new Date(q.createdAt).toLocaleDateString() : 'N/A') + '</td>';
                    d += '</tr>';
                });
                d += '</tbody></table></div>';
            } else {
                d += '<div style="text-align:center;padding:1rem;color:#6b7280;font-size:0.9rem;">No quotes linked to this customer yet.</div>';
            }

            panel.innerHTML = d;
            panel.style.display = 'block';
            panel.scrollIntoView({ behavior: 'smooth', block: 'start' });

            document.getElementById('admin-cust-detail-close').onclick = () => { panel.style.display = 'none'; };
            document.getElementById('admin-cust-save-notes').onclick = async () => {
                const notes = document.getElementById('admin-cust-notes').value;
                try {
                    const token = localStorage.getItem('ameridex-auth-token');
                    const res = await fetch('/api/admin/customers/' + id, {
                        method: 'PUT',
                        headers: { 'Authorization': 'Bearer ' + (token || ''), 'Content-Type': 'application/json' },
                        body: JSON.stringify({ notes })
                    });
                    if (res.ok) {
                        c.notes = notes;
                        const btn = document.getElementById('admin-cust-save-notes');
                        btn.textContent = 'Saved!'; btn.style.background = '#16a34a';
                        setTimeout(() => { btn.textContent = 'Save Notes'; btn.style.background = '#2563eb'; }, 1500);
                    }
                } catch (err) { alert('Failed to save: ' + err.message); }
            };
        }

        // ---- Edit View ----
        function showEdit(id) {
            const c = customers.find(x => (x.id || x._id) === id);
            if (!c) return;
            const panel = document.getElementById('admin-cust-detail');

            let e = '';
            e += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">';
            e += '<h3 style="margin:0;font-size:1.05rem;color:#2563eb;">Edit Customer</h3>';
            e += '<button id="admin-cust-edit-cancel" style="padding:0.4rem 0.8rem;background:#f3f4f6;border:none;border-radius:6px;cursor:pointer;font-size:0.85rem;font-weight:600;">Cancel</button>';
            e += '</div>';

            e += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;">';
            e += editField('edit-cust-name', 'Name', c.name);
            e += editField('edit-cust-email', 'Email', c.email);
            e += editField('edit-cust-company', 'Company', c.company);
            e += editField('edit-cust-phone', 'Phone', c.phone);
            e += editField('edit-cust-zip', 'Zip Code', c.zipCode || c.zip);
            e += '</div>';

            e += '<div style="margin-top:1rem;">';
            e += '<label style="font-size:0.85rem;font-weight:600;color:#374151;display:block;margin-bottom:0.3rem;">Admin Notes</label>';
            e += '<textarea id="edit-cust-notes" rows="2" style="width:100%;padding:0.6rem;border:1px solid #e5e7eb;border-radius:8px;font-size:0.9rem;resize:vertical;">' + esc(c.notes || '') + '</textarea>';
            e += '</div>';

            e += '<div style="display:flex;gap:0.75rem;margin-top:1rem;">';
            e += '<button id="admin-cust-edit-save" style="padding:0.5rem 1.25rem;background:#2563eb;color:white;border:none;border-radius:8px;font-size:0.9rem;font-weight:600;cursor:pointer;">Save Changes</button>';
            e += '<button id="admin-cust-edit-cancel2" style="padding:0.5rem 1.25rem;background:#f3f4f6;color:#374151;border:none;border-radius:8px;font-size:0.9rem;font-weight:600;cursor:pointer;">Cancel</button>';
            e += '</div>';

            panel.innerHTML = e;
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
                if (!updates.name || !updates.email) { alert('Name and email are required.'); return; }
                try {
                    const token = localStorage.getItem('ameridex-auth-token');
                    const res = await fetch('/api/admin/customers/' + id, {
                        method: 'PUT',
                        headers: { 'Authorization': 'Bearer ' + (token || ''), 'Content-Type': 'application/json' },
                        body: JSON.stringify(updates)
                    });
                    if (res.ok) {
                        const updated = await res.json();
                        Object.assign(c, updated);
                        panel.style.display = 'none';
                        renderRows();
                    } else {
                        const err = await res.json().catch(() => ({}));
                        alert('Error: ' + (err.error || 'Unknown error'));
                    }
                } catch (err) { alert('Failed: ' + err.message); }
            };
        }
    }

    // -------------------------------------------------------
    // HELPERS
    // -------------------------------------------------------
    function statCard(label, value, color) {
        return '<div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:0.85rem 1rem;text-align:center;">'
            + '<div style="font-size:1.3rem;font-weight:700;color:' + color + ';">' + value + '</div>'
            + '<div style="font-size:0.78rem;color:#6b7280;margin-top:0.2rem;">' + label + '</div></div>';
    }

    function infoField(label, value) {
        return '<div><div style="font-size:0.78rem;color:#6b7280;font-weight:600;margin-bottom:0.15rem;">' + label + '</div>'
            + '<div style="font-size:0.92rem;color:#111827;">' + esc(value || 'N/A') + '</div></div>';
    }

    function editField(id, label, value) {
        return '<div><label for="' + id + '" style="font-size:0.85rem;font-weight:600;color:#374151;display:block;margin-bottom:0.25rem;">' + label + '</label>'
            + '<input type="text" id="' + id + '" value="' + esc(value || '') + '" style="width:100%;padding:0.55rem 0.75rem;border:1px solid #e5e7eb;border-radius:8px;font-size:0.9rem;"></div>';
    }

    function esc(str) {
        const d = document.createElement('div');
        d.textContent = str || '';
        return d.innerHTML;
    }

})();
