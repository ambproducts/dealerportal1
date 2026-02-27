// ============================================================
// AmeriDex Dealer Portal - Patch File v1.6
// Date: 2026-02-27
// ============================================================
// HOW TO USE:
//   Add this <script> tag at the very bottom of dealer-portal.html,
//   right before the closing </body> tag:
//
//     <script src="ameridex-patches.js"></script>
//
//   This file monkey-patches the existing global functions
//   in-place. No edits to the main file required.
//
// v1.6 Changes (2026-02-27):
//   - PATCH 0 rewritten: Instead of repairing broken DOM nesting
//     in saved-quotes-section, we now REMOVE the entire section.
//     The My Quotes tab (quotes-customers.html) fully replaces
//     this functionality with server-backed quotes and customers.
//   - PATCH 0b retained but deprecated (renderCustomersList is
//     no longer called since the section is removed).
//   - PATCH 6 updated: Loads ameridex-customer-sync.js to migrate
//     localStorage customers to the server API.
//
// v1.5 Changes (2026-02-26):
//   - CRITICAL FIX: Prepended DOM repair (PATCH 0) to fix unclosed
//     <div> in saved-quotes card-header. This was causing calculator,
//     colors, customer info, and order details sections to be nested
//     inside the saved-quotes card, breaking ALL interactivity.
//   - Added ameridex-addrow-fix.js to EXTRA_SCRIPTS loader for
//     renderCustomersList() and render() safety wrapper.
// ============================================================

(function () {
    'use strict';

    // ===========================================================
    // PATCH 0 (v1.6): Remove Saved Quotes Section Entirely
    // ===========================================================
    // The saved-quotes-section on the dashboard is now redundant.
    // The My Quotes tab (quotes-customers.html) provides full
    // server-backed quote management and customer browsing.
    //
    // This patch:
    //   1. Finds the saved-quotes-section element
    //   2. Rescues any child sections that were trapped inside
    //      due to the unclosed <div> bug (same as v1.5 repair)
    //   3. Removes the saved-quotes-section from the DOM
    //   4. Also hides the customers-section if it exists on
    //      the dashboard (separate from My Quotes page)
    // ===========================================================

    function removeSavedQuotesSection() {
        var savedSection = document.getElementById('saved-quotes-section');
        if (!savedSection) {
            console.log('[patches v1.6] PATCH 0: No saved-quotes-section found, nothing to remove.');
            return;
        }

        var form = document.getElementById('order-form');
        if (!form) {
            // Fallback: just hide it
            savedSection.style.display = 'none';
            console.log('[patches v1.6] PATCH 0: No order-form found, hid saved-quotes-section.');
            return;
        }

        // Step 1: Rescue any sections trapped inside due to the
        // unclosed <div> bug from the original HTML
        var sectionIds = ['customers-section', 'calculator', 'colors', 'customer', 'order'];
        var insertAfter = savedSection;

        sectionIds.forEach(function (id) {
            var el = document.getElementById(id);
            if (el && savedSection.contains(el) && el !== savedSection) {
                el.parentNode.removeChild(el);
                if (insertAfter.nextSibling) {
                    form.insertBefore(el, insertAfter.nextSibling);
                } else {
                    form.appendChild(el);
                }
                insertAfter = el;
                console.log('[patches v1.6] PATCH 0: Rescued section #' + id + ' from saved-quotes.');
            }
        });

        // Also rescue any other trapped sections/cards
        var trappedSections = savedSection.querySelectorAll('section, .card');
        trappedSections.forEach(function (section) {
            if (sectionIds.indexOf(section.id) !== -1) return;
            if (section === savedSection) return;
            section.parentNode.removeChild(section);
            form.appendChild(section);
            console.log('[patches v1.6] PATCH 0: Rescued unnamed trapped section.');
        });

        // Step 2: Remove the saved-quotes-section itself
        savedSection.parentNode.removeChild(savedSection);
        console.log('[patches v1.6] PATCH 0: Removed saved-quotes-section from DOM.');

        // Step 3: Also remove the old customers-section on the dashboard
        // (not the one on quotes-customers.html, which has different IDs)
        var customersSection = document.getElementById('customers-section');
        if (customersSection && form.contains(customersSection)) {
            customersSection.parentNode.removeChild(customersSection);
            console.log('[patches v1.6] PATCH 0: Removed customers-section from dashboard DOM.');
        }

        // Step 4: Force re-render to fix any layout issues
        if (typeof window.render === 'function') {
            try { window.render(); } catch (e) { /* will retry later */ }
        }
        if (typeof window.updateTotalAndFasteners === 'function') {
            try { window.updateTotalAndFasteners(); } catch (e) {}
        }
        if (typeof window.updateCustomerProgress === 'function') {
            try { window.updateCustomerProgress(); } catch (e) {}
        }
    }

    // Run removal immediately if DOM is ready, or on DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', removeSavedQuotesSection);
    } else {
        removeSavedQuotesSection();
    }

    // Expose globally so other scripts can call if needed
    window.repairSavedQuotesDOM = removeSavedQuotesSection;


    // ===========================================================
    // PATCH 0b: Define missing renderCustomersList()
    // ===========================================================
    // DEPRECATED in v1.6: The customers-section has been removed
    // from the dashboard. This function is kept as a no-op safety
    // net in case any other code calls it.
    // ===========================================================

    if (typeof window.renderCustomersList !== 'function') {
        window.renderCustomersList = function renderCustomersList() {
            // v1.6: No-op. The old customers list on the dashboard
            // has been removed. Customer management now lives on
            // the My Quotes page (quotes-customers.html).
            console.log('[patches v1.6] renderCustomersList() called but customers-section has been removed. Use My Quotes tab.');
        };
        console.log('[patches v1.6] PATCH 0b: Registered renderCustomersList() as no-op (section removed).');
    }


    // ===========================================================
    // PATCH 1: XSS Protection Utility
    // ===========================================================
    window.escapeHTML = function (str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    };


    // ===========================================================
    // PATCH 2: Consolidated Subtotal Function
    // ===========================================================
    if (typeof window.getItemSubtotalFromData === 'function') {
        window.getItemSubtotalFromData = function (li) {
            return window.getItemSubtotal(li);
        };
    }


    // ===========================================================
    // PATCH 3: Fix Quote ID Collision After Deletion
    // ===========================================================
    window.generateQuoteNumber = function () {
        var today = new Date();
        var dateStr = today.getFullYear().toString()
            + String(today.getMonth() + 1).padStart(2, '0')
            + String(today.getDate()).padStart(2, '0');
        var todayPrefix = dealerSettings.dealerCode + '-' + dateStr;
        var maxSeq = 0;
        savedQuotes.forEach(function (q) {
            if (q.quoteId && q.quoteId.startsWith(todayPrefix + '-')) {
                var seqStr = q.quoteId.slice((todayPrefix + '-').length);
                var seq = parseInt(seqStr, 10);
                if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
            }
        });
        return todayPrefix + '-' + String(maxSeq + 1).padStart(3, '0');
    };


    // ===========================================================
    // PATCH 4: Sync currentQuote from DOM Before Save/Timeout
    // ===========================================================
    window.syncQuoteFromDOM = function () {
        currentQuote.customer.name     = document.getElementById('cust-name').value.trim();
        currentQuote.customer.email    = document.getElementById('cust-email').value.trim();
        currentQuote.customer.zipCode  = document.getElementById('cust-zip').value.trim();
        currentQuote.customer.company  = document.getElementById('cust-company').value.trim();
        currentQuote.customer.phone    = document.getElementById('cust-phone').value.trim();
        currentQuote.specialInstructions = document.getElementById('special-instr').value.trim();
        currentQuote.internalNotes     = document.getElementById('internal-notes').value.trim();
        currentQuote.shippingAddress   = document.getElementById('ship-addr').value.trim();
        currentQuote.deliveryDate      = document.getElementById('del-date').value;
        currentQuote.options.pictureFrame = document.getElementById('pic-frame').checked;
        currentQuote.options.stairs      = document.getElementById('stairs').checked;
    };

    var _originalSaveAndClose = window.saveAndClose;
    window.saveAndClose = function () {
        window.syncQuoteFromDOM();
        if (typeof _originalSaveAndClose === 'function') {
            _originalSaveAndClose();
        }
    };


    // ===========================================================
    // PATCH 5: XSS-Safe generatePrintHTML()
    //
    // NOTE: This is a baseline safe version. If ameridex-print-branding.js
    // loads successfully (via PATCH 6 below), it will override this
    // function with the fully branded version including the AmeriDex
    // logo, navy/red color scheme, and professional footer.
    // ===========================================================
    window.generatePrintHTML = function (type) {
        var today = new Date().toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric'
        });
        var isCustomer = (type === 'customer');
        var title = isCustomer ? 'Customer Quote' : 'Dealer Order Form';

        var html = '<div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">';

        html += '<div style="border-bottom:3px solid #2563eb;padding-bottom:15px;margin-bottom:20px;">';
        html += '<h1 style="color:#2563eb;margin:0;">AmeriDex ' + title + '</h1>';
        html += '<p style="color:#666;margin:5px 0 0;">Generated ' + today + '</p>';
        if (currentQuote.quoteId) {
            html += '<p style="color:#1e40af;font-weight:bold;margin:5px 0 0;">Quote # ' + escapeHTML(currentQuote.quoteId) + '</p>';
        }
        if (!isCustomer && dealerSettings.dealerCode) {
            html += '<p style="color:#666;margin:5px 0 0;">Dealer: ' + escapeHTML(dealerSettings.dealerCode) + '</p>';
        }
        html += '</div>';

        html += '<div style="margin-bottom:20px;">';
        html += '<h2 style="color:#374151;font-size:1.1rem;border-bottom:1px solid #ddd;padding-bottom:5px;">Customer Information</h2>';
        html += '<table style="width:100%;">';
        html += '<tr><td style="padding:3px 10px 3px 0;color:#666;width:120px;"><strong>Name</strong></td>';
        html += '<td>' + (escapeHTML(document.getElementById('cust-name').value) || 'N/A') + '</td></tr>';
        html += '<tr><td style="padding:3px 10px 3px 0;color:#666;"><strong>Email</strong></td>';
        html += '<td>' + (escapeHTML(document.getElementById('cust-email').value) || 'N/A') + '</td></tr>';
        html += '<tr><td style="padding:3px 10px 3px 0;color:#666;"><strong>Zip Code</strong></td>';
        html += '<td>' + (escapeHTML(document.getElementById('cust-zip').value) || 'N/A') + '</td></tr>';
        var company = document.getElementById('cust-company').value;
        if (company) {
            html += '<tr><td style="padding:3px 10px 3px 0;color:#666;"><strong>Company</strong></td>';
            html += '<td>' + escapeHTML(company) + '</td></tr>';
        }
        var phone = document.getElementById('cust-phone').value;
        if (phone) {
            html += '<tr><td style="padding:3px 10px 3px 0;color:#666;"><strong>Phone</strong></td>';
            html += '<td>' + escapeHTML(phone) + '</td></tr>';
        }
        html += '</table></div>';

        var hasPicFrame = document.getElementById('pic-frame').checked;
        var hasStairs = document.getElementById('stairs').checked;
        if (hasPicFrame || hasStairs) {
            html += '<div style="margin-bottom:20px;"><h2 style="color:#374151;font-size:1.1rem;border-bottom:1px solid #ddd;padding-bottom:5px;">Options</h2>';
            if (hasPicFrame) html += '<p style="margin:5px 0;">&#10003; Picture Framing</p>';
            if (hasStairs) html += '<p style="margin:5px 0;">&#10003; Stairs</p>';
            html += '</div>';
        }

        html += '<div style="margin-bottom:20px;"><h2 style="color:#374151;font-size:1.1rem;border-bottom:1px solid #ddd;padding-bottom:5px;">Order Items</h2>';
        html += '<table style="width:100%;border-collapse:collapse;margin-top:10px;"><thead><tr style="background:#f3f4f6;">';
        html += '<th style="border:1px solid #ddd;padding:10px;text-align:left;">Product</th>';
        html += '<th style="border:1px solid #ddd;padding:10px;text-align:left;">Color</th>';
        html += '<th style="border:1px solid #ddd;padding:10px;text-align:left;">Length</th>';
        html += '<th style="border:1px solid #ddd;padding:10px;text-align:center;">Qty</th>';
        html += '<th style="border:1px solid #ddd;padding:10px;text-align:right;">Subtotal</th></tr></thead><tbody>';

        var grandTotal = 0;
        currentQuote.lineItems.forEach(function (item) {
            var prod = PRODUCTS[item.type] || PRODUCTS.custom;
            var sub = getItemSubtotal(item);
            grandTotal += sub;
            var lengthDisplay = '';
            if (item.type === 'dexerdry') lengthDisplay = item.length + ' ft box';
            else if (prod.isFt) {
                var len = item.length === 'custom' ? (item.customLength || 0) : (item.length || 0);
                lengthDisplay = len + ' ft';
            }
            var productName = item.type === 'custom' && item.customDesc ? escapeHTML(item.customDesc) : escapeHTML(prod.name);
            html += '<tr><td style="border:1px solid #ddd;padding:10px;">' + productName + '</td>';
            html += '<td style="border:1px solid #ddd;padding:10px;">' + (prod.hasColor ? escapeHTML(item.color || '') : '') + '</td>';
            html += '<td style="border:1px solid #ddd;padding:10px;">' + escapeHTML(lengthDisplay) + '</td>';
            html += '<td style="border:1px solid #ddd;padding:10px;text-align:center;">' + item.qty + '</td>';
            html += '<td style="border:1px solid #ddd;padding:10px;text-align:right;">' + formatCurrency(sub) + '</td></tr>';
        });

        html += '<tr style="background:#f3f4f6;font-weight:bold;"><td colspan="4" style="border:1px solid #ddd;padding:12px;text-align:right;">ESTIMATED TOTAL:</td>';
        html += '<td style="border:1px solid #ddd;padding:12px;text-align:right;color:#1e40af;font-size:1.1rem;">' + formatCurrency(grandTotal) + '</td></tr></tbody></table></div>';

        var special = document.getElementById('special-instr').value;
        if (special) {
            html += '<div style="margin-bottom:20px;"><h2 style="color:#374151;font-size:1.1rem;border-bottom:1px solid #ddd;padding-bottom:5px;">Special Instructions</h2>';
            html += '<p style="white-space:pre-wrap;background:#f9fafb;padding:10px;border-radius:5px;">' + escapeHTML(special) + '</p></div>';
        }

        var shipAddr = document.getElementById('ship-addr').value;
        var delDate = document.getElementById('del-date').value;
        if (shipAddr || delDate) {
            html += '<div style="margin-bottom:20px;"><h2 style="color:#374151;font-size:1.1rem;border-bottom:1px solid #ddd;padding-bottom:5px;">Shipping &amp; Delivery</h2>';
            if (shipAddr) html += '<p><strong>Address:</strong><br>' + escapeHTML(shipAddr).replace(/\n/g, '<br>') + '</p>';
            if (delDate) html += '<p><strong>Preferred Date:</strong> ' + escapeHTML(delDate) + '</p>';
            html += '</div>';
        }

        if (isCustomer) {
            html += '<div style="margin-top:30px;padding-top:15px;border-top:1px solid #ddd;font-size:0.85rem;color:#666;">';
            html += '<p><strong>Disclaimer:</strong> This is an estimate only. Final pricing subject to confirmation by AM Building Products / AmeriDex. Prices do not include shipping, taxes, or installation unless otherwise noted.</p></div>';
        }

        html += '</div>';
        return html;
    };


    // ===========================================================
    // PATCH 6: Bootstrap Loader for Additional Scripts
    //
    // v1.6: Added ameridex-customer-sync.js to sync localStorage
    //       customers to the server API.
    // ===========================================================
    var EXTRA_SCRIPTS = [
        'ameridex-addrow-fix.js',
        'ameridex-print-branding.js',
        'ameridex-ui-fixes.js',
        'ameridex-admin-csv-fix.js',
        'ameridex-customer-sync.js'
    ];

    var scriptIndex = 0;

    function loadNextScript() {
        if (scriptIndex >= EXTRA_SCRIPTS.length) {
            console.log('[patches v1.6] PATCH 6: All ' + EXTRA_SCRIPTS.length + ' extra scripts loaded.');
            // Run removal one more time after all scripts loaded,
            // in case any script re-rendered the section
            setTimeout(function() {
                removeSavedQuotesSection();
            }, 100);
            return;
        }
        var src = EXTRA_SCRIPTS[scriptIndex];
        var el = document.createElement('script');
        el.src = src;
        el.onload = function () {
            console.log('[patches v1.6] PATCH 6: Loaded ' + src);
            scriptIndex++;
            loadNextScript();
        };
        el.onerror = function () {
            console.error('[patches v1.6] PATCH 6: FAILED to load ' + src);
            scriptIndex++;
            loadNextScript();
        };
        document.body.appendChild(el);
    }

    // Start loading after a short delay to ensure all other static
    // scripts have finished executing first
    setTimeout(loadNextScript, 50);

})();
