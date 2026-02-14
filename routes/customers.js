// ============================================================
// AmeriDex Dealer Portal - Customer API Routes
// File: routes/customers.js
// Date: 2026-02-13
// ============================================================
// Express router for customer CRUD + search.
//
// Permission model:
//   - Dealers see ONLY their own customers (filtered by dealerCode)
//   - Admins see ALL customers across all dealers
//
// Expects:
//   - req.user.role  = 'dealer' | 'admin'
//   - req.user.dealerCode = e.g. 'ABC123' (set by auth middleware)
//   - A Customer model (Mongoose-style, see schema at bottom)
//
// Mount: app.use('/api/customers', require('./routes/customers'))
// ============================================================

const express = require('express');
const router = express.Router();
const Customer = require('../models/Customer');
const { authenticateToken } = require('../middleware/auth');

// All routes require authentication
router.use(authenticateToken);

// -------------------------------------------------------
// HELPER: build the base query filter
// -------------------------------------------------------
// Dealers only see customers tagged with their dealerCode.
// Admins see everything (no dealerCode filter).
// If a dealerCode query param is passed by an admin, it acts
// as an optional narrowing filter (for the admin Customers tab
// dealer dropdown).
// -------------------------------------------------------
function buildBaseFilter(req) {
    const filter = {};

    if (req.user.role === 'admin') {
        // Admin can optionally filter by dealer
        if (req.query.dealerCode) {
            filter.dealers = req.query.dealerCode.toUpperCase();
        }
    } else {
        // Dealers are ALWAYS scoped to their own code
        filter.dealers = req.user.dealerCode;
    }

    return filter;
}

// -------------------------------------------------------
// GET /api/customers
// List customers (paginated)
//   Query params: dealerCode, page, limit
//   Dealer: returns only their customers
//   Admin:  returns all (optionally filtered by dealerCode)
// -------------------------------------------------------
router.get('/', async (req, res) => {
    try {
        const filter = buildBaseFilter(req);
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
        const skip = (page - 1) * limit;

        const [customers, total] = await Promise.all([
            Customer.find(filter)
                .sort({ updatedAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Customer.countDocuments(filter)
        ]);

        res.json({
            customers,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        console.error('[customers] GET / error:', err.message);
        res.status(500).json({ error: 'Failed to retrieve customers' });
    }
});

// -------------------------------------------------------
// GET /api/customers/search
// Autocomplete search
//   Query params: q (required), dealerCode, limit
//   Dealer: searches only their customers
//   Admin:  searches all (optionally filtered by dealerCode)
// -------------------------------------------------------
router.get('/search', async (req, res) => {
    try {
        const query = (req.query.q || '').trim();
        if (query.length < 2) {
            return res.json({ customers: [] });
        }

        const filter = buildBaseFilter(req);
        const limit = Math.min(20, Math.max(1, parseInt(req.query.limit) || 7));

        // Build text search across name, email, company, phone, zipCode
        const searchRegex = new RegExp(escapeRegex(query), 'i');
        filter.$or = [
            { name: searchRegex },
            { email: searchRegex },
            { company: searchRegex },
            { phone: searchRegex },
            { zipCode: searchRegex }
        ];

        const customers = await Customer.find(filter)
            .sort({ updatedAt: -1 })
            .limit(limit)
            .lean();

        res.json({ customers });
    } catch (err) {
        console.error('[customers] GET /search error:', err.message);
        res.status(500).json({ error: 'Search failed' });
    }
});

// -------------------------------------------------------
// GET /api/customers/:id
// Get single customer
//   Dealer: only if customer belongs to them
//   Admin:  any customer
// -------------------------------------------------------
router.get('/:id', async (req, res) => {
    try {
        const customer = await Customer.findById(req.params.id).lean();

        if (!customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        // Dealer can only view their own customers
        if (req.user.role !== 'admin') {
            if (!customer.dealers || !customer.dealers.includes(req.user.dealerCode)) {
                return res.status(403).json({ error: 'Access denied' });
            }
        }

        res.json(customer);
    } catch (err) {
        console.error('[customers] GET /:id error:', err.message);
        res.status(500).json({ error: 'Failed to retrieve customer' });
    }
});

// -------------------------------------------------------
// POST /api/customers
// Create or upsert a customer
//   Body: { name, email, company, phone, zipCode, dealerCode }
//
//   Upsert logic: if a customer with the same email already
//   exists for this dealer, update their info instead of
//   creating a duplicate. If the customer exists under a
//   DIFFERENT dealer, create a separate record (Option A
//   isolation). Admins bypass isolation.
// -------------------------------------------------------
router.post('/', async (req, res) => {
    try {
        const { name, email, company, phone, zipCode, dealerCode, notes } = req.body;

        if (!email || !email.trim()) {
            return res.status(400).json({ error: 'Email is required' });
        }
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Name is required' });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const effectiveDealerCode = req.user.role === 'admin'
            ? (dealerCode || req.query.dealerCode || '').toUpperCase()
            : req.user.dealerCode;

        if (!effectiveDealerCode) {
            return res.status(400).json({ error: 'Dealer code is required' });
        }

        // Check for existing customer with same email under this dealer
        const existing = await Customer.findOne({
            email: normalizedEmail,
            dealers: effectiveDealerCode
        });

        if (existing) {
            // Upsert: update the existing record
            existing.name = name.trim();
            if (company !== undefined) existing.company = company.trim();
            if (phone !== undefined) existing.phone = phone.trim();
            if (zipCode !== undefined) existing.zipCode = zipCode.trim();
            if (notes !== undefined) existing.notes = notes;
            existing.lastContact = new Date();
            existing.updatedAt = new Date();

            await existing.save();
            return res.json(existing.toObject());
        }

        // Create new customer
        const customer = new Customer({
            name: name.trim(),
            email: normalizedEmail,
            company: (company || '').trim(),
            phone: (phone || '').trim(),
            zipCode: (zipCode || '').trim(),
            notes: notes || '',
            dealers: [effectiveDealerCode],
            firstContact: new Date(),
            lastContact: new Date()
        });

        await customer.save();
        res.status(201).json(customer.toObject());
    } catch (err) {
        // Handle duplicate key errors gracefully
        if (err.code === 11000) {
            return res.status(409).json({ error: 'Customer with this email already exists' });
        }
        console.error('[customers] POST / error:', err.message);
        res.status(500).json({ error: 'Failed to create customer' });
    }
});

// -------------------------------------------------------
// PUT /api/customers/:id
// Update a customer
//   Dealer: only if customer belongs to them
//   Admin:  any customer, plus can modify dealers[] array
// -------------------------------------------------------
router.put('/:id', async (req, res) => {
    try {
        const customer = await Customer.findById(req.params.id);

        if (!customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        // Dealer can only edit their own customers
        if (req.user.role !== 'admin') {
            if (!customer.dealers || !customer.dealers.includes(req.user.dealerCode)) {
                return res.status(403).json({ error: 'Access denied' });
            }
        }

        // Allowed fields for dealers
        const { name, email, company, phone, zipCode, notes } = req.body;

        if (name !== undefined) customer.name = name.trim();
        if (email !== undefined) customer.email = email.trim().toLowerCase();
        if (company !== undefined) customer.company = company.trim();
        if (phone !== undefined) customer.phone = phone.trim();
        if (zipCode !== undefined) customer.zipCode = zipCode.trim();
        if (notes !== undefined) customer.notes = notes;
        customer.lastContact = new Date();
        customer.updatedAt = new Date();

        // Admin-only: modify the dealers array
        if (req.user.role === 'admin') {
            const { dealers } = req.body;
            if (Array.isArray(dealers)) {
                customer.dealers = dealers.map(d => d.toUpperCase());
            }
        }

        await customer.save();
        res.json(customer.toObject());
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ error: 'Another customer with this email already exists' });
        }
        console.error('[customers] PUT /:id error:', err.message);
        res.status(500).json({ error: 'Failed to update customer' });
    }
});

// -------------------------------------------------------
// DELETE /api/customers/:id
// Admin only
// -------------------------------------------------------
router.delete('/:id', async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const customer = await Customer.findByIdAndDelete(req.params.id);
        if (!customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        res.json({ message: 'Customer deleted', id: req.params.id });
    } catch (err) {
        console.error('[customers] DELETE /:id error:', err.message);
        res.status(500).json({ error: 'Failed to delete customer' });
    }
});

// -------------------------------------------------------
// UTILITY
// -------------------------------------------------------
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = router;
