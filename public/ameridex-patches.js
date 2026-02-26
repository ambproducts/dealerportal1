// ============================================================
// AmeriDex Dealer Portal - Patch File v1.4
// Date: 2026-02-25
// ============================================================
// HOW TO USE:
//   Add this <script> tag at the very bottom of dealer-portal.html,
//   right before the closing </body> tag:
//
//     <script src="ameridex-patches.js"></script>
//
//   This file monkey-patches the existing global functions
//   in-place. No edits to the main file required.
// ============================================================

(function () {
    'use strict';

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
    // Dynamically loads scripts that are not in the static <script>
    // tags of dealer-portal.html. These scripts override functions
    // defined above (e.g., generatePrintHTML gets replaced by the
    // branded version from ameridex-print-branding.js).
    //
    // Load order matters: print-branding must load before ui-fixes.
    // ===========================================================
    var EXTRA_SCRIPTS = [
        'ameridex-print-branding.js',
        'ameridex-ui-fixes.js'
    ];

    var scriptIndex = 0;

    function loadNextScript() {
        if (scriptIndex >= EXTRA_SCRIPTS.length) {
            console.log('[ameridex-patches] PATCH 6: All extra scripts loaded.');
            return;
        }
        var src = EXTRA_SCRIPTS[scriptIndex];
        var el = document.createElement('script');
        el.src = src;
        el.onload = function () {
            console.log('[ameridex-patches] PATCH 6: Loaded ' + src);
            scriptIndex++;
            loadNextScript();
        };
        el.onerror = function () {
            console.error('[ameridex-patches] PATCH 6: FAILED to load ' + src);
            scriptIndex++;
            loadNextScript();
        };
        document.body.appendChild(el);
    }

    // Start loading after a short delay to ensure all other static
    // scripts have finished executing first
    setTimeout(loadNextScript, 50);

})();
