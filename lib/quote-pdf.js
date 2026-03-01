// ============================================================
// lib/quote-pdf.js - Server-side PDF generation
// Date: 2026-03-01
// ============================================================
// Generates PDF from quote-template.html using Puppeteer.
// Template variables: {{QUOTE_NUMBER}}, {{QUOTE_DATE}}, etc.
// ============================================================

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

/**
 * Generate PDF from quote data using the template
 * @param {Object} quote - Full quote object
 * @param {Object} dealer - Dealer object
 * @param {Object} customer - Customer object
 * @returns {Promise<Buffer>} PDF buffer
 */
async function generateQuotePDF(quote, dealer, customer) {
    const templatePath = path.join(__dirname, '../public/quote-template.html');
    let html = fs.readFileSync(templatePath, 'utf8');

    // Embed logo as base64 so Puppeteer can render it
    const logoPath = path.join(__dirname, '../public/images/ameridex-logo.png');
    if (fs.existsSync(logoPath)) {
        const logoBuffer = fs.readFileSync(logoPath);
        const logoDataUrl = 'data:image/png;base64,' + logoBuffer.toString('base64');
        html = html.replace(
            /src="\/images\/ameridex-logo\.png"/g,
            'src="' + logoDataUrl + '"'
        );
    }

    // Format dates
    const quoteDate = new Date(quote.createdAt).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
    });

    // Build line-item table rows
    const orderRowsHTML = (quote.lineItems || []).map(function(item) {
        const lengthDisplay = item.customLength
            ? item.customLength + "' (custom)"
            : item.length
            ? item.length + "'"
            : 'N/A';

        const colorDisplay = item.color2
            ? item.color + ' / ' + item.color2
            : item.color || 'N/A';

        return '<tr>'
            + '<td><span class="product-name">' + escapeHtml(item.productName || 'Custom Item') + '</span>'
            + (item.type ? '<br><small style="color:#6B7A90">' + escapeHtml(item.type) + '</small>' : '')
            + '</td>'
            + '<td><span class="color-swatch"><span class="swatch-dot"></span>' + escapeHtml(colorDisplay) + '</span></td>'
            + '<td>' + lengthDisplay + '</td>'
            + '<td>' + item.quantity + '</td>'
            + '<td>$' + item.total.toFixed(2) + '</td>'
            + '</tr>';
    }).join('\n');

    // Format totals
    const subtotal = '$' + quote.totalAmount.toFixed(2);
    const estimatedTotal = '$' + quote.totalAmount.toFixed(2);

    // Dealer info
    const dealerBusiness = dealer.dealerName || dealer.name || dealer.businessName || 'N/A';
    const dealerContact = dealer.contactName || dealer.contact || dealer.username || 'N/A';
    const dealerCode = quote.dealerCode || dealer.dealerCode || 'N/A';

    // Customer info
    const custName = customer.name || 'N/A';
    const custEmail = customer.email || 'N/A';
    const custZip = customer.zipCode || customer.zip || 'N/A';

    // Replace all template placeholders
    html = html
        .replace(/{{QUOTE_NUMBER}}/g, escapeHtml(quote.quoteNumber))
        .replace(/{{QUOTE_DATE}}/g, escapeHtml(quoteDate))
        .replace(/{{DEALER_CODE}}/g, escapeHtml(dealerCode))
        .replace(/{{DEALER_BUSINESS}}/g, escapeHtml(dealerBusiness))
        .replace(/{{DEALER_CONTACT}}/g, escapeHtml(dealerContact))
        .replace(/{{CUSTOMER_NAME}}/g, escapeHtml(custName))
        .replace(/{{CUSTOMER_EMAIL}}/g, escapeHtml(custEmail))
        .replace(/{{CUSTOMER_ZIP}}/g, escapeHtml(custZip))
        .replace(/{{ORDER_ROWS}}/g, orderRowsHTML)
        .replace(/{{SUBTOTAL}}/g, subtotal)
        .replace(/{{ESTIMATED_TOTAL}}/g, estimatedTotal);

    // Launch Puppeteer and generate PDF
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });

        const pdfBuffer = await page.pdf({
            format: 'Letter',
            printBackground: true,
            margin: {
                top: '0.5in',
                right: '0.5in',
                bottom: '0.5in',
                left: '0.5in'
            }
        });

        return pdfBuffer;
    } finally {
        await browser.close();
    }
}

function escapeHtml(text) {
    if (!text) return '';
    var str = String(text);
    var map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return str.replace(/[&<>"']/g, function(m) { return map[m]; });
}

module.exports = { generateQuotePDF };
