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
router.post('/generate', requireAuth, async (req, res) => {
    const { html, filename } = req.body;

    if (!html || typeof html !== 'string' || !html.trim()) {
        return res.status(400).json({ error: 'html is required' });
    }

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

        // Set the HTML content directly — no network round-trip needed.
        // The HTML is already fully filled (logo inlined as base64,
        // all placeholders replaced) by the client before sending.
        await page.setContent(html, { waitUntil: 'networkidle0' });

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
