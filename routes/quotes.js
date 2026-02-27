const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { readJSON, writeJSON, QUOTES_FILE, TIERS_FILE, CUSTOMERS_FILE, generateId } = require('../lib/helpers');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);

function generateQuoteNumber() {
    const now = new Date();
    const y = now.getFullYear().toString().slice(-2);
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const r = Math.random().toString(36).substring(2, 6).toUpperCase();
    return 'Q' + y + m + d + '-' + r;
}

function recalcQuoteTotal(quote) {
    quote.totalAmount = quote.lineItems.reduce((sum, i) => sum + (i.total || 0), 0);
    quote.totalAmount = Math.round(quote.totalAmount * 100) / 100;
}

// =============================================================
// upsertCustomer
// Finds or creates a customer in customers.json.
// On update (PUT), prefers matching by customerId first,
// then falls back to email for legacy quotes.
// Returns the customer record (with id).
// =============================================================
function upsertCustomer(customerData, dealerCode, existingCustomerId) {
    if (!customerData || !customerData.email || !customerData.name) {
        return customerData || {};
    }

    const customers = readJSON(CUSTOMERS_FILE);
    const normalizedEmail = customerData.email.toLowerCase().trim();
    const now = new Date().toISOString();

    // Step 1: Try to find by existingCustomerId (for PUT updates)
    let existing = null;
    if (existingCustomerId) {
        existing = customers.find(c => c.id === existingCustomerId);
    }

    // Step 2: Fall back to email match within this dealer
    if (!existing) {
        existing = customers.find(c =>
            c.email && c.email.toLowerCase() === normalizedEmail
            && c.dealers && c.dealers.includes(dealerCode)
        );
    }

    if (existing) {
        // Update fields from the quote's customer data
        existing.name = customerData.name;
        if (customerData.company !== undefined) existing.company = customerData.company;
        if (customerData.phone !== undefined) existing.phone = customerData.phone;
        if (customerData.zipCode !== undefined) existing.zipCode = customerData.zipCode;
        existing.email = normalizedEmail;

        // Ensure this dealer is in the dealers array
        if (!existing.dealers) existing.dealers = [];
        if (!existing.dealers.includes(dealerCode)) {
            existing.dealers.push(dealerCode);
        }

        existing.lastContact = now;
        existing.updatedAt = now;

        writeJSON(CUSTOMERS_FILE, customers);

        console.log('[CustomerDB] Updated via quote: ' + existing.name + ' (' + normalizedEmail + ') dealer: ' + dealerCode);
        return existing;
    }

    // Step 3: Create new customer
    const newCustomer = {
        id: crypto.randomUUID(),
        name: customerData.name,
        email: normalizedEmail,
        company: customerData.company || '',
        phone: customerData.phone || '',
        zipCode: customerData.zipCode || '',
        dealers: [dealerCode],
        quoteCount: 0,
        totalValue: 0,
        firstContact: now,
        lastContact: now,
        createdAt: now,
        updatedAt: now,
        notes: ''
    };

    customers.push(newCustomer);
    writeJSON(CUSTOMERS_FILE, customers);

    console.log('[CustomerDB] Created via quote: ' + newCustomer.name + ' (' + normalizedEmail + ') dealer: ' + dealerCode);
    return newCustomer;
}

// =============================================================
// recalcCustomerStats
// Scans all quotes to recompute quoteCount and totalValue
// for a given customerId. Called after every quote save.
// =============================================================
function recalcCustomerStats(customerId) {
    if (!customerId) return;

    const customers = readJSON(CUSTOMERS_FILE);
    const custIdx = customers.findIndex(c => c.id === customerId);
    if (custIdx === -1) return;

    const quotes = readJSON(QUOTES_FILE);
    const customerQuotes = quotes.filter(q =>
        q.customer && q.customer.customerId === customerId
    );

    customers[custIdx].quoteCount = customerQuotes.length;
    customers[custIdx].totalValue = Math.round(
        customerQuotes.reduce((sum, q) => sum + (q.totalAmount || 0), 0) * 100
    ) / 100;

    writeJSON(CUSTOMERS_FILE, customers);
}

// =============================================================
// GET /api/quotes/pending-overrides
// GM sees overrides for their dealer, Admin sees all
// MUST be defined before /:id route to avoid conflict
// =============================================================
router.get('/pending-overrides', requireRole('admin', 'gm'), (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const results = [];

    quotes.forEach(q => {
        // GM can only see their own dealer's overrides
        if (req.user.role === 'gm' && q.dealerCode !== req.user.dealerCode) return;

        (q.lineItems || []).forEach((item, idx) => {
            if (item.priceOverride && item.priceOverride.status === 'pending') {
                results.push({
                    quoteId: q.id,
                    quoteNumber: q.quoteNumber,
                    dealerCode: q.dealerCode,
                    customerName: q.customer ? (q.customer.name || q.customer.firstName || '') : '',
                    itemIndex: idx,
                    productName: item.productName || '',
                    tierPrice: item.tierPrice || item.price,
                    requestedPrice: item.priceOverride.requestedPrice,
                    reason: item.priceOverride.reason,
                    requestedBy: item.priceOverride.requestedBy,
                    requestedAt: item.priceOverride.requestedAt,
                    quoteStatus: q.status,
                    quoteCreatedBy: q.createdBy
                });
            }
        });
    });

    // Sort newest first
    results.sort((a, b) => (b.requestedAt || '').localeCompare(a.requestedAt || ''));
    res.json({ pending: results, count: results.length });
});

// =============================================================
// GET /api/quotes
// Supports pagination, filtering, and search.
//
// Query params:
//   page       (int, default: none = legacy mode returns raw array)
//   limit      (int, default 20, max 100)
//   sort       (string, default '-updatedAt', prefix '-' for desc)
//   status     (string, filter by quote status)
//   search     (string, fuzzy match on customer name/company/email/quoteNumber/notes)
//   since      (ISO date string, quotes updated on or after this date)
//   customerId (string, filter by customer ID)
//
// Backward compatible: If 'page' is NOT provided, returns the
// raw array exactly as before so existing dealer-portal.html
// and overrides code continues to work without changes.
//
// Paginated response shape:
//   {
//     quotes: [ ... ],
//     pagination: { page, limit, totalCount, totalPages, hasNext, hasPrev }
//   }
// =============================================================
router.get('/', (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    let mine = quotes.filter(q => q.dealerCode === req.user.dealerCode);

    // Frontdesk users only see their own quotes
    if (req.user.role === 'frontdesk') {
        mine = mine.filter(q => q.createdBy === req.user.username);
    }

    // --- STATUS FILTER ---
    const statusFilter = (req.query.status || '').trim().toLowerCase();
    if (statusFilter) {
        mine = mine.filter(q => q.status === statusFilter);
    }

    // --- CUSTOMER FILTER ---
    const customerIdFilter = (req.query.customerId || '').trim();
    if (customerIdFilter) {
        mine = mine.filter(q =>
            q.customer && q.customer.customerId === customerIdFilter
        );
    }

    // --- DATE RANGE FILTER (since) ---
    const sinceFilter = req.query.since;
    if (sinceFilter) {
        const sinceDate = new Date(sinceFilter);
        if (!isNaN(sinceDate.getTime())) {
            mine = mine.filter(q => {
                const qDate = new Date(q.updatedAt || q.createdAt);
                return qDate >= sinceDate;
            });
        }
    }

    // --- SEARCH ---
    const search = (req.query.search || '').trim().toLowerCase();
    if (search) {
        mine = mine.filter(q => {
            const hay = [
                q.quoteNumber || '',
                q.customer ? (q.customer.name || '') : '',
                q.customer ? (q.customer.company || '') : '',
                q.customer ? (q.customer.email || '') : '',
                q.notes || ''
            ].join(' ').toLowerCase();
            return hay.includes(search);
        });
    }

    // --- SORT ---
    const sortParam = (req.query.sort || '-updatedAt').trim();
    const sortDesc = sortParam.startsWith('-');
    const sortField = sortDesc ? sortParam.slice(1) : sortParam;

    mine.sort((a, b) => {
        let aVal, bVal;
        if (sortField === 'totalAmount') {
            aVal = a.totalAmount || 0;
            bVal = b.totalAmount || 0;
        } else if (sortField === 'quoteNumber') {
            aVal = a.quoteNumber || '';
            bVal = b.quoteNumber || '';
            return sortDesc
                ? bVal.localeCompare(aVal)
                : aVal.localeCompare(bVal);
        } else {
            // Date fields: updatedAt, createdAt, submittedAt, etc.
            aVal = new Date(a[sortField] || a.updatedAt || a.createdAt || 0).getTime();
            bVal = new Date(b[sortField] || b.updatedAt || b.createdAt || 0).getTime();
        }
        return sortDesc ? bVal - aVal : aVal - bVal;
    });

    // --- BACKWARD COMPAT ---
    // If no 'page' param, return raw array (existing code expects this)
    if (!req.query.page) {
        return res.json(mine);
    }

    // --- PAGINATION ---
    const totalCount = mine.length;
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const totalPages = Math.max(Math.ceil(totalCount / limit), 1);
    const page = Math.min(Math.max(parseInt(req.query.page) || 1, 1), totalPages);
    const startIdx = (page - 1) * limit;
    const paged = mine.slice(startIdx, startIdx + limit);

    res.json({
        quotes: paged,
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
// GET /api/quotes/:id
// =============================================================
router.get('/:id', (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const quote = quotes.find(q => q.id === req.params.id && q.dealerCode === req.user.dealerCode);
    if (!quote) return res.status(404).json({ error: 'Quote not found' });

    // Frontdesk can only see their own quotes
    if (req.user.role === 'frontdesk' && quote.createdBy !== req.user.username) {
        return res.status(403).json({ error: 'Access denied' });
    }

    res.json(quote);
});

// =============================================================
// POST /api/quotes
// =============================================================
router.post('/', (req, res) => {
    const { customer, lineItems, notes } = req.body;

    const tiers = readJSON(TIERS_FILE);
    const dealerTier = req.dealer.pricingTier || 'standard';
    const tier = tiers.find(t => t.slug === dealerTier) || { multiplier: 1.0 };

    const items = (lineItems || []).map(item => {
        const basePrice = parseFloat(item.basePrice || item.price) || 0;
        const tierPrice = Math.round(basePrice * tier.multiplier * 100) / 100;
        const qty = parseInt(item.quantity) || 1;
        return {
            productId: item.productId || '',
            productName: item.productName || '',
            quantity: qty,
            basePrice: basePrice,
            tierPrice: tierPrice,
            price: tierPrice,
            total: Math.round(tierPrice * qty * 100) / 100,
            priceOverride: null
        };
    });

    const totalAmount = items.reduce((sum, i) => sum + i.total, 0);

    // Upsert customer into customers.json and get back the record with id
    const upsertedCustomer = upsertCustomer(customer, req.user.dealerCode, null);

    // Build the customer snapshot stored on the quote (includes customerId)
    const customerSnapshot = {
        customerId: upsertedCustomer.id || null,
        name: upsertedCustomer.name || (customer && customer.name) || '',
        email: upsertedCustomer.email || (customer && customer.email) || '',
        company: upsertedCustomer.company || (customer && customer.company) || '',
        phone: upsertedCustomer.phone || (customer && customer.phone) || '',
        zipCode: upsertedCustomer.zipCode || (customer && customer.zipCode) || ''
    };

    const newQuote = {
        id: generateId(),
        quoteNumber: generateQuoteNumber(),
        dealerCode: req.user.dealerCode,
        createdBy: req.user.username,
        createdByRole: req.user.role,
        customer: customerSnapshot,
        lineItems: items,
        notes: notes || '',
        pricingTier: dealerTier,
        tierMultiplier: tier.multiplier,
        totalAmount: Math.round(totalAmount * 100) / 100,
        hasPendingOverrides: false,
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

    // Recalculate customer stats now that the quote exists in the file
    recalcCustomerStats(customerSnapshot.customerId);

    console.log('[Quotes] Created: ' + newQuote.quoteNumber + ' by ' + req.user.username + ' (' + req.user.role + ') | Dealer: ' + req.user.dealerCode + ' | Customer: ' + customerSnapshot.name + ' (' + (customerSnapshot.customerId || 'no-id') + ')');
    res.status(201).json(newQuote);
});

// =============================================================
// PUT /api/quotes/:id
// =============================================================
router.put('/:id', (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const idx = quotes.findIndex(q => q.id === req.params.id && q.dealerCode === req.user.dealerCode);
    if (idx === -1) return res.status(404).json({ error: 'Quote not found' });

    // Frontdesk can only edit their own quotes
    if (req.user.role === 'frontdesk' && quotes[idx].createdBy !== req.user.username) {
        return res.status(403).json({ error: 'Access denied' });
    }

    if (quotes[idx].status !== 'draft' && quotes[idx].status !== 'revision') {
        return res.status(400).json({ error: 'Only draft or revision quotes can be edited' });
    }

    const { customer, lineItems, notes } = req.body;

    // Track the old customerId for stats recalc (in case customer changes)
    const oldCustomerId = quotes[idx].customer ? quotes[idx].customer.customerId : null;

    if (customer) {
        // Use the existing customerId on the quote to find the right record to update
        const existingCustomerId = (quotes[idx].customer && quotes[idx].customer.customerId) || null;
        const upsertedCustomer = upsertCustomer(customer, req.user.dealerCode, existingCustomerId);

        quotes[idx].customer = {
            customerId: upsertedCustomer.id || null,
            name: upsertedCustomer.name || customer.name || '',
            email: upsertedCustomer.email || customer.email || '',
            company: upsertedCustomer.company || customer.company || '',
            phone: upsertedCustomer.phone || customer.phone || '',
            zipCode: upsertedCustomer.zipCode || customer.zipCode || ''
        };
    }

    if (notes !== undefined) quotes[idx].notes = notes;

    if (lineItems) {
        const tiers = readJSON(TIERS_FILE);
        const dealerTier = req.dealer.pricingTier || 'standard';
        const tier = tiers.find(t => t.slug === dealerTier) || { multiplier: 1.0 };

        quotes[idx].lineItems = lineItems.map(item => {
            const basePrice = parseFloat(item.basePrice || item.price) || 0;
            const tierPrice = Math.round(basePrice * tier.multiplier * 100) / 100;
            const qty = parseInt(item.quantity) || 1;

            // Preserve existing override if item has one
            const existingOverride = item.priceOverride || null;
            let effectivePrice = tierPrice;

            if (existingOverride && existingOverride.status === 'approved') {
                effectivePrice = existingOverride.requestedPrice;
            }

            return {
                productId: item.productId || '',
                productName: item.productName || '',
                quantity: qty,
                basePrice: basePrice,
                tierPrice: tierPrice,
                price: effectivePrice,
                total: Math.round(effectivePrice * qty * 100) / 100,
                priceOverride: existingOverride
            };
        });

        recalcQuoteTotal(quotes[idx]);
        quotes[idx].hasPendingOverrides = quotes[idx].lineItems.some(
            i => i.priceOverride && i.priceOverride.status === 'pending'
        );
    }

    quotes[idx].updatedAt = new Date().toISOString();
    writeJSON(QUOTES_FILE, quotes);

    // Recalculate stats for the current customer
    const newCustomerId = quotes[idx].customer ? quotes[idx].customer.customerId : null;
    if (newCustomerId) {
        recalcCustomerStats(newCustomerId);
    }
    // If the customer changed, also recalc the old customer's stats
    if (oldCustomerId && oldCustomerId !== newCustomerId) {
        recalcCustomerStats(oldCustomerId);
    }

    res.json(quotes[idx]);
});

// =============================================================
// POST /api/quotes/:id/items/:itemIndex/request-override
// Frontdesk: creates pending override (needs GM/Admin approval)
// GM/Admin: auto-approves the override immediately
// =============================================================
router.post('/:id/items/:itemIndex/request-override', (req, res) => {
    const { requestedPrice, reason } = req.body;

    if (requestedPrice === undefined || requestedPrice === null) {
        return res.status(400).json({ error: 'requestedPrice is required' });
    }
    const price = parseFloat(requestedPrice);
    if (isNaN(price) || price < 0) {
        return res.status(400).json({ error: 'requestedPrice must be a valid positive number' });
    }
    if (!reason || !reason.trim()) {
        return res.status(400).json({ error: 'A reason is required for all price overrides' });
    }

    const quotes = readJSON(QUOTES_FILE);
    const quote = quotes.find(q => q.id === req.params.id && q.dealerCode === req.user.dealerCode);
    if (!quote) return res.status(404).json({ error: 'Quote not found' });

    if (quote.status !== 'draft' && quote.status !== 'revision') {
        return res.status(400).json({ error: 'Price overrides can only be requested on draft or revision quotes' });
    }

    const itemIdx = parseInt(req.params.itemIndex);
    if (isNaN(itemIdx) || itemIdx < 0 || itemIdx >= quote.lineItems.length) {
        return res.status(404).json({ error: 'Line item not found at index ' + req.params.itemIndex });
    }

    // Frontdesk can only override on their own quotes
    if (req.user.role === 'frontdesk' && quote.createdBy !== req.user.username) {
        return res.status(403).json({ error: 'Access denied' });
    }

    const item = quote.lineItems[itemIdx];
    const isAutoApprover = (req.user.role === 'gm' || req.user.role === 'admin');

    item.priceOverride = {
        requestedPrice: Math.round(price * 100) / 100,
        originalTierPrice: item.tierPrice,
        reason: reason.trim(),
        requestedBy: req.user.username,
        requestedByRole: req.user.role,
        requestedAt: new Date().toISOString(),
        status: isAutoApprover ? 'approved' : 'pending',
        approvedBy: isAutoApprover ? req.user.username : null,
        approvedAt: isAutoApprover ? new Date().toISOString() : null,
        rejectedBy: null,
        rejectedAt: null,
        rejectedReason: null
    };

    // If auto-approved (GM/Admin), apply the price immediately
    if (isAutoApprover) {
        item.price = item.priceOverride.requestedPrice;
        item.total = Math.round(item.price * item.quantity * 100) / 100;
        recalcQuoteTotal(quote);
    }

    // Update pending flag
    quote.hasPendingOverrides = quote.lineItems.some(
        i => i.priceOverride && i.priceOverride.status === 'pending'
    );
    quote.updatedAt = new Date().toISOString();

    const qIdx = quotes.findIndex(q => q.id === quote.id);
    quotes[qIdx] = quote;
    writeJSON(QUOTES_FILE, quotes);

    const action = isAutoApprover ? 'Override applied' : 'Override requested';
    console.log('[Quotes] ' + action + ': ' + quote.quoteNumber + ' item #' + itemIdx
        + ' $' + item.tierPrice + ' -> $' + item.priceOverride.requestedPrice
        + ' by ' + req.user.username + ' (' + req.user.role + ')'
        + ' | Reason: ' + reason.trim());

    res.json({
        message: action + ' successfully',
        item: item,
        quote: quote
    });
});

// =============================================================
// POST /api/quotes/:id/items/:itemIndex/approve-override
// GM/Admin only
// =============================================================
router.post('/:id/items/:itemIndex/approve-override', requireRole('admin', 'gm'), (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const quote = quotes.find(q => q.id === req.params.id);
    if (!quote) return res.status(404).json({ error: 'Quote not found' });

    // GM can only approve for their own dealer
    if (req.user.role === 'gm' && quote.dealerCode !== req.user.dealerCode) {
        return res.status(403).json({ error: 'Access denied' });
    }

    const itemIdx = parseInt(req.params.itemIndex);
    if (isNaN(itemIdx) || itemIdx < 0 || itemIdx >= quote.lineItems.length) {
        return res.status(404).json({ error: 'Line item not found' });
    }

    const item = quote.lineItems[itemIdx];
    if (!item.priceOverride || item.priceOverride.status !== 'pending') {
        return res.status(400).json({ error: 'No pending override on this line item' });
    }

    // Approve the override
    item.priceOverride.status = 'approved';
    item.priceOverride.approvedBy = req.user.username;
    item.priceOverride.approvedAt = new Date().toISOString();

    // Apply the overridden price
    item.price = item.priceOverride.requestedPrice;
    item.total = Math.round(item.price * item.quantity * 100) / 100;

    recalcQuoteTotal(quote);
    quote.hasPendingOverrides = quote.lineItems.some(
        i => i.priceOverride && i.priceOverride.status === 'pending'
    );
    quote.updatedAt = new Date().toISOString();

    const qIdx = quotes.findIndex(q => q.id === quote.id);
    quotes[qIdx] = quote;
    writeJSON(QUOTES_FILE, quotes);

    console.log('[Quotes] Override APPROVED: ' + quote.quoteNumber + ' item #' + itemIdx
        + ' $' + item.priceOverride.originalTierPrice + ' -> $' + item.priceOverride.requestedPrice
        + ' by ' + req.user.username
        + ' (requested by ' + item.priceOverride.requestedBy + ')');

    res.json({
        message: 'Price override approved',
        item: item,
        quote: quote
    });
});

// =============================================================
// POST /api/quotes/:id/items/:itemIndex/reject-override
// GM/Admin only
// =============================================================
router.post('/:id/items/:itemIndex/reject-override', requireRole('admin', 'gm'), (req, res) => {
    const { rejectedReason } = req.body;

    const quotes = readJSON(QUOTES_FILE);
    const quote = quotes.find(q => q.id === req.params.id);
    if (!quote) return res.status(404).json({ error: 'Quote not found' });

    // GM can only reject for their own dealer
    if (req.user.role === 'gm' && quote.dealerCode !== req.user.dealerCode) {
        return res.status(403).json({ error: 'Access denied' });
    }

    const itemIdx = parseInt(req.params.itemIndex);
    if (isNaN(itemIdx) || itemIdx < 0 || itemIdx >= quote.lineItems.length) {
        return res.status(404).json({ error: 'Line item not found' });
    }

    const item = quote.lineItems[itemIdx];
    if (!item.priceOverride || item.priceOverride.status !== 'pending') {
        return res.status(400).json({ error: 'No pending override on this line item' });
    }

    // Reject and revert to tier price
    item.priceOverride.status = 'rejected';
    item.priceOverride.rejectedBy = req.user.username;
    item.priceOverride.rejectedAt = new Date().toISOString();
    item.priceOverride.rejectedReason = (rejectedReason || '').trim() || null;

    // Revert price to tier price
    item.price = item.tierPrice;
    item.total = Math.round(item.price * item.quantity * 100) / 100;

    recalcQuoteTotal(quote);
    quote.hasPendingOverrides = quote.lineItems.some(
        i => i.priceOverride && i.priceOverride.status === 'pending'
    );
    quote.updatedAt = new Date().toISOString();

    const qIdx = quotes.findIndex(q => q.id === quote.id);
    quotes[qIdx] = quote;
    writeJSON(QUOTES_FILE, quotes);

    console.log('[Quotes] Override REJECTED: ' + quote.quoteNumber + ' item #' + itemIdx
        + ' requested $' + item.priceOverride.requestedPrice
        + ' by ' + req.user.username
        + ' | Reason: ' + (item.priceOverride.rejectedReason || 'none'));

    res.json({
        message: 'Price override rejected',
        item: item,
        quote: quote
    });
});

// =============================================================
// POST /api/quotes/:id/submit
// Blocks submission if there are pending overrides
// =============================================================
router.post('/:id/submit', (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const idx = quotes.findIndex(q => q.id === req.params.id && q.dealerCode === req.user.dealerCode);
    if (idx === -1) return res.status(404).json({ error: 'Quote not found' });

    // Frontdesk can only submit their own quotes
    if (req.user.role === 'frontdesk' && quotes[idx].createdBy !== req.user.username) {
        return res.status(403).json({ error: 'Access denied' });
    }

    if (quotes[idx].status !== 'draft' && quotes[idx].status !== 'revision') {
        return res.status(400).json({ error: 'Only draft or revision quotes can be submitted' });
    }
    if (!quotes[idx].lineItems || quotes[idx].lineItems.length === 0) {
        return res.status(400).json({ error: 'Cannot submit a quote with no line items' });
    }

    // Check for pending overrides
    const pendingCount = quotes[idx].lineItems.filter(
        i => i.priceOverride && i.priceOverride.status === 'pending'
    ).length;
    if (pendingCount > 0) {
        return res.status(400).json({
            error: 'Cannot submit quote with ' + pendingCount + ' pending price override(s). GM approval required.',
            pendingOverrides: pendingCount
        });
    }

    quotes[idx].status = 'submitted';
    quotes[idx].submittedAt = new Date().toISOString();
    quotes[idx].updatedAt = new Date().toISOString();
    writeJSON(QUOTES_FILE, quotes);

    console.log('[Quotes] Submitted: ' + quotes[idx].quoteNumber + ' by ' + req.user.username);
    res.json(quotes[idx]);
});

// =============================================================
// DELETE /api/quotes/:id
// Recalculates customer stats after deletion
// =============================================================
router.delete('/:id', (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const idx = quotes.findIndex(q => q.id === req.params.id && q.dealerCode === req.user.dealerCode);
    if (idx === -1) return res.status(404).json({ error: 'Quote not found' });

    // Frontdesk can only delete their own quotes
    if (req.user.role === 'frontdesk' && quotes[idx].createdBy !== req.user.username) {
        return res.status(403).json({ error: 'Access denied' });
    }

    if (quotes[idx].status !== 'draft') {
        return res.status(400).json({ error: 'Only draft quotes can be deleted' });
    }

    const removed = quotes.splice(idx, 1)[0];
    writeJSON(QUOTES_FILE, quotes);

    // Recalculate customer stats since a quote was removed
    const custId = removed.customer ? removed.customer.customerId : null;
    if (custId) {
        recalcCustomerStats(custId);
    }

    res.json({ message: 'Quote ' + removed.quoteNumber + ' deleted' });
});

// =============================================================
// POST /api/quotes/:id/duplicate
// =============================================================
router.post('/:id/duplicate', (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const original = quotes.find(q => q.id === req.params.id && q.dealerCode === req.user.dealerCode);
    if (!original) return res.status(404).json({ error: 'Quote not found' });

    const dup = JSON.parse(JSON.stringify(original));
    dup.id = generateId();
    dup.quoteNumber = generateQuoteNumber();
    dup.status = 'draft';
    dup.createdBy = req.user.username;
    dup.createdByRole = req.user.role;
    dup.createdAt = new Date().toISOString();
    dup.updatedAt = new Date().toISOString();
    dup.submittedAt = null;
    dup.reviewedAt = null;
    dup.approvedAt = null;

    // Clear all overrides on duplicated quote (start fresh)
    dup.lineItems.forEach(item => {
        item.priceOverride = null;
        item.price = item.tierPrice;
        item.total = Math.round(item.price * item.quantity * 100) / 100;
    });
    dup.hasPendingOverrides = false;
    recalcQuoteTotal(dup);

    quotes.push(dup);
    writeJSON(QUOTES_FILE, quotes);

    // Recalculate customer stats since a new quote references this customer
    const custId = dup.customer ? dup.customer.customerId : null;
    if (custId) {
        recalcCustomerStats(custId);
    }

    console.log('[Quotes] Duplicated: ' + original.quoteNumber + ' -> ' + dup.quoteNumber);
    res.status(201).json(dup);
});

module.exports = router;
