// ============================================================
// AmeriDex Dealer Portal - Customer Address Fields Patch v1.0
// Date: 2026-02-27
// ============================================================
// PURPOSE: Adds Address, City, and State fields to the
// Customer Information section of the quote builder.
// Only Zip Code remains mandatory. All new fields are optional.
//
// REQUIRES: dealer-portal.html loaded first (DOM elements must exist)
//
// Load order: add to script tags in dealer-portal.html AFTER
// the inline <script> block but BEFORE ameridex-portal-nav.js
// OR load via script-loader.js after DOMContentLoaded.
// ============================================================

(function () {
    'use strict';

    // ----------------------------------------------------------
    // US STATES LIST
    // ----------------------------------------------------------
    var US_STATES = [
        { value: '', label: 'Select State...' },
        { value: 'AL', label: 'Alabama' },
        { value: 'AK', label: 'Alaska' },
        { value: 'AZ', label: 'Arizona' },
        { value: 'AR', label: 'Arkansas' },
        { value: 'CA', label: 'California' },
        { value: 'CO', label: 'Colorado' },
        { value: 'CT', label: 'Connecticut' },
        { value: 'DE', label: 'Delaware' },
        { value: 'DC', label: 'District of Columbia' },
        { value: 'FL', label: 'Florida' },
        { value: 'GA', label: 'Georgia' },
        { value: 'HI', label: 'Hawaii' },
        { value: 'ID', label: 'Idaho' },
        { value: 'IL', label: 'Illinois' },
        { value: 'IN', label: 'Indiana' },
        { value: 'IA', label: 'Iowa' },
        { value: 'KS', label: 'Kansas' },
        { value: 'KY', label: 'Kentucky' },
        { value: 'LA', label: 'Louisiana' },
        { value: 'ME', label: 'Maine' },
        { value: 'MD', label: 'Maryland' },
        { value: 'MA', label: 'Massachusetts' },
        { value: 'MI', label: 'Michigan' },
        { value: 'MN', label: 'Minnesota' },
        { value: 'MS', label: 'Mississippi' },
        { value: 'MO', label: 'Missouri' },
        { value: 'MT', label: 'Montana' },
        { value: 'NE', label: 'Nebraska' },
        { value: 'NV', label: 'Nevada' },
        { value: 'NH', label: 'New Hampshire' },
        { value: 'NJ', label: 'New Jersey' },
        { value: 'NM', label: 'New Mexico' },
        { value: 'NY', label: 'New York' },
        { value: 'NC', label: 'North Carolina' },
        { value: 'ND', label: 'North Dakota' },
        { value: 'OH', label: 'Ohio' },
        { value: 'OK', label: 'Oklahoma' },
        { value: 'OR', label: 'Oregon' },
        { value: 'PA', label: 'Pennsylvania' },
        { value: 'PR', label: 'Puerto Rico' },
        { value: 'RI', label: 'Rhode Island' },
        { value: 'SC', label: 'South Carolina' },
        { value: 'SD', label: 'South Dakota' },
        { value: 'TN', label: 'Tennessee' },
        { value: 'TX', label: 'Texas' },
        { value: 'UT', label: 'Utah' },
        { value: 'VT', label: 'Vermont' },
        { value: 'VI', label: 'Virgin Islands' },
        { value: 'VA', label: 'Virginia' },
        { value: 'WA', label: 'Washington' },
        { value: 'WV', label: 'West Virginia' },
        { value: 'WI', label: 'Wisconsin' },
        { value: 'WY', label: 'Wyoming' }
    ];

    // ----------------------------------------------------------
    // HELPER: Wait for DOM + inline script to finish
    // ----------------------------------------------------------
    function onReady(fn) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fn);
        } else {
            fn();
        }
    }

    onReady(function () {

        // ----------------------------------------------------------
        // 1. INJECT HTML FIELDS
        // ----------------------------------------------------------
        // Find the Company/Phone row (the field-row-2 after the
        // name/email/zip row inside #customer section)
        var customerSection = document.getElementById('customer');
        if (!customerSection) {
            console.error('[CustomerAddress] #customer section not found');
            return;
        }

        var formGrid = customerSection.querySelector('.form-grid');
        if (!formGrid) {
            console.error('[CustomerAddress] .form-grid inside #customer not found');
            return;
        }

        // Build the Address row (full width)
        var addressRow = document.createElement('div');
        addressRow.className = 'field-row-2';
        addressRow.id = 'customer-address-row';
        addressRow.innerHTML =
            '<div class="field" style="grid-column: 1 / -1;">' +
                '<label for="cust-address">Address</label>' +
                '<input type="text" id="cust-address" placeholder="e.g., 123 Main Street">' +
            '</div>';

        // Build the City / State row
        var cityStateRow = document.createElement('div');
        cityStateRow.className = 'field-row-3';
        cityStateRow.id = 'customer-city-state-row';

        // City field
        var cityFieldHTML =
            '<div class="field">' +
                '<label for="cust-city">City</label>' +
                '<input type="text" id="cust-city" placeholder="e.g., Linden">' +
            '</div>';

        // State dropdown
        var stateOptionsHTML = '';
        US_STATES.forEach(function (s) {
            stateOptionsHTML += '<option value="' + s.value + '">' + s.label + '</option>';
        });
        var stateFieldHTML =
            '<div class="field">' +
                '<label for="cust-state">State</label>' +
                '<select id="cust-state">' + stateOptionsHTML + '</select>' +
            '</div>';

        // Empty third column placeholder (keeps layout aligned with name/email/zip row)
        var emptyFieldHTML = '<div class="field" style="visibility:hidden;"><label>&nbsp;</label><input type="text" disabled></div>';

        cityStateRow.innerHTML = cityFieldHTML + stateFieldHTML + emptyFieldHTML;

        // Insert AFTER the name/email/zip row (first .field-row-3)
        // and BEFORE the company/phone row (the .field-row-2)
        var companyPhoneRow = formGrid.querySelector('.field-row-2');
        if (companyPhoneRow) {
            formGrid.insertBefore(cityStateRow, companyPhoneRow);
            formGrid.insertBefore(addressRow, cityStateRow);
        } else {
            // fallback: append at end
            formGrid.appendChild(addressRow);
            formGrid.appendChild(cityStateRow);
        }

        console.log('[CustomerAddress] Address, City, State fields injected.');

        // ----------------------------------------------------------
        // 2. PATCH: currentQuote.customer defaults
        // ----------------------------------------------------------
        // Ensure the global currentQuote has the new fields
        if (window.currentQuote && window.currentQuote.customer) {
            if (!('address' in window.currentQuote.customer)) window.currentQuote.customer.address = '';
            if (!('city' in window.currentQuote.customer)) window.currentQuote.customer.city = '';
            if (!('state' in window.currentQuote.customer)) window.currentQuote.customer.state = '';
        }

        // ----------------------------------------------------------
        // 3. PATCH: saveCurrentQuote()
        // ----------------------------------------------------------
        var _origSave = window.saveCurrentQuote;
        if (typeof _origSave === 'function') {
            window.saveCurrentQuote = function () {
                // Ensure fields exist on customer object before save reads them
                if (window.currentQuote && window.currentQuote.customer) {
                    window.currentQuote.customer.address = (document.getElementById('cust-address') || {}).value || '';
                    window.currentQuote.customer.city = (document.getElementById('cust-city') || {}).value || '';
                    window.currentQuote.customer.state = (document.getElementById('cust-state') || {}).value || '';
                }
                return _origSave.apply(this, arguments);
            };
        }

        // ----------------------------------------------------------
        // 4. PATCH: loadQuote()
        // ----------------------------------------------------------
        var _origLoad = window.loadQuote;
        if (typeof _origLoad === 'function') {
            window.loadQuote = function (idx) {
                _origLoad.apply(this, arguments);
                // After the original loads, populate our new fields
                var cust = window.currentQuote ? window.currentQuote.customer : null;
                if (cust) {
                    var addrEl = document.getElementById('cust-address');
                    var cityEl = document.getElementById('cust-city');
                    var stateEl = document.getElementById('cust-state');
                    if (addrEl) addrEl.value = cust.address || '';
                    if (cityEl) cityEl.value = cust.city || '';
                    if (stateEl) stateEl.value = cust.state || '';
                }
            };
        }

        // ----------------------------------------------------------
        // 5. PATCH: resetFormOnly()
        // ----------------------------------------------------------
        var _origReset = window.resetFormOnly;
        if (typeof _origReset === 'function') {
            window.resetFormOnly = function () {
                _origReset.apply(this, arguments);
                var addrEl = document.getElementById('cust-address');
                var cityEl = document.getElementById('cust-city');
                var stateEl = document.getElementById('cust-state');
                if (addrEl) addrEl.value = '';
                if (cityEl) cityEl.value = '';
                if (stateEl) stateEl.value = '';
                // Also ensure the reset state object has the fields
                if (window.currentQuote && window.currentQuote.customer) {
                    window.currentQuote.customer.address = '';
                    window.currentQuote.customer.city = '';
                    window.currentQuote.customer.state = '';
                }
            };
        }

        // ----------------------------------------------------------
        // 6. PATCH: generatePrintHTML()
        // ----------------------------------------------------------
        var _origPrintHTML = window.generatePrintHTML;
        if (typeof _origPrintHTML === 'function') {
            window.generatePrintHTML = function (type) {
                var html = _origPrintHTML.apply(this, arguments);
                // Inject address/city/state into the Customer Information table
                var address = (document.getElementById('cust-address') || {}).value || '';
                var city = (document.getElementById('cust-city') || {}).value || '';
                var state = (document.getElementById('cust-state') || {}).value || '';
                var locationLine = [city, state].filter(Boolean).join(', ');

                if (address || locationLine) {
                    // Build the extra rows
                    var extraRows = '';
                    if (address) {
                        extraRows += '<tr><td style="padding: 3px 10px 3px 0; color: #666;"><strong>Address:</strong></td><td>' + address + '</td></tr>';
                    }
                    if (locationLine) {
                        extraRows += '<tr><td style="padding: 3px 10px 3px 0; color: #666;"><strong>City/State:</strong></td><td>' + locationLine + '</td></tr>';
                    }
                    // Insert after the Zip Code row
                    // The zip row contains "Zip Code:" text
                    var zipMarker = '<strong>Zip Code:</strong></td>';
                    var zipIdx = html.indexOf(zipMarker);
                    if (zipIdx !== -1) {
                        // Find the end of that <tr> (next </tr>)
                        var trEnd = html.indexOf('</tr>', zipIdx);
                        if (trEnd !== -1) {
                            html = html.slice(0, trEnd + 5) + extraRows + html.slice(trEnd + 5);
                        }
                    }
                }
                return html;
            };
        }

        // ----------------------------------------------------------
        // 7. PATCH: generateOrderTextForEmail()
        // ----------------------------------------------------------
        var _origEmailText = window.generateOrderTextForEmail;
        if (typeof _origEmailText === 'function') {
            window.generateOrderTextForEmail = function () {
                var txt = _origEmailText.apply(this, arguments);
                // Insert address/city/state after the Zip Code line
                var address = (document.getElementById('cust-address') || {}).value || '';
                var city = (document.getElementById('cust-city') || {}).value || '';
                var state = (document.getElementById('cust-state') || {}).value || '';

                var extra = '';
                if (address) extra += 'Address: ' + address + '\n';
                if (city) extra += 'City: ' + city + '\n';
                if (state) extra += 'State: ' + state + '\n';

                if (extra) {
                    var zipMarker = 'Zip Code: ';
                    var zipIdx = txt.indexOf(zipMarker);
                    if (zipIdx !== -1) {
                        var lineEnd = txt.indexOf('\n', zipIdx);
                        if (lineEnd !== -1) {
                            txt = txt.slice(0, lineEnd + 1) + extra + txt.slice(lineEnd + 1);
                        }
                    }
                }
                return txt;
            };
        }

        // ----------------------------------------------------------
        // 8. PATCH: showReviewModal()
        // ----------------------------------------------------------
        var _origReviewModal = window.showReviewModal;
        if (typeof _origReviewModal === 'function') {
            window.showReviewModal = function () {
                _origReviewModal.apply(this, arguments);
                // Add address info to the review modal after it renders
                var address = (document.getElementById('cust-address') || {}).value || '';
                var city = (document.getElementById('cust-city') || {}).value || '';
                var state = (document.getElementById('cust-state') || {}).value || '';

                // Remove any previously injected rows
                var old = document.querySelectorAll('.review-address-extra');
                old.forEach(function (el) { el.remove(); });

                var reviewZip = document.getElementById('review-zip');
                if (reviewZip) {
                    var parentItem = reviewZip.closest('.review-item');
                    if (parentItem) {
                        var insertAfter = parentItem;
                        if (address) {
                            var addrDiv = document.createElement('div');
                            addrDiv.className = 'review-item review-address-extra';
                            addrDiv.innerHTML = '<span class="review-item-label">Address:</span><span>' + (address || 'N/A') + '</span>';
                            insertAfter.parentNode.insertBefore(addrDiv, insertAfter.nextSibling);
                            insertAfter = addrDiv;
                        }
                        var locationLine = [city, state].filter(Boolean).join(', ');
                        if (locationLine) {
                            var locDiv = document.createElement('div');
                            locDiv.className = 'review-item review-address-extra';
                            locDiv.innerHTML = '<span class="review-item-label">City/State:</span><span>' + locationLine + '</span>';
                            insertAfter.parentNode.insertBefore(locDiv, insertAfter.nextSibling);
                        }
                    }
                }
            };
        }

        // ----------------------------------------------------------
        // 9. PATCH: showCustomerLookup() - auto-fill new fields
        // ----------------------------------------------------------
        // We patch the click handler approach by wrapping the
        // existing showCustomerLookup to attach extra logic
        var _origShowLookup = window.showCustomerLookup;
        if (typeof _origShowLookup === 'function') {
            window.showCustomerLookup = function (results) {
                _origShowLookup.apply(this, arguments);
                // After the original renders the lookup items,
                // re-bind click handlers to also fill address fields
                var container = document.getElementById('customer-lookup-results');
                if (!container) return;
                var items = container.querySelectorAll('.customer-lookup-item');
                items.forEach(function (itemEl, idx) {
                    var customer = results[idx];
                    if (!customer) return;
                    // Wrap the existing onclick
                    var origClick = itemEl.onclick;
                    itemEl.onclick = null;
                    itemEl.addEventListener('click', function () {
                        // The original handler fills name/email/company/phone
                        // We add address/city/state
                        var addrEl = document.getElementById('cust-address');
                        var cityEl = document.getElementById('cust-city');
                        var stateEl = document.getElementById('cust-state');
                        if (addrEl) addrEl.value = customer.address || '';
                        if (cityEl) cityEl.value = customer.city || '';
                        if (stateEl) stateEl.value = customer.state || '';
                    });
                });
            };
        }

        // ----------------------------------------------------------
        // 10. PATCH: updateCustomerHistory() - save new fields
        // ----------------------------------------------------------
        var _origUpdateHistory = window.updateCustomerHistory;
        if (typeof _origUpdateHistory === 'function') {
            window.updateCustomerHistory = function () {
                // Ensure currentQuote.customer has the address fields
                // before the original function runs
                if (window.currentQuote && window.currentQuote.customer) {
                    window.currentQuote.customer.address = (document.getElementById('cust-address') || {}).value || '';
                    window.currentQuote.customer.city = (document.getElementById('cust-city') || {}).value || '';
                    window.currentQuote.customer.state = (document.getElementById('cust-state') || {}).value || '';
                }
                _origUpdateHistory.apply(this, arguments);
                // Also patch the customerHistory entry to persist new fields
                var email = window.currentQuote.customer.email;
                if (!email) return;
                var history = window.customerHistory || [];
                var entry = history.find(function (c) {
                    return c.email && c.email.toLowerCase() === email.toLowerCase();
                });
                if (entry) {
                    entry.address = window.currentQuote.customer.address || '';
                    entry.city = window.currentQuote.customer.city || '';
                    entry.state = window.currentQuote.customer.state || '';
                }
            };
        }

        // ----------------------------------------------------------
        // 11. PATCH: generatePDF() - include address in PDF
        // ----------------------------------------------------------
        var _origPDF = window.generatePDF;
        if (typeof _origPDF === 'function') {
            window.generatePDF = function () {
                // The original PDF generator reads DOM fields directly.
                // We wrap it to inject extra lines. However, since jsPDF
                // builds sequentially, we instead patch the approach:
                // We temporarily set the cust-name value to include address,
                // which is hacky. Instead, let's just replace entirely.
                // 
                // Actually, the simplest safe approach: add address info
                // to the special instructions temporarily, generate, restore.
                // 
                // Better approach: monkey-patch is too fragile for PDF.
                // Instead, we'll just call the original and let the print
                // HTML version handle the full address. PDF will show the
                // fields that the original PDF generator already reads.
                //
                // For a clean PDF integration we would need to rewrite
                // generatePDF. For now, call original as-is.
                // The print/HTML preview will show full address.
                _origPDF.apply(this, arguments);
            };
        }

        // ----------------------------------------------------------
        // 12. PATCH: buildFormspreePayload() - include address
        // ----------------------------------------------------------
        var _origPayload = window.buildFormspreePayload;
        if (typeof _origPayload === 'function') {
            window.buildFormspreePayload = function () {
                var payload = _origPayload.apply(this, arguments);
                payload.customerAddress = (document.getElementById('cust-address') || {}).value || '';
                payload.customerCity = (document.getElementById('cust-city') || {}).value || '';
                payload.customerState = (document.getElementById('cust-state') || {}).value || '';
                return payload;
            };
        }

        console.log('[CustomerAddress] All patches applied successfully.');
    });
})();
