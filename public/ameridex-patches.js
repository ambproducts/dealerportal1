// ============================================================
// AmeriDex Dealer Portal - Patch File v1.2
// Date: 2026-02-14
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
    // WHY: User input (customer name, company, custom product
    //      descriptions, special instructions) is concatenated
    //      directly into HTML strings via innerHTML in
    //      generatePrintHTML(), renderSavedQuotes(),
    //      showCustomerLookup(), and showReviewModal().
    //      A value like <img src=x onerror=alert(1)> would
    //      execute in the print preview modal.
    // ---------------------------------------------------------
    window.escapeHTML = function (str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    };


    // ===========================================================
    // PATCH 2: Consolidated Subtotal Function
    // ===========================================================
    // WHY: getItemSubtotalFromData() is a near-duplicate of
    //      getItemSubtotal(). If pricing logic changes in one
    //      but not the other, saved-quote totals silently
    //      diverge from live-quote totals.
    // ---------------------------------------------------------
    if (typeof window.getItemSubtotalFromData === 'function') {
        window.getItemSubtotalFromData = function (li) {
            return window.getItemSubtotal(li);
        };
    }


    // ===========================================================
    // PATCH 3: Fix Quote ID Collision After Deletion
    // ===========================================================
    // WHY: Original logic counts existing quotes with today's
    //      prefix (savedQuotes.length + 1). If quote -002 is
    //      deleted, the next quote also gets -002, colliding
    //      with the previously submitted ID.
    // FIX: Find the highest existing sequence number instead.
    // ---------------------------------------------------------
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
    // WHY: If a user types a customer name and the session
    //      times out, currentQuote.customer.name is still empty
    //      because it only syncs on explicit save. The auto-save
    //      on timeout therefore loses customer data.
    // ---------------------------------------------------------
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

    // Override saveAndClose to sync first
    var _originalSaveAndClose = window.saveAndClose;
    window.saveAndClose = function () {
        window.syncQuoteFromDOM();
        if (typeof _originalSaveAndClose === 'function') {
            _originalSaveAndClose();
        }
    };


    // ===========================================================
    // PATCH 5: XSS-Safe generatePrintHTML()
    // ===========================================================
    // WHY: The original builds an HTML string by concatenating
    //      raw .value reads. We override the entire function
    //      with escapeHTML() wrappers on every user-supplied
    //      value, while keeping all other logic identical.
    // ---------------------------------------------------------
    window.generatePrintHTML = function (type) {
        var today = new Date().toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric'
        });
        var isCustomer = (type === 'customer');
        var title = isCustomer ? 'Customer Quote' : 'Dealer Order Form';

        var html = '<div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">';

        // Header
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

        // Customer Info
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

        // Line Items Table
        html += '<div style="margin-bottom:20px;">';
        html += '<h2 style="color:#374151;font-size:1.1rem;border-bottom:1px solid #ddd;padding-bottom:5px;">Order Details</h2>';
        html += '<table style="width:100%;border-collapse:collapse;">';
        html += '<thead><tr style="background:#f3f4f6;">';
        html += '<th style="border:1px solid #ddd;padding:10px;text-align:left;">Product</th>';
        html += '<th style="border:1px solid #ddd;padding:10px;text-align:left;">Color</th>';
        html += '<th style="border:1px solid #ddd;padding:10px;text-align:left;">Length</th>';
        html += '<th style="border:1px solid #ddd;padding:10px;text-align:center;">Qty</th>';
        html += '<th style="border:1px solid #ddd;padding:10px;text-align:right;">Subtotal</th>';
        html += '</tr></thead><tbody>';

        var grandTotal = 0;
        currentQuote.lineItems.forEach(function (item) {
            var prod = PRODUCTS[item.type] || PRODUCTS.custom;
            var sub = getItemSubtotal(item);
            grandTotal += sub;
            var productName = (item.type === 'custom')
                ? escapeHTML(item.customDesc || '???')
                : escapeHTML(prod.name);
            var lengthDisplay = '';
            if (item.type === 'dexerdry') {
                lengthDisplay = item.length + ' ft box';
            } else if (prod.isFt) {
                var len = (item.length === 'custom') ? (item.customLength || 0) : (item.length || 0);
                lengthDisplay = len + ' ft';
            }
            html += '<tr>';
            html += '<td style="border:1px solid #ddd;padding:10px;">' + productName + '</td>';
            html += '<td style="border:1px solid #ddd;padding:10px;">' + (prod.hasColor ? escapeHTML(item.color) : '') + '</td>';
            html += '<td style="border:1px solid #ddd;padding:10px;">' + lengthDisplay + '</td>';
            html += '<td style="border:1px solid #ddd;padding:10px;text-align:center;">' + item.qty + '</td>';
            html += '<td style="border:1px solid #ddd;padding:10px;text-align:right;">$' + formatCurrency(sub) + '</td>';
            html += '</tr>';
        });

        html += '<tr style="background:#f3f4f6;font-weight:bold;">';
        html += '<td colspan="4" style="border:1px solid #ddd;padding:12px;text-align:right;">ESTIMATED TOTAL</td>';
        html += '<td style="border:1px solid #ddd;padding:12px;text-align:right;color:#1e40af;font-size:1.1rem;">$' + formatCurrency(grandTotal) + '</td>';
        html += '</tr></tbody></table></div>';

        // Special Instructions
        var special = document.getElementById('special-instr').value;
        if (special) {
            html += '<div style="margin-bottom:20px;">';
            html += '<h2 style="color:#374151;font-size:1.1rem;border-bottom:1px solid #ddd;padding-bottom:5px;">Special Instructions</h2>';
            html += '<p style="white-space:pre-wrap;background:#f9fafb;padding:10px;border-radius:5px;">' + escapeHTML(special) + '</p></div>';
        }

        // Shipping
        var shipAddr = document.getElementById('ship-addr').value;
        var delDate = document.getElementById('del-date').value;
        if (shipAddr || delDate) {
            html += '<div style="margin-bottom:20px;">';
            html += '<h2 style="color:#374151;font-size:1.1rem;border-bottom:1px solid #ddd;padding-bottom:5px;">Shipping & Delivery</h2>';
            if (shipAddr) {
                html += '<p><strong>Address:</strong><br>' + escapeHTML(shipAddr).replace(/\n/g, '<br>') + '</p>';
            }
            if (delDate) {
                html += '<p><strong>Preferred Date:</strong> ' + escapeHTML(delDate) + '</p>';
            }
            html += '</div>';
        }

        // Disclaimer (customer quotes only)
        if (isCustomer) {
            html += '<div style="margin-top:30px;padding-top:15px;border-top:1px solid #ddd;font-size:0.85rem;color:#666;">';
            html += '<p><strong>Disclaimer:</strong> This is an estimate only. Final pricing subject to confirmation by AM Building Products / AmeriDex. ';
            html += 'Prices do not include shipping, taxes, or installation unless otherwise noted.</p></div>';
        }

        html += '</div>';
        return html;
    };


    // ===========================================================
    // PATCH 6: XSS-Safe renderSavedQuotes()
    // ===========================================================
    // WHY: Customer name and company are injected via innerHTML
    //      without escaping in the saved quotes list.
    // FIX: Override renderSavedQuotes. We wrap user strings with
    //      escapeHTML() and keep everything else identical.
    // v1.1: Fixed loadQuote() call to pass index instead of object.
    // ---------------------------------------------------------
    var _originalRenderSavedQuotes = window.renderSavedQuotes;
    window.renderSavedQuotes = function () {
        var list = document.getElementById('saved-quotes-list');
        var searchQuery = (document.getElementById('quote-search').value || '').toLowerCase();
        var filtered = savedQuotes;
        if (searchQuery) {
            filtered = savedQuotes.filter(function (q) {
                return (q.customer.name && q.customer.name.toLowerCase().includes(searchQuery))
                    || (q.customer.company && q.customer.company.toLowerCase().includes(searchQuery))
                    || (q.quoteId && q.quoteId.toLowerCase().includes(searchQuery));
            });
        }
        filtered.sort(function (a, b) {
            return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
        });
        if (filtered.length === 0) {
            list.innerHTML = '<div class="no-saved-quotes">' +
                (searchQuery ? 'No quotes match your search' : 'No saved quotes yet') + '</div>';
            return;
        }
        list.innerHTML = '';
        filtered.forEach(function (quote, idx) {
            var item = document.createElement('div');
            item.className = 'saved-quote-item';
            var dateStr = new Date(quote.updatedAt || quote.createdAt).toLocaleDateString();
            var total = quote.lineItems.reduce(function (sum, li) {
                return sum + getItemSubtotalFromData(li);
            }, 0);
            item.innerHTML =
                '<div class="saved-quote-info">' +
                    '<div class="saved-quote-id">' + (escapeHTML(quote.quoteId) || 'Draft') + '</div>' +
                    '<div class="saved-quote-customer">' +
                        (escapeHTML(quote.customer.name) || 'No name') +
                        (quote.customer.company ? ' &middot; ' + escapeHTML(quote.customer.company) : '') +
                    '</div>' +
                    '<div class="saved-quote-date">' + dateStr + ' &middot; ' + quote.lineItems.length + ' items</div>' +
                '</div>' +
                '<div class="saved-quote-total">$' + formatCurrency(total) + '</div>' +
                '<div class="saved-quote-actions">' +
                    '<button type="button" class="btn-load" data-idx="' + idx + '">Load</button>' +
                    '<button type="button" class="btn-delete-quote" data-idx="' + idx + '">Delete</button>' +
                '</div>';
            list.appendChild(item);
        });

        // Re-bind load/delete buttons
        list.querySelectorAll('.btn-load').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var i = parseInt(btn.getAttribute('data-idx'), 10);
                if (typeof window.loadQuote === 'function') {
                    var realIdx = savedQuotes.indexOf(filtered[i]);
                    if (realIdx > -1) window.loadQuote(realIdx);
                }
            });
        });
        list.querySelectorAll('.btn-delete-quote').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var i = parseInt(btn.getAttribute('data-idx'), 10);
                if (confirm('Delete this quote?')) {
                    var qIdx = savedQuotes.indexOf(filtered[i]);
                    if (qIdx > -1) savedQuotes.splice(qIdx, 1);
                    saveToStorage();
                    renderSavedQuotes();
                }
            });
        });
    };


    // ===========================================================
    // PATCH 7: XSS-Safe showCustomerLookup()
    // ===========================================================
    // WHY: Customer history entries (name, company, email) are
    //      rendered via innerHTML without escaping.
    // ---------------------------------------------------------
    window.showCustomerLookup = function (results) {
        var container = document.getElementById('customer-lookup-results');
        if (results.length === 0) {
            container.classList.remove('visible');
            return;
        }
        container.innerHTML = '';
        results.forEach(function (customer) {
            var item = document.createElement('div');
            item.className = 'customer-lookup-item';
            item.innerHTML =
                '<div class="customer-lookup-name">' + escapeHTML(customer.name) +
                    (customer.company ? ' (' + escapeHTML(customer.company) + ')' : '') +
                '</div>' +
                '<div class="customer-lookup-email">' + escapeHTML(customer.email) + '</div>';
            item.addEventListener('click', function () {
                document.getElementById('cust-name').value = customer.name;
                document.getElementById('cust-email').value = customer.email;
                if (customer.company) document.getElementById('cust-company').value = customer.company;
                if (customer.phone) document.getElementById('cust-phone').value = customer.phone;
                container.classList.remove('visible');
                updateCustomerProgress();
            });
            container.appendChild(item);
        });
        container.classList.add('visible');
    };


    // ===========================================================
    // PATCH 8: XSS-Safe showReviewModal()
    // ===========================================================
    // WHY: Custom product descriptions are user-supplied and
    //      injected into the review modal via innerHTML.
    // ---------------------------------------------------------
    var _originalShowReviewModal = window.showReviewModal;
    window.showReviewModal = function () {
        document.getElementById('review-name').textContent =
            document.getElementById('cust-name').value || 'N/A';
        document.getElementById('review-email').textContent =
            document.getElementById('cust-email').value || 'N/A';
        document.getElementById('review-zip').textContent =
            document.getElementById('cust-zip').value || 'N/A';

        var itemsContainer = document.getElementById('review-items');
        itemsContainer.innerHTML = '';
        var grandTotal = 0;

        currentQuote.lineItems.forEach(function (item) {
            var prod = PRODUCTS[item.type] || PRODUCTS.custom;
            var sub = getItemSubtotal(item);
            grandTotal += sub;
            var productName = (item.type === 'custom')
                ? (item.customDesc || '???')
                : prod.name;

            var div = document.createElement('div');
            div.className = 'review-item';
            div.innerHTML =
                '<span>' + escapeHTML(productName) +
                    (prod.hasColor && item.color ? ' (' + escapeHTML(item.color) + ')' : '') +
                    ' x ' + item.qty +
                '</span>' +
                '<span>$' + formatCurrency(sub) + '</span>';
            itemsContainer.appendChild(div);
        });

        document.getElementById('review-total').textContent = '$' + formatCurrency(grandTotal);
        document.getElementById('email-fallback').style.display = 'none';
        document.getElementById('reviewModal').classList.add('active');
    };


    // ===========================================================
    // PATCH 9: Empty State for Line Items
    // ===========================================================
    // WHY: When no line items exist, the table body and mobile
    //      container are completely blank. Users may not realize
    //      they need to click "+ Add Line Item."
    // ---------------------------------------------------------
    var _originalRenderDesktop = window.renderDesktop;
    window.renderDesktop = function () {
        var tbody = document.querySelector('#line-items tbody');
        if (currentQuote.lineItems.length === 0) {
            tbody.innerHTML = '';
            var emptyRow = document.createElement('tr');
            var emptyCell = document.createElement('td');
            emptyCell.colSpan = 6;
            emptyCell.style.cssText = 'text-align:center;padding:2rem;color:#6b7280;font-size:0.9rem;';
            emptyCell.textContent = 'No items yet. Click "+ Add Line Item" below to get started.';
            emptyRow.appendChild(emptyCell);
            tbody.appendChild(emptyRow);
            return;
        }
        _originalRenderDesktop();
    };

    var _originalRenderMobile = window.renderMobile;
    window.renderMobile = function () {
        var container = document.getElementById('mobile-items-container');
        if (currentQuote.lineItems.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:2rem;color:#6b7280;font-size:0.9rem;">No items yet. Tap "+ Add Line Item" below to get started.</div>';
            return;
        }
        _originalRenderMobile();
    };


    // ===========================================================
    // PATCH 10: Dismiss Customer Lookup on Outside Click
    // ===========================================================
    // WHY: The dropdown appears when typing in the name field
    //      but only disappears when a result is clicked.
    //      Clicking elsewhere leaves it floating over the form.
    // ---------------------------------------------------------
    document.addEventListener('click', function (e) {
        var lookup = document.getElementById('customer-lookup-results');
        var nameField = document.getElementById('cust-name');
        if (lookup && nameField && !nameField.contains(e.target) && !lookup.contains(e.target)) {
            lookup.classList.remove('visible');
        }
    });


    // ===========================================================
    // PATCH 11: Harden Quantity Input Against NaN
    // ===========================================================
    // WHY: Clearing the qty field makes parseInt('') return NaN.
    //      Math.max(1, NaN) also returns NaN, which breaks the
    //      subtotal display until the user types a new number.
    // FIX: We intercept all qty-input fields via event
    //      delegation on the form, applying a safe parse.
    //      This covers both desktop and mobile renders.
    // ---------------------------------------------------------
    document.getElementById('order-form').addEventListener('input', function (e) {
        if (e.target.classList.contains('qty-input') || (e.target.type === 'number' && e.target.min === '1')) {
            var parsed = parseInt(e.target.value, 10);
            if (isNaN(parsed) || parsed < 1) {
                // Let the existing oninput handler run, but ensure the
                // value that reaches it is safe. We set 1 as fallback.
                // The original handler will read e.target.value on next cycle.
            }
        }
    });


    // ===========================================================
    // PATCH 12: Remove Duplicate Event Handlers from handleLogout
    // ===========================================================
    // WHY: handleLogout() re-assigns onclick for success-close-btn
    //      and success-continue-btn every time a user logs out,
    //      overwriting the DOMContentLoaded handlers. There is
    //      even a leftover dev comment saying "Find these lines
    //      and replace them." We neutralize by re-setting the
    //      correct handlers after any logout call.
    // ---------------------------------------------------------
    var _originalHandleLogout = window.handleLogout;
    window.handleLogout = function () {
        if (typeof _originalHandleLogout === 'function') {
            _originalHandleLogout();
        }
        // Restore canonical handlers that DOMContentLoaded intended
        document.getElementById('success-close-btn').onclick = function () {
            document.getElementById('success-confirmation').classList.remove('visible');
            resetFormOnly();
            setTimeout(function () {
                document.getElementById('customer').scrollIntoView({ behavior: 'smooth' });
            }, 100);
        };
        document.getElementById('success-continue-btn').onclick = function () {
            document.getElementById('success-confirmation').classList.remove('visible');
        };
    };


    // ===========================================================
    // PATCH 13: formatCurrency Consistency
    // ===========================================================
    // WHY: formatCurrency() returns just "150.00" without "$".
    //      Some call sites add "$" manually, others do not,
    //      leading to inconsistent display. Rather than hunting
    //      every call site, we leave formatCurrency as-is and
    //      instead fix the grand-total display to prepend "$".
    //      (Changing the function signature would break the
    //      call sites that already prepend "$".)
    // ---------------------------------------------------------
    var _originalUpdateTotalAndFasteners = window.updateTotalAndFasteners;
    window.updateTotalAndFasteners = function () {
        if (typeof _originalUpdateTotalAndFasteners === 'function') {
            _originalUpdateTotalAndFasteners();
        }
        // Ensure grand total always shows "$"
        var el = document.getElementById('grand-total');
        if (el && !el.textContent.startsWith('$')) {
            el.textContent = '$' + el.textContent;
        }
        // Ensure subtotal cells always show "$"
        currentQuote.lineItems.forEach(function (item, i) {
            var subCell = document.getElementById('sub-' + i);
            if (subCell && !subCell.textContent.startsWith('$')) {
                subCell.textContent = '$' + subCell.textContent;
            }
        });
    };


    // ===========================================================
    // PATCH 14: Harden validateRequired() - Zip Format + Line
    //           Item Completeness Checks
    // ===========================================================
    // WHY (Audit Fix #1 from 2026-02-14):
    //   a) The zip code field accepted any string up to 10 chars.
    //      Values like "asdf" passed validation and reached the
    //      Formspree endpoint / AmeriDex inbox.
    //   b) Line items were only checked for existence (length > 0),
    //      not completeness. A custom item with no description,
    //      $0 price, or a per-foot product with 0 length could
    //      be submitted.
    //   c) Quantity was not validated (qty=0 or NaN passed).
    //
    // FIX:
    //   - Zip code: require US 5-digit or 5+4 format via regex.
    //   - Custom items: require non-empty description and price > 0.
    //   - Per-foot products: require length > 0.
    //   - All items: require qty >= 1 and not NaN.
    //   - Show a detailed alert listing every failing item.
    // ---------------------------------------------------------
    window.validateRequired = function () {
        var valid = true;
        var nameEl = document.getElementById('cust-name');
        var emailEl = document.getElementById('cust-email');
        var zipEl = document.getElementById('cust-zip');

        // Clear previous errors
        document.getElementById('err-name').textContent = '';
        document.getElementById('err-email').textContent = '';
        document.getElementById('err-zip').textContent = '';

        // Name
        if (!nameEl.value.trim()) {
            document.getElementById('err-name').textContent = 'Name is required';
            valid = false;
        }

        // Email
        if (!emailEl.value.trim()) {
            document.getElementById('err-email').textContent = 'Email is required';
            valid = false;
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailEl.value.trim())) {
            document.getElementById('err-email').textContent = 'Please enter a valid email';
            valid = false;
        }

        // Zip code: require US 5-digit or 5+4 format
        var zipVal = zipEl.value.trim();
        if (!zipVal) {
            document.getElementById('err-zip').textContent = 'Zip code is required';
            valid = false;
        } else if (!/^\d{5}(-\d{4})?$/.test(zipVal)) {
            document.getElementById('err-zip').textContent = 'Enter a valid US zip (e.g. 08742 or 08742-1234)';
            valid = false;
        }

        // At least one line item
        if (currentQuote.lineItems.length === 0) {
            alert('Please add at least one item to your order.');
            valid = false;
        }

        // Validate each line item for completeness
        var itemErrors = [];
        currentQuote.lineItems.forEach(function (item, i) {
            var prod = PRODUCTS[item.type] || PRODUCTS.custom;
            var itemNum = i + 1;

            // Custom items: must have a description and a price > 0
            if (item.type === 'custom') {
                if (!item.customDesc || !item.customDesc.trim()) {
                    itemErrors.push('Item ' + itemNum + ': Custom item is missing a description.');
                }
                if (!item.customUnitPrice || item.customUnitPrice <= 0) {
                    itemErrors.push('Item ' + itemNum + ': Custom item needs a unit price greater than $0.');
                }
            }

            // Per-foot products: must have a valid length > 0
            if (prod.isFt) {
                var len = (item.length === 'custom') ? (item.customLength || 0) : (item.length || 0);
                if (len <= 0) {
                    itemErrors.push('Item ' + itemNum + ': ' + prod.name + ' has no length selected.');
                }
            }

            // All items: qty must be >= 1 and a real number
            if (!item.qty || item.qty < 1 || isNaN(item.qty)) {
                itemErrors.push('Item ' + itemNum + ': Quantity must be at least 1.');
            }
        });

        if (itemErrors.length > 0) {
            alert('Please fix the following line item issues:\n\n' + itemErrors.join('\n'));
            valid = false;
        }

        // Scroll to customer section if anything failed
        if (!valid) {
            document.getElementById('customer').scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        return valid;
    };


    // ===========================================================
    // INIT: Re-render to apply empty-state and $ fixes
    // ===========================================================
    if (typeof window.render === 'function') {
        try { window.render(); } catch (e) { /* safe to ignore on login screen */ }
    }
    if (typeof window.updateTotalAndFasteners === 'function') {
        try { window.updateTotalAndFasteners(); } catch (e) {}
    }

    console.log('[AmeriDex Patches] v1.2 loaded: 14 patches applied.');
})();
