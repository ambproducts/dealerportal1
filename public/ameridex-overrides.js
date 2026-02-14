// ============================================================
// AmeriDex Dealer Portal - Price Override System v1.0
// Date: 2026-02-14
// ============================================================
// REQUIRES: ameridex-api.js loaded first (provides ameridexAPI,
//           getCurrentUser, getCurrentDealer)
//
// Load order in dealer-portal.html (before </body>):
//   <script src="ameridex-patches.js"></script>
//   <script src="ameridex-api.js"></script>
//   <script src="ameridex-overrides.js"></script>
//
// This module handles:
//   - Override Price button per line item
//   - Override request modal (price + reason)
//   - Visual badges (pending/approved/rejected)
//   - GM pending overrides dashboard widget
//   - Submit gate (blocks if pending overrides exist)
//   - Approve/reject UI for GM role
// ============================================================

(function () {
    'use strict';

    var api = window.ameridexAPI;

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
    var _overrideTarget = null; // { quoteServerId, itemIndex, tierPrice, productName }


    // ----------------------------------------------------------
    // 3. MODAL BEHAVIOR
    // ----------------------------------------------------------
    function openOverrideModal(quoteServerId, itemIndex, tierPrice, productName) {
        var user = window.getCurrentUser ? window.getCurrentUser() : null;
        var role = user ? user.role : 'frontdesk';
        var isApprover = (role === 'gm' || role === 'admin');

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
        if (isApprover) {
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

    // Submit override request
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

        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';

        var path = '/api/quotes/' + _overrideTarget.quoteServerId
            + '/items/' + _overrideTarget.itemIndex + '/request-override';

        api('POST', path, {
            requestedPrice: price,
            reason: reason
        })
            .then(function (result) {
                closeOverrideModal();
                // Refresh quotes list to show updated badges
                if (typeof window.loadServerQuotesAndRender === 'function') {
                    window.loadServerQuotesAndRender();
                } else {
                    // Fallback: reload page section
                    refreshOverrideStates();
                }
                // Refresh GM widget if visible
                loadPendingOverrides();

                var status = result.item.priceOverride.status;
                var msg = (status === 'approved')
                    ? 'Price override applied: $' + _overrideTarget.tierPrice.toFixed(2) + ' changed to $' + price.toFixed(2)
                    : 'Price override requested. Awaiting GM approval.';
                showOverrideToast(msg, status === 'approved' ? 'success' : 'pending');
            })
            .catch(function (err) {
                errorEl.textContent = err.message || 'Failed to submit override';
                errorEl.style.display = 'block';
                submitBtn.disabled = false;
                var user = window.getCurrentUser ? window.getCurrentUser() : null;
                var role = user ? user.role : 'frontdesk';
                submitBtn.textContent = (role === 'gm' || role === 'admin') ? 'Apply Override' : 'Request Override';
            });
    });


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
    // 5. INJECT OVERRIDE BUTTONS INTO LINE ITEMS
    // ----------------------------------------------------------
    // This patches the renderDesktop function to add override
    // buttons and badges to each line item row.
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
            html += '<span class="override-original-price">$' + (item.tierPrice || 0).toFixed(2) + '</span>';
            html += '<span class="override-arrow">&#8594;</span>';
            html += '<span class="override-new-price">$' + item.priceOverride.requestedPrice.toFixed(2) + '</span>';
            html += getOverrideBadgeHTML(item.priceOverride);
        } else if (item.priceOverride.status === 'pending') {
            html += '<span class="override-original-price">$' + (item.tierPrice || 0).toFixed(2) + '</span>';
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
    // 6. PATCH renderSavedQuotes TO SHOW OVERRIDE STATES
    // ----------------------------------------------------------
    // We add a post-render hook that decorates the saved quotes
    // list with pending override counts.
    // ----------------------------------------------------------
    function refreshOverrideStates() {
        // This is called after renders to update UI. Currently
        // a no-op placeholder for future DOM decoration.
    }


    // ----------------------------------------------------------
    // 7. GM PENDING OVERRIDES WIDGET
    // ----------------------------------------------------------
    var _gmWidgetEl = null;

    function createGMWidget() {
        var user = window.getCurrentUser ? window.getCurrentUser() : null;
        if (!user || (user.role !== 'gm' && user.role !== 'admin')) return;

        // Check if widget already exists
        if (document.getElementById('gm-overrides-widget')) return;

        var widget = document.createElement('div');
        widget.className = 'gm-overrides-widget';
        widget.id = 'gm-overrides-widget';
        widget.style.display = 'none';
        widget.innerHTML =
            '<h3>Price Overrides Awaiting Approval <span class="pending-count" id="gm-pending-count">0</span></h3>' +
            '<div id="gm-overrides-list"></div>';

        // Insert before the saved quotes section
        var savedSection = document.getElementById('saved-quotes-section');
        if (savedSection) {
            savedSection.parentNode.insertBefore(widget, savedSection);
        } else {
            // Fallback: insert at top of main app
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

        // Bind approve buttons
        listEl.querySelectorAll('.btn-approve-override').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var qid = btn.getAttribute('data-qid');
                var idx = btn.getAttribute('data-idx');
                handleApproveOverride(qid, idx, btn);
            });
        });

        // Bind reject buttons
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
            .then(function () {
                showOverrideToast('Price override approved!', 'success');
                loadPendingOverrides();
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
            // Already showing, submit the rejection
            var reason = existingInput.value.trim();
            btn.disabled = true;
            btn.textContent = 'Rejecting...';

            api('POST', '/api/quotes/' + quoteId + '/items/' + itemIndex + '/reject-override', {
                rejectedReason: reason
            })
                .then(function () {
                    showOverrideToast('Price override rejected.', 'error');
                    loadPendingOverrides();
                })
                .catch(function (err) {
                    showOverrideToast('Failed to reject: ' + err.message, 'error');
                    btn.disabled = false;
                    btn.textContent = 'Reject';
                });
        } else {
            // Show rejection reason input
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
        // Find submit button in the review modal
        var submitBtns = document.querySelectorAll('[onclick*="sendFormalRequest"], .btn-submit-quote, #btn-submit-quote');
        // Also check the review modal submit area
        var reviewModal = document.getElementById('reviewModal');
        if (!reviewModal) return;

        // Check if current quote has pending overrides by looking at server state
        var currentServerId = null;
        if (typeof savedQuotes !== 'undefined' && typeof currentQuote !== 'undefined' && currentQuote.quoteId) {
            var match = savedQuotes.find(function (q) { return q.quoteId === currentQuote.quoteId; });
            if (match) currentServerId = match._serverId;
        }

        if (!currentServerId) return;

        // Check via API
        api('GET', '/api/quotes/' + currentServerId)
            .then(function (quote) {
                var pendingCount = (quote.lineItems || []).filter(function (li) {
                    return li.priceOverride && li.priceOverride.status === 'pending';
                }).length;

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
            })
            .catch(function () { /* silently fail */ });
    }

    // Hook into showReviewModal to check gate
    var _origShowReviewForOverrides = window.showReviewModal;
    window.showReviewModal = function () {
        if (typeof _origShowReviewForOverrides === 'function') {
            _origShowReviewForOverrides();
        }
        // Check submit gate after modal renders
        setTimeout(checkSubmitGate, 200);
    };

    // Also patch sendFormalRequest to double-check server-side
    var _origSendFormal = window.sendFormalRequest;
    window.sendFormalRequest = function () {
        // The server already blocks submission with pending overrides,
        // but we want a nice client-side message too
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


    // ----------------------------------------------------------
    // 10. INIT: Create widget + load pending on page ready
    // ----------------------------------------------------------
    // Wait for API auth to be ready, then init
    function initOverrides() {
        var user = window.getCurrentUser ? window.getCurrentUser() : null;
        if (!user) {
            // Not logged in yet, retry after auth completes
            setTimeout(initOverrides, 1000);
            return;
        }

        createGMWidget();
        loadPendingOverrides();
        console.log('[Overrides] v1.0 initialized for role: ' + user.role);
    }

    // Delay init to let auth complete
    setTimeout(initOverrides, 500);

    // Also re-init when navigating back to main app
    var observer = new MutationObserver(function () {
        var mainApp = document.getElementById('main-app');
        if (mainApp && !mainApp.classList.contains('app-hidden')) {
            createGMWidget();
            loadPendingOverrides();
        }
    });
    var mainApp = document.getElementById('main-app');
    if (mainApp) {
        observer.observe(mainApp, { attributes: true, attributeFilter: ['class'] });
    }

    console.log('[AmeriDex Overrides] v1.0 loaded.');
})();
