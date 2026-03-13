// =============================================================
// routes/pdf.js
// POST /api/pdf/generate
//
// Protected by requireAuth middleware — a valid Bearer token
// (issued by /api/auth/login) is required. Unauthenticated
// requests receive 401 before Puppeteer is ever invoked.
//
// Accepts a filled HTML string from the client, renders it
// with Puppeteer (headless Chromium), and returns a real .pdf
// binary as a file download.
//
// Uses @sparticuz/chromium which is pre-optimised for serverless
// and Render.com environments (already in package.json).
// =============================================================

const express      = require('express');
const router       = express.Router();
const { requireAuth } = require('../middleware/auth');

// Lazy-load Puppeteer so the server starts even if the Chromium
// binary hasn't been downloaded yet (e.g. local dev).
let puppeteer = null;
let chromium  = null;

function getPuppeteer() {
    if (!puppeteer) {
        try {
            puppeteer = require('puppeteer-core');
            chromium  = require('@sparticuz/chromium');
        } catch (e) {
            throw new Error('Puppeteer not available: ' + e.message);
        }
    }
    return { puppeteer, chromium };
}

// =============================================================
// POST /api/pdf/generate
//
// Headers:
//   Authorization: Bearer <token>   (required — checked by requireAuth)
//
// Request body (JSON):
//   { html: '<full filled HTML string>', filename: 'AmeriDex-Quote-XXXX' }
//
// Response:
//   200  application/pdf  binary stream
//        Content-Disposition: attachment; filename="AmeriDex-Quote-XXXX.pdf"
//   400  { error: 'html is required' }
//   401  { error: 'Authentication required' }   (from requireAuth)
//   500  { error: 'PDF generation failed', detail: '...' }
// =============================================================
// ---- Security: body size limit for this route (500 KB) ----
const PDF_MAX_BODY = 500 * 1024; // 500 KB
const pdfBodyLimit = express.json({ limit: PDF_MAX_BODY });

// ---- Security: strip dangerous HTML tags (defense-in-depth) ----
function sanitizeHtml(raw) {
    // Remove <script>, <iframe>, <object>, <embed>, <link> tags and their content
    // (for void/self-closing tags like <embed> and <link>, just remove the tag)
    return raw
        .replace(/<script[\s>][\s\S]*?<\/script>/gi, '')
        .replace(/<iframe[\s>][\s\S]*?<\/iframe>/gi, '')
        .replace(/<object[\s>][\s\S]*?<\/object>/gi, '')
        .replace(/<embed[^>]*\/?>/gi, '')
        .replace(/<link[^>]*\/?>/gi, '');
}

router.post('/generate', requireAuth, pdfBodyLimit, async (req, res) => {
    const { html: rawHtml, filename } = req.body;

    if (!rawHtml || typeof rawHtml !== 'string' || !rawHtml.trim()) {
        return res.status(400).json({ error: 'html is required' });
    }

    const html = sanitizeHtml(rawHtml);

    const safeFilename = (filename || 'AmeriDex-Quote')
        .replace(/[^a-zA-Z0-9-_]/g, '-')
        .slice(0, 100);

    let browser = null;

    try {
        const { puppeteer: pptr, chromium: chrom } = getPuppeteer();

        // @sparticuz/chromium provides a Render/Lambda-compatible binary.
        // In local dev, PUPPETEER_EXECUTABLE_PATH can override to a local Chrome.
        const executablePath =
            process.env.PUPPETEER_EXECUTABLE_PATH ||
            (await chrom.executablePath());

        browser = await pptr.launch({
            args: [
                ...chrom.args,
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ],
            defaultViewport: chrom.defaultViewport,
            executablePath,
            headless: true
        });

        const page = await browser.newPage();

        // ---- Security: block all outbound network requests (SSRF mitigation) ----
        await page.setRequestInterception(true);
        page.on('request', (interceptedRequest) => {
            const url = interceptedRequest.url();
            // Allow data: URIs (e.g. base64-inlined images) and about:blank
            if (url.startsWith('data:') || url === 'about:blank') {
                interceptedRequest.continue();
            } else {
                interceptedRequest.abort('blockedbyclient');
            }
        });

        // Set the HTML content directly — no network round-trip needed.
        // The HTML is already fully filled (logo inlined as base64,
        // all placeholders replaced) by the client before sending.
        // Using 'domcontentloaded' since outbound requests are blocked.
        await page.setContent(html, { waitUntil: 'domcontentloaded' });

        const pdfBuffer = await page.pdf({
            format: 'Letter',
            printBackground: true,
            margin: {
                top:    '0.5in',
                bottom: '0.5in',
                left:   '0.5in',
                right:  '0.5in'
            }
        });

        await browser.close();
        browser = null;

        res.set({
            'Content-Type':        'application/pdf',
            'Content-Disposition': `attachment; filename="${safeFilename}.pdf"`,
            'Content-Length':      pdfBuffer.length,
            'Cache-Control':       'no-store'
        });

        return res.send(pdfBuffer);

    } catch (err) {
        console.error('[PDF Route] Generation failed:', err);
        if (browser) {
            try { await browser.close(); } catch (_) {}
        }
        return res.status(500).json({
            error:  'PDF generation failed',
            detail: err.message
        });
    }
});

module.exports = router;
