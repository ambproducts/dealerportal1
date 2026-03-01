// ============================================================
// lib/quote-pdf.js - Server-side PDF generation
// Date: 2026-03-01
// ============================================================
// Generates PDF from quote-template.html using Puppeteer.
// Template variables: {{quoteNumber}}, {{date}}, etc.
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
    // Read the template
    const templatePath = path.join(__dirname, '../public/quote-template.html');
    let html = fs.readFileSync(templatePath, 'utf8');

    // Read and encode the logo as base64
    const logoPath = path.join(__dirname, '../public/images/ameridex-logo.png');
    let logoDataUrl = '';
    if (fs.existsSync(logoPath)) {
        const logoBuffer = fs.readFileSync(logoPath);
        logoDataUrl = `data:image/png;base64,${logoBuffer.toString('base64')}`;
    }

    // Format date
    const quoteDate = new Date(quote.createdAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    // Format expiry date
    const expiryDate = quote.expiresAt
        ? new Date(quote.expiresAt).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        })
        : 'N/A';

    // Build line items HTML
    const lineItemsHTML = quote.lineItems.map((item, idx) => {
        const lengthDisplay = item.customLength
            ? `${item.customLength}' (custom)`
            : item.length
            ? `${item.length}'`
            : 'N/A';

        const colorDisplay = item.color2
            ? `${item.color} / ${item.color2}`
            : item.color || 'N/A';

        return `
            <tr>
                <td class="line-item__cell line-item__index">${idx + 1}</td>
                <td class="line-item__cell line-item__name">
                    <div class="line-item__product">${item.productName || 'Custom Item'}</div>
                    ${item.type ? `<div class="line-item__detail">Type: ${item.type}</div>` : ''}
                    <div class="line-item__detail">Color: ${colorDisplay}</div>
                    <div class="line-item__detail">Length: ${lengthDisplay}</div>
                </td>
                <td class="line-item__cell line-item__qty">${item.quantity}</td>
                <td class="line-item__cell line-item__price">$${item.price.toFixed(2)}</td>
                <td class="line-item__cell line-item__total">$${item.total.toFixed(2)}</td>
            </tr>
        `;
    }).join('');

    // Build notes HTML
    const notesHTML = quote.notes
        ? `<div class="quote-notes">
               <div class="quote-notes__label">Notes:</div>
               <div class="quote-notes__text">${escapeHtml(quote.notes)}</div>
           </div>`
        : '';

    // Replace template variables
    html = html
        .replace(/{{logoDataUrl}}/g, logoDataUrl)
        .replace(/{{quoteNumber}}/g, quote.quoteNumber)
        .replace(/{{date}}/g, quoteDate)
        .replace(/{{dealerName}}/g, dealer.dealerName || dealer.name || 'N/A')
        .replace(/{{dealerCode}}/g, dealer.dealerCode)
        .replace(/{{customerName}}/g, customer.name)
        .replace(/{{customerCompany}}/g, customer.company || '')
        .replace(/{{customerEmail}}/g, customer.email || 'N/A')
        .replace(/{{customerPhone}}/g, customer.phone || 'N/A')
        .replace(/{{customerZip}}/g, customer.zipCode || '')
        .replace(/{{expiryDate}}/g, expiryDate)
        .replace(/{{lineItems}}/g, lineItemsHTML)
        .replace(/{{subtotal}}/g, quote.totalAmount.toFixed(2))
        .replace(/{{total}}/g, quote.totalAmount.toFixed(2))
        .replace(/{{notes}}/g, notesHTML);

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

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

module.exports = { generateQuotePDF };
