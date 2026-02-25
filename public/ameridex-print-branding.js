/**
 * ameridex-print-branding.js v1.1
 * Branded customer quote and dealer order form print/preview output.
 * Loaded after dealer-portal.html inline script.
 *
 * v1.1 Changes (2026-02-25):
 *   - SECURITY: Added esc() HTML entity escaper
 *   - SECURITY: All user-controlled strings now escaped before
 *     injection into innerHTML (customer info, line items,
 *     special instructions, shipping address, dealer info)
 *   - Prevents XSS via crafted customer names, emails, addresses,
 *     product descriptions, and special instructions
 */

(function () {
  'use strict';

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

  /* ── Shared CSS injected into the print window ── */
  const PRINT_WINDOW_STYLES = `
    * { box-sizing: border-box; }
    body {
      font-family: Arial, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      padding: 24px;
      color: #111827;
      font-size: 14px;
      line-height: 1.5;
    }
    .print-preview-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1.5rem;
      border-bottom: 3px solid #2563eb;
      padding-bottom: 1rem;
      margin-bottom: 1.5rem;
    }
    .print-preview-header-left {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .print-preview-logo { height: 48px; width: auto; }
    .print-preview-brand { display: flex; flex-direction: column; }
    .print-preview-brand-title {
      font-size: 1.5rem; font-weight: 700; color: #111827; line-height: 1.2;
    }
    .print-preview-brand-subtitle {
      font-size: 0.75rem; text-transform: uppercase;
      letter-spacing: 0.12em; color: #6b7280; margin-top: 0.15rem;
    }
    .print-preview-header-right {
      text-align: right; font-size: 0.85rem; color: #4b5563; line-height: 1.6;
    }
    .print-preview-doc-title {
      font-weight: 700; font-size: 1rem; color: #111827; margin-bottom: 0.25rem;
    }
    .print-preview-meta-line { color: #6b7280; font-size: 0.85rem; }
    h2 {
      color: #374151; font-size: 1.05rem;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 0.35rem; margin: 1.5rem 0 0.75rem;
    }
    table { width: 100%; border-collapse: collapse; margin: 0.5rem 0 1rem; }
    th {
      background: #2563eb; color: #fff; font-weight: 600;
      border: 1px solid #e5e7eb; padding: 8px; text-align: left; font-size: 0.9rem;
    }
    td {
      border: 1px solid #e5e7eb; padding: 8px; text-align: left; font-size: 0.9rem;
    }
    tr:nth-child(even) td { background: #f9fafb; }
    .total-row td { font-weight: 600; font-size: 1.05rem; background: #eff6ff; }
    .print-footer {
      margin-top: 2rem; padding-top: 1rem; border-top: 2px solid #e5e7eb;
      font-size: 0.8rem; color: #6b7280; text-align: center; line-height: 1.6;
    }
    @media print {
      body { padding: 0; }
      .print-preview-header { break-inside: avoid; }
      table { break-inside: auto; }
      tr { break-inside: avoid; }
    }
  `;

  /* ── Helper: logo path (swap to base64 later for reliability) ── */
  const LOGO_SRC = '/images/ameridex-logo.png';

  /* ── Build branded header HTML ── */
  function buildHeader(title, today, quoteId) {
    const ds = (typeof dealerSettings !== 'undefined') ? dealerSettings : {};
    const dealerCode = esc(ds.dealerCode || '');
    const dealerName = esc(ds.dealerName || '');
    const dealerContact = esc(ds.dealerContact || '');
    const dealerPhone = esc(ds.dealerPhone || '');

    let h = '';
    h += '<div class="print-preview-header">';
    h += '  <div class="print-preview-header-left">';
    h += '    <img class="print-preview-logo" src="' + LOGO_SRC + '" alt="AmeriDex Logo">';
    h += '    <div class="print-preview-brand">';
    h += '      <div class="print-preview-brand-title">AmeriDex</div>';
    h += '      <div class="print-preview-brand-subtitle">Dealer Portal</div>';
    h += '    </div>';
    h += '  </div>';
    h += '  <div class="print-preview-header-right">';
    h += '    <div class="print-preview-doc-title">' + esc(title) + '</div>';
    h += '    <div class="print-preview-meta-line">Date: ' + esc(today) + '</div>';
    if (quoteId) {
      h += '  <div class="print-preview-meta-line">Quote #: ' + esc(quoteId) + '</div>';
    }
    if (dealerCode) {
      h += '  <div class="print-preview-meta-line">Dealer Code: ' + dealerCode + '</div>';
    }
    if (dealerName) {
      h += '  <div class="print-preview-meta-line">' + dealerName + '</div>';
    }
    if (dealerContact) {
      h += '  <div class="print-preview-meta-line">' + dealerContact + '</div>';
    }
    if (dealerPhone) {
      h += '  <div class="print-preview-meta-line">' + dealerPhone + '</div>';
    }
    h += '  </div>';
    h += '</div>';
    return h;
  }

  /* ── Build customer info section ── */
  function buildCustomerInfo() {
    const val = function (id) {
      const el = document.getElementById(id);
      return el ? el.value : '';
    };

    const custName = esc(val('cust-name') || 'N/A');
    const custEmail = esc(val('cust-email') || 'N/A');
    const custZip = esc(val('cust-zip') || 'N/A');
    const custCompany = esc(val('cust-company'));
    const custPhone = esc(val('cust-phone'));

    let h = '<h2>Customer Information</h2>';
    h += '<table>';
    h += '<tr><td style="color:#6b7280;width:130px;border:none;"><strong>Name:</strong></td><td style="border:none;">' + custName + '</td></tr>';
    h += '<tr><td style="color:#6b7280;border:none;"><strong>Email:</strong></td><td style="border:none;">' + custEmail + '</td></tr>';
    h += '<tr><td style="color:#6b7280;border:none;"><strong>Zip Code:</strong></td><td style="border:none;">' + custZip + '</td></tr>';
    if (custCompany) {
      h += '<tr><td style="color:#6b7280;border:none;"><strong>Company:</strong></td><td style="border:none;">' + custCompany + '</td></tr>';
    }
    if (custPhone) {
      h += '<tr><td style="color:#6b7280;border:none;"><strong>Phone:</strong></td><td style="border:none;">' + custPhone + '</td></tr>';
    }
    h += '</table>';
    return h;
  }

  /* ── Build options section ── */
  function buildOptions() {
    const picFrame = document.getElementById('pic-frame');
    const stairs = document.getElementById('stairs');
    const hasPicFrame = picFrame && picFrame.checked;
    const hasStairs = stairs && stairs.checked;

    if (!hasPicFrame && !hasStairs) return '';

    let h = '<h2>Options</h2>';
    if (hasPicFrame) h += '<p style="margin:4px 0;">&#10003; Picture framing</p>';
    if (hasStairs) h += '<p style="margin:4px 0;">&#10003; Stairs</p>';
    return h;
  }

  /* ── Build line items table ── */
  function buildLineItems() {
    const quote = (typeof currentQuote !== 'undefined') ? currentQuote : { lineItems: [] };
    const products = (typeof PRODUCTS !== 'undefined') ? PRODUCTS : {};
    let grandTotal = 0;

    let h = '<h2>Order Items</h2>';
    h += '<table>';
    h += '<thead><tr>';
    h += '<th>Product</th><th>Color</th><th>Length</th>';
    h += '<th style="text-align:center;">Qty</th>';
    h += '<th style="text-align:right;">Subtotal</th>';
    h += '</tr></thead><tbody>';

    quote.lineItems.forEach(function (item) {
      const prod = products[item.type] || products.custom || { name: item.type, isFt: false, hasColor: false };
      const sub = (typeof getItemSubtotal === 'function') ? getItemSubtotal(item) : 0;
      grandTotal += sub;

      const productName = esc((item.type === 'custom' && item.customDesc) ? item.customDesc : prod.name);

      let lengthDisplay = '';
      if (item.type === 'dexerdry') {
        lengthDisplay = esc((item.length || 0) + ' ft box');
      } else if (prod.isFt) {
        const len = item.length === 'custom' ? (item.customLength || 0) : (item.length || 0);
        lengthDisplay = len ? esc(len + ' ft') : '';
      }

      const colorDisplay = prod.hasColor ? esc(item.color || '') : '';

      h += '<tr>';
      h += '<td>' + productName + '</td>';
      h += '<td>' + colorDisplay + '</td>';
      h += '<td>' + lengthDisplay + '</td>';
      h += '<td style="text-align:center;">' + (parseInt(item.qty, 10) || 0) + '</td>';
      h += '<td style="text-align:right;">$' + ((typeof formatCurrency === 'function') ? formatCurrency(sub) : sub.toFixed(2)) + '</td>';
      h += '</tr>';
    });

    h += '<tr class="total-row">';
    h += '<td colspan="4" style="text-align:right;">Estimated Total:</td>';
    h += '<td style="text-align:right;color:#1e40af;">$' + ((typeof formatCurrency === 'function') ? formatCurrency(grandTotal) : grandTotal.toFixed(2)) + '</td>';
    h += '</tr>';

    h += '</tbody></table>';
    return h;
  }

  /* ── Build special instructions ── */
  function buildSpecialInstructions() {
    const el = document.getElementById('special-instr');
    const special = el ? el.value : '';
    if (!special) return '';

    // Escape first, THEN convert newlines to <br> for safe display
    const safeSpecial = esc(special).replace(/\n/g, '<br>');

    let h = '<h2>Special Instructions</h2>';
    h += '<div style="background:#f9fafb;border-radius:6px;padding:10px;border:1px solid #e5e7eb;">';
    h += safeSpecial;
    h += '</div>';
    return h;
  }

  /* ── Build shipping & delivery ── */
  function buildShipping() {
    const addrEl = document.getElementById('ship-addr');
    const dateEl = document.getElementById('del-date');
    const shipAddr = addrEl ? addrEl.value : '';
    const delDate = dateEl ? dateEl.value : '';

    if (!shipAddr && !delDate) return '';

    let h = '<h2>Shipping &amp; Delivery</h2>';
    if (shipAddr) {
      // Escape first, THEN convert newlines to <br> for safe display
      const safeAddr = esc(shipAddr).replace(/\n/g, '<br>');
      h += '<p style="margin:6px 0;"><strong>Address:</strong><br>' + safeAddr + '</p>';
    }
    if (delDate) {
      h += '<p style="margin:6px 0;"><strong>Preferred Delivery Date:</strong> ' + esc(delDate) + '</p>';
    }
    return h;
  }

  /* ── Build disclaimer (customer) or internal note (dealer) ── */
  function buildFooter(isCustomer) {
    let h = '<div class="print-footer">';
    if (isCustomer) {
      h += '<p style="margin:0 0 0.5rem;"><strong>Disclaimer:</strong> This is an estimate only. Final pricing is subject to confirmation by A&amp;M Building Products / AmeriDex. Prices do not include shipping, taxes, or installation unless otherwise noted.</p>';
    }
    h += '<p style="margin:0;">AmeriDex &bull; A&amp;M Building Products &bull; ameridex.com</p>';
    h += '<p style="margin:0.25rem 0 0;">Thank you for choosing AmeriDex!</p>';
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

    var html = '<div style="max-width:900px;margin:0 auto;">';
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
    printWin.document.write('<title>AmeriDex Print</title>');
    printWin.document.write('<style>' + PRINT_WINDOW_STYLES + '</style>');
    printWin.document.write('</head><body>');
    printWin.document.write(previewEl.innerHTML);
    printWin.document.write('</body></html>');
    printWin.document.close();

    /* Wait for images (logo) to load before triggering print */
    var logo = printWin.document.querySelector('.print-preview-logo');
    if (logo && !logo.complete) {
      logo.onload = function () { printWin.focus(); printWin.print(); };
      logo.onerror = function () { printWin.focus(); printWin.print(); };
      /* Safety timeout in case onload never fires */
      setTimeout(function () { printWin.focus(); printWin.print(); }, 1500);
    } else {
      setTimeout(function () { printWin.focus(); printWin.print(); }, 300);
    }
  };

  console.log('[ameridex-print-branding] v1.1 loaded (XSS-safe).');
})();
