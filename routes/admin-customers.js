// ============================================================
// routes/admin-customers.js - Admin Customer Management v3.3
// Date: 2026-02-28
// ============================================================
// Soft delete with undo for customers. Only admin/gm can access.
// GM is scoped to their own dealer code for delete/restore.
// Admin has unrestricted access across all dealers.
// Deleting a customer cascade-soft-deletes their quotes.
//
// v3.3 Changes (2026-02-28):
//   - FIX: Null-safe email handling in PUT /:id endpoint.
//     Email is now optional on the quote form. If a customer
//     has no email (null or empty string), the previous
//     .toLowerCase().trim() call would throw TypeError.
//     Now guarded with (value || '') before string methods.
//
// v3.2 Changes (2026-02-27):
//   - ADD: POST /api/admin/customers/recalc-all endpoint to
//     recalculate quoteCount and totalValue for ALL customers
//     from current (non-deleted) quote data. Admin only.
//   - FIX: Call recalcCustomerStats after cascade soft-delete,
//     cascade restore, and permanent delete so stats stay
//     accurate in real-time.
//   - Import recalcCustomerStats from shared lib/helpers.js.
//
// Endpoints:
//   GET    /api/admin/customers              - List active customers
//   GET    /api/admin/customers/deleted       - List soft-deleted customers
//   POST   /api/admin/customers/recalc-all   - Recalc all customer stats
//   PUT    /api/admin/customers/:id          - Update a customer
//   DELETE /api/admin/customers/:id          - Soft delete customer + quotes
//   POST   /api/admin/customers/:id/restore  - Undo / restore customer + quotes
//   DELETE /api/admin/customers/:id/permanent - Permanently remove (admin only)
//   GET    /api/admin/customers/:id/quotes   - Get quotes for a customer
// ============================================================

const express = require('express');
const router = express.Router();
const { readJSON, writeJSON, CUSTOMERS_FILE, QUOTES_FILE, recalcCustomerStats } = require('../lib/helpers');
const { requireAuth, requireRole, requireAdmin } = require('../middleware/auth');

// All routes require authenticated admin or gm
router.use(requireAuth, requireRole('admin', 'gm'));

// -----------------------------------------------------------
// HELPER: Check if GM owns this customer (by dealer code)
// Admin always passes. GM must have their dealerCode in the
// customer's dealers array or dealerCode field.
// -----------------------------------------------------------
function gmOwnsCustomer(user, customer) {
    if (user.role === 'admin') return true;

    const myCode = user.dealerCode.toUpperCase();

    // Check the dealers array (primary method)
    if (customer.dealers && Array.isArray(customer.dealers)) {
        return customer.dealers.some(d => d.toUpperCase() === myCode);
    }

    // Fallback: check single dealerCode field
    if (customer.dealerCode) {
        return customer.dealerCode.toUpperCase() === myCode;
    }

    // If customer has no dealer association, deny for GM
    return false;
}

// -----------------------------------------------------------
// GET /api/admin/customers - List active (non-deleted) customers
// -----------------------------------------------------------
router.get('/', (req, res) => {
    const customers = readJSON(CUSTOMERS_FILE);
    res.json(customers.filter(c => !c.deleted));
});

// -----------------------------------------------------------
// GET /api/admin/customers/deleted - List soft-deleted customers
// GM only sees their dealer's deleted customers.
// -----------------------------------------------------------
router.get('/deleted', (req, res) => {
    const customers = readJSON(CUSTOMERS_FILE);
    let deleted = customers.filter(c => c.deleted === true);

    // Scope for GM: only their dealer's customers
    if (req.user.role === 'gm') {
        deleted = deleted.filter(c => gmOwnsCustomer(req.user, c));
    }

    deleted.sort((a, b) => new Date(b.deletedAt || 0) - new Date(a.deletedAt || 0));
    res.json(deleted);
});

// -----------------------------------------------------------
// POST /api/admin/customers/recalc-all - Recalculate stats
// for every customer from current quote data. Admin only.
// MUST be defined before /:id routes to avoid param conflict.
// -----------------------------------------------------------
router.post('/recalc-all', requireAdmin, (req, res) => {
    const customers = readJSON(CUSTOMERS_FILE);
    const quotes = readJSON(QUOTES_FILE);

    // Build a map of customerId -> { count, total } from non-deleted quotes
    const statsMap = {};
    quotes.forEach(q => {
        if (q.deleted) return;
        const custId = q.customer && q.customer.customerId;
        if (!custId) return;
        if (!statsMap[custId]) {
            statsMap[custId] = { count: 0, total: 0 };
        }
        statsMap[custId].count += 1;
        statsMap[custId].total += (q.totalAmount || 0);
    });

    let updated = 0;
    const changes = [];

    customers.forEach(c => {
        if (c.deleted) return; // skip deleted customers

        const stats = statsMap[c.id] || { count: 0, total: 0 };
        const newCount = stats.count;
        const newTotal = Math.round(stats.total * 100) / 100;

        const oldCount = c.quoteCount || 0;
        const oldTotal = c.totalValue || 0;

        if (oldCount !== newCount || oldTotal !== newTotal) {
            changes.push({
                id: c.id,
                name: c.name,
                quoteCount: { was: oldCount, now: newCount },
                totalValue: { was: oldTotal, now: newTotal }
            });
            c.quoteCount = newCount;
            c.totalValue = newTotal;
            updated++;
        }
    });

    writeJSON(CUSTOMERS_FILE, customers);

    console.log('[Admin] Customer stats recalculated: ' + updated + ' of ' + customers.length + ' customers updated by ' + req.user.username);
    res.json({
        message: 'Customer stats recalculated',
        totalCustomers: customers.filter(c => !c.deleted).length,
        customersUpdated: updated,
        changes: changes
    });
});

// -----------------------------------------------------------
// PUT /api/admin/customers/:id - Update a customer
// Email can be null or empty string (email is optional).
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
                ? (req.body[field] || '').toLowerCase().trim()
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
// GM: only if customer belongs to their dealer code.
// Recalculates customer stats after cascade soft-delete.
// -----------------------------------------------------------
router.delete('/:id', (req, res) => {
    const customers = readJSON(CUSTOMERS_FILE);
    const idx = customers.findIndex(c => c.id === req.params.id && !c.deleted);
    if (idx === -1) {
        return res.status(404).json({ error: 'Customer not found' });
    }

    // GM ownership check
    if (!gmOwnsCustomer(req.user, customers[idx])) {
        return res.status(403).json({
            error: 'Access denied. You can only delete customers for your dealer (' + req.user.dealerCode + ')'
        });
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

    // Cascade: soft delete quotes for this customer
    // GM cascade only deletes quotes at their dealer; admin deletes all
    const quotes = readJSON(QUOTES_FILE);
    let cascadeCount = 0;
    quotes.forEach(q => {
        if (q.customerId === customerId && !q.deleted) {
            // For GM, only cascade-delete quotes that belong to their dealer
            if (req.user.role === 'gm') {
                if (!q.dealerCode || q.dealerCode.toUpperCase() !== req.user.dealerCode.toUpperCase()) {
                    return; // Skip quotes from other dealers
                }
            }
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

    // Recalculate customer stats (now 0 active quotes for this customer)
    recalcCustomerStats(customerId);

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
// GM: only if customer belongs to their dealer code.
// Recalculates customer stats after cascade restore.
// -----------------------------------------------------------
router.post('/:id/restore', (req, res) => {
    const customers = readJSON(CUSTOMERS_FILE);
    const idx = customers.findIndex(c => c.id === req.params.id && c.deleted === true);
    if (idx === -1) {
        return res.status(404).json({ error: 'Deleted customer not found' });
    }

    // GM ownership check
    if (!gmOwnsCustomer(req.user, customers[idx])) {
        return res.status(403).json({
            error: 'Access denied. You can only restore customers for your dealer (' + req.user.dealerCode + ')'
        });
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
    // GM only restores quotes at their dealer; admin restores all
    const quotes = readJSON(QUOTES_FILE);
    let restoredQuotes = 0;
    quotes.forEach(q => {
        if (q.deletedReason === 'cascade:customer:' + customerId && q.deleted === true) {
            // For GM, only restore quotes that belong to their dealer
            if (req.user.role === 'gm') {
                if (!q.dealerCode || q.dealerCode.toUpperCase() !== req.user.dealerCode.toUpperCase()) {
                    return; // Skip quotes from other dealers
                }
            }
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

    // Recalculate customer stats (restored quotes now count again)
    recalcCustomerStats(customerId);

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
