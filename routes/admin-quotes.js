// ============================================================
// routes/admin-quotes.js - Admin Quote Management v3.1
// Date: 2026-02-27
// ============================================================
// Soft delete with undo for quotes. Only admin/gm can access.
// GM is scoped to their own dealer code for delete/restore.
// Admin has unrestricted access across all dealers.
//
// Endpoints:
//   GET    /api/admin/quotes              - List active quotes
//   GET    /api/admin/quotes/deleted       - List soft-deleted quotes
//   GET    /api/admin/quotes/export        - Export quotes as CSV
//   PUT    /api/admin/quotes/:id/status    - Update quote status
//   DELETE /api/admin/quotes/:id           - Soft delete a quote
//   POST   /api/admin/quotes/:id/restore  - Undo / restore a quote
//   DELETE /api/admin/quotes/:id/permanent - Permanently remove (admin only)
// ============================================================

const express = require('express');
const router = express.Router();
const { readJSON, writeJSON, QUOTES_FILE } = require('../lib/helpers');
const { requireAuth, requireRole, requireAdmin } = require('../middleware/auth');

// All routes require authenticated admin or gm
router.use(requireAuth, requireRole('admin', 'gm'));

// -----------------------------------------------------------
// HELPER: Check if GM owns this quote (by dealer code)
// Admin always passes. GM must match dealerCode.
// -----------------------------------------------------------
function gmOwnsQuote(user, quote) {
    if (user.role === 'admin') return true;
    // GM: quote must belong to their dealer
    return quote.dealerCode &&
           quote.dealerCode.toUpperCase() === user.dealerCode.toUpperCase();
}

// -----------------------------------------------------------
// GET /api/admin/quotes - List active (non-deleted) quotes
// -----------------------------------------------------------
router.get('/', (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const { dealerCode, status, from, to } = req.query;
    // Filter out soft-deleted quotes
    let filtered = quotes.filter(q => !q.deleted);
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

// -----------------------------------------------------------
// GET /api/admin/quotes/deleted - List soft-deleted quotes
// GM only sees their dealer's deleted quotes.
// -----------------------------------------------------------
router.get('/deleted', (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    let deleted = quotes.filter(q => q.deleted === true);

    // Scope for GM: only their dealer's quotes
    if (req.user.role === 'gm') {
        const myCode = req.user.dealerCode.toUpperCase();
        deleted = deleted.filter(q => q.dealerCode && q.dealerCode.toUpperCase() === myCode);
    }

    deleted.sort((a, b) => new Date(b.deletedAt || 0) - new Date(a.deletedAt || 0));
    res.json(deleted);
});

// -----------------------------------------------------------
// GET /api/admin/quotes/export - CSV export (active only)
// -----------------------------------------------------------
router.get('/export', (req, res) => {
    const quotes = readJSON(QUOTES_FILE).filter(q => !q.deleted);
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

// -----------------------------------------------------------
// PUT /api/admin/quotes/:id/status - Update quote status
// -----------------------------------------------------------
router.put('/:id/status', (req, res) => {
    const { status } = req.body;
    const validStatuses = ['draft', 'submitted', 'reviewed', 'approved', 'revision'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status. Must be: ' + validStatuses.join(', ') });
    }
    const quotes = readJSON(QUOTES_FILE);
    const idx = quotes.findIndex(q => q.id === req.params.id && !q.deleted);
    if (idx === -1) return res.status(404).json({ error: 'Quote not found' });

    quotes[idx].status = status;
    quotes[idx].updatedAt = new Date().toISOString();
    if (status === 'approved') quotes[idx].approvedAt = new Date().toISOString();
    if (status === 'reviewed') quotes[idx].reviewedAt = new Date().toISOString();
    writeJSON(QUOTES_FILE, quotes);
    res.json(quotes[idx]);
});

// -----------------------------------------------------------
// DELETE /api/admin/quotes/:id - Soft delete a quote
// GM: only if quote belongs to their dealer code.
// -----------------------------------------------------------
router.delete('/:id', (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const idx = quotes.findIndex(q => q.id === req.params.id && !q.deleted);
    if (idx === -1) {
        return res.status(404).json({ error: 'Quote not found' });
    }

    // GM ownership check
    if (!gmOwnsQuote(req.user, quotes[idx])) {
        return res.status(403).json({
            error: 'Access denied. You can only delete quotes for your dealer (' + req.user.dealerCode + ')'
        });
    }

    quotes[idx].deleted = true;
    quotes[idx].deletedAt = new Date().toISOString();
    quotes[idx].deletedBy = req.user.username;
    quotes[idx].deletedByRole = req.user.role;
    writeJSON(QUOTES_FILE, quotes);

    console.log('[Admin] Quote soft-deleted: ' + (quotes[idx].quoteNumber || quotes[idx].id) + ' by ' + req.user.username + ' (' + req.user.role + ')');
    res.json({
        message: 'Quote deleted',
        quoteNumber: quotes[idx].quoteNumber || null,
        id: quotes[idx].id,
        canUndo: true
    });
});

// -----------------------------------------------------------
// POST /api/admin/quotes/:id/restore - Undo / restore a quote
// GM: only if quote belongs to their dealer code.
// -----------------------------------------------------------
router.post('/:id/restore', (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const idx = quotes.findIndex(q => q.id === req.params.id && q.deleted === true);
    if (idx === -1) {
        return res.status(404).json({ error: 'Deleted quote not found' });
    }

    // GM ownership check
    if (!gmOwnsQuote(req.user, quotes[idx])) {
        return res.status(403).json({
            error: 'Access denied. You can only restore quotes for your dealer (' + req.user.dealerCode + ')'
        });
    }

    delete quotes[idx].deleted;
    delete quotes[idx].deletedAt;
    delete quotes[idx].deletedBy;
    delete quotes[idx].deletedByRole;
    quotes[idx].restoredAt = new Date().toISOString();
    quotes[idx].restoredBy = req.user.username;
    quotes[idx].updatedAt = new Date().toISOString();
    writeJSON(QUOTES_FILE, quotes);

    console.log('[Admin] Quote restored: ' + (quotes[idx].quoteNumber || quotes[idx].id) + ' by ' + req.user.username);
    res.json({
        message: 'Quote restored',
        quote: quotes[idx]
    });
});

// -----------------------------------------------------------
// DELETE /api/admin/quotes/:id/permanent - Permanently remove
// Only admin can permanently delete (extra safety)
// -----------------------------------------------------------
router.delete('/:id/permanent', requireAdmin, (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const idx = quotes.findIndex(q => q.id === req.params.id);
    if (idx === -1) {
        return res.status(404).json({ error: 'Quote not found' });
    }

    const removed = quotes.splice(idx, 1)[0];
    writeJSON(QUOTES_FILE, quotes);

    console.log('[Admin] Quote PERMANENTLY deleted: ' + (removed.quoteNumber || removed.id) + ' by ' + req.user.username);
    res.json({
        message: 'Quote permanently deleted',
        quoteNumber: removed.quoteNumber || null,
        id: removed.id
    });
});

module.exports = router;
