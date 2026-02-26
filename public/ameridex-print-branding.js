/**
 * ameridex-print-branding.js
 * 
 * Branded PDF generation for AmeriDex Dealer Portal.
 * Overrides the default generatePDF() with a professional layout featuring:
 *   - AmeriDex logo header on every page
 *   - Dealer business information
 *   - Clean table layout with alternating row shading
 *   - Customer-facing disclaimer
 *   - Multi-page support with consistent header/footer
 * 
 * Must be loaded AFTER the main dealer-portal.html inline script.
 */

(function () {
    'use strict';

    // =========================================================================
    // CONFIGURATION
    // =========================================================================

    const PDF_CONFIG = {
        margin: { top: 45, left: 20, right: 20, bottom: 25 },
        colors: {
            primary: [37, 99, 235],       // #2563eb
            primaryDark: [30, 64, 175],    // #1e40af
            headerBg: [37, 99, 235],
            headerText: [255, 255, 255],
            tableHeaderBg: [243, 244, 246],// #f3f4f6
            tableHeaderText: [55, 65, 81], // #374151
            tableAltRow: [249, 250, 251],  // #f9fafb
            textMain: [17, 24, 39],        // #111827
            textMuted: [107, 114, 128],    // #6b7280
            border: [229, 231, 235],       // #e5e7eb
            success: [22, 163, 74],        // #16a34a
            white: [255, 255, 255]
        },
        fonts: {
            titleSize: 18,
            sectionSize: 13,
            bodySize: 10,
            smallSize: 8.5,
            tinySize: 7.5
        },
        logo: {
            // Base64-encoded PNG of the AmeriDex logo will be set at runtime
            // if the image can be loaded from the DOM or fetched.
            dataUrl: null,
            width: 45,
            height: 12
        }
    };

    // =========================================================================
    // LOGO LOADER
    // =========================================================================

    /**
     * Attempt to load the AmeriDex logo as a base64 data URL.
     * Tries the header <img> first, then falls back to a canvas draw from /images/ameridex-logo.png.
     */
    function loadLogoAsDataUrl() {
        return new Promise((resolve) => {
            // Try to grab the logo from the existing header image
            const headerImg = document.querySelector('header.app-header img');
            if (headerImg && headerImg.complete && headerImg.naturalWidth > 0) {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = headerImg.naturalWidth;
                    canvas.height = headerImg.naturalHeight;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(headerImg, 0, 0);
                    const dataUrl = canvas.toDataURL('image/png');
                    if (dataUrl && dataUrl.length > 100) {
                        resolve(dataUrl);
                        return;
                    }
                } catch (e) {
                    // Cross-origin or tainted canvas; fall through
                }
            }

            // Fallback: load from path
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = function () {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.naturalWidth;
                    canvas.height = img.naturalHeight;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    resolve(canvas.toDataURL('image/png'));
                } catch (e) {
                    resolve(null);
                }
            };
            img.onerror = function () { resolve(null); };
            img.src = '/images/ameridex-logo.png';
        });
    }

    // =========================================================================
    // PDF HELPER UTILITIES
    // =========================================================================

    function setColor(doc, rgb) {
        doc.setTextColor(rgb[0], rgb[1], rgb[2]);
    }

    function setFillColor(doc, rgb) {
        doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    }

    function setDrawColor(doc, rgb) {
        doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
    }

    function pageWidth(doc) {
        return doc.internal.pageSize.getWidth();
    }

    function pageHeight(doc) {
        return doc.internal.pageSize.getHeight();
    }

    function checkPageBreak(doc, y, needed) {
        if (y + needed > pageHeight(doc) - PDF_CONFIG.margin.bottom) {
            doc.addPage();
            return drawPageHeader(doc);
        }
        return y;
    }

    // =========================================================================
    // PAGE HEADER (rendered on every page)
    // =========================================================================

    function drawPageHeader(doc) {
        const pw = pageWidth(doc);
        const cfg = PDF_CONFIG;

        // Blue header bar
        setFillColor(doc, cfg.colors.headerBg);
        doc.rect(0, 0, pw, 35, 'F');

        // Logo (if available)
        let textStartX = cfg.margin.left;
        if (cfg.logo.dataUrl) {
            try {
                doc.addImage(cfg.logo.dataUrl, 'PNG', cfg.margin.left, 6, cfg.logo.width, cfg.logo.height);
                textStartX = cfg.margin.left + cfg.logo.width + 6;
            } catch (e) {
                // Logo failed to render; continue without it
            }
        }

        // Title text
        doc.setFontSize(cfg.fonts.titleSize);
        doc.setFont('helvetica', 'bold');
        setColor(doc, cfg.colors.headerText);
        doc.text('AmeriDex', textStartX, 15);

        doc.setFontSize(cfg.fonts.smallSize);
        doc.setFont('helvetica', 'normal');
        doc.text('Dealer Portal', textStartX, 22);

        // Right side: dealer info
        const dealerCode = (typeof dealerSettings !== 'undefined' && dealerSettings.dealerCode) ? dealerSettings.dealerCode : '';
        const dealerName = (typeof dealerSettings !== 'undefined' && dealerSettings.dealerName) ? dealerSettings.dealerName : '';
        if (dealerCode || dealerName) {
            doc.setFontSize(cfg.fonts.smallSize);
            setColor(doc, cfg.colors.headerText);
            const rightX = pw - cfg.margin.right;
            if (dealerName) {
                doc.text(dealerName, rightX, 13, { align: 'right' });
                doc.text('Dealer: ' + dealerCode, rightX, 20, { align: 'right' });
            } else {
                doc.text('Dealer: ' + dealerCode, rightX, 16, { align: 'right' });
            }
        }

        // Thin accent line below header
        setDrawColor(doc, cfg.colors.primaryDark);
        doc.setLineWidth(0.5);
        doc.line(0, 35, pw, 35);

        return cfg.margin.top; // return Y position after header
    }

    // =========================================================================
    // SECTION DRAWING HELPERS
    // =========================================================================

    function drawSectionTitle(doc, y, title) {
        y = checkPageBreak(doc, y, 14);
        doc.setFontSize(PDF_CONFIG.fonts.sectionSize);
        doc.setFont('helvetica', 'bold');
        setColor(doc, PDF_CONFIG.colors.primaryDark);
        doc.text(title, PDF_CONFIG.margin.left, y);
        y += 2;
        setDrawColor(doc, PDF_CONFIG.colors.primary);
        doc.setLineWidth(0.3);
        doc.line(PDF_CONFIG.margin.left, y, pageWidth(doc) - PDF_CONFIG.margin.right, y);
        return y + 6;
    }

    function drawKeyValue(doc, y, label, value) {
        y = checkPageBreak(doc, y, 7);
        const cfg = PDF_CONFIG;
        doc.setFontSize(cfg.fonts.bodySize);
        doc.setFont('helvetica', 'bold');
        setColor(doc, cfg.colors.textMuted);
        doc.text(label + ':', cfg.margin.left, y);

        doc.setFont('helvetica', 'normal');
        setColor(doc, cfg.colors.textMain);
        doc.text(String(value || 'N/A'), cfg.margin.left + 45, y);
        return y + 6;
    }

    // =========================================================================
    // LINE ITEMS TABLE
    // =========================================================================

    function drawLineItemsTable(doc, y) {
        const cfg = PDF_CONFIG;
        const left = cfg.margin.left;
        const right = pageWidth(doc) - cfg.margin.right;
        const tableWidth = right - left;

        // Column definitions: [label, x-offset from left, width, align]
        const cols = [
            { label: 'Product',  x: left,                  w: tableWidth * 0.36, align: 'left' },
            { label: 'Color',    x: left + tableWidth * 0.36, w: tableWidth * 0.14, align: 'left' },
            { label: 'Length',   x: left + tableWidth * 0.50, w: tableWidth * 0.14, align: 'left' },
            { label: 'Qty',      x: left + tableWidth * 0.64, w: tableWidth * 0.10, align: 'center' },
            { label: 'Subtotal', x: left + tableWidth * 0.74, w: tableWidth * 0.26, align: 'right' }
        ];

        const rowHeight = 8;
        const headerHeight = 9;

        // Draw header
        y = checkPageBreak(doc, y, headerHeight + rowHeight * 2);
        setFillColor(doc, cfg.colors.tableHeaderBg);
        doc.rect(left, y - 5, tableWidth, headerHeight, 'F');
        doc.setFontSize(cfg.fonts.smallSize);
        doc.setFont('helvetica', 'bold');
        setColor(doc, cfg.colors.tableHeaderText);
        cols.forEach(col => {
            let tx = col.x + 2;
            if (col.align === 'right') tx = col.x + col.w - 2;
            else if (col.align === 'center') tx = col.x + col.w / 2;
            doc.text(col.label, tx, y, { align: col.align });
        });
        y += headerHeight - 1;

        // Border under header
        setDrawColor(doc, cfg.colors.border);
        doc.setLineWidth(0.2);
        doc.line(left, y - 3, right, y - 3);

        // Rows
        let grandTotal = 0;
        if (typeof currentQuote === 'undefined' || !currentQuote.lineItems) return { y: y, total: 0 };

        currentQuote.lineItems.forEach((item, idx) => {
            y = checkPageBreak(doc, y, rowHeight + 2);

            // Alternating row background
            if (idx % 2 === 1) {
                setFillColor(doc, cfg.colors.tableAltRow);
                doc.rect(left, y - 5, tableWidth, rowHeight, 'F');
            }

            const prod = PRODUCTS[item.type] || PRODUCTS.custom;
            const sub = getItemSubtotal(item);
            grandTotal += sub;

            const productName = (item.type === 'custom' && item.customDesc) ? item.customDesc : prod.name;
            const colorName = (prod.hasColor && item.color) ? item.color : '';
            let lengthDisplay = '';
            if (item.type === 'dexerdry') {
                lengthDisplay = item.length + ' ft box';
            } else if (prod.isFt) {
                const len = item.length === 'custom' ? (item.customLength || 0) : (item.length || 0);
                lengthDisplay = len + ' ft';
            }

            doc.setFontSize(cfg.fonts.bodySize);
            doc.setFont('helvetica', 'normal');
            setColor(doc, cfg.colors.textMain);

            // Truncate product name if too long
            const maxProductChars = 35;
            const displayName = productName.length > maxProductChars
                ? productName.substring(0, maxProductChars - 2) + '...'
                : productName;

            doc.text(displayName, cols[0].x + 2, y);
            doc.text(colorName, cols[1].x + 2, y);
            doc.text(lengthDisplay, cols[2].x + 2, y);
            doc.text(String(item.qty), cols[3].x + cols[3].w / 2, y, { align: 'center' });
            doc.text(formatCurrency(sub), cols[4].x + cols[4].w - 2, y, { align: 'right' });

            y += rowHeight;
        });

        // Bottom border
        setDrawColor(doc, cfg.colors.border);
        doc.line(left, y - 3, right, y - 3);

        // Total row
        y += 3;
        y = checkPageBreak(doc, y, 12);
        setFillColor(doc, cfg.colors.primary);
        doc.rect(left, y - 6, tableWidth, 10, 'F');
        doc.setFontSize(cfg.fonts.bodySize + 1);
        doc.setFont('helvetica', 'bold');
        setColor(doc, cfg.colors.white);
        doc.text('ESTIMATED TOTAL', cols[3].x - 30, y, { align: 'right' });
        doc.text(formatCurrency(grandTotal), cols[4].x + cols[4].w - 2, y, { align: 'right' });
        y += 10;

        return { y: y, total: grandTotal };
    }

    // =========================================================================
    // PAGE FOOTER
    // =========================================================================

    function drawPageFooter(doc) {
        const totalPages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            const pw = pageWidth(doc);
            const ph = pageHeight(doc);
            doc.setFontSize(PDF_CONFIG.fonts.tinySize);
            doc.setFont('helvetica', 'normal');
            setColor(doc, PDF_CONFIG.colors.textMuted);
            doc.text(
                'Page ' + i + ' of ' + totalPages,
                pw / 2,
                ph - 10,
                { align: 'center' }
            );
            doc.text(
                'Generated by AmeriDex Dealer Portal',
                pw / 2,
                ph - 6,
                { align: 'center' }
            );
        }
    }

    // =========================================================================
    // MAIN PDF GENERATION (overrides window.generatePDF)
    // =========================================================================

    async function generateBrandedPDF() {
        if (typeof window.jspdf === 'undefined') {
            alert('PDF library not loaded. Please try again in a moment.');
            return;
        }

        // Load logo if not already loaded
        if (!PDF_CONFIG.logo.dataUrl) {
            PDF_CONFIG.logo.dataUrl = await loadLogoAsDataUrl();
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const cfg = PDF_CONFIG;
        const today = new Date().toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric'
        });

        // ---- Page 1 Header ----
        let y = drawPageHeader(doc);

        // ---- Quote Info Bar ----
        y += 2;
        doc.setFontSize(cfg.fonts.bodySize);
        doc.setFont('helvetica', 'normal');
        setColor(doc, cfg.colors.textMuted);
        doc.text('Date: ' + today, cfg.margin.left, y);

        if (typeof currentQuote !== 'undefined' && currentQuote.quoteId) {
            doc.setFont('helvetica', 'bold');
            setColor(doc, cfg.colors.primary);
            doc.text('Quote #: ' + currentQuote.quoteId, pageWidth(doc) - cfg.margin.right, y, { align: 'right' });
        }
        y += 10;

        // ---- Customer Information ----
        y = drawSectionTitle(doc, y, 'Customer Information');
        const custName = document.getElementById('cust-name').value || '';
        const custEmail = document.getElementById('cust-email').value || '';
        const custZip = document.getElementById('cust-zip').value || '';
        const custCompany = document.getElementById('cust-company').value || '';
        const custPhone = document.getElementById('cust-phone').value || '';

        y = drawKeyValue(doc, y, 'Name', custName);
        y = drawKeyValue(doc, y, 'Email', custEmail);
        y = drawKeyValue(doc, y, 'Zip Code', custZip);
        if (custCompany) y = drawKeyValue(doc, y, 'Company', custCompany);
        if (custPhone) y = drawKeyValue(doc, y, 'Phone', custPhone);

        // ---- Dealer Info (if available) ----
        if (typeof dealerSettings !== 'undefined') {
            const dealerContact = dealerSettings.dealerContact || '';
            const dealerPhone = dealerSettings.dealerPhone || '';
            const dealerName = dealerSettings.dealerName || '';
            if (dealerContact || dealerPhone || dealerName) {
                y += 4;
                y = drawSectionTitle(doc, y, 'Dealer Information');
                if (dealerName) y = drawKeyValue(doc, y, 'Business', dealerName);
                if (dealerContact) y = drawKeyValue(doc, y, 'Contact', dealerContact);
                if (dealerPhone) y = drawKeyValue(doc, y, 'Phone', dealerPhone);
                y = drawKeyValue(doc, y, 'Dealer Code', dealerSettings.dealerCode || '');
            }
        }

        // ---- Options ----
        const hasPicFrame = document.getElementById('pic-frame').checked;
        const hasStairs = document.getElementById('stairs').checked;
        if (hasPicFrame || hasStairs) {
            y += 4;
            y = drawSectionTitle(doc, y, 'Options');
            doc.setFontSize(cfg.fonts.bodySize);
            doc.setFont('helvetica', 'normal');
            setColor(doc, cfg.colors.success);
            if (hasPicFrame) {
                doc.text('\u2713 Picture Framing', cfg.margin.left, y);
                y += 6;
            }
            if (hasStairs) {
                doc.text('\u2713 Stairs', cfg.margin.left, y);
                y += 6;
            }
        }

        // ---- Line Items ----
        y += 4;
        y = drawSectionTitle(doc, y, 'Order Items');
        const tableResult = drawLineItemsTable(doc, y);
        y = tableResult.y;

        // ---- Special Instructions ----
        const special = document.getElementById('special-instr').value;
        if (special) {
            y += 4;
            y = drawSectionTitle(doc, y, 'Special Instructions');
            y = checkPageBreak(doc, y, 12);
            doc.setFontSize(cfg.fonts.bodySize);
            doc.setFont('helvetica', 'normal');
            setColor(doc, cfg.colors.textMain);
            const splitLines = doc.splitTextToSize(special, pageWidth(doc) - cfg.margin.left - cfg.margin.right);
            splitLines.forEach(line => {
                y = checkPageBreak(doc, y, 6);
                doc.text(line, cfg.margin.left, y);
                y += 5;
            });
        }

        // ---- Shipping & Delivery ----
        const shipAddr = document.getElementById('ship-addr').value;
        const delDate = document.getElementById('del-date').value;
        if (shipAddr || delDate) {
            y += 4;
            y = drawSectionTitle(doc, y, 'Shipping & Delivery');
            if (shipAddr) {
                y = drawKeyValue(doc, y, 'Address', shipAddr.replace(/\n/g, ', '));
            }
            if (delDate) {
                y = drawKeyValue(doc, y, 'Pref. Date', delDate);
            }
        }

        // ---- Disclaimer ----
        y += 8;
        y = checkPageBreak(doc, y, 25);
        setDrawColor(doc, cfg.colors.border);
        doc.setLineWidth(0.3);
        doc.line(cfg.margin.left, y, pageWidth(doc) - cfg.margin.right, y);
        y += 6;
        doc.setFontSize(cfg.fonts.tinySize);
        doc.setFont('helvetica', 'italic');
        setColor(doc, cfg.colors.textMuted);
        const disclaimer = 'Disclaimer: This is an estimate only. Final pricing is subject to confirmation by A&M Building Products / AmeriDex. ' +
            'Prices do not include shipping, taxes, or installation unless otherwise noted. ' +
            'Product availability and lead times may vary. Contact sales@ameridex.com for questions.';
        const disclaimerLines = doc.splitTextToSize(disclaimer, pageWidth(doc) - cfg.margin.left - cfg.margin.right);
        disclaimerLines.forEach(line => {
            y = checkPageBreak(doc, y, 5);
            doc.text(line, cfg.margin.left, y);
            y += 4;
        });

        // ---- Page Footers ----
        drawPageFooter(doc);

        // ---- Save ----
        const quoteId = (typeof currentQuote !== 'undefined' && currentQuote.quoteId)
            ? currentQuote.quoteId
            : 'draft';
        doc.save('AmeriDex-Quote-' + quoteId + '.pdf');
    }

    // =========================================================================
    // OVERRIDE: Replace the original generatePDF
    // =========================================================================

    window.generatePDF = generateBrandedPDF;

    console.log('[ameridex-print-branding] Branded PDF generator loaded.');

})();
