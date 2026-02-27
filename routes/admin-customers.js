// ============================================================
// routes/admin-customers.js - Admin Customer Management v2.0
// Date: 2026-02-27
// ============================================================
// Provides admin/GM customer management including delete capability.
// Only users with 'admin' or 'gm' role can access these endpoints.
//
// Mounted at /api/admin/customers in server.js.
//
// Endpoints:
//   GET    /api/admin/customers              - List all customers
//   PUT    /api/admin/customers/:id          - Update a customer
//   DELETE /api/admin/customers/:id          - Delete a customer (admin/gm only)
//   GET    /api/admin/customers/:id/quotes   - Get quotes for a customer
// ============================================================

const express = require('express');
const router = express.Router();
const { readJSON, writeJSON, CUSTOMERS_FILE, QUOTES_FILE } = require('../lib/helpers');
const { requireAuth, requireRole } = require('../middleware/auth');

// All routes require authenticated admin or gm
router.use(requireAuth, requireRole('admin', 'gm'));

// GET /api/admin/customers
router.get('/', (req, res) => {
    const customers = readJSON(CUSTOMERS_FILE);
    res.json(customers);
});

// PUT /api/admin/customers/:id
router.put('/:id', (req, res) => {
    const customers = readJSON(CUSTOMERS_FILE);
    const idx = customers.findIndex(c => c.id === req.params.id);
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
// DELETE /api/admin/customers/:id - Delete a customer (admin/gm)
// Also removes all quotes associated with this customer.
// -----------------------------------------------------------
router.delete('/:id', (req, res) => {
    const customers = readJSON(CUSTOMERS_FILE);
    const idx = customers.findIndex(c => c.id === req.params.id);
    if (idx === -1) {
        return res.status(404).json({ error: 'Customer not found' });
    }

    const removed = customers.splice(idx, 1)[0];
    writeJSON(CUSTOMERS_FILE, customers);

    // Also clean up any quotes tied to this customer
    const quotes = readJSON(QUOTES_FILE);
    const beforeCount = quotes.length;
    const remaining = quotes.filter(q => q.customerId !== removed.id);
    if (remaining.length < beforeCount) {
        writeJSON(QUOTES_FILE, remaining);
        console.log('[Admin] Cascade deleted ' + (beforeCount - remaining.length) + ' quotes for customer: ' + removed.name);
    }

    console.log('[Admin] Customer deleted: ' + removed.name + ' by ' + req.user.username + ' (' + req.user.role + ')');
    res.json({
        message: 'Customer deleted',
        customerName: removed.name,
        id: removed.id,
        quotesRemoved: beforeCount - remaining.length
    });
});

// GET /api/admin/customers/:id/quotes
router.get('/:id/quotes', (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const customerQuotes = quotes.filter(q => q.customerId === req.params.id);
    res.json(customerQuotes);
});

module.exports = router;
