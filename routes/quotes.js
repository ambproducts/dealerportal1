const express = require('express');
const router = express.Router();
const { readJSON, writeJSON, QUOTES_FILE, TIERS_FILE, generateId } = require('../lib/helpers');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

function generateQuoteNumber() {
    const now = new Date();
    const y = now.getFullYear().toString().slice(-2);
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const r = Math.random().toString(36).substring(2, 6).toUpperCase();
    return 'Q' + y + m + d + '-' + r;
}

// GET /api/quotes
router.get('/', (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const mine = quotes.filter(q => q.dealerCode === req.user.dealerCode);
    mine.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
    res.json(mine);
});

// GET /api/quotes/:id
router.get('/:id', (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const quote = quotes.find(q => q.id === req.params.id && q.dealerCode === req.user.dealerCode);
    if (!quote) return res.status(404).json({ error: 'Quote not found' });
    res.json(quote);
});

// POST /api/quotes
router.post('/', (req, res) => {
    const { customer, lineItems, notes } = req.body;

    const tiers = readJSON(TIERS_FILE);
    const dealerTier = req.dealer.pricingTier || 'standard';
    const tier = tiers.find(t => t.slug === dealerTier) || { multiplier: 1.0 };

    const items = (lineItems || []).map(item => {
        const price = parseFloat(item.price) || 0;
        const qty = parseInt(item.quantity) || 1;
        return {
            productId: item.productId || '',
            productName: item.productName || '',
            quantity: qty,
            price: price,
            total: Math.round(price * qty * 100) / 100
        };
    });

    const totalAmount = items.reduce((sum, i) => sum + i.total, 0);

    const newQuote = {
        id: generateId(),
        quoteNumber: generateQuoteNumber(),
        dealerCode: req.user.dealerCode,
        createdBy: req.user.username,
        customer: customer || {},
        lineItems: items,
        notes: notes || '',
        pricingTier: dealerTier,
        tierMultiplier: tier.multiplier,
        totalAmount: Math.round(totalAmount * 100) / 100,
        status: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        submittedAt: null,
        reviewedAt: null,
        approvedAt: null
    };

    const quotes = readJSON(QUOTES_FILE);
    quotes.push(newQuote);
    writeJSON(QUOTES_FILE, quotes);

    console.log('[Quotes] Created: ' + newQuote.quoteNumber + ' by ' + req.user.username + ' (' + req.user.dealerCode + ')');
    res.status(201).json(newQuote);
});

// PUT /api/quotes/:id
router.put('/:id', (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const idx = quotes.findIndex(q => q.id === req.params.id && q.dealerCode === req.user.dealerCode);
    if (idx === -1) return res.status(404).json({ error: 'Quote not found' });

    if (quotes[idx].status !== 'draft' && quotes[idx].status !== 'revision') {
        return res.status(400).json({ error: 'Only draft or revision quotes can be edited' });
    }

    const { customer, lineItems, notes } = req.body;
    if (customer) quotes[idx].customer = customer;
    if (notes !== undefined) quotes[idx].notes = notes;

    if (lineItems) {
        quotes[idx].lineItems = lineItems.map(item => {
            const price = parseFloat(item.price) || 0;
            const qty = parseInt(item.quantity) || 1;
            return {
                productId: item.productId || '',
                productName: item.productName || '',
                quantity: qty,
                price: price,
                total: Math.round(price * qty * 100) / 100
            };
        });
        quotes[idx].totalAmount = quotes[idx].lineItems.reduce((sum, i) => sum + i.total, 0);
        quotes[idx].totalAmount = Math.round(quotes[idx].totalAmount * 100) / 100;
    }

    quotes[idx].updatedAt = new Date().toISOString();
    writeJSON(QUOTES_FILE, quotes);
    res.json(quotes[idx]);
});

// POST /api/quotes/:id/submit
router.post('/:id/submit', (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const idx = quotes.findIndex(q => q.id === req.params.id && q.dealerCode === req.user.dealerCode);
    if (idx === -1) return res.status(404).json({ error: 'Quote not found' });

    if (quotes[idx].status !== 'draft' && quotes[idx].status !== 'revision') {
        return res.status(400).json({ error: 'Only draft or revision quotes can be submitted' });
    }
    if (!quotes[idx].lineItems || quotes[idx].lineItems.length === 0) {
        return res.status(400).json({ error: 'Cannot submit a quote with no line items' });
    }

    quotes[idx].status = 'submitted';
    quotes[idx].submittedAt = new Date().toISOString();
    quotes[idx].updatedAt = new Date().toISOString();
    writeJSON(QUOTES_FILE, quotes);

    console.log('[Quotes] Submitted: ' + quotes[idx].quoteNumber + ' by ' + req.user.username);
    res.json(quotes[idx]);
});

// DELETE /api/quotes/:id
router.delete('/:id', (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const idx = quotes.findIndex(q => q.id === req.params.id && q.dealerCode === req.user.dealerCode);
    if (idx === -1) return res.status(404).json({ error: 'Quote not found' });

    if (quotes[idx].status !== 'draft') {
        return res.status(400).json({ error: 'Only draft quotes can be deleted' });
    }

    const removed = quotes.splice(idx, 1)[0];
    writeJSON(QUOTES_FILE, quotes);
    res.json({ message: 'Quote ' + removed.quoteNumber + ' deleted' });
});

// POST /api/quotes/:id/duplicate
router.post('/:id/duplicate', (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const original = quotes.find(q => q.id === req.params.id && q.dealerCode === req.user.dealerCode);
    if (!original) return res.status(404).json({ error: 'Quote not found' });

    const dup = JSON.parse(JSON.stringify(original));
    dup.id = generateId();
    dup.quoteNumber = generateQuoteNumber();
    dup.status = 'draft';
    dup.createdBy = req.user.username;
    dup.createdAt = new Date().toISOString();
    dup.updatedAt = new Date().toISOString();
    dup.submittedAt = null;
    dup.reviewedAt = null;
    dup.approvedAt = null;

    quotes.push(dup);
    writeJSON(QUOTES_FILE, quotes);

    console.log('[Quotes] Duplicated: ' + original.quoteNumber + ' -> ' + dup.quoteNumber);
    res.status(201).json(dup);
});

module.exports = router;
