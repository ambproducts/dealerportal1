const express = require('express');
const router = express.Router();
const { readJSON, writeJSON, CUSTOMERS_FILE, QUOTES_FILE } = require('../lib/helpers');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.use(requireAuth, requireAdmin);

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
    console.log('[Admin] Customer updated: ' + customers[idx].name);
    res.json(customers[idx]);
});

// DELETE /api/admin/customers/:id
router.delete('/:id', (req, res) => {
    const customers = readJSON(CUSTOMERS_FILE);
    const idx = customers.findIndex(c => c.id === req.params.id);
    if (idx === -1) {
        return res.status(404).json({ error: 'Customer not found' });
    }

    const removed = customers.splice(idx, 1)[0];
    writeJSON(CUSTOMERS_FILE, customers);
    console.log('[Admin] Customer deleted: ' + removed.name);
    res.json({ message: 'Customer deleted' });
});

// GET /api/admin/customers/:id/quotes
router.get('/:id/quotes', (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const customerQuotes = quotes.filter(q => q.customerId === req.params.id);
    res.json(customerQuotes);
});

module.exports = router;
