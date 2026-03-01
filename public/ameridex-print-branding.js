/**
 * ameridex-print-branding.js
 *
 * Template-based quote output for AmeriDex Dealer Portal.
 * Both "Print Quote" and "Download PDF" use the same quote-template.html,
 * ensuring identical formatting.
 *
 * Print Quote:    Fetches template, fills placeholders client-side, opens
 *                 in a new window, triggers window.print().
 *
 * Download PDF:   Calls GET /api/quotes/:id/pdf (Puppeteer on the server).
 *                 Falls back to client-side print-to-PDF if the endpoint
 *                 is unavailable.
 *
 * Must be loaded AFTER the main dealer-portal.html inline script.
 */

(function () {
    'use strict';

    // Cache the template HTML after first fetch
    let cachedTemplate = null;

    // =========================================================================
    // TEMPLATE LOADER
    // =========================================================================

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

    // =========================================================================
    // DATA GATHERING
    // =========================================================================

    /**
     * Collect all quote data from the current context.
     * Prefers the loaded currentQuote object; falls back to DOM inputs.
     */
    function gatherQuoteData() {
        var data = {
            quoteNumber: '',
            quoteDate: '',
            dealerCode: '',
            dealerBusiness: '',
            dealerContact: '',
            customerName: '',
            customerEmail: '',
            customerZip: '',
            lineItems: [],
            subtotal: 0,
            estimatedTotal: 0
        };

        // Quote number and date
        if (typeof currentQuote !== 'undefined' && currentQuote) {
            data.quoteNumber = currentQuote.quoteNumber || currentQuote.quoteId || 'Draft';
            data.quoteDate = currentQuote.createdAt
                ? new Date(currentQuote.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric', month: 'long', day: 'numeric'
                })
                : new Date().toLocaleDateString('en-US', {
                    year: 'numeric', month: 'long', day: 'numeric'
                });
        } else {
            data.quoteNumber = 'Draft';
            data.quoteDate = new Date().toLocaleDateString('en-US', {
                year: 'numeric', month: 'long', day: 'numeric'
            });
        }

        // Dealer info
        if (typeof dealerSettings !== 'undefined' && dealerSettings) {
            data.dealerCode = dealerSettings.dealerCode || '';
            data.dealerBusiness = dealerSettings.dealerName || dealerSettings.businessName || '';
            data.dealerContact = dealerSettings.dealerContact || dealerSettings.contactName || '';
        }

        // Customer info: prefer currentQuote.customer, fall back to DOM
        if (typeof currentQuote !== 'undefined' && currentQuote && currentQuote.customer) {
            data.customerName = currentQuote.customer.name || '';
            data.customerEmail = currentQuote.customer.email || '';
            data.customerZip = currentQuote.customer.zipCode || '';
        } else {
            var nameEl = document.getElementById('cust-name');
            var emailEl = document.getElementById('cust-email');
            var zipEl = document.getElementById('cust-zip');
            data.customerName = nameEl ? nameEl.value : '';
            data.customerEmail = emailEl ? emailEl.value : '';
            data.customerZip = zipEl ? zipEl.value : '';
        }

        // Line items
        if (typeof currentQuote !== 'undefined' && currentQuote && currentQuote.lineItems) {
            var total = 0;
            data.lineItems = currentQuote.lineItems.map(function (item) {
                var itemTotal = item.total || 0;
                total += itemTotal;
                return {
                    productName: item.productName || 'Custom Item',
                    type: item.type || '',
                    color: item.color || '',
                    color2: item.color2 || '',
                    length: item.length,
                    customLength: item.customLength,
                    quantity: item.quantity || 1,
                    total: itemTotal
                };
            });
            data.subtotal = total;
            data.estimatedTotal = total;
        }

        return data;
    }

    // =========================================================================
    // TEMPLATE FILLING
    // =========================================================================

    function escapeHtml(text) {
        if (!text) return '';
        var str = String(text);
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    function buildOrderRows(lineItems) {
        if (!lineItems || lineItems.length === 0) {
            return '<tr><td colspan="5" style="text-align:center;padding:20px;color:#6B7A90;">No items added</td></tr>';
        }

        return lineItems.map(function (item) {
            var lengthDisplay = item.customLength
                ? item.customLength + "' (custom)"
                : item.length
                ? item.length + "'"
                : 'N/A';

            var colorDisplay = item.color2
                ? item.color + ' / ' + item.color2
                : item.color || 'N/A';

            return '<tr>'
                + '<td><span class="product-name">' + escapeHtml(item.productName) + '</span>'
                + (item.type ? '<br><small style="color:#6B7A90">' + escapeHtml(item.type) + '</small>' : '')
                + '</td>'
                + '<td><span class="color-swatch"><span class="swatch-dot"></span>' + escapeHtml(colorDisplay) + '</span></td>'
                + '<td>' + lengthDisplay + '</td>'
                + '<td>' + item.quantity + '</td>'
                + '<td>$' + item.total.toFixed(2) + '</td>'
                + '</tr>';
        }).join('\n');
    }

    function fillTemplate(html, data) {
        var subtotalStr = '$' + data.subtotal.toFixed(2);
        var totalStr = '$' + data.estimatedTotal.toFixed(2);

        return html
            .replace(/{{QUOTE_NUMBER}}/g, escapeHtml(data.quoteNumber))
            .replace(/{{QUOTE_DATE}}/g, escapeHtml(data.quoteDate))
            .replace(/{{DEALER_CODE}}/g, escapeHtml(data.dealerCode))
            .replace(/{{DEALER_BUSINESS}}/g, escapeHtml(data.dealerBusiness))
            .replace(/{{DEALER_CONTACT}}/g, escapeHtml(data.dealerContact))
            .replace(/{{CUSTOMER_NAME}}/g, escapeHtml(data.customerName))
            .replace(/{{CUSTOMER_EMAIL}}/g, escapeHtml(data.customerEmail || 'N/A'))
            .replace(/{{CUSTOMER_ZIP}}/g, escapeHtml(data.customerZip))
            .replace(/{{ORDER_ROWS}}/g, buildOrderRows(data.lineItems))
            .replace(/{{SUBTOTAL}}/g, subtotalStr)
            .replace(/{{ESTIMATED_TOTAL}}/g, totalStr);
    }

    // =========================================================================
    // PRINT QUOTE (client-side, uses template in new window)
    // =========================================================================

    async function printQuote() {
        try {
            var html = await fetchTemplate();
            var data = gatherQuoteData();
            var filledHtml = fillTemplate(html, data);

            var printWindow = window.open('', '_blank', 'width=900,height=700');
            if (!printWindow) {
                alert('Pop-up blocked. Please allow pop-ups for this site to print quotes.');
                return;
            }

            printWindow.document.open();
            printWindow.document.write(filledHtml);
            printWindow.document.close();

            // Wait for content to render, then trigger print
            printWindow.onload = function () {
                setTimeout(function () {
                    printWindow.focus();
                    printWindow.print();
                }, 300);
            };

            // Fallback if onload doesn't fire (some browsers)
            setTimeout(function () {
                try {
                    printWindow.focus();
                    printWindow.print();
                } catch (e) { /* window may have been closed */ }
            }, 1500);

        } catch (err) {
            console.error('[Print] Failed to generate print view:', err);
            alert('Failed to load print template. Please try again.');
        }
    }

    // =========================================================================
    // DOWNLOAD PDF (server-side via Puppeteer endpoint)
    // =========================================================================

    async function downloadPDF() {
        // If we have a saved quote with an ID, use the server endpoint
        if (typeof currentQuote !== 'undefined' && currentQuote && currentQuote.id) {
            try {
                var token = localStorage.getItem('authToken') || '';
                var response = await fetch('/api/quotes/' + currentQuote.id + '/pdf', {
                    headers: { 'Authorization': 'Bearer ' + token }
                });

                if (response.ok) {
                    var blob = await response.blob();
                    var url = URL.createObjectURL(blob);
                    var a = document.createElement('a');
                    a.href = url;
                    a.download = (currentQuote.quoteNumber || 'quote') + '.pdf';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    console.log('[PDF] Downloaded via server: ' + currentQuote.quoteNumber);
                    return;
                }

                console.warn('[PDF] Server endpoint returned ' + response.status + ', falling back to print.');
            } catch (err) {
                console.warn('[PDF] Server endpoint failed, falling back to print:', err.message);
            }
        }

        // Fallback: open the template and let the user "Save as PDF" from print dialog
        console.log('[PDF] Using client-side print fallback.');
        await printQuote();
    }

    // =========================================================================
    // OVERRIDE GLOBALS
    // =========================================================================

    window.generatePDF = downloadPDF;
    window.printQuote = printQuote;
    window.downloadQuotePDF = downloadPDF;

    console.log('[ameridex-print-branding] Template-based print/PDF generator loaded.');

})();
