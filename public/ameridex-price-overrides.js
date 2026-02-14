// ============================================================
// AmeriDex Dealer Portal - Price Override System UI v1.0
// File: ameridex-price-overrides.js
// Date: 2026-02-14
// ============================================================
// Frontend UI for the GM approval workflow on price overrides.
//
// FEATURES:
// - "Override" button on each line item in quote builder
// - Request override modal (price + reason required)
// - Visual badges for override states (pending/approved/rejected)
// - GM dashboard widget showing pending overrides count
// - Approve/reject controls for GM/admin roles
// - Submit button validation (blocks if pending overrides)
// - Role-aware: frontdesk creates pending, GM auto-approves
//
// INTEGRATION:
// - Patches existing quote builder UI via mutation observer
// - Uses window.ameridexAPI() for all backend calls
// - Reads dealer role from window.currentDealer or token payload
// - Self-contained, no dependencies beyond ameridex-api.js
// ============================================================

(function () {
    'use strict';

    let _initialized = false;
    let _modalElement = null;
    let _currentQuote = null;
    let _currentItemIndex = null;
    let _dealerRole = null;

    // ========================================================
    // INITIALIZATION
    // ========================================================
    function init() {
        if (_initialized) return;
        _initialized = true;

        console.log('[PriceOverrides] Initializing v1.0');

        // Determine dealer role from session
        const api = window.ameridexAPI;
        if (api && typeof api.getCurrentUser === 'function') {
            const currentDealer = api.getCurrentUser();
            _dealerRole = currentDealer ? currentDealer.role : null;
        }

        // Create the override modal
        createModal();

        // Inject GM approval widget if role is GM or admin
        if (_dealerRole === 'gm' || _dealerRole === 'admin') {
            injectGMWidget();
        }

        // Watch for quote builder rendering
        observeQuoteBuilder();

        console.log('[PriceOverrides] Initialized for role: ' + (_dealerRole || 'unknown'));
    }

    // ========================================================
    // QUOTE BUILDER PATCHING
    // ========================================================
    function observeQuoteBuilder() {
        const observer = new MutationObserver(() => {
            patchQuoteBuilder();
        });
        observer.observe(document.body, { childList: true, subtree: true });

        // Initial patch
        setTimeout(() => patchQuoteBuilder(), 500);
        setInterval(() => patchQuoteBuilder(), 2000);
    }

    function patchQuoteBuilder() {
        // Find the quote line items table
        const tables = document.querySelectorAll('table');
        for (const table of tables) {
            const headers = Array.from(table.querySelectorAll('th, thead td')).map(h => h.textContent.trim().toLowerCase());
            if (headers.some(h => h.includes('product') || h.includes('item')) &&
                headers.some(h => h.includes('price') || h.includes('total'))) {
                patchLineItemTable(table);
            }
        }

        // Patch submit button
        patchSubmitButton();
    }

    function patchLineItemTable(table) {
        const tbody = table.querySelector('tbody');
        if (!tbody) return;

        const rows = Array.from(tbody.querySelectorAll('tr')).filter(r => !r.classList.contains('override-patched'));
        if (rows.length === 0) return;

        rows.forEach((row, idx) => {
            row.classList.add('override-patched');

            // Look for a price cell (usually has $ or numeric content)
            const cells = Array.from(row.querySelectorAll('td'));
            const priceCell = cells.find(c => /\$|\d+\.\d{2}/.test(c.textContent));
            if (!priceCell) return;

            // Look for an action cell (usually last cell with buttons)
            let actionCell = cells[cells.length - 1];
            if (!actionCell.querySelector('button') && cells.length > 1) {
                // If last cell has no buttons, use second-to-last
                actionCell = cells[cells.length - 2];
            }

            // Check if this item already has an override button
            if (actionCell.querySelector('.override-btn')) return;

            // Inject override button
            const btn = document.createElement('button');
            btn.className = 'override-btn';
            btn.textContent = 'Override';
            btn.style.cssText = 'padding:0.3rem 0.6rem;background:#f59e0b;color:white;border:none;border-radius:6px;font-size:0.8rem;font-weight:600;cursor:pointer;margin-left:0.3rem;';
            btn.dataset.itemIndex = idx;
            btn.onclick = () => openOverrideModal(idx, row);
            actionCell.appendChild(btn);

            // If there's override data in the row, add a badge
            // (This requires the quote data to be accessible. We'll inject
            // badges after API calls. For now, mark rows for future updates.)
            row.dataset.itemIndex = idx;
        });
    }

    function patchSubmitButton() {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
            const text = btn.textContent.trim().toLowerCase();
            if ((text === 'submit quote' || text === 'submit') && !btn.dataset.overridePatch) {
                btn.dataset.overridePatch = 'true';
                const originalClick = btn.onclick;
                btn.onclick = async (e) => {
                    if (await hasP endingOverrides()) {
                        e.preventDefault();
                        e.stopPropagation();
                        alert('This quote has pending price overrides. Please wait for GM approval before submitting.');
                        return false;
                    }
                    if (originalClick) originalClick.call(btn, e);
                };
            }
        }
    }

    async function hasPendingOverrides() {
        // Check if current quote (if loaded) has pending overrides
        // This is a heuristic check. Real implementation would inspect
        // the quote object from the page context.
        const quoteData = getQuoteDataFromPage();
        if (!quoteData || !quoteData.lineItems) return false;
        return quoteData.lineItems.some(item =>
            item.priceOverride && item.priceOverride.status === 'pending'
        );
    }

    function getQuoteDataFromPage() {
        // Try to extract quote data from the page context
        // This is a placeholder. In real implementation, we'd hook into
        // the quote builder's state management or parse from DOM.
        if (window._currentQuote) return window._currentQuote;
        return null;
    }

    // ========================================================
    // OVERRIDE MODAL
    // ========================================================
    function createModal() {
        _modalElement = document.createElement('div');
        _modalElement.id = 'ameridex-override-modal';
        _modalElement.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:10000;align-items:center;justify-content:center;';
        _modalElement.innerHTML = `
            <div style="background:white;border-radius:12px;padding:1.5rem;width:90%;max-width:500px;box-shadow:0 10px 40px rgba(0,0,0,0.2);">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
                    <h3 id="override-modal-title" style="margin:0;font-size:1.1rem;color:#111827;">Request Price Override</h3>
                    <button id="override-modal-close" style="background:none;border:none;font-size:1.5rem;color:#6b7280;cursor:pointer;padding:0;">&times;</button>
                </div>
                <div id="override-modal-body"></div>
            </div>
        `;
        document.body.appendChild(_modalElement);

        // Close handlers
        document.getElementById('override-modal-close').onclick = closeModal;
        _modalElement.onclick = (e) => {
            if (e.target === _modalElement) closeModal();
        };
    }

    function openOverrideModal(itemIndex, row) {
        _currentItemIndex = itemIndex;
        _currentQuote = getQuoteDataFromPage();

        if (!_currentQuote) {
            alert('Quote data not available. Please refresh and try again.');
            return;
        }

        const item = _currentQuote.lineItems[itemIndex];
        if (!item) {
            alert('Line item not found.');
            return;
        }

        const override = item.priceOverride;
        const mode = determineMode(override);

        renderModalBody(mode, item);
        _modalElement.style.display = 'flex';
    }

    function determineMode(override) {
        if (!override) return 'request';
        if (override.status === 'pending' && _dealerRole === 'frontdesk') return 'edit';
        if (override.status === 'pending' && (_dealerRole === 'gm' || _dealerRole === 'admin')) return 'gm-review';
        if (override.status === 'approved') return 'view-approved';
        if (override.status === 'rejected') return 'view-rejected';
        return 'request';
    }

    function renderModalBody(mode, item) {
        const body = document.getElementById('override-modal-body');
        const title = document.getElementById('override-modal-title');

        const tierPrice = item.tierPrice || item.price;
        const override = item.priceOverride;

        if (mode === 'request') {
            title.textContent = 'Request Price Override';
            body.innerHTML = `
                <div style="margin-bottom:1rem;">
                    <div style="font-size:0.9rem;color:#6b7280;margin-bottom:0.5rem;"><strong>Product:</strong> ${esc(item.productName || 'Unknown')}</div>
                    <div style="font-size:0.9rem;color:#6b7280;margin-bottom:0.5rem;"><strong>Tier Price:</strong> $${tierPrice.toFixed(2)}</div>
                </div>
                <div style="margin-bottom:1rem;">
                    <label style="font-size:0.85rem;font-weight:600;color:#374151;display:block;margin-bottom:0.3rem;">Requested Price *</label>
                    <input type="number" id="override-price-input" step="0.01" min="0" value="${tierPrice.toFixed(2)}" style="width:100%;padding:0.6rem;border:1px solid #e5e7eb;border-radius:8px;font-size:0.95rem;">
                </div>
                <div style="margin-bottom:1rem;">
                    <label style="font-size:0.85rem;font-weight:600;color:#374151;display:block;margin-bottom:0.3rem;">Reason for Override *</label>
                    <textarea id="override-reason-input" rows="3" placeholder="e.g., Competitor match, bulk discount, repeat customer..." style="width:100%;padding:0.6rem;border:1px solid #e5e7eb;border-radius:8px;font-size:0.95rem;resize:vertical;"></textarea>
                    <div style="font-size:0.75rem;color:#6b7280;margin-top:0.25rem;">A clear reason is required for all price overrides.</div>
                </div>
                <div style="display:flex;gap:0.75rem;">
                    <button id="override-request-btn" style="flex:1;padding:0.6rem;background:#f59e0b;color:white;border:none;border-radius:8px;font-size:0.95rem;font-weight:600;cursor:pointer;">Request Override</button>
                    <button id="override-cancel-btn" style="padding:0.6rem 1.25rem;background:#f3f4f6;color:#374151;border:none;border-radius:8px;font-size:0.95rem;font-weight:600;cursor:pointer;">Cancel</button>
                </div>
            `;

            document.getElementById('override-request-btn').onclick = () => requestOverride(item);
            document.getElementById('override-cancel-btn').onclick = closeModal;

        } else if (mode === 'edit') {
            title.textContent = 'Edit Pending Override';
            body.innerHTML = `
                <div style="margin-bottom:1rem;">
                    <div style="font-size:0.9rem;color:#6b7280;margin-bottom:0.5rem;"><strong>Product:</strong> ${esc(item.productName || 'Unknown')}</div>
                    <div style="font-size:0.9rem;color:#6b7280;margin-bottom:0.5rem;"><strong>Tier Price:</strong> $${tierPrice.toFixed(2)}</div>
                    <div style="padding:0.5rem;background:#fef3c7;border:1px solid #fbbf24;border-radius:6px;font-size:0.85rem;color:#92400e;margin-bottom:0.5rem;">⏳ Waiting for GM approval</div>
                </div>
                <div style="margin-bottom:1rem;">
                    <label style="font-size:0.85rem;font-weight:600;color:#374151;display:block;margin-bottom:0.3rem;">Requested Price</label>
                    <input type="number" id="override-price-input" step="0.01" min="0" value="${override.requestedPrice.toFixed(2)}" style="width:100%;padding:0.6rem;border:1px solid #e5e7eb;border-radius:8px;font-size:0.95rem;">
                </div>
                <div style="margin-bottom:1rem;">
                    <label style="font-size:0.85rem;font-weight:600;color:#374151;display:block;margin-bottom:0.3rem;">Reason</label>
                    <textarea id="override-reason-input" rows="3" style="width:100%;padding:0.6rem;border:1px solid #e5e7eb;border-radius:8px;font-size:0.95rem;resize:vertical;">${esc(override.reason || '')}</textarea>
                </div>
                <div style="display:flex;gap:0.75rem;">
                    <button id="override-update-btn" style="flex:1;padding:0.6rem;background:#f59e0b;color:white;border:none;border-radius:8px;font-size:0.95rem;font-weight:600;cursor:pointer;">Update Request</button>
                    <button id="override-cancel-request-btn" style="padding:0.6rem 1rem;background:#ef4444;color:white;border:none;border-radius:8px;font-size:0.95rem;font-weight:600;cursor:pointer;">Cancel Request</button>
                </div>
            `;

            document.getElementById('override-update-btn').onclick = () => requestOverride(item);
            document.getElementById('override-cancel-request-btn').onclick = () => {
                if (confirm('Are you sure you want to cancel this override request?')) {
                    // TODO: Implement cancel API or just revert to tier price
                    closeModal();
                }
            };

        } else if (mode === 'gm-review') {
            title.textContent = 'Review Price Override';
            body.innerHTML = `
                <div style="margin-bottom:1rem;">
                    <div style="font-size:0.9rem;color:#6b7280;margin-bottom:0.5rem;"><strong>Product:</strong> ${esc(item.productName || 'Unknown')}</div>
                    <div style="font-size:0.9rem;color:#6b7280;margin-bottom:0.5rem;"><strong>Tier Price:</strong> $${tierPrice.toFixed(2)}</div>
                    <div style="font-size:0.9rem;color:#6b7280;margin-bottom:0.5rem;"><strong>Requested Price:</strong> <span style="color:#f59e0b;font-weight:700;font-size:1.1rem;">$${override.requestedPrice.toFixed(2)}</span></div>
                    <div style="font-size:0.9rem;color:#6b7280;margin-bottom:0.5rem;"><strong>Requested By:</strong> ${esc(override.requestedBy)} on ${new Date(override.requestedAt).toLocaleString()}</div>
                </div>
                <div style="margin-bottom:1rem;">
                    <label style="font-size:0.85rem;font-weight:600;color:#374151;display:block;margin-bottom:0.3rem;">Reason</label>
                    <div style="padding:0.6rem;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;font-size:0.9rem;color:#111827;white-space:pre-wrap;">${esc(override.reason || 'No reason provided')}</div>
                </div>
                <div style="margin-bottom:1rem;">
                    <label style="font-size:0.85rem;font-weight:600;color:#374151;display:block;margin-bottom:0.3rem;">Rejection Reason (if rejecting)</label>
                    <textarea id="override-reject-reason-input" rows="2" placeholder="Optional: explain why this override is being rejected..." style="width:100%;padding:0.6rem;border:1px solid #e5e7eb;border-radius:8px;font-size:0.9rem;resize:vertical;"></textarea>
                </div>
                <div style="display:flex;gap:0.75rem;">
                    <button id="override-approve-btn" style="flex:1;padding:0.6rem;background:#16a34a;color:white;border:none;border-radius:8px;font-size:0.95rem;font-weight:600;cursor:pointer;">✓ Approve</button>
                    <button id="override-reject-btn" style="flex:1;padding:0.6rem;background:#ef4444;color:white;border:none;border-radius:8px;font-size:0.95rem;font-weight:600;cursor:pointer;">✗ Reject</button>
                </div>
            `;

            document.getElementById('override-approve-btn').onclick = () => approveOverride(item);
            document.getElementById('override-reject-btn').onclick = () => rejectOverride(item);

        } else if (mode === 'view-approved') {
            title.textContent = 'Price Override (Approved)';
            body.innerHTML = `
                <div style="margin-bottom:1rem;">
                    <div style="font-size:0.9rem;color:#6b7280;margin-bottom:0.5rem;"><strong>Product:</strong> ${esc(item.productName || 'Unknown')}</div>
                    <div style="font-size:0.9rem;color:#6b7280;margin-bottom:0.5rem;"><strong>Original Tier Price:</strong> <span style="text-decoration:line-through;">$${tierPrice.toFixed(2)}</span></div>
                    <div style="font-size:0.9rem;color:#6b7280;margin-bottom:0.5rem;"><strong>Override Price:</strong> <span style="color:#16a34a;font-weight:700;font-size:1.1rem;">$${override.requestedPrice.toFixed(2)}</span></div>
                </div>
                <div style="padding:0.6rem;background:#dcfce7;border:1px solid #16a34a;border-radius:6px;font-size:0.85rem;color:#166534;margin-bottom:1rem;">✓ Approved by ${esc(override.approvedBy)} on ${new Date(override.approvedAt).toLocaleString()}</div>
                <div style="margin-bottom:1rem;">
                    <label style="font-size:0.85rem;font-weight:600;color:#374151;display:block;margin-bottom:0.3rem;">Reason</label>
                    <div style="padding:0.6rem;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;font-size:0.9rem;color:#111827;white-space:pre-wrap;">${esc(override.reason || 'No reason provided')}</div>
                </div>
                <button id="override-close-btn" style="width:100%;padding:0.6rem;background:#f3f4f6;color:#374151;border:none;border-radius:8px;font-size:0.95rem;font-weight:600;cursor:pointer;">Close</button>
            `;

            document.getElementById('override-close-btn').onclick = closeModal;

        } else if (mode === 'view-rejected') {
            title.textContent = 'Price Override (Rejected)';
            body.innerHTML = `
                <div style="margin-bottom:1rem;">
                    <div style="font-size:0.9rem;color:#6b7280;margin-bottom:0.5rem;"><strong>Product:</strong> ${esc(item.productName || 'Unknown')}</div>
                    <div style="font-size:0.9rem;color:#6b7280;margin-bottom:0.5rem;"><strong>Tier Price:</strong> $${tierPrice.toFixed(2)}</div>
                    <div style="font-size:0.9rem;color:#6b7280;margin-bottom:0.5rem;"><strong>Requested Price:</strong> <span style="text-decoration:line-through;color:#ef4444;">$${override.requestedPrice.toFixed(2)}</span></div>
                </div>
                <div style="padding:0.6rem;background:#fee2e2;border:1px solid #ef4444;border-radius:6px;font-size:0.85rem;color:#991b1b;margin-bottom:1rem;">✗ Rejected by ${esc(override.rejectedBy)} on ${new Date(override.rejectedAt).toLocaleString()}</div>
                <div style="margin-bottom:1rem;">
                    <label style="font-size:0.85rem;font-weight:600;color:#374151;display:block;margin-bottom:0.3rem;">Your Reason</label>
                    <div style="padding:0.6rem;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;font-size:0.9rem;color:#111827;white-space:pre-wrap;">${esc(override.reason || 'No reason provided')}</div>
                </div>
                ${override.rejectedReason ? `
                <div style="margin-bottom:1rem;">
                    <label style="font-size:0.85rem;font-weight:600;color:#374151;display:block;margin-bottom:0.3rem;">Rejection Reason</label>
                    <div style="padding:0.6rem;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;font-size:0.9rem;color:#991b1b;white-space:pre-wrap;">${esc(override.rejectedReason)}</div>
                </div>` : ''}
                <div style="display:flex;gap:0.75rem;">
                    <button id="override-request-again-btn" style="flex:1;padding:0.6rem;background:#f59e0b;color:white;border:none;border-radius:8px;font-size:0.95rem;font-weight:600;cursor:pointer;">Request Again</button>
                    <button id="override-close-btn" style="padding:0.6rem 1.25rem;background:#f3f4f6;color:#374151;border:none;border-radius:8px;font-size:0.95rem;font-weight:600;cursor:pointer;">Close</button>
                </div>
            `;

            document.getElementById('override-request-again-btn').onclick = () => {
                // Clear rejection and open request mode
                item.priceOverride = null;
                renderModalBody('request', item);
            };
            document.getElementById('override-close-btn').onclick = closeModal;
        }
    }

    function closeModal() {
        _modalElement.style.display = 'none';
        _currentQuote = null;
        _currentItemIndex = null;
    }

    // ========================================================
    // API ACTIONS
    // ========================================================
    async function requestOverride(item) {
        const price = parseFloat(document.getElementById('override-price-input').value);
        const reason = document.getElementById('override-reason-input').value.trim();

        if (isNaN(price) || price < 0) {
            alert('Please enter a valid price.');
            return;
        }
        if (!reason) {
            alert('A reason is required for all price overrides.');
            return;
        }

        const api = window.ameridexAPI;
        if (!api) {
            alert('API not available. Please refresh and try again.');
            return;
        }

        try {
            const result = await api('POST', `/api/quotes/${_currentQuote.id}/items/${_currentItemIndex}/request-override`, {
                requestedPrice: price,
                reason: reason
            });

            alert(result.message || 'Override request submitted successfully');
            closeModal();

            // Refresh the quote view
            refreshQuoteView();

        } catch (err) {
            alert('Failed to request override: ' + (err.message || 'Unknown error'));
        }
    }

    async function approveOverride(item) {
        const api = window.ameridexAPI;
        if (!api) {
            alert('API not available.');
            return;
        }

        try {
            const result = await api('POST', `/api/quotes/${_currentQuote.id}/items/${_currentItemIndex}/approve-override`);
            alert('Price override approved successfully');
            closeModal();
            refreshQuoteView();
            refreshGMWidget();
        } catch (err) {
            alert('Failed to approve: ' + (err.message || 'Unknown error'));
        }
    }

    async function rejectOverride(item) {
        const rejectedReason = document.getElementById('override-reject-reason-input').value.trim();

        const api = window.ameridexAPI;
        if (!api) {
            alert('API not available.');
            return;
        }

        try {
            const result = await api('POST', `/api/quotes/${_currentQuote.id}/items/${_currentItemIndex}/reject-override`, {
                rejectedReason: rejectedReason || null
            });
            alert('Price override rejected');
            closeModal();
            refreshQuoteView();
            refreshGMWidget();
        } catch (err) {
            alert('Failed to reject: ' + (err.message || 'Unknown error'));
        }
    }

    function refreshQuoteView() {
        // Trigger quote reload if there's a refresh mechanism
        if (window.loadQuote && _currentQuote && _currentQuote.id) {
            window.loadQuote(_currentQuote.id);
        } else {
            // Fallback: reload page
            setTimeout(() => window.location.reload(), 500);
        }
    }

    // ========================================================
    // GM APPROVAL WIDGET
    // ========================================================
    function injectGMWidget() {
        // Find the dealer dashboard container
        const interval = setInterval(() => {
            const dashboard = findDashboardContainer();
            if (dashboard && !document.getElementById('ameridex-gm-override-widget')) {
                clearInterval(interval);
                const widget = createGMWidget();
                dashboard.insertBefore(widget, dashboard.firstChild);
                loadGMWidgetData();
            }
        }, 500);

        setTimeout(() => clearInterval(interval), 10000);
    }

    function findDashboardContainer() {
        // Look for a container that likely holds dashboard content
        const candidates = document.querySelectorAll('[class*="dashboard"], [id*="dashboard"], main, .content, #content');
        for (const el of candidates) {
            if (el.querySelector('h1, h2, h3') || el.textContent.includes('Dashboard') || el.textContent.includes('Welcome')) {
                return el;
            }
        }
        return document.querySelector('main') || document.body;
    }

    function createGMWidget() {
        const widget = document.createElement('div');
        widget.id = 'ameridex-gm-override-widget';
        widget.style.cssText = 'background:#fffbeb;border:2px solid #f59e0b;border-radius:12px;padding:1rem 1.25rem;margin-bottom:1.5rem;';
        widget.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <div>
                    <h3 style="margin:0 0 0.25rem;font-size:1rem;color:#92400e;display:flex;align-items:center;gap:0.5rem;">
                        <span style="font-size:1.2rem;">⏳</span>
                        <span id="gm-override-count">0 Price Overrides</span> Need Your Approval
                    </h3>
                    <p style="margin:0;font-size:0.85rem;color:#78350f;">Review and approve price override requests from your team</p>
                </div>
                <button id="gm-override-toggle" style="padding:0.5rem 1rem;background:#f59e0b;color:white;border:none;border-radius:8px;font-size:0.9rem;font-weight:600;cursor:pointer;">View Pending</button>
            </div>
            <div id="gm-override-list" style="display:none;margin-top:1rem;max-height:400px;overflow-y:auto;"></div>
        `;

        document.getElementById('gm-override-toggle').onclick = toggleGMWidget;
        return widget;
    }

    function toggleGMWidget() {
        const list = document.getElementById('gm-override-list');
        const btn = document.getElementById('gm-override-toggle');
        if (list.style.display === 'none') {
            list.style.display = 'block';
            btn.textContent = 'Hide';
        } else {
            list.style.display = 'none';
            btn.textContent = 'View Pending';
        }
    }

    async function loadGMWidgetData() {
        const api = window.ameridexAPI;
        if (!api) return;

        try {
            const data = await api('GET', '/api/quotes/pending-overrides');
            const pending = data.pending || [];
            const count = pending.length;

            document.getElementById('gm-override-count').textContent = count + (count === 1 ? ' Price Override' : ' Price Overrides');

            if (count === 0) {
                document.getElementById('gm-override-list').innerHTML = '<div style="text-align:center;padding:1rem;color:#78350f;font-size:0.9rem;">No pending overrides. Great job!</div>';
                return;
            }

            const list = document.getElementById('gm-override-list');
            list.innerHTML = pending.map(p => `
                <div style="background:white;border:1px solid #fbbf24;border-radius:8px;padding:0.75rem;margin-bottom:0.75rem;">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.5rem;">
                        <div>
                            <div style="font-weight:600;color:#111827;font-size:0.95rem;">${esc(p.productName)}</div>
                            <div style="font-size:0.8rem;color:#6b7280;margin-top:0.15rem;">Quote ${esc(p.quoteNumber)} • ${esc(p.customerName || 'N/A')}</div>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-size:0.85rem;color:#6b7280;text-decoration:line-through;">$${p.tierPrice.toFixed(2)}</div>
                            <div style="font-size:1.05rem;font-weight:700;color:#f59e0b;">$${p.requestedPrice.toFixed(2)}</div>
                        </div>
                    </div>
                    <div style="font-size:0.85rem;color:#374151;margin-bottom:0.5rem;padding:0.5rem;background:#f9fafb;border-radius:6px;">
                        <strong>Reason:</strong> ${esc(p.reason)}
                    </div>
                    <div style="font-size:0.75rem;color:#6b7280;margin-bottom:0.5rem;">Requested by ${esc(p.requestedBy)} • ${new Date(p.requestedAt).toLocaleString()}</div>
                    <div style="display:flex;gap:0.5rem;">
                        <button onclick="window.ameridexPriceOverrides.quickApprove('${p.quoteId}', ${p.itemIndex})" style="flex:1;padding:0.4rem;background:#16a34a;color:white;border:none;border-radius:6px;font-size:0.8rem;font-weight:600;cursor:pointer;">✓ Approve</button>
                        <button onclick="window.ameridexPriceOverrides.quickReject('${p.quoteId}', ${p.itemIndex})" style="flex:1;padding:0.4rem;background:#ef4444;color:white;border:none;border-radius:6px;font-size:0.8rem;font-weight:600;cursor:pointer;">✗ Reject</button>
                        <button onclick="window.ameridexPriceOverrides.openQuote('${p.quoteId}')" style="padding:0.4rem 0.75rem;background:#f3f4f6;color:#374151;border:none;border-radius:6px;font-size:0.8rem;font-weight:600;cursor:pointer;">View Quote</button>
                    </div>
                </div>
            `).join('');

        } catch (err) {
            console.error('[PriceOverrides] Failed to load GM widget data:', err);
        }
    }

    function refreshGMWidget() {
        if (document.getElementById('ameridex-gm-override-widget')) {
            loadGMWidgetData();
        }
    }

    // ========================================================
    // PUBLIC API (for GM widget inline handlers)
    // ========================================================
    window.ameridexPriceOverrides = {
        quickApprove: async function (quoteId, itemIndex) {
            const api = window.ameridexAPI;
            if (!api) return;
            if (!confirm('Approve this price override?')) return;
            try {
                await api('POST', `/api/quotes/${quoteId}/items/${itemIndex}/approve-override`);
                alert('Override approved');
                refreshGMWidget();
            } catch (err) {
                alert('Failed: ' + err.message);
            }
        },
        quickReject: async function (quoteId, itemIndex) {
            const api = window.ameridexAPI;
            if (!api) return;
            const reason = prompt('Rejection reason (optional):');
            if (reason === null) return; // canceled
            try {
                await api('POST', `/api/quotes/${quoteId}/items/${itemIndex}/reject-override`, {
                    rejectedReason: reason || null
                });
                alert('Override rejected');
                refreshGMWidget();
            } catch (err) {
                alert('Failed: ' + err.message);
            }
        },
        openQuote: function (quoteId) {
            // Navigate to quote detail or open in modal
            if (window.loadQuote) {
                window.loadQuote(quoteId);
            } else {
                alert('Quote ID: ' + quoteId + ' (navigation not implemented)');
            }
        }
    };

    // ========================================================
    // UTILITIES
    // ========================================================
    function esc(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }

    // ========================================================
    // AUTO-INIT
    // ========================================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 100);
    }

})();
