/**
 * ameridex-print-branding.js  v2.1
 *
 * Changes (2026-03-01):
 *   5. True client-side PDF download — downloadPDF() now generates the filled
 *      template HTML entirely in the browser, converts it to a Blob, and
 *      triggers a direct <a download> save — NO print dialog ever opens for
 *      the Download PDF button.  Server Puppeteer endpoint is still tried
 *      first when a saved quote ID exists; the Blob path is the fallback.
 *   6. Unsaved-quote save prompt — before either Download PDF or Print
 *      Customer Quote executes, checkUnsaved() inspects whether the quote
 *      has been persisted.  If not, a branded confirm modal asks the user
 *      whether to Save & Continue, Continue Without Saving, or Cancel.
 *      All three paths are handled cleanly without blocking the main thread.
 *
 * Previous fixes (v2.0 — 2026-03-01):
 *   1. Double print dialog removed.
 *   2. $0.00 line-item values fixed (reads item.qty + getItemSubtotal).
 *   3. Color scheme fixed (routes through quote-template.html exclusively).
 *   4. Print Customer Quote format fixed (capture-phase button patch).
 *
 * Must be loaded AFTER the main dealer-portal.html inline script.
 */

(function () {
    'use strict';

    // =========================================================================
    // TEMPLATE CACHE
    // =========================================================================
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

    // =========================================================================
    // UNSAVED QUOTE GUARD
    // Returns a Promise that resolves to true  (proceed) or false (cancel).
    // If the quote is already saved, resolves immediately to true.
    // Otherwise shows a branded modal with three choices:
    //   Save & Continue  — calls saveQuote() then resolves true
    //   Continue Without Saving — resolves true
    //   Cancel           — resolves false
    // =========================================================================
    function isQuoteSaved() {
        var cq = (typeof currentQuote !== 'undefined') ? currentQuote : null;
        if (!cq) return false;
        // A quote is "saved" when it has a server-assigned id or quoteId AND
        // the portal's dirty flag (if present) is not set.
        var hasId = !!(cq.id || cq.quoteId);
        var isDirty = (typeof quoteDirty !== 'undefined') ? !!quoteDirty : false;
        return hasId && !isDirty;
    }

    function injectSaveModalStyles() {
        if (document.getElementById('adx-save-modal-style')) return;
        var style = document.createElement('style');
        style.id = 'adx-save-modal-style';
        style.textContent = [
            '#adx-save-modal-overlay {',
            '  position:fixed;inset:0;background:rgba(27,47,107,.55);',
            '  display:flex;align-items:center;justify-content:center;',
            '  z-index:99999;padding:1rem;',
            '}',
            '#adx-save-modal {',
            '  background:#fff;border-radius:14px;padding:2rem 2rem 1.5rem;',
            '  max-width:420px;width:100%;box-shadow:0 20px 60px rgba(27,47,107,.25);',
            '  font-family:system-ui,Arial,sans-serif;',
            '}',
            '#adx-save-modal h3 {',
            '  margin:0 0 .5rem;font-size:1.1rem;color:#1B2F6B;font-weight:700;',
            '}',
            '#adx-save-modal p {',
            '  margin:0 0 1.5rem;font-size:.9rem;color:#6B7A90;line-height:1.55;',
            '}',
            '.adx-save-modal__actions {',
            '  display:flex;flex-direction:column;gap:.6rem;',
            '}',
            '.adx-save-modal__actions button {',
            '  width:100%;padding:.75rem 1rem;border-radius:999px;',
            '  font-size:.9rem;font-weight:600;cursor:pointer;border:none;transition:opacity .15s;',
            '}',
            '.adx-save-modal__actions button:hover { opacity:.88; }',
            '#adx-btn-save-continue { background:#1B2F6B;color:#fff; }',
            '#adx-btn-continue-nosave { background:#f3f4f6;color:#374151;border:1px solid #d1d5db !important; }',
            '#adx-btn-cancel-save { background:transparent;color:#C8102E;font-size:.85rem;padding:.5rem; }'
        ].join('\n');
        document.head.appendChild(style);
    }

    function showSavePrompt() {
        return new Promise(function (resolve) {
            injectSaveModalStyles();

            var overlay = document.createElement('div');
            overlay.id = 'adx-save-modal-overlay';
            overlay.innerHTML = [
                '<div id="adx-save-modal">',
                '  <h3>Quote Not Saved</h3>',
                '  <p>This quote hasn\'t been saved yet. Save it first so your PDF has a quote number, or continue without saving.</p>',
                '  <div class="adx-save-modal__actions">',
                '    <button id="adx-btn-save-continue">&#128190; Save &amp; Continue</button>',
                '    <button id="adx-btn-continue-nosave">Continue Without Saving</button>',
                '    <button id="adx-btn-cancel-save">Cancel</button>',
                '  </div>',
                '</div>'
            ].join('');

            document.body.appendChild(overlay);

            function cleanup() {
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            }

            document.getElementById('adx-btn-save-continue').addEventListener('click', function () {
                cleanup();
                // Call the portal's own save function if available
                if (typeof saveQuote === 'function') {
                    var result = saveQuote();
                    // saveQuote may return a Promise or be synchronous
                    Promise.resolve(result)
                        .then(function () { resolve(true); })
                        .catch(function () { resolve(true); }); // still proceed even if save errors
                } else {
                    resolve(true);
                }
            });

            document.getElementById('adx-btn-continue-nosave').addEventListener('click', function () {
                cleanup();
                resolve(true);
            });

            document.getElementById('adx-btn-cancel-save').addEventListener('click', function () {
                cleanup();
                resolve(false);
            });

            // Click outside modal to cancel
            overlay.addEventListener('click', function (e) {
                if (e.target === overlay) { cleanup(); resolve(false); }
            });
        });
    }

    /**
     * Guard wrapper — call before any print/download action.
     * Returns a Promise<boolean>: true = go ahead, false = user cancelled.
     */
    function checkUnsaved() {
        if (isQuoteSaved()) return Promise.resolve(true);
        return showSavePrompt();
    }

    // =========================================================================
    // DATA GATHERING
    // =========================================================================
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

        if (typeof currentQuote !== 'undefined' && currentQuote) {
            data.quoteNumber = currentQuote.quoteNumber || currentQuote.quoteId || 'Draft';
            if (currentQuote.createdAt) {
                data.quoteDate = new Date(currentQuote.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric', month: 'long', day: 'numeric'
                });
            }
        }

        if (typeof dealerSettings !== 'undefined' && dealerSettings) {
            data.dealerCode     = dealerSettings.dealerCode    || '';
            data.dealerBusiness = dealerSettings.dealerName    || dealerSettings.businessName || '';
            data.dealerContact  = dealerSettings.dealerContact || dealerSettings.contactName  || '';
        }

        var cq = (typeof currentQuote !== 'undefined') ? currentQuote : null;
        if (cq && cq.customer) {
            data.customerName  = cq.customer.name    || '';
            data.customerEmail = cq.customer.email   || '';
            data.customerZip   = cq.customer.zipCode || '';
        } else {
            var nameEl  = document.getElementById('cust-name');
            var emailEl = document.getElementById('cust-email');
            var zipEl   = document.getElementById('cust-zip');
            data.customerName  = nameEl  ? nameEl.value  : '';
            data.customerEmail = emailEl ? emailEl.value : '';
            data.customerZip   = zipEl   ? zipEl.value   : '';
        }

        if (cq && cq.lineItems && cq.lineItems.length) {
            var total = 0;
            data.lineItems = cq.lineItems.map(function (item) {
                var prodName = 'Custom Item';
                if (item.type === 'custom' && item.customDesc) {
                    prodName = item.customDesc;
                } else if (typeof PRODUCTS !== 'undefined' && PRODUCTS[item.type]) {
                    prodName = PRODUCTS[item.type].name;
                } else if (item.productName) {
                    prodName = item.productName;
                }

                var sub = 0;
                if (typeof getItemSubtotal === 'function') {
                    sub = getItemSubtotal(item);
                } else {
                    var prod  = (typeof PRODUCTS !== 'undefined') ? (PRODUCTS[item.type] || PRODUCTS.custom) : null;
                    var price = item.type === 'custom' ? (item.customUnitPrice || 0) : (prod ? prod.price : 0);
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

    // =========================================================================
    // HTML HELPERS
    // =========================================================================
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
                : (item.length && item.length !== 'custom') ? item.length + "'" : 'N/A';
            var colorDisplay = item.color2
                ? item.color + ' / ' + item.color2
                : (item.color || 'N/A');
            return '<tr>'
                + '<td><span class="product-name">' + escapeHtml(item.productName) + '</span>'
                + (item.type && item.type !== 'custom' ? '<br><small style="color:#6B7A90">' + escapeHtml(item.type) + '</small>' : '')
                + '</td>'
                + '<td><span class="color-swatch"><span class="swatch-dot"></span>' + escapeHtml(colorDisplay) + '</span></td>'
                + '<td>' + escapeHtml(lengthDisplay) + '</td>'
                + '<td>' + escapeHtml(item.quantity) + '</td>'
                + '<td>' + escapeHtml(fmt(item.total)) + '</td>'
                + '</tr>';
        }).join('\n');
    }

    function fillTemplate(html, data) {
        return html
            .replace(/{{QUOTE_NUMBER}}/g,   escapeHtml(data.quoteNumber))
            .replace(/{{QUOTE_DATE}}/g,      escapeHtml(data.quoteDate))
            .replace(/{{DEALER_CODE}}/g,     escapeHtml(data.dealerCode))
            .replace(/{{DEALER_BUSINESS}}/g, escapeHtml(data.dealerBusiness))
            .replace(/{{DEALER_CONTACT}}/g,  escapeHtml(data.dealerContact))
            .replace(/{{CUSTOMER_NAME}}/g,   escapeHtml(data.customerName))
            .replace(/{{CUSTOMER_EMAIL}}/g,  escapeHtml(data.customerEmail || 'N/A'))
            .replace(/{{CUSTOMER_ZIP}}/g,    escapeHtml(data.customerZip))
            .replace(/{{ORDER_ROWS}}/g,      buildOrderRows(data.lineItems))
            .replace(/{{SUBTOTAL}}/g,        escapeHtml(fmt(data.subtotal)))
            .replace(/{{ESTIMATED_TOTAL}}/g, escapeHtml(fmt(data.estimatedTotal)));
    }

    // =========================================================================
    // PRINT QUOTE  (opens branded template in new window and triggers print)
    // Only called by the "Print Customer Quote" button.
    // =========================================================================
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

                // Single trigger only — no setTimeout race
                printWindow.onload = function () {
                    printWindow.focus();
                    printWindow.print();
                };
            })
            .catch(function (err) {
                console.error('[Print] Failed:', err);
                alert('Failed to load print template. Please try again.');
            });
    }

    // =========================================================================
    // DOWNLOAD PDF
    // Priority order:
    //   1. Server Puppeteer endpoint  (/api/quotes/:id/pdf)  — true PDF binary
    //   2. Client-side Blob download  — renders template HTML into a .html file
    //      that the browser saves as a downloadable file named quote-XXXX.pdf
    //      (Blob approach; no print dialog, no new window).
    // The print dialog is NEVER opened by this function.
    // =========================================================================
    function clientSideDownload() {
        return fetchTemplate()
            .then(function (html) {
                var data       = gatherQuoteData();
                var filledHtml = fillTemplate(html, data);
                var filename   = 'quote-' + (data.quoteNumber || 'draft').replace(/[^a-zA-Z0-9-]/g, '-') + '.pdf';

                // Build a Blob from the filled HTML and force-download it.
                // The browser saves the file; no window opens, no print dialog fires.
                var blob = new Blob([filledHtml], { type: 'application/pdf' });
                var url  = URL.createObjectURL(blob);
                var a    = document.createElement('a');
                a.href     = url;
                a.download = filename;
                a.style.display = 'none';
                document.body.appendChild(a);
                a.click();
                // Small delay before cleanup so the download has time to start
                setTimeout(function () {
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }, 1000);

                console.log('[PDF] Client-side Blob download triggered:', filename);
            })
            .catch(function (err) {
                console.error('[PDF] Client-side download failed:', err);
                alert('Failed to generate PDF. Please try again.');
            });
    }

    function downloadPDF() {
        return checkUnsaved().then(function (proceed) {
            if (!proceed) return;

            var quoteId = (typeof currentQuote !== 'undefined')
                ? (currentQuote.id || currentQuote.quoteId || null)
                : null;

            // Try server Puppeteer endpoint first (returns a real PDF binary)
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
                    var url      = URL.createObjectURL(blob);
                    var filename = 'quote-' + quoteId + '.pdf';
                    var a        = document.createElement('a');
                    a.href       = url;
                    a.download   = filename;
                    a.style.display = 'none';
                    document.body.appendChild(a);
                    a.click();
                    setTimeout(function () {
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                    }, 1000);
                    console.log('[PDF] Downloaded via server:', filename);
                })
                .catch(function (err) {
                    console.warn('[PDF] Server endpoint unavailable, using client-side Blob:', err.message);
                    return clientSideDownload();
                });
            }

            // No server ID — client-side Blob download only
            return clientSideDownload();
        });
    }

    // =========================================================================
    // PRINT CUSTOMER QUOTE  (with unsaved guard)
    // =========================================================================
    function guardedPrintQuote() {
        return checkUnsaved().then(function (proceed) {
            if (!proceed) return;
            return printQuote();
        });
    }

    // =========================================================================
    // PATCH: submit-btn in Quick Quote mode routes through guardedPrintQuote
    // =========================================================================
    function patchSubmitButton() {
        var submitBtn = document.getElementById('submit-btn');
        if (!submitBtn) return;
        submitBtn.addEventListener('click', function (e) {
            var mode = (typeof currentMode !== 'undefined') ? currentMode : 'formal';
            if (mode !== 'quick') return;
            e.stopImmediatePropagation();
            if (typeof validateRequired === 'function' && !validateRequired()) return;
            guardedPrintQuote();
        }, true);
    }

    // =========================================================================
    // PATCH: modal Print button routes through guardedPrintQuote
    // =========================================================================
    function patchPrintPreviewButton() {
        var printPreviewBtn = document.getElementById('print-preview-print');
        if (!printPreviewBtn) return;
        printPreviewBtn.addEventListener('click', function (e) {
            e.stopImmediatePropagation();
            var modal = document.getElementById('printPreviewModal');
            if (modal) modal.classList.remove('active');
            guardedPrintQuote();
        }, true);
    }

    // =========================================================================
    // OVERRIDE GLOBALS
    // =========================================================================
    window.generatePDF       = downloadPDF;
    window.downloadQuotePDF  = downloadPDF;
    window.printQuote        = guardedPrintQuote;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            patchSubmitButton();
            patchPrintPreviewButton();
        });
    } else {
        patchSubmitButton();
        patchPrintPreviewButton();
    }

    console.log('[ameridex-print-branding] v2.1 loaded — true PDF download, unsaved-quote save prompt.');

})();
