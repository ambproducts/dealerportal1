const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { readJSON, writeJSON, CUSTOMERS_FILE, QUOTES_FILE } = require('../lib/helpers');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// =============================================================
// GET /api/customers
// Supports pagination, filtering, and search.
//
// Query params:
//   page       (int, default: none = legacy mode returns raw array)
//   limit      (int, default 20, max 100)
//   sort       (string, default '-lastContact', prefix '-' for desc)
//   search     (string, fuzzy match on name/email/company/phone/zip)
//   hasQuotes  ('true' to only return customers with quoteCount >= 1)
//
// Backward compatible: If 'page' is NOT provided, returns the
// raw array exactly as before so existing code continues to work.
//
// Paginated response shape:
//   {
//     customers: [ ... ],
//     pagination: { page, limit, totalCount, totalPages, hasNext, hasPrev }
//   }
// =============================================================
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

    // --- SEARCH ---
    const search = (req.query.search || '').trim().toLowerCase();
    if (search) {
        filtered = filtered.filter(c => {
            const hay = [
                c.name || '',
                c.email || '',
                c.company || '',
                c.phone || '',
                c.zipCode || ''
            ].join(' ').toLowerCase();
            return hay.includes(search);
        });
    }

    // --- HAS QUOTES FILTER ---
    if (req.query.hasQuotes === 'true') {
        filtered = filtered.filter(c => (c.quoteCount || 0) >= 1);
    }

    // --- ENRICH: Add lastQuoteDate from quotes data ---
    // Only do this for paginated requests to avoid perf hit on legacy calls
    if (req.query.page) {
        const quotes = readJSON(QUOTES_FILE);

        // Build a lookup: customerId -> most recent quote date
        const lastQuoteDateMap = {};
        quotes.forEach(q => {
            if (!q.customer || !q.customer.customerId) return;
            const cid = q.customer.customerId;
            const qDate = q.updatedAt || q.createdAt;
            if (!lastQuoteDateMap[cid] || qDate > lastQuoteDateMap[cid]) {
                lastQuoteDateMap[cid] = qDate;
            }
        });

        filtered = filtered.map(c => {
            const enriched = Object.assign({}, c);
            enriched.lastQuoteDate = lastQuoteDateMap[c.id] || null;
            return enriched;
        });
    }

    // --- SORT ---
    const sortParam = (req.query.sort || '-lastContact').trim();
    const sortDesc = sortParam.startsWith('-');
    const sortField = sortDesc ? sortParam.slice(1) : sortParam;

    filtered.sort((a, b) => {
        let aVal, bVal;

        if (sortField === 'name') {
            aVal = (a.name || '').toLowerCase();
            bVal = (b.name || '').toLowerCase();
            return sortDesc
                ? bVal.localeCompare(aVal)
                : aVal.localeCompare(bVal);
        } else if (sortField === 'quoteCount') {
            aVal = a.quoteCount || 0;
            bVal = b.quoteCount || 0;
        } else if (sortField === 'totalValue') {
            aVal = a.totalValue || 0;
            bVal = b.totalValue || 0;
        } else if (sortField === 'lastQuoteDate') {
            aVal = new Date(a.lastQuoteDate || a.lastContact || 0).getTime();
            bVal = new Date(b.lastQuoteDate || b.lastContact || 0).getTime();
        } else {
            // Date fields: lastContact, createdAt, updatedAt
            aVal = new Date(a[sortField] || a.lastContact || a.createdAt || 0).getTime();
            bVal = new Date(b[sortField] || b.lastContact || b.createdAt || 0).getTime();
        }

        return sortDesc ? bVal - aVal : aVal - bVal;
    });

    // --- BACKWARD COMPAT ---
    // If no 'page' param, return raw array (existing code expects this)
    if (!req.query.page) {
        return res.json(filtered);
    }

    // --- PAGINATION ---
    const totalCount = filtered.length;
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const totalPages = Math.max(Math.ceil(totalCount / limit), 1);
    const page = Math.min(Math.max(parseInt(req.query.page) || 1, 1), totalPages);
    const startIdx = (page - 1) * limit;
    const paged = filtered.slice(startIdx, startIdx + limit);

    res.json({
        customers: paged,
        pagination: {
            page: page,
            limit: limit,
            totalCount: totalCount,
            totalPages: totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
        }
    });
});

// =============================================================
// GET /api/customers/search?q=...
// Quick search for autocomplete / typeahead (max 15 results)
// =============================================================
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
                || (c.phone || '').includes(q)
                || (c.zipCode || '').includes(q);
        })
        .slice(0, 15)
        .map(c => ({
            id: c.id,
            name: c.name,
            email: c.email || '',
            company: c.company,
            phone: c.phone,
            zipCode: c.zipCode,
            isMyCustomer: c.dealers && c.dealers.includes(dealerCode),
            quoteCount: c.quoteCount || 0
        }));

    res.json(results);
});

// =============================================================
// POST /api/customers
// Required fields: name, zipCode
// Optional fields: email, company, phone
// =============================================================
router.post('/', (req, res) => {
    const { name, email, company, phone, zipCode } = req.body;

    if (!name || !zipCode) {
        return res.status(400).json({ error: 'Name and zip code are required' });
    }

    const customers = readJSON(CUSTOMERS_FILE);
    const dealerCode = req.user.dealerCode;
    const normalizedEmail = (email || '').toLowerCase().trim();
    const trimmedZip = zipCode.trim();

    // Dedup strategy:
    // 1. If email is provided, match by email + dealer (primary)
    // 2. If no email, match by name + zipCode + dealer (fallback)
    let existing = null;
    if (normalizedEmail) {
        existing = customers.find(c =>
            c.email && c.email.toLowerCase() === normalizedEmail
            && c.dealers && c.dealers.includes(dealerCode)
        );
    } else {
        existing = customers.find(c =>
            (c.name || '').toLowerCase() === name.toLowerCase().trim()
            && (c.zipCode || '') === trimmedZip
            && c.dealers && c.dealers.includes(dealerCode)
        );
    }

    if (existing) {
        if (name) existing.name = name;
        if (normalizedEmail) existing.email = normalizedEmail;
        if (company !== undefined) existing.company = company;
        if (phone !== undefined) existing.phone = phone;
        if (zipCode !== undefined) existing.zipCode = trimmedZip;
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
        name: name.trim(),
        email: normalizedEmail,
        company: company || '',
        phone: phone || '',
        zipCode: trimmedZip,
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

    const logEmail = normalizedEmail || '(no email)';
    console.log('[CustomerDB] New customer: ' + name + ' ' + logEmail + ' zip:' + trimmedZip + ' by ' + dealerCode);
    res.status(201).json(newCustomer);
});

// =============================================================
// PUT /api/customers/:id
// =============================================================
router.put('/:id', (req, res) => {
    const customers = readJSON(CUSTOMERS_FILE);
    const idx = customers.findIndex(c => c.id === req.params.id);
    if (idx === -1) {
        return res.status(404).json({ error: 'Customer not found' });
    }

    // Validate: name and zipCode cannot be set to empty
    if (req.body.name !== undefined && !req.body.name.trim()) {
        return res.status(400).json({ error: 'Customer name cannot be empty' });
    }
    if (req.body.zipCode !== undefined && !req.body.zipCode.trim()) {
        return res.status(400).json({ error: 'Customer zip code cannot be empty' });
    }

    const allowed = ['name', 'email', 'company', 'phone', 'zipCode'];
    allowed.forEach(field => {
        if (req.body[field] !== undefined) {
            customers[idx][field] = field === 'email'
                ? (req.body[field] || '').toLowerCase().trim()
                : req.body[field];
        }
    });
    customers[idx].updatedAt = new Date().toISOString();

    writeJSON(CUSTOMERS_FILE, customers);
    res.json(customers[idx]);
});

module.exports = router;
