const express = require('express');
const router = express.Router();
const { readJSON, writeJSON, QUOTES_FILE } = require('../lib/helpers');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.use(requireAuth, requireAdmin);

// GET /api/admin/quotes
router.get('/', (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const { dealerCode, status, from, to } = req.query;
    let filtered = quotes;
    if (dealerCode) {
        filtered = filtered.filter(q => q.dealerCode === dealerCode.toUpperCase());
    }
    if (status) {
        filtered = filtered.filter(q => q.status === status);
    }
    if (from) {
        filtered = filtered.filter(q => new Date(q.createdAt) >= new Date(from));
    }
    if (to) {
        filtered = filtered.filter(q => new Date(q.createdAt) <= new Date(to + 'T23:59:59'));
    }
    filtered.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
    res.json(filtered);
});

// PUT /api/admin/quotes/:id/status
router.put('/:id/status', (req, res) => {
    const { status } = req.body;
    const validStatuses = ['draft', 'submitted', 'reviewed', 'approved', 'revision'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status. Must be: ' + validStatuses.join(', ') });
    }
    const quotes = readJSON(QUOTES_FILE);
    const idx = quotes.findIndex(q => q.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Quote not found' });

    quotes[idx].status = status;
    quotes[idx].updatedAt = new Date().toISOString();
    if (status === 'approved') quotes[idx].approvedAt = new Date().toISOString();
    if (status === 'reviewed') quotes[idx].reviewedAt = new Date().toISOString();
    writeJSON(QUOTES_FILE, quotes);
    res.json(quotes[idx]);
});

// GET /api/admin/quotes/export
router.get('/export', (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const headers = ['Quote Number', 'Dealer Code', 'Status', 'Customer Name',
                     'Customer Email', 'Customer Zip', 'Total Amount',
                     'Created', 'Submitted', 'Line Item Count'];
    const rows = quotes.map(q => [
        q.quoteNumber || '',
        q.dealerCode || '',
        q.status || '',
        (q.customer && q.customer.name) || '',
        (q.customer && q.customer.email) || '',
        (q.customer && q.customer.zipCode) || '',
        q.totalAmount || 0,
        q.createdAt || '',
        q.submittedAt || '',
        (q.lineItems && q.lineItems.length) || 0
    ]);

    const csvContent = [headers.join(',')]
        .concat(rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')))
        .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="ameridex-quotes-export.csv"');
    res.send(csvContent);
});

module.exports = router;
