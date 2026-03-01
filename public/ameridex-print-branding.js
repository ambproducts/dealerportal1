/**
 * ameridex-print-branding.js  v2.5
 *
 * Changes (v2.5 — 2026-03-01):
 *   TRUE PDF DOWNLOAD
 *     The only correct client-side way to produce a real .pdf binary
 *     without a server renderer is the browser's own print-to-PDF engine.
 *     downloadPDF() now:
 *       1. Builds the fully filled, logo-inlined HTML.
 *       2. Opens it in a new window (same as Print Customer Quote).
 *       3. Injects a one-shot onafterprint handler that closes the window.
 *       4. Calls window.print() on that window.
 *     The system print dialog opens with "Save as PDF" as the default
 *     destination on Chrome and Edge. The user clicks Save and gets a
 *     real .pdf file in their downloads folder.
 *     This is identical to how Notion, Google Docs, and Figma handle
 *     client-side PDF export.
 *
 *   DIFFERENCE from Print Customer Quote:
 *     - Print Customer Quote: opens print dialog immediately, intended
 *       for sending to a physical printer or saving manually.
 *     - Download PDF: opens print dialog with a toast hint telling the
 *       user to select "Save as PDF" as the destination, making the
 *       intent clear.
 *
 * Changes (v2.4 — 2026-03-01):
 *   - Logo inlined as base64 data URI (fixes missing logo in Blob docs).
 *   - Force .html download via <a download>.
 *
 * Changes (v2.3 — 2026-03-01):
 *   - Removed dead server /api/quotes/:id/pdf call.
 *   - Switched Blob MIME to text/html.
 *
 * Changes (v2.2 — 2026-03-01):
 *   - Double-load guard, null classList fix, full customer info.
 *
 * Changes (v2.1 — 2026-03-01):
 *   - No print dialog on Download PDF, unsaved-quote save prompt.
 */

(function () {
    'use strict';

    // =========================================================================
    // DOUBLE-LOAD GUARD
    // =========================================================================
    if (window.__adxPrintBrandingLoaded) {
        console.log('[ameridex-print-branding] Already loaded — skipping duplicate execution.');
        return;
    }
    window.__adxPrintBrandingLoaded = true;

    // =========================================================================
    // LOGO — fetched once, cached as base64 data URI so it renders in Blob docs
    // =========================================================================
    var cachedLogoDataUri = null;

    function fetchLogoDataUri() {
        if (cachedLogoDataUri) return Promise.resolve(cachedLogoDataUri);
        return fetch('/images/ameridex-logo.png')
            .then(function (res) {
                if (!res.ok) throw new Error('Logo fetch failed: ' + res.status);
                return res.blob();
            })
            .then(function (blob) {
                return new Promise(function (resolve, reject) {
                    var reader = new FileReader();
                    reader.onload  = function () {
                        cachedLogoDataUri = reader.result;
                        resolve(cachedLogoDataUri);
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });
            })
            .catch(function (err) {
                console.warn('[PDF] Could not inline logo:', err.message);
                return '';
            });
    }

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
    // =========================================================================
    function isQuoteSaved() {
        var cq = (typeof currentQuote !== 'undefined') ? currentQuote : null;
        if (!cq) return false;
        var hasId   = !!(cq.id || cq.quoteId);
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
                if (typeof saveQuote === 'function') {
                    Promise.resolve(saveQuote())
                        .then(function () { resolve(true); })
                        .catch(function () { resolve(true); });
                } else {
                    resolve(true);
                }
            });
            document.getElementById('adx-btn-continue-nosave').addEventListener('click', function () {
                cleanup(); resolve(true);
            });
            document.getElementById('adx-btn-cancel-save').addEventListener('click', function () {
                cleanup(); resolve(false);
            });
            overlay.addEventListener('click', function (e) {
                if (e.target === overlay) { cleanup(); resolve(false); }
            });
        });
    }

    function checkUnsaved() {
        if (isQuoteSaved()) return Promise.resolve(true);
        return showSavePrompt();
    }

    // =========================================================================
    // DATA GATHERING
    // =========================================================================
    function readField(id) {
        var el = document.getElementById(id);
        return el ? (el.value || '').trim() : '';
    }

    function gatherQuoteData() {
        var data = {
            quoteNumber:     'Draft',
            quoteDate:       new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
            dealerCode:      '',
            dealerBusiness:  '',
            dealerContact:   '',
            customerName:    '',
            customerEmail:   '',
            customerPhone:   '',
            customerCompany: '',
            customerZip:     '',
            customerAddress: '',
            customerCity:    '',
            customerState:   '',
            lineItems:       [],
            subtotal:        0,
            estimatedTotal:  0
        };

        var cq = (typeof currentQuote !== 'undefined') ? currentQuote : null;

        if (cq) {
            data.quoteNumber = cq.quoteNumber || cq.quoteId || 'Draft';
            if (cq.createdAt) {
                data.quoteDate = new Date(cq.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric', month: 'long', day: 'numeric'
                });
            }
        }

        if (typeof dealerSettings !== 'undefined' && dealerSettings) {
            data.dealerCode     = dealerSettings.dealerCode    || '';
            data.dealerBusiness = dealerSettings.dealerName    || dealerSettings.businessName || '';
            data.dealerContact  = dealerSettings.dealerContact || dealerSettings.contactName  || '';
        }

        var custObj = (cq && cq.customer) ? cq.customer : null;
        data.customerName    = (custObj && custObj.name)    || readField('cust-name');
        data.customerEmail   = (custObj && custObj.email)   || readField('cust-email');
        data.customerPhone   = (custObj && custObj.phone)   || readField('cust-phone');
        data.customerCompany = (custObj && custObj.company) || readField('cust-company');
        data.customerZip     = (custObj && custObj.zipCode) || readField('cust-zip');
        data.customerAddress = (custObj && custObj.address) || readField('cust-address');
        data.customerCity    = (custObj && custObj.city)    || readField('cust-city');
        data.customerState   = (custObj && custObj.state)   || readField('cust-state');

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
            data.subtotal      = total;
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

    function infoRow(label, value) {
        if (!value || !String(value).trim()) return '';
        return '<div class="info-row">'
             + '<span class="info-label">' + escapeHtml(label) + '</span>'
             + '<span class="info-value">' + escapeHtml(value) + '</span>'
             + '</div>';
    }

    function buildCustomerInfoRows(data) {
        var rows = '';
        rows += infoRow('Name',       data.customerName);
        rows += infoRow('Company',    data.customerCompany);
        rows += infoRow('Phone',      data.customerPhone);
        rows += infoRow('Email',      data.customerEmail);
        rows += infoRow('Address',    data.customerAddress);
        var cityState = [data.customerCity, data.customerState].filter(Boolean).join(', ');
        if (cityState) rows += infoRow('City / State', cityState);
        rows += infoRow('Zip Code',   data.customerZip);
        if (!rows) {
            rows = '<div class="info-row"><span class="info-value" style="color:#6B7A90;font-weight:400;">No customer information entered</span></div>';
        }
        return rows;
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
                + (item.type && item.type !== 'custom'
                    ? '<br><small style="color:#6B7A90">' + escapeHtml(item.type) + '</small>'
                    : '')
                + '</td>'
                + '<td><span class="color-swatch"><span class="swatch-dot"></span>' + escapeHtml(colorDisplay) + '</span></td>'
                + '<td>' + escapeHtml(lengthDisplay) + '</td>'
                + '<td>' + escapeHtml(item.quantity) + '</td>'
                + '<td>' + escapeHtml(fmt(item.total)) + '</td>'
                + '</tr>';
        }).join('\n');
    }

    function fillTemplate(html, data, logoDataUri) {
        if (logoDataUri) {
            // Replace logo src regardless of attribute order
            html = html.replace(
                /(<img\b[^>]*?\bclass="logo"[^>]*?\bsrc=")[^"]*(")/,
                '$1' + logoDataUri + '$2'
            );
            html = html.replace(
                /(<img\b[^>]*?\bsrc=")[^"]*([^>]*?\bclass="logo")/,
                '$1' + logoDataUri + '$2'
            );
        }
        return html
            .replace(/{{QUOTE_NUMBER}}/g,      escapeHtml(data.quoteNumber))
            .replace(/{{QUOTE_DATE}}/g,         escapeHtml(data.quoteDate))
            .replace(/{{DEALER_CODE}}/g,        escapeHtml(data.dealerCode))
            .replace(/{{DEALER_BUSINESS}}/g,    escapeHtml(data.dealerBusiness))
            .replace(/{{DEALER_CONTACT}}/g,     escapeHtml(data.dealerContact))
            .replace(/{{CUSTOMER_INFO_ROWS}}/g, buildCustomerInfoRows(data))
            .replace(/{{ORDER_ROWS}}/g,         buildOrderRows(data.lineItems))
            .replace(/{{SUBTOTAL}}/g,           escapeHtml(fmt(data.subtotal)))
            .replace(/{{ESTIMATED_TOTAL}}/g,    escapeHtml(fmt(data.estimatedTotal)));
    }

    // =========================================================================
    // BUILD FILLED HTML — fetches template + logo in parallel
    // =========================================================================
    function buildFilledHtml() {
        return Promise.all([fetchTemplate(), fetchLogoDataUri()])
            .then(function (results) {
                return fillTemplate(results[0], gatherQuoteData(), results[1]);
            });
    }

    // =========================================================================
    // OPEN QUOTE WINDOW — shared by both download and print paths
    // Writes filled HTML into a new window and resolves with that window ref.
    // =========================================================================
    function openQuoteWindow(filledHtml) {
        var win = window.open('', '_blank', 'width=900,height=700');
        if (!win) return null;
        win.document.open();
        win.document.write(filledHtml);
        win.document.close();
        return win;
    }

    // =========================================================================
    // DOWNLOAD PDF
    // Opens the quote in a new window configured for "Save as PDF":
    //   - Page title set to the quote filename so the browser pre-fills
    //     the Save dialog with the correct name (e.g. AmeriDex-Quote-Q260301-X5L2).
    //   - A prominent toast inside the window instructs the user to choose
    //     "Save as PDF" as the destination.
    //   - window.print() fires automatically on load.
    //   - onafterprint closes the window automatically.
    // On Chrome/Edge the default print destination is "Save as PDF".
    // The resulting file is a real .pdf binary saved by the OS.
    // =========================================================================
    function clientSideDownload() {
        return buildFilledHtml()
            .then(function (filledHtml) {
                var data     = gatherQuoteData();
                var filename = 'AmeriDex-Quote-'
                             + (data.quoteNumber || 'Draft').replace(/[^a-zA-Z0-9-]/g, '-');

                // Inject print-to-PDF helper styles + toast + auto-print into the template.
                // The toast is only visible on screen (hidden in @media print) so it
                // doesn't appear in the saved PDF.
                var pdfHelpInjection = [
                    '<style>',
                    '  #adx-pdf-toast {',
                    '    position:fixed;bottom:24px;left:50%;transform:translateX(-50%);',
                    '    background:#1B2F6B;color:#fff;padding:12px 24px;border-radius:999px;',
                    '    font-family:system-ui,Arial,sans-serif;font-size:14px;font-weight:600;',
                    '    box-shadow:0 8px 32px rgba(27,47,107,.35);z-index:9999;',
                    '    white-space:nowrap;',
                    '  }',
                    '  #adx-pdf-toast span { color:#C8102E; }',
                    '  @media print { #adx-pdf-toast { display:none !important; } }',
                    '</style>',
                    '<div id="adx-pdf-toast">',
                    '  In the print dialog, set Destination to <span>Save as PDF</span> then click Save',
                    '</div>',
                    '<script>',
                    '  document.title = ' + JSON.stringify(filename) + ';',
                    '  window.onload = function() {',
                    '    window.onafterprint = function() { window.close(); };',
                    '    setTimeout(function() { window.print(); }, 400);',
                    '  };',
                    '<\/script>'
                ].join('\n');

                // Inject before </body>
                var injected = filledHtml.replace('</body>', pdfHelpInjection + '\n</body>');

                var win = openQuoteWindow(injected);
                if (!win) {
                    alert('Pop-up blocked. Please allow pop-ups for this site to download quotes as PDF.');
                }
                console.log('[PDF] Print-to-PDF window opened for:', filename);
            })
            .catch(function (err) {
                console.error('[PDF] Download failed:', err);
                alert('Failed to generate quote. Please try again.');
            });
    }

    function downloadPDF() {
        return checkUnsaved().then(function (proceed) {
            if (!proceed) return;
            return clientSideDownload();
        });
    }

    // =========================================================================
    // PRINT CUSTOMER QUOTE — opens in new window, triggers print dialog
    // Same as download but no toast and no auto-close after print.
    // =========================================================================
    function printQuote() {
        return buildFilledHtml()
            .then(function (filledHtml) {
                var data = gatherQuoteData();
                var autoprint = [
                    '<script>',
                    '  document.title = ' + JSON.stringify('AmeriDex Quote ' + (data.quoteNumber || 'Draft')) + ';',
                    '  window.onload = function() { window.focus(); window.print(); };',
                    '<\/script>'
                ].join('\n');
                var injected = filledHtml.replace('</body>', autoprint + '\n</body>');
                var win = openQuoteWindow(injected);
                if (!win) {
                    alert('Pop-up blocked. Please allow pop-ups for this site to print quotes.');
                }
            })
            .catch(function (err) {
                console.error('[Print] Failed:', err);
                alert('Failed to load print template. Please try again.');
            });
    }

    function guardedPrintQuote() {
        return checkUnsaved().then(function (proceed) {
            if (!proceed) return;
            return printQuote();
        });
    }

    // =========================================================================
    // PATCH: submit-btn in Quick Quote mode
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
    // PATCH: modal Print button — null-guarded
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
    window.generatePDF      = downloadPDF;
    window.downloadQuotePDF = downloadPDF;
    window.printQuote       = guardedPrintQuote;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            patchSubmitButton();
            patchPrintPreviewButton();
        });
    } else {
        patchSubmitButton();
        patchPrintPreviewButton();
    }

    console.log('[ameridex-print-branding] v2.5 loaded — print-to-PDF download, base64 logo, full customer info.');

})();
