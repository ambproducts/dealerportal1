// ============================================================
// AmeriDex Dealer Portal - Price Override System v1.6
// Date: 2026-02-14
// ============================================================
// REQUIRES: ameridex-api.js, ameridex-pricing-fix.js loaded first
//
// Load order (managed by script-loader.js):
//   1. ameridex-patches.js
//   2. ameridex-api.js
//   3. ameridex-pricing-fix.js
//   4. ameridex-overrides.js      <-- this file
//   5. ameridex-roles.js
//   6. ameridex-admin.js
//   7. ameridex-admin-customers.js
//
// v1.6 Changes (2026-02-14):
//   - FIX: Race condition where override vanishes after save.
//     autoSaveQuoteThenOverride now waits for BOTH the save
//     AND the override API before refreshing the UI.
//   - FIX: fireOverrideAPI now returns its promise so callers
//     can chain on completion.
//   - FIX: syncLocalQuoteFromServer will never downgrade a
//     local override (approved/pending) to null from stale
//     server data, and will never overwrite a newer local
//     approved override with an older server timestamp.
//   - ADD: _localOverrideLock prevents concurrent server
//     fetches from clobbering in-flight overrides.
//
// v1.5 Changes (2026-02-14):
//   - ADD: GM/Admin real-time polling for pending overrides (30s).
//   - ADD: Polling pauses when browser tab is hidden, resumes on focus.
//   - ADD: Immediate refresh on tab re-focus before resuming interval.
//   - ADD: Polling stops if main-app becomes hidden (logout).
//
// v1.4 Changes (2026-02-14):
//   - ADD: Auto-save quote when frontdesk requests a pending override
//     on an unsaved quote, so the GM sees it immediately.
//   - ADD: After auto-save, fires the override API with the new
//     server ID so the pending override persists on the server.
//
// v1.3 Changes (2026-02-14):
//   - REWRITE: Overrides now operate client-side on the live
//     currentQuote.lineItems. No save required before overriding.
//   - GM/Admin override is instant. Frontdesk override sets pending.
//   - Multiple line items can be overridden in sequence.
// ============================================================

(function () {
    'use strict';

    // ----------------------------------------------------------
    // DEFENSIVE: escapeHTML fallback
    // ----------------------------------------------------------
    if (typeof window.escapeHTML !== 'function') {
        window.escapeHTML = function (str) {
            if (!str) return '';
            var div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        };
        console.warn('[Overrides] escapeHTML was not found from patches.js, using built-in fallback.');
    }

    var api = window.ameridexAPI;

    // ----------------------------------------------------------
    // OVERRIDE LOCK: Prevents server sync from clobbering
    // in-flight local overrides. Set to true while an override
    // is being applied locally and synced to the server.
    // ----------------------------------------------------------
    var _localOverrideLock = false;


    // ----------------------------------------------------------
    // 1. INJECT CSS FOR OVERRIDE UI
    // ----------------------------------------------------------
    var overrideCSS = document.createElement('style');
    overrideCSS.textContent = [
        '/* Override Badges */',
        '.override-badge{display:inline-flex;align-items:center;gap:0.25rem;padding:0.15rem 0.5rem;border-radius:999px;font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;white-space:nowrap;}',
        '.override-badge--pending{background:#fef3c7;color:#92400e;border:1px solid #fcd34d;}',
        '.override-badge--approved{background:#dcfce7;color:#166534;border:1px solid #86efac;}',
        '.override-badge--rejected{background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;}',
        '',
        '/* Override Button on Line Items */',
        '.btn-override{font-size:0.7rem;padding:0.2rem 0.5rem;border:1px solid #d1d5db;border-radius:4px;background:#f9fafb;color:#374151;cursor:pointer;white-space:nowrap;transition:all 0.15s;}',
        '.btn-override:hover{background:#eff6ff;border-color:#93c5fd;color:#1d4ed8;}',
        '.btn-override--active{background:#fef3c7;border-color:#fcd34d;color:#92400e;}',
        '',
        '/* Override Modal */',
        '.override-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:none;align-items:center;justify-content:center;padding:1rem;}',
        '.override-modal-overlay.active{display:flex;}',
        '.override-modal{background:#fff;border-radius:12px;box-shadow:0 25px 50px rgba(0,0,0,0.25);width:100%;max-width:480px;overflow:hidden;}',
        '.override-modal-header{padding:1.25rem 1.5rem;background:linear-gradient(135deg,#1e40af,#3b82f6);color:#fff;}',
        '.override-modal-header h3{margin:0;font-size:1.1rem;}',
        '.override-modal-header p{margin:0.25rem 0 0;font-size:0.8rem;opacity:0.85;}',
        '.override-modal-body{padding:1.25rem 1.5rem;}',
        '.override-modal-body .field{margin-bottom:1rem;}',
        '.override-modal-body label{display:block;font-size:0.8rem;font-weight:600;color:#374151;margin-bottom:0.35rem;}',
        '.override-modal-body input,.override-modal-body textarea{width:100%;padding:0.6rem 0.75rem;border:1px solid #d1d5db;border-radius:6px;font-size:0.9rem;box-sizing:border-box;}',
        '.override-modal-body textarea{resize:vertical;min-height:80px;}',
        '.override-modal-body .price-comparison{display:flex;gap:1.5rem;margin-bottom:1rem;padding:0.75rem;background:#f9fafb;border-radius:8px;}',
        '.override-modal-body .price-comparison div{flex:1;text-align:center;}',
        '.override-modal-body .price-comparison .price-label{font-size:0.7rem;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;}',
        '.override-modal-body .price-comparison .price-value{font-size:1.3rem;font-weight:700;color:#1e40af;margin-top:0.15rem;}',
        '.override-modal-body .price-comparison .price-value--new{color:#16a34a;}',
        '.override-modal-body .override-error{color:#dc2626;font-size:0.8rem;margin-top:0.25rem;display:none;}',
        '.override-modal-footer{padding:1rem 1.5rem;border-top:1px solid #e5e7eb;display:flex;justify-content:flex-end;gap:0.75rem;}',
        '.override-modal-footer .btn-cancel{padding:0.5rem 1.25rem;border:1px solid #d1d5db;border-radius:6px;background:#fff;color:#374151;cursor:pointer;font-size:0.85rem;}',
        '.override-modal-footer .btn-submit-override{padding:0.5rem 1.25rem;border:none;border-radius:6px;background:#1e40af;color:#fff;cursor:pointer;font-size:0.85rem;font-weight:600;}',
        '.override-modal-footer .btn-submit-override:disabled{opacity:0.5;cursor:not-allowed;}',
        '',
        '/* Override line item styling */',
        '.line-item-override-info{display:flex;align-items:center;gap:0.4rem;flex-wrap:wrap;margin-top:0.25rem;}',
        '.override-original-price{text-decoration:line-through;color:#9ca3af;font-size:0.8rem;}',
        '.override-arrow{color:#6b7280;font-size:0.75rem;}',
        '.override-new-price{font-weight:700;color:#16a34a;}',
        '',
        '/* GM Pending Overrides Widget */',
        '.gm-overrides-widget{background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:1rem 1.25rem;margin-bottom:1.5rem;}',
        '.gm-overrides-widget h3{margin:0 0 0.5rem;font-size:1rem;color:#92400e;display:flex;align-items:center;gap:0.5rem;}',
        '.gm-overrides-widget .pending-count{background:#f59e0b;color:#fff;font-size:0.75rem;font-weight:700;padding:0.15rem 0.55rem;border-radius:999px;min-width:1.5rem;text-align:center;}',
        '.gm-overrides-widget .override-review-item{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:0.75rem 1rem;margin-bottom:0.5rem;}',
        '.gm-overrides-widget .override-review-item:last-child{margin-bottom:0;}',
        '.gm-overrides-widget .override-review-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.35rem;}',
        '.gm-overrides-widget .override-review-product{font-weight:600;color:#1f2937;font-size:0.9rem;}',
        '.gm-overrides-widget .override-review-quote{font-size:0.75rem;color:#6b7280;}',
        '.gm-overrides-widget .override-review-prices{display:flex;align-items:center;gap:0.5rem;font-size:0.85rem;margin-bottom:0.25rem;}',
        '.gm-overrides-widget .override-review-reason{font-size:0.8rem;color:#6b7280;font-style:italic;margin-bottom:0.5rem;}',
        '.gm-overrides-widget .override-review-actions{display:flex;gap:0.5rem;}',
        '.gm-overrides-widget .btn-approve-override{padding:0.35rem 0.75rem;border:none;border-radius:5px;background:#16a34a;color:#fff;font-size:0.78rem;font-weight:600;cursor:pointer;}',
        '.gm-overrides-widget .btn-reject-override{padding:0.35rem 0.75rem;border:1px solid #dc2626;border-radius:5px;background:#fff;color:#dc2626;font-size:0.78rem;font-weight:600;cursor:pointer;}',
        '.gm-overrides-widget .override-review-requestedby{font-size:0.7rem;color:#9ca3af;margin-top:0.25rem;}',
        '',
        '/* Submit block warning */',
        '.submit-block-warning{background:#fef3c7;border:1px solid #fcd34d;color:#92400e;padding:0.6rem 1rem;border-radius:8px;font-size:0.85rem;margin-top:0.75rem;display:none;align-items:center;gap:0.5rem;}',
        '.submit-block-warning .warning-icon{font-size:1.1rem;}',
        '',
        '/* Reject reason modal */',
        '.reject-reason-input{margin-top:0.5rem;width:100%;padding:0.5rem;border:1px solid #d1d5db;border-radius:6px;font-size:0.85rem;resize:vertical;min-height:60px;}'
    ].join('\n');
    document.head.appendChild(overrideCSS);


    // ----------------------------------------------------------
    // 2. CREATE OVERRIDE REQUEST MODAL (injected once)
    // ----------------------------------------------------------
    var modalHTML =
        '<div class="override-modal-overlay" id="override-modal-overlay">' +
            '<div class="override-modal">' +
                '<div class="override-modal-header">' +
                    '<h3 id="override-modal-title">Override Price</h3>' +
                    '<p id="override-modal-subtitle">Product name here</p>' +
                '</div>' +
                '<div class="override-modal-body">' +
                    '<div class="price-comparison">' +
                        '<div>' +
                            '<div class="price-label">Tier Price</div>' +
                            '<div class="price-value" id="override-tier-price">$0.00</div>' +
                        '</div>' +
                        '<div>' +
                            '<div class="price-label">New Price</div>' +
                            '<div class="price-value price-value--new" id="override-new-price-display">$0.00</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="field">' +
                        '<label for="override-price-input">Override Price ($)</label>' +
                        '<input type="number" id="override-price-input" min="0" step="0.01" placeholder="Enter new price">' +
                    '</div>' +
                    '<div class="field">' +
                        '<label for="override-reason-input">Reason (required)</label>' +
                        '<textarea id="override-reason-input" placeholder="Why is this override needed? e.g., Competitor match, volume deal, customer loyalty..."></textarea>' +
                    '</div>' +
                    '<div class="override-error" id="override-error"></div>' +
                '</div>' +
                '<div class="override-modal-footer">' +
                    '<button type="button" class="btn-cancel" id="override-cancel-btn">Cancel</button>' +
                    '<button type="button" class="btn-submit-override" id="override-submit-btn">Request Override</button>' +
                '</div>' +
            '</div>' +
        '</div>';

    var modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHTML;
    document.body.appendChild(modalContainer.firstElementChild);

    // State for currently open override
    var _overrideTarget = null; // { itemIndex, tierPrice, productName }


    // ----------------------------------------------------------
    // 3. MODAL BEHAVIOR
    // ----------------------------------------------------------
    function openOverrideModal(quoteServerId, itemIndex, tierPrice, productName) {
        var user = window.getCurrentUser ? window.getCurrentUser() : null;
        var role = user ? user.role : 'frontdesk';
        var canApprove = (role === 'gm' || role === 'admin' || role === 'dealer' || role === 'rep');

        _overrideTarget = {
            quoteServerId: quoteServerId,
            itemIndex: itemIndex,
            tierPrice: tierPrice,
            productName: productName
        };

        document.getElementById('override-modal-subtitle').textContent = productName;
        document.getElementById('override-tier-price').textContent = '$' + tierPrice.toFixed(2);
        document.getElementById('override-new-price-display').textContent = '$0.00';
        document.getElementById('override-price-input').value = '';
        document.getElementById('override-reason-input').value = '';
        document.getElementById('override-error').style.display = 'none';

        var submitBtn = document.getElementById('override-submit-btn');
        if (canApprove) {
            submitBtn.textContent = 'Apply Override';
            document.getElementById('override-modal-title').textContent = 'Override Price (Immediate)';
        } else {
            submitBtn.textContent = 'Request Override';
            document.getElementById('override-modal-title').textContent = 'Request Price Override';
        }
        submitBtn.disabled = false;

        document.getElementById('override-modal-overlay').classList.add('active');
        setTimeout(function () {
            document.getElementById('override-price-input').focus();
        }, 100);
    }

    function closeOverrideModal() {
        document.getElementById('override-modal-overlay').classList.remove('active');
        _overrideTarget = null;
    }

    // Live price preview
    document.getElementById('override-price-input').addEventListener('input', function () {
        var val = parseFloat(this.value);
        var display = document.getElementById('override-new-price-display');
        if (!isNaN(val) && val >= 0) {
            display.textContent = '$' + val.toFixed(2);
        } else {
            display.textContent = '$0.00';
        }
    });

    document.getElementById('override-cancel-btn').addEventListener('click', closeOverrideModal);
    document.getElementById('override-modal-overlay').addEventListener('click', function (e) {
        if (e.target === this) closeOverrideModal();
    });


    // ----------------------------------------------------------
    // 3b. APPLY OVERRIDE: Client-side, no save required
    // ----------------------------------------------------------
    document.getElementById('override-submit-btn').addEventListener('click', function () {
        if (!_overrideTarget) return;

        var priceInput = document.getElementById('override-price-input');
        var reasonInput = document.getElementById('override-reason-input');
        var errorEl = document.getElementById('override-error');
        var submitBtn = this;

        var price = parseFloat(priceInput.value);
        var reason = reasonInput.value.trim();

        errorEl.style.display = 'none';

        if (isNaN(price) || price < 0) {
            errorEl.textContent = 'Please enter a valid price';
            errorEl.style.display = 'block';
            priceInput.focus();
            return;
        }
        if (!reason) {
            errorEl.textContent = 'A reason is required for all price overrides';
            errorEl.style.display = 'block';
            reasonInput.focus();
            return;
        }

        // Resolve user info
        var user = window.getCurrentUser ? window.getCurrentUser() : null;
        var role = user ? user.role : 'frontdesk';
        var username = user ? user.username : 'unknown';
        var canApprove = (role === 'gm' || role === 'admin' || role === 'dealer' || role === 'rep');
        var idx = _overrideTarget.itemIndex;
        var tierPrice = _overrideTarget.tierPrice;
        var roundedPrice = Math.round(price * 100) / 100;

        // Validate the line item exists in local state
        if (typeof currentQuote === 'undefined' || !currentQuote.lineItems || !currentQuote.lineItems[idx]) {
            errorEl.textContent = 'Line item not found. Please try again.';
            errorEl.style.display = 'block';
            return;
        }

        var item = currentQuote.lineItems[idx];

        // ----- LOCK: Prevent server sync from clobbering -----
        _localOverrideLock = true;

        // ----- CLIENT-SIDE: Apply override to local lineItem -----
        item.priceOverride = {
            requestedPrice: roundedPrice,
            originalTierPrice: tierPrice,
            reason: reason,
            requestedBy: username,
            requestedByRole: role,
            requestedAt: new Date().toISOString(),
            status: canApprove ? 'approved' : 'pending',
            approvedBy: canApprove ? username : null,
            approvedAt: canApprove ? new Date().toISOString() : null,
            rejectedBy: null,
            rejectedAt: null,
            rejectedReason: null
        };

        // Store tierPrice on the item if not already present
        if (item.tierPrice === undefined || item.tierPrice === null) {
            item.tierPrice = tierPrice;
        }

        // Re-render immediately so price updates on screen
        if (typeof renderDesktop === 'function') {
            renderDesktop();
        }
        if (typeof renderMobile === 'function') {
            renderMobile();
        }
        if (typeof updateTotals === 'function') {
            updateTotals();
        }
        if (typeof updateTotalAndFasteners === 'function') {
            updateTotalAndFasteners();
        }

        // Close modal and show feedback
        closeOverrideModal();

        if (canApprove) {
            showOverrideToast(
                'Price override applied: $' + tierPrice.toFixed(2) + ' changed to $' + roundedPrice.toFixed(2),
                'success'
            );
        } else {
            showOverrideToast(
                'Price override requested for ' + _overrideTarget.productName + '. Awaiting GM approval.',
                'pending'
            );
        }

        // ----- BACKGROUND SERVER SYNC -----
        var capturedIdx = idx;
        var capturedPrice = roundedPrice;
        var capturedReason = reason;
        var isFrontdesk = (role === 'frontdesk');

        var serverId = null;
        if (typeof savedQuotes !== 'undefined' && typeof currentQuote !== 'undefined' && currentQuote.quoteId) {
            var match = savedQuotes.find(function (q) { return q.quoteId === currentQuote.quoteId; });
            if (match && match._serverId) serverId = match._serverId;
        }
        if (!serverId && _overrideTarget && _overrideTarget.quoteServerId) {
            serverId = _overrideTarget.quoteServerId;
        }

        if (serverId && api) {
            fireOverrideAPI(serverId, capturedIdx, capturedPrice, capturedReason)
                .finally(function () {
                    _localOverrideLock = false;
                });
        } else if (api) {
            autoSaveQuoteThenOverride(capturedIdx, capturedPrice, capturedReason, isFrontdesk);
            // Lock released inside autoSaveQuoteThenOverride on completion
        } else {
            _localOverrideLock = false;
        }
    });


    // ----------------------------------------------------------
    // 3b-i. HELPER: Fire the override API call
    // Now returns a promise so callers can chain on completion.
    // ----------------------------------------------------------
    function fireOverrideAPI(serverId, itemIdx, price, reason) {
        var path = '/api/quotes/' + serverId + '/items/' + itemIdx + '/request-override';
        return api('POST', path, {
            requestedPrice: price,
            reason: reason
        }).then(function (result) {
            console.log('[Overrides] Server sync OK for item #' + itemIdx);
            if (result && result.quote) {
                syncLocalQuoteFromServer(result.quote);
            }
            // Re-render to pick up any server-side corrections
            if (typeof renderDesktop === 'function') renderDesktop();
            if (typeof updateTotals === 'function') updateTotals();
            if (typeof updateTotalAndFasteners === 'function') updateTotalAndFasteners();
            return result;
        }).catch(function (err) {
            console.warn('[Overrides] Server sync failed for item #' + itemIdx + ':', err.message);
        });
    }


    // ----------------------------------------------------------
    // 3b-ii. HELPER: Auto-save an unsaved quote, then fire override
    // Waits for BOTH save + override to finish before refreshing.
    // ----------------------------------------------------------
    function autoSaveQuoteThenOverride(itemIdx, price, reason, isFrontdesk) {
        if (typeof currentQuote === 'undefined' || !currentQuote.lineItems) {
            console.warn('[Overrides] Cannot auto-save: no currentQuote');
            _localOverrideLock = false;
            return;
        }

        var payload = {
            customer: currentQuote.customer || {},
            lineItems: currentQuote.lineItems.map(function (li) {
                return {
                    productId: li.productId || li.id || '',
                    productName: li.productName || li.type || li.name || '',
                    quantity: li.quantity || li.qty || 1,
                    basePrice: li.basePrice || li.price || 0,
                    price: li.price || 0
                };
            }),
            notes: currentQuote.notes || currentQuote.specialInstructions || ''
        };

        console.log('[Overrides] Auto-saving quote to server for override sync...');

        api('POST', '/api/quotes', payload)
            .then(function (savedQuote) {
                console.log('[Overrides] Auto-save OK. Server ID: ' + savedQuote.id + ', Quote #: ' + savedQuote.quoteNumber);

                // Link server ID to local quote
                if (typeof savedQuotes !== 'undefined' && typeof currentQuote !== 'undefined' && currentQuote.quoteId) {
                    var localMatch = savedQuotes.find(function (q) { return q.quoteId === currentQuote.quoteId; });
                    if (localMatch) {
                        localMatch._serverId = savedQuote.id;
                        localMatch._serverQuoteNumber = savedQuote.quoteNumber;
                    }
                }

                if (typeof currentQuote !== 'undefined') {
                    currentQuote._serverId = savedQuote.id;
                    currentQuote._serverQuoteNumber = savedQuote.quoteNumber;
                }

                // Now fire the override API and wait for it to complete
                return fireOverrideAPI(savedQuote.id, itemIdx, price, reason);
            })
            .then(function () {
                // BOTH save and override are done. NOW refresh UI.
                if (isFrontdesk) {
                    showOverrideToast('Quote saved. Your GM can now review the override.', 'success');
                }

                if (typeof window.loadServerQuotesAndRender === 'function') {
                    window.loadServerQuotesAndRender();
                }
            })
            .catch(function (err) {
                console.warn('[Overrides] Auto-save+override failed:', err.message);
                if (isFrontdesk) {
                    showOverrideToast(
                        'Could not auto-save quote. Please save manually so GM can see your override request.',
                        'error'
                    );
                }
            })
            .finally(function () {
                _localOverrideLock = false;
            });
    }


    // ----------------------------------------------------------
    // 3c. HELPER: Sync server quote data into local state
    // SAFE: Never downgrades a local override to null or to
    // an older server version. Respects _localOverrideLock.
    // ----------------------------------------------------------
    function syncLocalQuoteFromServer(serverQuote) {
        if (!serverQuote || !serverQuote.lineItems) return;
        if (typeof currentQuote === 'undefined' || !currentQuote.lineItems) return;

        serverQuote.lineItems.forEach(function (serverItem, idx) {
            if (idx >= currentQuote.lineItems.length) return;

            var local = currentQuote.lineItems[idx];

            // ---- GUARD: If lock is active, skip override sync ----
            // The local state is authoritative while an override
            // is being applied and synced to the server.
            if (_localOverrideLock && local.priceOverride) {
                return;
            }

            // ---- RULE 1: Never downgrade local override to null ----
            // If local has an override but server doesn't, keep local.
            // This happens when the server quote was saved before the
            // override API completed.
            if (local.priceOverride && !serverItem.priceOverride) {
                return;
            }

            // ---- RULE 2: Upgrade pending to approved ----
            // If local is pending and server is approved, accept server.
            if (local.priceOverride && local.priceOverride.status === 'pending'
                && serverItem.priceOverride && serverItem.priceOverride.status === 'approved') {
                local.priceOverride = serverItem.priceOverride;
                if (typeof renderDesktop === 'function') renderDesktop();
                if (typeof updateTotals === 'function') updateTotals();
                return;
            }

            // ---- RULE 3: Upgrade pending to rejected ----
            // If local is pending and server is rejected, accept server.
            if (local.priceOverride && local.priceOverride.status === 'pending'
                && serverItem.priceOverride && serverItem.priceOverride.status === 'rejected') {
                local.priceOverride = serverItem.priceOverride;
                if (typeof renderDesktop === 'function') renderDesktop();
                if (typeof updateTotals === 'function') updateTotals();
                return;
            }

            // ---- RULE 4: Never overwrite a local approved with an older server approved ----
            // Compare timestamps to ensure we only move forward.
            if (local.priceOverride && local.priceOverride.status === 'approved'
                && serverItem.priceOverride && serverItem.priceOverride.status === 'approved') {
                var localTime = new Date(local.priceOverride.approvedAt || 0).getTime();
                var serverTime = new Date(serverItem.priceOverride.approvedAt || 0).getTime();
                if (serverTime > localTime) {
                    // Server has a newer approval (e.g., re-override). Accept it.
                    local.priceOverride = serverItem.priceOverride;
                }
                // Otherwise keep local (it's the same or newer).
                return;
            }

            // ---- RULE 5: If local has no override, accept server override ----
            if (!local.priceOverride && serverItem.priceOverride) {
                local.priceOverride = serverItem.priceOverride;
            }

            // Sync tierPrice and basePrice if missing locally
            if ((local.tierPrice === undefined || local.tierPrice === null) && serverItem.tierPrice) {
                local.tierPrice = serverItem.tierPrice;
            }
            if ((local.basePrice === undefined || local.basePrice === null) && serverItem.basePrice) {
                local.basePrice = serverItem.basePrice;
            }
        });
    }


    // ----------------------------------------------------------
    // 4. TOAST NOTIFICATION (lightweight)
    // ----------------------------------------------------------
    function showOverrideToast(message, type) {
        var toast = document.createElement('div');
        var bg = type === 'success' ? '#16a34a' : type === 'pending' ? '#f59e0b' : '#dc2626';
        toast.style.cssText = 'position:fixed;bottom:2rem;right:2rem;background:' + bg
            + ';color:#fff;padding:0.75rem 1.25rem;border-radius:8px;font-size:0.85rem;'
            + 'font-weight:600;z-index:11000;box-shadow:0 4px 15px rgba(0,0,0,0.2);'
            + 'animation:slideInRight 0.3s ease;max-width:380px;';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(function () {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(function () { toast.remove(); }, 300);
        }, 4000);
    }


    // ----------------------------------------------------------
    // 5. OVERRIDE BADGE + PRICE DISPLAY HELPERS
    // ----------------------------------------------------------
    function getOverrideBadgeHTML(overrideObj) {
        if (!overrideObj) return '';
        var cls = 'override-badge override-badge--' + overrideObj.status;
        var label = overrideObj.status;
        if (overrideObj.status === 'pending') label = 'Pending GM Approval';
        if (overrideObj.status === 'approved') label = 'Override Approved';
        if (overrideObj.status === 'rejected') label = 'Override Rejected';
        return '<span class="' + cls + '">' + label + '</span>';
    }

    function getOverridePriceHTML(item) {
        if (!item.priceOverride) return '';
        var html = '<div class="line-item-override-info">';
        if (item.priceOverride.status === 'approved') {
            html += '<span class="override-original-price">$' + (item.priceOverride.originalTierPrice || item.tierPrice || 0).toFixed(2) + '</span>';
            html += '<span class="override-arrow">&#8594;</span>';
            html += '<span class="override-new-price">$' + item.priceOverride.requestedPrice.toFixed(2) + '</span>';
            html += getOverrideBadgeHTML(item.priceOverride);
        } else if (item.priceOverride.status === 'pending') {
            html += '<span class="override-original-price">$' + (item.priceOverride.originalTierPrice || item.tierPrice || 0).toFixed(2) + '</span>';
            html += '<span class="override-arrow">&#8594;</span>';
            html += '<span style="color:#f59e0b;font-weight:600;">$' + item.priceOverride.requestedPrice.toFixed(2) + '</span>';
            html += getOverrideBadgeHTML(item.priceOverride);
        } else if (item.priceOverride.status === 'rejected') {
            html += getOverrideBadgeHTML(item.priceOverride);
            if (item.priceOverride.rejectedReason) {
                html += '<span style="font-size:0.75rem;color:#991b1b;"> ' + escapeHTML(item.priceOverride.rejectedReason) + '</span>';
            }
        }
        html += '</div>';
        return html;
    }

    // Expose override button click handler globally
    window._handleOverrideClick = function (quoteServerId, itemIndex, tierPrice, productName) {
        openOverrideModal(quoteServerId, itemIndex, tierPrice, productName);
    };


    // ----------------------------------------------------------
    // 6. refreshOverrideStates placeholder
    // ----------------------------------------------------------
    function refreshOverrideStates() {
        // Placeholder for future saved-quotes-list decoration.
    }


    // ----------------------------------------------------------
    // 7. GM PENDING OVERRIDES WIDGET
    // ----------------------------------------------------------
    var _gmWidgetEl = null;

    function createGMWidget() {
        var user = window.getCurrentUser ? window.getCurrentUser() : null;
        if (!user || (user.role !== 'gm' && user.role !== 'admin')) return;

        if (document.getElementById('gm-overrides-widget')) return;

        var widget = document.createElement('div');
        widget.className = 'gm-overrides-widget';
        widget.id = 'gm-overrides-widget';
        widget.style.display = 'none';
        widget.innerHTML =
            '<h3>Price Overrides Awaiting Approval <span class="pending-count" id="gm-pending-count">0</span></h3>' +
            '<div id="gm-overrides-list"></div>';

        var savedSection = document.getElementById('saved-quotes-section');
        if (savedSection) {
            savedSection.parentNode.insertBefore(widget, savedSection);
        } else {
            var mainApp = document.getElementById('main-app');
            if (mainApp && mainApp.firstChild) {
                mainApp.insertBefore(widget, mainApp.firstChild);
            }
        }
        _gmWidgetEl = widget;
    }

    function loadPendingOverrides() {
        var user = window.getCurrentUser ? window.getCurrentUser() : null;
        if (!user || (user.role !== 'gm' && user.role !== 'admin')) return;

        api('GET', '/api/quotes/pending-overrides')
            .then(function (data) {
                renderPendingOverrides(data.pending || [], data.count || 0);
            })
            .catch(function (err) {
                console.warn('[Overrides] Failed to load pending:', err.message);
            });
    }

    function renderPendingOverrides(overrides, count) {
        var widget = document.getElementById('gm-overrides-widget');
        if (!widget) {
            createGMWidget();
            widget = document.getElementById('gm-overrides-widget');
        }
        if (!widget) return;

        var countEl = document.getElementById('gm-pending-count');
        if (countEl) countEl.textContent = count;

        if (count === 0) {
            widget.style.display = 'none';
            return;
        }

        widget.style.display = 'block';
        var listEl = document.getElementById('gm-overrides-list');
        listEl.innerHTML = '';

        overrides.forEach(function (ov) {
            var item = document.createElement('div');
            item.className = 'override-review-item';
            item.setAttribute('data-quote-id', ov.quoteId);
            item.setAttribute('data-item-index', ov.itemIndex);

            item.innerHTML =
                '<div class="override-review-header">' +
                    '<span class="override-review-product">' + escapeHTML(ov.productName) + '</span>' +
                    '<span class="override-review-quote">Quote ' + escapeHTML(ov.quoteNumber)
                        + (ov.customerName ? ' | ' + escapeHTML(ov.customerName) : '') + '</span>' +
                '</div>' +
                '<div class="override-review-prices">' +
                    '<span style="color:#6b7280;">Tier: <strong>$' + (ov.tierPrice || 0).toFixed(2) + '</strong></span>' +
                    '<span style="color:#6b7280;">&#8594;</span>' +
                    '<span style="color:#16a34a;">Requested: <strong>$' + ov.requestedPrice.toFixed(2) + '</strong></span>' +
                    '<span style="color:#6b7280;font-size:0.8rem;">(' +
                        (ov.requestedPrice < ov.tierPrice
                            ? '-' + Math.round((1 - ov.requestedPrice / ov.tierPrice) * 100) + '%'
                            : '+' + Math.round((ov.requestedPrice / ov.tierPrice - 1) * 100) + '%') +
                    ')</span>' +
                '</div>' +
                '<div class="override-review-reason">"' + escapeHTML(ov.reason) + '"</div>' +
                '<div class="override-review-actions">' +
                    '<button class="btn-approve-override" data-qid="' + ov.quoteId + '" data-idx="' + ov.itemIndex + '">Approve</button>' +
                    '<button class="btn-reject-override" data-qid="' + ov.quoteId + '" data-idx="' + ov.itemIndex + '">Reject</button>' +
                '</div>' +
                '<div class="override-review-requestedby">Requested by ' + escapeHTML(ov.requestedBy)
                    + ' on ' + new Date(ov.requestedAt).toLocaleString() + '</div>';

            listEl.appendChild(item);
        });

        listEl.querySelectorAll('.btn-approve-override').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var qid = btn.getAttribute('data-qid');
                var idx = btn.getAttribute('data-idx');
                handleApproveOverride(qid, idx, btn);
            });
        });

        listEl.querySelectorAll('.btn-reject-override').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var qid = btn.getAttribute('data-qid');
                var idx = btn.getAttribute('data-idx');
                handleRejectOverride(qid, idx, btn);
            });
        });
    }

    function handleApproveOverride(quoteId, itemIndex, btn) {
        if (!confirm('Approve this price override?')) return;

        btn.disabled = true;
        btn.textContent = 'Approving...';

        api('POST', '/api/quotes/' + quoteId + '/items/' + itemIndex + '/approve-override')
            .then(function (result) {
                showOverrideToast('Price override approved!', 'success');
                if (result.quote) {
                    syncLocalQuoteFromServer(result.quote);
                }
                loadPendingOverrides();
                if (typeof window.loadServerQuotesAndRender === 'function') {
                    window.loadServerQuotesAndRender();
                }
            })
            .catch(function (err) {
                showOverrideToast('Failed to approve: ' + err.message, 'error');
                btn.disabled = false;
                btn.textContent = 'Approve';
            });
    }

    function handleRejectOverride(quoteId, itemIndex, btn) {
        var reviewItem = btn.closest('.override-review-item');
        var existingInput = reviewItem.querySelector('.reject-reason-input');
        if (existingInput) {
            var reason = existingInput.value.trim();
            btn.disabled = true;
            btn.textContent = 'Rejecting...';

            api('POST', '/api/quotes/' + quoteId + '/items/' + itemIndex + '/reject-override', {
                rejectedReason: reason
            })
                .then(function (result) {
                    showOverrideToast('Price override rejected.', 'error');
                    if (result.quote) {
                        syncLocalQuoteFromServer(result.quote);
                    }
                    loadPendingOverrides();
                    if (typeof window.loadServerQuotesAndRender === 'function') {
                        window.loadServerQuotesAndRender();
                    }
                })
                .catch(function (err) {
                    showOverrideToast('Failed to reject: ' + err.message, 'error');
                    btn.disabled = false;
                    btn.textContent = 'Reject';
                });
        } else {
            var input = document.createElement('textarea');
            input.className = 'reject-reason-input';
            input.placeholder = 'Reason for rejection (optional, visible to requester)';
            var actionsDiv = reviewItem.querySelector('.override-review-actions');
            actionsDiv.parentNode.insertBefore(input, actionsDiv.nextSibling);
            input.focus();
            btn.textContent = 'Confirm Reject';
        }
    }


    // ----------------------------------------------------------
    // 8. SUBMIT GATE: Block submit with pending overrides
    // ----------------------------------------------------------
    function checkSubmitGate() {
        var reviewModal = document.getElementById('reviewModal');
        if (!reviewModal) return;

        var pendingCount = 0;
        if (typeof currentQuote !== 'undefined' && currentQuote.lineItems) {
            pendingCount = currentQuote.lineItems.filter(function (li) {
                return li.priceOverride && li.priceOverride.status === 'pending';
            }).length;
        }

        var warningEl = document.getElementById('submit-block-warning');
        if (pendingCount > 0) {
            if (!warningEl) {
                warningEl = document.createElement('div');
                warningEl.className = 'submit-block-warning';
                warningEl.id = 'submit-block-warning';
                var modalContent = reviewModal.querySelector('.modal-content') || reviewModal;
                modalContent.appendChild(warningEl);
            }
            warningEl.innerHTML =
                '<span class="warning-icon">&#9888;</span>' +
                '<span>This quote has <strong>' + pendingCount + ' pending price override(s)</strong>. ' +
                'GM approval is required before submission.</span>';
            warningEl.style.display = 'flex';
        } else if (warningEl) {
            warningEl.style.display = 'none';
        }
    }

    var _origShowReviewForOverrides = window.showReviewModal;
    window.showReviewModal = function () {
        if (typeof _origShowReviewForOverrides === 'function') {
            _origShowReviewForOverrides();
        }
        setTimeout(checkSubmitGate, 200);
    };

    var _origSendFormal = window.sendFormalRequest;
    window.sendFormalRequest = function () {
        if (typeof _origSendFormal === 'function') {
            _origSendFormal();
        }
    };


    // ----------------------------------------------------------
    // 9. EXPOSE FUNCTIONS GLOBALLY
    // ----------------------------------------------------------
    window.openOverrideModal = openOverrideModal;
    window.loadPendingOverrides = loadPendingOverrides;
    window.getOverrideBadgeHTML = getOverrideBadgeHTML;
    window.getOverridePriceHTML = getOverridePriceHTML;
    window.refreshOverrideStates = refreshOverrideStates;
    window.syncLocalQuoteFromServer = syncLocalQuoteFromServer;


    // ----------------------------------------------------------
    // 10. REAL-TIME POLLING FOR GM/ADMIN
    // ----------------------------------------------------------
    var POLL_INTERVAL_MS = 30000; // 30 seconds
    var _pollTimer = null;
    var _pollActive = false;
    var _tabVisible = true;

    function isGMOrAdmin() {
        var user = window.getCurrentUser ? window.getCurrentUser() : null;
        return user && (user.role === 'gm' || user.role === 'admin');
    }

    function isAppVisible() {
        var mainApp = document.getElementById('main-app');
        return mainApp && !mainApp.classList.contains('app-hidden');
    }

    function pollPendingOverrides() {
        if (!_pollActive) return;
        if (!_tabVisible) return;
        if (!isGMOrAdmin()) {
            stopPolling();
            return;
        }
        if (!isAppVisible()) return;

        api('GET', '/api/quotes/pending-overrides')
            .then(function (data) {
                renderPendingOverrides(data.pending || [], data.count || 0);
            })
            .catch(function (err) {
                console.warn('[Overrides Poll] Failed:', err.message);
            });
    }

    function startPolling() {
        if (_pollActive) return;
        if (!isGMOrAdmin()) return;

        _pollActive = true;
        _pollTimer = setInterval(pollPendingOverrides, POLL_INTERVAL_MS);
        console.log('[Overrides] Polling started (every ' + (POLL_INTERVAL_MS / 1000) + 's)');
    }

    function stopPolling() {
        if (_pollTimer) {
            clearInterval(_pollTimer);
            _pollTimer = null;
        }
        _pollActive = false;
        console.log('[Overrides] Polling stopped.');
    }

    document.addEventListener('visibilitychange', function () {
        _tabVisible = !document.hidden;
        if (_tabVisible && _pollActive && isGMOrAdmin()) {
            console.log('[Overrides] Tab visible, refreshing pending overrides...');
            pollPendingOverrides();
        }
    });

    var _pollObserver = new MutationObserver(function () {
        if (isAppVisible() && isGMOrAdmin()) {
            if (!_pollActive) {
                loadPendingOverrides();
                startPolling();
            }
        } else {
            if (_pollActive) {
                stopPolling();
            }
        }
    });


    // ----------------------------------------------------------
    // 11. INIT: Create widget + load pending + start polling
    // ----------------------------------------------------------
    function initOverrides() {
        var user = window.getCurrentUser ? window.getCurrentUser() : null;
        if (!user) {
            setTimeout(initOverrides, 1000);
            return;
        }

        createGMWidget();
        loadPendingOverrides();

        if (user.role === 'gm' || user.role === 'admin') {
            startPolling();
        }

        console.log('[Overrides] v1.6 initialized for role: ' + user.role);
    }

    setTimeout(initOverrides, 500);

    var mainApp = document.getElementById('main-app');
    if (mainApp) {
        _pollObserver.observe(mainApp, { attributes: true, attributeFilter: ['class'] });
    }

    console.log('[AmeriDex Overrides] v1.6 loaded.');
})();
