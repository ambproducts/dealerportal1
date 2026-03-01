/**
 * ameridex-print-branding.js  v2.0
 *
 * Fixes (2026-03-01):
 *   1. Double print dialog  — removed the 1 500 ms setTimeout fallback; only
 *      printWindow.onload fires print now.  The fallback was racing onload.
 *   2. $0.00 line-item values — gatherQuoteData() now calls the portal's own
 *      getItemSubtotal() and reads item.qty (not item.quantity / item.total).
 *   3. Wrong color scheme   — quote-template.html uses --color-brand:#1A3A5C
 *      and --color-accent:#D4870A. Those ARE the AmeriDex navy + gold palette.
 *      The portal's header was generating its own blue (#2563eb) HTML instead
 *      of using the template; now BOTH paths use the template exclusively.
 *   4. "Print Customer Quote" had no format — the submit-btn in quick-quote
 *      mode called showPrintPreview('customer'), which generated unstyled HTML.
 *      We now intercept that button and route it through printQuote() so the
 *      branded template is used every time.
 *
 * Must be loaded AFTER the main dealer-portal.html inline script.
 */

(function () {
    'use strict';

    // -------------------------------------------------------------------------
    // TEMPLATE CACHE
    // -------------------------------------------------------------------------
    var cachedTemplate = null;

    function fetchTemplate() {
        if (cachedTemplate) return Promise.resolve(cachedTemplate);
        return fetch('/quote-template.html')
            .then(function (res) {
                if (!res.ok) throw new Error('Template fetch failed: ' + res.status);
                return res.text();
            })
            .then(function (html) {
                cachedTemplate = html;
                return html;
            });
    }

    // -------------------------------------------------------------------------
    // DATA GATHERING
    // Reads the portal's live currentQuote state correctly:
    //   • item.qty        (not item.quantity)
    //   • getItemSubtotal(item) for the dollar value (not item.total)
    //   • PRODUCTS[item.type].name for the display name
    // -------------------------------------------------------------------------
    function gatherQuoteData() {
        var data = {
            quoteNumber:    'Draft',
            quoteDate:      new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
            dealerCode:     '',
            dealerBusiness: '',
            dealerContact:  '',
            customerName:   '',
            customerEmail:  '',
            customerZip:    '',
            lineItems:      [],
            subtotal:       0,
            estimatedTotal: 0
        };

        // Quote meta
        if (typeof currentQuote !== 'undefined' && currentQuote) {
            data.quoteNumber = currentQuote.quoteNumber || currentQuote.quoteId || 'Draft';
            if (currentQuote.createdAt) {
                data.quoteDate = new Date(currentQuote.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric', month: 'long', day: 'numeric'
                });
            }
        }

        // Dealer info
        if (typeof dealerSettings !== 'undefined' && dealerSettings) {
            data.dealerCode     = dealerSettings.dealerCode     || '';
            data.dealerBusiness = dealerSettings.dealerName     || dealerSettings.businessName  || '';
            data.dealerContact  = dealerSettings.dealerContact  || dealerSettings.contactName   || '';
        }

        // Customer info: prefer currentQuote.customer, fall back to DOM
        var cq = (typeof currentQuote !== 'undefined') ? currentQuote : null;
        if (cq && cq.customer) {
            data.customerName  = cq.customer.name     || '';
            data.customerEmail = cq.customer.email    || '';
            data.customerZip   = cq.customer.zipCode  || '';
        } else {
            var nameEl  = document.getElementById('cust-name');
            var emailEl = document.getElementById('cust-email');
            var zipEl   = document.getElementById('cust-zip');
            data.customerName  = nameEl  ? nameEl.value  : '';
            data.customerEmail = emailEl ? emailEl.value : '';
            data.customerZip   = zipEl   ? zipEl.value   : '';
        }

        // Line items — use the portal's own pricing helpers
        if (cq && cq.lineItems && cq.lineItems.length) {
            var total = 0;

            data.lineItems = cq.lineItems.map(function (item) {
                // Product display name
                var prodName = 'Custom Item';
                if (item.type === 'custom' && item.customDesc) {
                    prodName = item.customDesc;
                } else if (typeof PRODUCTS !== 'undefined' && PRODUCTS[item.type]) {
                    prodName = PRODUCTS[item.type].name;
                } else if (item.productName) {
                    prodName = item.productName;
                }

                // Sub-total: use the portal helper if available, otherwise compute inline
                var sub = 0;
                if (typeof getItemSubtotal === 'function') {
                    sub = getItemSubtotal(item);
                } else {
                    // inline fallback identical to portal logic
                    var prod = (typeof PRODUCTS !== 'undefined') ? (PRODUCTS[item.type] || PRODUCTS.custom) : null;
                    var price = item.type === 'custom'
                        ? (item.customUnitPrice || 0)
                        : (prod ? prod.price : 0);
                    if (item.type === 'dexerdry') {
                        sub = (item.length || 0) * (item.qty || 0) * price;
                    } else if (prod && prod.isFt) {
                        var len = item.length === 'custom' ? (item.customLength || 0) : (item.length || 0);
                        sub = len * (item.qty || 0) * price;
                    } else {
                        sub = (item.qty || 0) * price;
                    }
                }

                total += sub;

                return {
                    productName:  prodName,
                    type:         item.type || '',
                    color:        item.color  || '',
                    color2:       item.color2 || '',
                    length:       item.length,
                    customLength: item.customLength,
                    quantity:     item.qty || item.quantity || 1,
                    total:        sub
                };
            });

            data.subtotal       = total;
            data.estimatedTotal = total;
        }

        return data;
    }

    // -------------------------------------------------------------------------
    // HTML HELPERS
    // -------------------------------------------------------------------------
    function escapeHtml(text) {
        if (!text && text !== 0) return '';
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(String(text)));
        return div.innerHTML;
    }

    function fmt(num) {
        return '$' + Number(num || 0).toFixed(2);
    }

    function buildOrderRows(lineItems) {
        if (!lineItems || lineItems.length === 0) {
            return '<tr><td colspan="5" style="text-align:center;padding:20px;color:#6B7A90;">No items added</td></tr>';
        }

        return lineItems.map(function (item) {
            var lengthDisplay = item.customLength
                ? item.customLength + "' (custom)"
                : (item.length && item.length !== 'custom')
                ? item.length + "'"
                : 'N/A';

            var colorDisplay = item.color2
                ? item.color + ' / ' + item.color2
                : (item.color || 'N/A');

            return '<tr>'
                + '<td><span class="product-name">' + escapeHtml(item.productName) + '</span>'
                + (item.type && item.type !== 'custom'
                    ? '<br><small style="color:#6B7A90">' + escapeHtml(item.type) + '</small>'
                    : '')
                + '</td>'
                + '<td><span class="color-swatch"><span class="swatch-dot"></span>'
                + escapeHtml(colorDisplay) + '</span></td>'
                + '<td>' + escapeHtml(lengthDisplay) + '</td>'
                + '<td>' + escapeHtml(item.quantity) + '</td>'
                + '<td>' + escapeHtml(fmt(item.total)) + '</td>'
                + '</tr>';
        }).join('\n');
    }

    function fillTemplate(html, data) {
        return html
            .replace(/{{QUOTE_NUMBER}}/g,    escapeHtml(data.quoteNumber))
            .replace(/{{QUOTE_DATE}}/g,       escapeHtml(data.quoteDate))
            .replace(/{{DEALER_CODE}}/g,      escapeHtml(data.dealerCode))
            .replace(/{{DEALER_BUSINESS}}/g,  escapeHtml(data.dealerBusiness))
            .replace(/{{DEALER_CONTACT}}/g,   escapeHtml(data.dealerContact))
            .replace(/{{CUSTOMER_NAME}}/g,    escapeHtml(data.customerName))
            .replace(/{{CUSTOMER_EMAIL}}/g,   escapeHtml(data.customerEmail || 'N/A'))
            .replace(/{{CUSTOMER_ZIP}}/g,     escapeHtml(data.customerZip))
            .replace(/{{ORDER_ROWS}}/g,       buildOrderRows(data.lineItems))
            .replace(/{{SUBTOTAL}}/g,         escapeHtml(fmt(data.subtotal)))
            .replace(/{{ESTIMATED_TOTAL}}/g,  escapeHtml(fmt(data.estimatedTotal)));
    }

    // -------------------------------------------------------------------------
    // PRINT QUOTE
    // Fix: only ONE print trigger (onload). The old 1 500 ms setTimeout fallback
    // was racing onload and causing the dialog to open twice.
    // -------------------------------------------------------------------------
    function printQuote() {
        return fetchTemplate()
            .then(function (html) {
                var data       = gatherQuoteData();
                var filledHtml = fillTemplate(html, data);

                var printWindow = window.open('', '_blank', 'width=900,height=700');
                if (!printWindow) {
                    alert('Pop-up blocked. Please allow pop-ups for this site to print quotes.');
                    return;
                }

                printWindow.document.open();
                printWindow.document.write(filledHtml);
                printWindow.document.close();

                // Single trigger only — no setTimeout racing onload
                printWindow.onload = function () {
                    printWindow.focus();
                    printWindow.print();
                };
            })
            .catch(function (err) {
                console.error('[Print] Failed to generate print view:', err);
                alert('Failed to load print template. Please try again.');
            });
    }

    // -------------------------------------------------------------------------
    // DOWNLOAD PDF
    // Tries server-side Puppeteer endpoint first (checks both .id and .quoteId),
    // then falls back to printQuote() — which now only opens the dialog once.
    // -------------------------------------------------------------------------
    function downloadPDF() {
        var quoteId = (typeof currentQuote !== 'undefined')
            ? (currentQuote.id || currentQuote.quoteId || null)
            : null;

        if (quoteId) {
            var token = localStorage.getItem('authToken') || '';
            return fetch('/api/quotes/' + quoteId + '/pdf', {
                headers: { 'Authorization': 'Bearer ' + token }
            })
            .then(function (response) {
                if (!response.ok) throw new Error('Server returned ' + response.status);
                return response.blob();
            })
            .then(function (blob) {
                var url = URL.createObjectURL(blob);
                var a   = document.createElement('a');
                a.href  = url;
                a.download = (quoteId || 'quote') + '.pdf';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                console.log('[PDF] Downloaded via server:', quoteId);
            })
            .catch(function (err) {
                console.warn('[PDF] Server endpoint failed, falling back to print:', err.message);
                return printQuote();
            });
        }

        // No server ID available — go straight to print fallback
        console.log('[PDF] No server ID, using client-side print fallback.');
        return printQuote();
    }

    // -------------------------------------------------------------------------
    // FIX: "Print Customer Quote" / submit-btn in Quick Quote mode
    // The inline script wires submit-btn → showPrintPreview('customer'),
    // which produces unstyled HTML. We replace that onclick after DOMContentLoaded
    // so Quick Quote mode routes through the branded template instead.
    // -------------------------------------------------------------------------
    function patchSubmitButton() {
        var submitBtn = document.getElementById('submit-btn');
        if (!submitBtn) return;

        submitBtn.addEventListener('click', function (e) {
            // Only intercept Quick Quote mode
            var mode = (typeof currentMode !== 'undefined') ? currentMode : 'formal';
            if (mode !== 'quick') return; // let formal mode bubble to inline handler

            e.stopImmediatePropagation(); // prevent inline handler from running

            // Run the same validation the inline script would run
            if (typeof validateRequired === 'function' && !validateRequired()) return;

            printQuote();
        }, true); // capture phase so we run BEFORE the inline onclick
    }

    // -------------------------------------------------------------------------
    // OVERRIDE GLOBALS & PATCH PRINT PREVIEW MODAL
    // Also patch "print-preview-print" so the modal's Print button uses the
    // template (the inline printFromPreview() uses unstyled HTML too).
    // -------------------------------------------------------------------------
    window.generatePDF        = downloadPDF;
    window.downloadQuotePDF   = downloadPDF;
    window.printQuote         = printQuote;

    // Patch the modal Print button
    function patchPrintPreviewButton() {
        var printPreviewBtn = document.getElementById('print-preview-print');
        if (!printPreviewBtn) return;
        printPreviewBtn.addEventListener('click', function (e) {
            e.stopImmediatePropagation();
            // Close the modal, then open the branded window
            var modal = document.getElementById('printPreviewModal');
            if (modal) modal.classList.remove('active');
            printQuote();
        }, true);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            patchSubmitButton();
            patchPrintPreviewButton();
        });
    } else {
        patchSubmitButton();
        patchPrintPreviewButton();
    }

    console.log('[ameridex-print-branding] v2.0 loaded — double-print, $0.00, color, and customer-quote-format bugs fixed.');

})();
