/**
 * ameridex-print-branding.js v2.0
 * Branded customer quote and dealer order form print/preview output.
 * Loaded after dealer-portal.html inline script.
 *
 * v2.0 Changes (2026-02-25):
 *   - BRANDING: Full AmeriDex brand identity on printable quotes
 *   - BRANDING: Logo pre-cached as base64 at page load for reliable print rendering
 *   - BRANDING: Navy #1B3A5C + Red #C8102E color palette from official logo
 *   - BRANDING: Split navy/red header bar mirroring logo design language
 *   - BRANDING: Professional footer with company contact info
 *   - BRANDING: Removed "Dealer Portal" from customer-facing output
 *   - SECURITY: All v1.1 XSS protections preserved (esc() on all user strings)
 */

(function () {
  'use strict';

  /* ── Brand Constants ── */
  var BRAND_NAVY  = '#1B3A5C';
  var BRAND_RED   = '#C8102E';
  var BRAND_NAVY_LIGHT = '#2A4F7A';
  var BRAND_RED_LIGHT  = '#FDEDEF';
  var BRAND_GRAY  = '#6B7280';
  var BRAND_LIGHT = '#F7F8FA';
  var BRAND_BORDER = '#E5E7EB';

  /* ── Company Info ── */
  var COMPANY_NAME    = 'A&M Building Products / AmeriDex';
  var COMPANY_PHONE   = '(732) 899-1440';
  var COMPANY_ADDRESS = '2401 Bridge Ave, Point Pleasant, NJ 08742';
  var COMPANY_WEBSITE = 'ameridex.com';

  /* ── HTML entity escaper (XSS prevention) ── */
  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ── Logo base64 cache ──
     We pre-convert the logo PNG to a base64 data URI at page load.
     This guarantees the logo renders in about:blank print windows
     where relative /images/ paths fail.
  */
  var LOGO_BASE64 = '';
  var LOGO_SRC = '/images/ameridex-logo.png';

  function preloadLogoAsBase64() {
    try {
      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        ctx.drawImage(img, 0, 0);
        try {
          LOGO_BASE64 = canvas.toDataURL('image/png');
          console.log('[ameridex-print-branding] Logo cached as base64 (' + LOGO_BASE64.length + ' chars).');
        } catch (e) {
          console.warn('[ameridex-print-branding] Canvas toDataURL failed (CORS?). Will use path fallback.', e);
        }
      };
      img.onerror = function () {
        console.warn('[ameridex-print-branding] Logo image failed to load from ' + LOGO_SRC);
      };
      img.src = LOGO_SRC;
    } catch (e) {
      console.warn('[ameridex-print-branding] Logo preload error:', e);
    }
  }

  /* Kick off preload immediately */
  preloadLogoAsBase64();

  function getLogoSrc() {
    return LOGO_BASE64 || LOGO_SRC;
  }

  /* ── Shared CSS injected into the print window ── */
  var PRINT_WINDOW_STYLES = '\
    * { box-sizing: border-box; margin: 0; padding: 0; }\
    body {\
      font-family: Arial, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;\
      padding: 0;\
      color: #111827;\
      font-size: 13px;\
      line-height: 1.5;\
    }\
    .quote-page {\
      max-width: 850px;\
      margin: 0 auto;\
      padding: 24px 32px;\
    }\
    \
    /* ---- HEADER ---- */\
    .brand-header {\
      text-align: center;\
      padding-bottom: 0;\
      margin-bottom: 0;\
    }\
    .brand-logo {\
      width: 260px;\
      height: auto;\
      display: block;\
      margin: 0 auto 8px;\
    }\
    .brand-bar {\
      height: 5px;\
      margin: 12px 0 0 0;\
      background: linear-gradient(to right, ' + BRAND_NAVY + ' 55%, ' + BRAND_RED + ' 55%);\
      border-radius: 2px;\
    }\
    \
    /* ---- DOC TITLE + META ---- */\
    .doc-meta {\
      display: flex;\
      justify-content: space-between;\
      align-items: flex-start;\
      margin: 16px 0 12px;\
      padding-bottom: 8px;\
    }\
    .doc-meta-left {}\
    .doc-title {\
      font-size: 1.35rem;\
      font-weight: 700;\
      color: ' + BRAND_NAVY + ';\
      margin: 0 0 2px;\
    }\
    .doc-subtitle {\
      font-size: 0.8rem;\
      color: ' + BRAND_GRAY + ';\
    }\
    .doc-meta-right {\
      text-align: right;\
      font-size: 0.82rem;\
      color: #4B5563;\
      line-height: 1.7;\
    }\
    .doc-meta-label {\
      color: ' + BRAND_GRAY + ';\
      font-size: 0.75rem;\
      text-transform: uppercase;\
      letter-spacing: 0.05em;\
    }\
    .doc-meta-value {\
      font-weight: 600;\
      color: ' + BRAND_NAVY + ';\
    }\
    \
    /* ---- SECTION HEADERS ---- */\
    h2 {\
      color: ' + BRAND_NAVY + ';\
      font-size: 0.95rem;\
      font-weight: 700;\
      text-transform: uppercase;\
      letter-spacing: 0.06em;\
      border-bottom: 2px solid ' + BRAND_NAVY + ';\
      padding-bottom: 4px;\
      margin: 20px 0 10px;\
    }\
    \
    /* ---- CUSTOMER INFO TABLE ---- */\
    .info-table { width: auto; border-collapse: collapse; margin: 6px 0 10px; }\
    .info-table td {\
      padding: 3px 12px 3px 0;\
      border: none;\
      font-size: 0.88rem;\
      vertical-align: top;\
    }\
    .info-label {\
      color: ' + BRAND_GRAY + ';\
      font-weight: 600;\
      width: 110px;\
      white-space: nowrap;\
    }\
    \
    /* ---- ITEMS TABLE ---- */\
    table.items-table { width: 100%; border-collapse: collapse; margin: 8px 0 12px; }\
    table.items-table th {\
      background: ' + BRAND_NAVY + ';\
      color: #fff;\
      font-weight: 600;\
      border: 1px solid ' + BRAND_NAVY + ';\
      padding: 9px 10px;\
      text-align: left;\
      font-size: 0.85rem;\
      text-transform: uppercase;\
      letter-spacing: 0.03em;\
    }\
    table.items-table td {\
      border: 1px solid ' + BRAND_BORDER + ';\
      padding: 8px 10px;\
      text-align: left;\
      font-size: 0.88rem;\
    }\
    table.items-table tr:nth-child(even) td { background: ' + BRAND_LIGHT + '; }\
    table.items-table tr:hover td { background: #EEF2F7; }\
    \
    /* Total row */\
    .total-row td {\
      font-weight: 700;\
      font-size: 1rem;\
      background: ' + BRAND_RED_LIGHT + ' !important;\
      border-top: 2px solid ' + BRAND_RED + ';\
    }\
    .total-amount {\
      color: ' + BRAND_RED + ';\
      font-size: 1.1rem;\
    }\
    \
    /* ---- SPECIAL INSTRUCTIONS / SHIPPING ---- */\
    .info-box {\
      background: ' + BRAND_LIGHT + ';\
      border-radius: 6px;\
      padding: 10px 14px;\
      border: 1px solid ' + BRAND_BORDER + ';\
      font-size: 0.88rem;\
      margin: 6px 0;\
    }\
    .options-list {\
      margin: 4px 0;\
      font-size: 0.88rem;\
    }\
    .options-list span {\
      color: ' + BRAND_NAVY + ';\
      font-weight: 600;\
    }\
    \
    /* ---- FOOTER ---- */\
    .brand-footer {\
      margin-top: 28px;\
      padding-top: 0;\
      text-align: center;\
      font-size: 0.78rem;\
      color: ' + BRAND_GRAY + ';\
      line-height: 1.7;\
    }\
    .footer-bar {\
      height: 3px;\
      background: linear-gradient(to right, ' + BRAND_NAVY + ' 55%, ' + BRAND_RED + ' 55%);\
      border-radius: 2px;\
      margin-bottom: 12px;\
    }\
    .footer-logo {\
      width: 120px;\
      height: auto;\
      margin: 0 auto 6px;\
      display: block;\
      opacity: 0.7;\
    }\
    .footer-company {\
      font-weight: 600;\
      color: ' + BRAND_NAVY + ';\
      font-size: 0.82rem;\
    }\
    .footer-disclaimer {\
      margin: 10px auto 8px;\
      max-width: 700px;\
      font-size: 0.75rem;\
      color: #9CA3AF;\
      line-height: 1.5;\
    }\
    .footer-tagline {\
      font-size: 0.82rem;\
      color: ' + BRAND_NAVY + ';\
      font-weight: 600;\
      margin-top: 4px;\
    }\
    \
    /* ---- PRINT OVERRIDES ---- */\
    @media print {\
      body { padding: 0; }\
      .quote-page { padding: 12px 20px; }\
      .brand-header { break-inside: avoid; }\
      table.items-table { break-inside: auto; }\
      table.items-table tr { break-inside: avoid; }\
      .brand-footer { break-inside: avoid; }\
    }\
  ';

  /* ── Build branded header HTML ── */
  function buildHeader(title, today, quoteId) {
    var ds = (typeof dealerSettings !== 'undefined') ? dealerSettings : {};
    var dealerCode = esc(ds.dealerCode || '');
    var dealerName = esc(ds.dealerName || '');
    var dealerContact = esc(ds.dealerContact || '');
    var dealerPhone = esc(ds.dealerPhone || '');
    var logoSrc = getLogoSrc();

    var h = '';

    /* Logo + brand bar */
    h += '<div class="brand-header">';
    h += '  <img class="brand-logo" src="' + logoSrc + '" alt="AmeriDex">';
    h += '  <div class="brand-bar"></div>';
    h += '</div>';

    /* Doc title + meta info */
    h += '<div class="doc-meta">';
    h += '  <div class="doc-meta-left">';
    h += '    <div class="doc-title">' + esc(title) + '</div>';
    h += '    <div class="doc-subtitle">Generated ' + esc(today) + '</div>';
    h += '  </div>';
    h += '  <div class="doc-meta-right">';
    if (quoteId) {
      h += '  <div><span class="doc-meta-label">Quote # </span><span class="doc-meta-value">' + esc(quoteId) + '</span></div>';
    }
    if (dealerCode) {
      h += '  <div><span class="doc-meta-label">Dealer Code: </span><span class="doc-meta-value">' + dealerCode + '</span></div>';
    }
    if (dealerName) {
      h += '  <div>' + dealerName + '</div>';
    }
    if (dealerContact) {
      h += '  <div>' + dealerContact + '</div>';
    }
    if (dealerPhone) {
      h += '  <div>' + dealerPhone + '</div>';
    }
    h += '  </div>';
    h += '</div>';

    return h;
  }

  /* ── Build customer info section ── */
  function buildCustomerInfo() {
    var val = function (id) {
      var el = document.getElementById(id);
      return el ? el.value : '';
    };

    var custName = esc(val('cust-name') || 'N/A');
    var custEmail = esc(val('cust-email') || 'N/A');
    var custZip = esc(val('cust-zip') || 'N/A');
    var custCompany = esc(val('cust-company'));
    var custPhone = esc(val('cust-phone'));

    var h = '<h2>Customer Information</h2>';
    h += '<table class="info-table">';
    h += '<tr><td class="info-label">Name</td><td>' + custName + '</td></tr>';
    h += '<tr><td class="info-label">Email</td><td>' + custEmail + '</td></tr>';
    h += '<tr><td class="info-label">Zip Code</td><td>' + custZip + '</td></tr>';
    if (custCompany) {
      h += '<tr><td class="info-label">Company</td><td>' + custCompany + '</td></tr>';
    }
    if (custPhone) {
      h += '<tr><td class="info-label">Phone</td><td>' + custPhone + '</td></tr>';
    }
    h += '</table>';
    return h;
  }

  /* ── Build options section ── */
  function buildOptions() {
    var picFrame = document.getElementById('pic-frame');
    var stairs = document.getElementById('stairs');
    var hasPicFrame = picFrame && picFrame.checked;
    var hasStairs = stairs && stairs.checked;

    if (!hasPicFrame && !hasStairs) return '';

    var h = '<h2>Options</h2>';
    h += '<div class="options-list">';
    if (hasPicFrame) h += '<p style="margin:4px 0;"><span>&#10003;</span> Picture framing</p>';
    if (hasStairs) h += '<p style="margin:4px 0;"><span>&#10003;</span> Stairs</p>';
    h += '</div>';
    return h;
  }

  /* ── Build line items table ── */
  function buildLineItems() {
    var quote = (typeof currentQuote !== 'undefined') ? currentQuote : { lineItems: [] };
    var products = (typeof PRODUCTS !== 'undefined') ? PRODUCTS : {};
    var grandTotal = 0;

    var h = '<h2>Order Details</h2>';
    h += '<table class="items-table">';
    h += '<thead><tr>';
    h += '<th>Product</th><th>Color</th><th>Length</th>';
    h += '<th style="text-align:center;">Qty</th>';
    h += '<th style="text-align:right;">Subtotal</th>';
    h += '</tr></thead><tbody>';

    quote.lineItems.forEach(function (item) {
      var prod = products[item.type] || products.custom || { name: item.type, isFt: false, hasColor: false };
      var sub = (typeof getItemSubtotal === 'function') ? getItemSubtotal(item) : 0;
      grandTotal += sub;

      var productName = esc((item.type === 'custom' && item.customDesc) ? item.customDesc : prod.name);

      var lengthDisplay = '';
      if (item.type === 'dexerdry') {
        lengthDisplay = esc((item.length || 0) + ' ft box');
      } else if (prod.isFt) {
        var len = item.length === 'custom' ? (item.customLength || 0) : (item.length || 0);
        lengthDisplay = len ? esc(len + ' ft') : '';
      }

      var colorDisplay = prod.hasColor ? esc(item.color || '') : '';

      h += '<tr>';
      h += '<td>' + productName + '</td>';
      h += '<td>' + colorDisplay + '</td>';
      h += '<td>' + lengthDisplay + '</td>';
      h += '<td style="text-align:center;">' + (parseInt(item.qty, 10) || 0) + '</td>';
      h += '<td style="text-align:right;">$' + ((typeof formatCurrency === 'function') ? formatCurrency(sub) : sub.toFixed(2)) + '</td>';
      h += '</tr>';
    });

    h += '<tr class="total-row">';
    h += '<td colspan="4" style="text-align:right;">Estimated Total</td>';
    h += '<td style="text-align:right;"><span class="total-amount">$' + ((typeof formatCurrency === 'function') ? formatCurrency(grandTotal) : grandTotal.toFixed(2)) + '</span></td>';
    h += '</tr>';

    h += '</tbody></table>';
    return h;
  }

  /* ── Build special instructions ── */
  function buildSpecialInstructions() {
    var el = document.getElementById('special-instr');
    var special = el ? el.value : '';
    if (!special) return '';

    var safeSpecial = esc(special).replace(/\n/g, '<br>');

    var h = '<h2>Special Instructions</h2>';
    h += '<div class="info-box">';
    h += safeSpecial;
    h += '</div>';
    return h;
  }

  /* ── Build shipping & delivery ── */
  function buildShipping() {
    var addrEl = document.getElementById('ship-addr');
    var dateEl = document.getElementById('del-date');
    var shipAddr = addrEl ? addrEl.value : '';
    var delDate = dateEl ? dateEl.value : '';

    if (!shipAddr && !delDate) return '';

    var h = '<h2>Shipping &amp; Delivery</h2>';
    if (shipAddr) {
      var safeAddr = esc(shipAddr).replace(/\n/g, '<br>');
      h += '<div class="info-box"><strong>Address:</strong><br>' + safeAddr + '</div>';
    }
    if (delDate) {
      h += '<p style="margin:6px 0;font-size:0.88rem;"><strong>Preferred Delivery Date:</strong> ' + esc(delDate) + '</p>';
    }
    return h;
  }

  /* ── Build footer ── */
  function buildFooter(isCustomer) {
    var logoSrc = getLogoSrc();

    var h = '<div class="brand-footer">';
    h += '  <div class="footer-bar"></div>';
    h += '  <img class="footer-logo" src="' + logoSrc + '" alt="AmeriDex">';

    if (isCustomer) {
      h += '<div class="footer-disclaimer">';
      h += '<strong>Disclaimer:</strong> This is an estimate only. Final pricing is subject to confirmation by A&amp;M Building Products / AmeriDex. Prices do not include shipping, taxes, or installation unless otherwise noted.';
      h += '</div>';
    }

    h += '  <div class="footer-company">' + esc(COMPANY_NAME) + '</div>';
    h += '  <div>' + esc(COMPANY_ADDRESS) + '</div>';
    h += '  <div>' + esc(COMPANY_PHONE) + ' &nbsp;|&nbsp; ' + esc(COMPANY_WEBSITE) + '</div>';
    h += '  <div class="footer-tagline">Thank you for choosing AmeriDex!</div>';
    h += '</div>';
    return h;
  }

  /* ══════════════════════════════════════════════
     MAIN OVERRIDE: generatePrintHTML(type)
     ══════════════════════════════════════════════ */
  window.generatePrintHTML = function (type) {
    var today = new Date().toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
    var isCustomer = (type === 'customer');
    var title = isCustomer ? 'Customer Quote' : 'Dealer Order Form';
    var quoteId = (typeof currentQuote !== 'undefined' && currentQuote.quoteId) ? currentQuote.quoteId : '';

    var html = '<div class="quote-page">';
    html += buildHeader(title, today, quoteId);
    html += buildCustomerInfo();
    html += buildOptions();
    html += buildLineItems();
    html += buildSpecialInstructions();
    html += buildShipping();
    html += buildFooter(isCustomer);
    html += '</div>';

    return html;
  };

  /* ══════════════════════════════════════════════
     MAIN OVERRIDE: printFromPreview()
     ══════════════════════════════════════════════ */
  window.printFromPreview = function () {
    var previewEl = document.querySelector('.print-preview-content');
    if (!previewEl) return;

    var printWin = window.open('', '_blank', 'width=900,height=700');
    if (!printWin) {
      alert('Pop-up blocked. Please allow pop-ups for this site.');
      return;
    }

    printWin.document.write('<!DOCTYPE html><html><head>');
    printWin.document.write('<meta charset="utf-8">');
    printWin.document.write('<title>AmeriDex Quote</title>');
    printWin.document.write('<style>' + PRINT_WINDOW_STYLES + '</style>');
    printWin.document.write('</head><body>');
    printWin.document.write(previewEl.innerHTML);
    printWin.document.write('</body></html>');
    printWin.document.close();

    /* Wait for images (logo) to load before triggering print */
    var logos = printWin.document.querySelectorAll('.brand-logo, .footer-logo');
    var pending = 0;

    function checkReady() {
      pending--;
      if (pending <= 0) {
        setTimeout(function () { printWin.focus(); printWin.print(); }, 200);
      }
    }

    for (var i = 0; i < logos.length; i++) {
      if (!logos[i].complete) {
        pending++;
        logos[i].onload = checkReady;
        logos[i].onerror = checkReady;
      }
    }

    if (pending === 0) {
      setTimeout(function () { printWin.focus(); printWin.print(); }, 300);
    } else {
      /* Safety timeout */
      setTimeout(function () { printWin.focus(); printWin.print(); }, 2000);
    }
  };

  /* ══════════════════════════════════════════════
     Allow manual base64 override if needed:
       window.AMERIDEX_LOGO_BASE64 = 'data:image/png;base64,...';
     Set this before generating a print and it will be used.
     ══════════════════════════════════════════════ */
  var origGetLogoSrc = getLogoSrc;
  getLogoSrc = function () {
    if (window.AMERIDEX_LOGO_BASE64) return window.AMERIDEX_LOGO_BASE64;
    return origGetLogoSrc();
  };

  console.log('[ameridex-print-branding] v2.0 loaded (branded + XSS-safe).');
})();
