const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { readJSON, writeJSON, CUSTOMERS_FILE, QUOTES_FILE } = require('../lib/helpers');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/customers
router.get('/', (req, res) => {
    const customers = readJSON(CUSTOMERS_FILE);
    const dealerCode = req.user.dealerCode;
    const userRole = req.user.role;

    let filtered;

    // Frontdesk: only see customers whose dealers[] includes their dealerCode
    if (userRole === 'frontdesk') {
        filtered = customers.filter(c =>
            c.dealers && c.dealers.includes(dealerCode)
        );
    } else {
        // GM and Admin: see all customers across all dealers
        filtered = customers;
    }

    res.json(filtered);
});

// GET /api/customers/search?q=...
router.get('/search', (req, res) => {
    const q = (req.query.q || '').toLowerCase().trim();
    if (q.length < 2) {
        return res.json([]);
    }

    const customers = readJSON(CUSTOMERS_FILE);
    const dealerCode = req.user.dealerCode;
    const userRole = req.user.role;

    let searchPool;

    // Frontdesk: only search within their dealer's customers
    if (userRole === 'frontdesk') {
        searchPool = customers.filter(c =>
            c.dealers && c.dealers.includes(dealerCode)
        );
    } else {
        // GM and Admin: search across all customers
        searchPool = customers;
    }

    const results = searchPool
        .filter(c => {
            return (c.name || '').toLowerCase().includes(q)
                || (c.email || '').toLowerCase().includes(q)
                || (c.company || '').toLowerCase().includes(q)
                || (c.phone || '').includes(q);
        })
        .slice(0, 15)
        .map(c => ({
            id: c.id,
            name: c.name,
            email: c.email,
            company: c.company,
            phone: c.phone,
            zipCode: c.zipCode,
            isMyCustomer: c.dealers && c.dealers.includes(dealerCode),
            quoteCount: c.quoteCount || 0
        }));

    res.json(results);
});

// POST /api/customers
router.post('/', (req, res) => {
    const { name, email, company, phone, zipCode } = req.body;

    if (!email || !name) {
        return res.status(400).json({ error: 'Name and email are required' });
    }

    const customers = readJSON(CUSTOMERS_FILE);
    const dealerCode = req.user.dealerCode;
    const normalizedEmail = email.toLowerCase().trim();

    let existing = customers.find(c => c.email.toLowerCase() === normalizedEmail);

    if (existing) {
        if (name) existing.name = name;
        if (company !== undefined) existing.company = company;
        if (phone !== undefined) existing.phone = phone;
        if (zipCode !== undefined) existing.zipCode = zipCode;
        if (!existing.dealers) existing.dealers = [];
        if (!existing.dealers.includes(dealerCode)) {
            existing.dealers.push(dealerCode);
        }
        existing.updatedAt = new Date().toISOString();
        existing.lastContact = new Date().toISOString();

        writeJSON(CUSTOMERS_FILE, customers);
        return res.json(existing);
    }

    const newCustomer = {
        id: crypto.randomUUID(),
        name: name,
        email: normalizedEmail,
        company: company || '',
        phone: phone || '',
        zipCode: zipCode || '',
        dealers: [dealerCode],
        quoteCount: 0,
        totalValue: 0,
        firstContact: new Date().toISOString(),
        lastContact: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        notes: ''
    };

    customers.push(newCustomer);
    writeJSON(CUSTOMERS_FILE, customers);

    console.log('[CustomerDB] New customer: ' + name + ' (' + normalizedEmail + ') by ' + dealerCode);
    res.status(201).json(newCustomer);
});

// PUT /api/customers/:id
router.put('/:id', (req, res) => {
    const customers = readJSON(CUSTOMERS_FILE);
    const idx = customers.findIndex(c => c.id === req.params.id);
    if (idx === -1) {
        return res.status(404).json({ error: 'Customer not found' });
    }

    const allowed = ['name', 'email', 'company', 'phone', 'zipCode'];
    allowed.forEach(field => {
        if (req.body[field] !== undefined) {
            customers[idx][field] = field === 'email'
                ? req.body[field].toLowerCase().trim()
                : req.body[field];
        }
    });
    customers[idx].updatedAt = new Date().toISOString();

    writeJSON(CUSTOMERS_FILE, customers);
    res.json(customers[idx]);
});

module.exports = router;
