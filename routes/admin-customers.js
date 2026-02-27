// ============================================================
// routes/admin-customers.js - Admin Customer Management v3.0
// Date: 2026-02-27
// ============================================================
// Soft delete with undo for customers. Only admin/gm can access.
// Deleting a customer cascade-soft-deletes their quotes.
//
// Endpoints:
//   GET    /api/admin/customers              - List active customers
//   GET    /api/admin/customers/deleted       - List soft-deleted customers
//   PUT    /api/admin/customers/:id          - Update a customer
//   DELETE /api/admin/customers/:id          - Soft delete customer + quotes
//   POST   /api/admin/customers/:id/restore  - Undo / restore customer + quotes
//   DELETE /api/admin/customers/:id/permanent - Permanently remove (admin only)
//   GET    /api/admin/customers/:id/quotes   - Get quotes for a customer
// ============================================================

const express = require('express');
const router = express.Router();
const { readJSON, writeJSON, CUSTOMERS_FILE, QUOTES_FILE } = require('../lib/helpers');
const { requireAuth, requireRole, requireAdmin } = require('../middleware/auth');

// All routes require authenticated admin or gm
router.use(requireAuth, requireRole('admin', 'gm'));

// -----------------------------------------------------------
// GET /api/admin/customers - List active (non-deleted) customers
// -----------------------------------------------------------
router.get('/', (req, res) => {
    const customers = readJSON(CUSTOMERS_FILE);
    res.json(customers.filter(c => !c.deleted));
});

// -----------------------------------------------------------
// GET /api/admin/customers/deleted - List soft-deleted customers
// -----------------------------------------------------------
router.get('/deleted', (req, res) => {
    const customers = readJSON(CUSTOMERS_FILE);
    const deleted = customers.filter(c => c.deleted === true);
    deleted.sort((a, b) => new Date(b.deletedAt || 0) - new Date(a.deletedAt || 0));
    res.json(deleted);
});

// -----------------------------------------------------------
// PUT /api/admin/customers/:id - Update a customer
// -----------------------------------------------------------
router.put('/:id', (req, res) => {
    const customers = readJSON(CUSTOMERS_FILE);
    const idx = customers.findIndex(c => c.id === req.params.id && !c.deleted);
    if (idx === -1) {
        return res.status(404).json({ error: 'Customer not found' });
    }

    const allowed = ['name', 'email', 'company', 'phone', 'zipCode', 'notes', 'dealers'];
    allowed.forEach(field => {
        if (req.body[field] !== undefined) {
            customers[idx][field] = field === 'email'
                ? req.body[field].toLowerCase().trim()
                : req.body[field];
        }
    });
    customers[idx].updatedAt = new Date().toISOString();

    writeJSON(CUSTOMERS_FILE, customers);
    console.log('[Admin] Customer updated: ' + customers[idx].name + ' by ' + req.user.username);
    res.json(customers[idx]);
});

// -----------------------------------------------------------
// DELETE /api/admin/customers/:id - Soft delete customer + cascade quotes
// -----------------------------------------------------------
router.delete('/:id', (req, res) => {
    const customers = readJSON(CUSTOMERS_FILE);
    const idx = customers.findIndex(c => c.id === req.params.id && !c.deleted);
    if (idx === -1) {
        return res.status(404).json({ error: 'Customer not found' });
    }

    const now = new Date().toISOString();
    const customerId = customers[idx].id;
    const customerName = customers[idx].name;

    // Soft delete the customer
    customers[idx].deleted = true;
    customers[idx].deletedAt = now;
    customers[idx].deletedBy = req.user.username;
    customers[idx].deletedByRole = req.user.role;
    writeJSON(CUSTOMERS_FILE, customers);

    // Cascade: soft delete all quotes for this customer
    const quotes = readJSON(QUOTES_FILE);
    let cascadeCount = 0;
    quotes.forEach(q => {
        if (q.customerId === customerId && !q.deleted) {
            q.deleted = true;
            q.deletedAt = now;
            q.deletedBy = req.user.username;
            q.deletedByRole = req.user.role;
            q.deletedReason = 'cascade:customer:' + customerId;
            cascadeCount++;
        }
    });
    if (cascadeCount > 0) {
        writeJSON(QUOTES_FILE, quotes);
    }

    console.log('[Admin] Customer soft-deleted: ' + customerName + ' by ' + req.user.username + ' (' + req.user.role + ') | Cascade quotes: ' + cascadeCount);
    res.json({
        message: 'Customer deleted',
        customerName: customerName,
        id: customerId,
        quotesDeleted: cascadeCount,
        canUndo: true
    });
});

// -----------------------------------------------------------
// POST /api/admin/customers/:id/restore - Undo / restore customer + quotes
// -----------------------------------------------------------
router.post('/:id/restore', (req, res) => {
    const customers = readJSON(CUSTOMERS_FILE);
    const idx = customers.findIndex(c => c.id === req.params.id && c.deleted === true);
    if (idx === -1) {
        return res.status(404).json({ error: 'Deleted customer not found' });
    }

    const customerId = customers[idx].id;

    // Restore the customer
    delete customers[idx].deleted;
    delete customers[idx].deletedAt;
    delete customers[idx].deletedBy;
    delete customers[idx].deletedByRole;
    customers[idx].restoredAt = new Date().toISOString();
    customers[idx].restoredBy = req.user.username;
    customers[idx].updatedAt = new Date().toISOString();
    writeJSON(CUSTOMERS_FILE, customers);

    // Restore cascade-deleted quotes for this customer
    const quotes = readJSON(QUOTES_FILE);
    let restoredQuotes = 0;
    quotes.forEach(q => {
        if (q.deletedReason === 'cascade:customer:' + customerId && q.deleted === true) {
            delete q.deleted;
            delete q.deletedAt;
            delete q.deletedBy;
            delete q.deletedByRole;
            delete q.deletedReason;
            q.restoredAt = new Date().toISOString();
            q.restoredBy = req.user.username;
            q.updatedAt = new Date().toISOString();
            restoredQuotes++;
        }
    });
    if (restoredQuotes > 0) {
        writeJSON(QUOTES_FILE, quotes);
    }

    console.log('[Admin] Customer restored: ' + customers[idx].name + ' by ' + req.user.username + ' | Cascade restored quotes: ' + restoredQuotes);
    res.json({
        message: 'Customer restored',
        customer: customers[idx],
        quotesRestored: restoredQuotes
    });
});

// -----------------------------------------------------------
// DELETE /api/admin/customers/:id/permanent - Permanently remove
// Only admin can permanently delete (extra safety)
// -----------------------------------------------------------
router.delete('/:id/permanent', requireAdmin, (req, res) => {
    const customers = readJSON(CUSTOMERS_FILE);
    const idx = customers.findIndex(c => c.id === req.params.id);
    if (idx === -1) {
        return res.status(404).json({ error: 'Customer not found' });
    }

    const removed = customers.splice(idx, 1)[0];
    writeJSON(CUSTOMERS_FILE, customers);

    // Also permanently remove cascade-deleted quotes
    const quotes = readJSON(QUOTES_FILE);
    const beforeCount = quotes.length;
    const remaining = quotes.filter(q => q.customerId !== removed.id);
    if (remaining.length < beforeCount) {
        writeJSON(QUOTES_FILE, remaining);
    }

    console.log('[Admin] Customer PERMANENTLY deleted: ' + removed.name + ' by ' + req.user.username);
    res.json({
        message: 'Customer permanently deleted',
        customerName: removed.name,
        id: removed.id,
        quotesRemoved: beforeCount - remaining.length
    });
});

// -----------------------------------------------------------
// GET /api/admin/customers/:id/quotes - Get quotes for a customer
// -----------------------------------------------------------
router.get('/:id/quotes', (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const customerQuotes = quotes.filter(q => q.customerId === req.params.id && !q.deleted);
    res.json(customerQuotes);
});

module.exports = router;
