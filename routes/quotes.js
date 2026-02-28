// ============================================================
// routes/quotes.js - Quote CRUD with per-dealer pricing
// Date: 2026-02-28
// ============================================================
// v3.0: Replaced tier-based pricing with per-dealer pricing.
// Line items now get their price from dealer.pricing[productId]
// instead of basePrice * tierMultiplier.
//
// Field names (tierPrice, originalTierPrice, etc.) are preserved
// for backward compatibility with existing quotes and frontend.
// ============================================================

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const {
    readJSON, writeJSON,
    QUOTES_FILE, CUSTOMERS_FILE, PRODUCTS_FILE,
    generateId, getDealerPrice, recalcCustomerStats
} = require('../lib/helpers');
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

function calcItemTotal(item) {
    const rawLength = item.length;
    const customLength = parseFloat(item.customLength) || 0;
    const parsedLength = parseFloat(rawLength) || 0;
    const effectiveLength = parsedLength > 0 ? parsedLength : customLength;
    const lengthMultiplier = effectiveLength > 0 ? effectiveLength : 1;
    return Math.round(item.price * item.quantity * lengthMultiplier * 100) / 100;
}

function recalcQuoteTotal(quote) {
    quote.totalAmount = quote.lineItems.reduce((sum, i) => sum + (i.total || 0), 0);
    quote.totalAmount = Math.round(quote.totalAmount * 100) / 100;
}

// =============================================================
// buildLineItem
// Creates a normalized line item using per-dealer pricing.
// "tierPrice" field name kept for backward compat.
// =============================================================
function buildLineItem(item, dealer) {
    const basePrice = parseFloat(item.basePrice || item.price) || 0;
    const productId = item.productId || '';

    // Per-dealer pricing: look up the dealer's specific price
    // For custom items (no productId or productId === 'custom'),
    // use the price as-is from the line item
    let dealerPrice;
    if (!productId || productId === 'custom') {
        dealerPrice = basePrice;
    } else {
        dealerPrice = getDealerPrice(dealer, productId);
    }
    dealerPrice = Math.round(dealerPrice * 100) / 100;

    const qty = parseInt(item.quantity) || 1;
    const length = item.length != null ? item.length : null;
    const customLength = item.customLength != null ? item.customLength : null;

    // Preserve existing override if present
    const existingOverride = item.priceOverride || null;
    let effectivePrice = dealerPrice;

    if (existingOverride && existingOverride.status === 'approved') {
        effectivePrice = existingOverride.requestedPrice;
    }

    return {
        productId: productId,
        productName: item.productName || '',
        quantity: qty,
        length: length,
        customLength: customLength,
        basePrice: basePrice,
        tierPrice: dealerPrice,
        price: effectivePrice,
        total: calcItemTotal({ price: effectivePrice, quantity: qty, length: length, customLength: customLength }),
        color: item.color || '',
        color2: item.color2 || '',
        type: item.type || '',
        priceOverride: existingOverride
    };
}

// =============================================================
// upsertCustomer
// =============================================================
function upsertCustomer(customerData, dealerCode, existingCustomerId) {
    if (!customerData || !customerData.email || !customerData.name) {
        return customerData || {};
    }

    const customers = readJSON(CUSTOMERS_FILE);
    const normalizedEmail = customerData.email.toLowerCase().trim();
    const now = new Date().toISOString();

    let existing = null;
    if (existingCustomerId) {
        existing = customers.find(c => c.id === existingCustomerId);
    }
    if (!existing) {
        existing = customers.find(c =>
            c.email && c.email.toLowerCase() === normalizedEmail
            && c.dealers && c.dealers.includes(dealerCode)
        );
    }

    if (existing) {
        existing.name = customerData.name;
        if (customerData.company !== undefined) existing.company = customerData.company;
        if (customerData.phone !== undefined) existing.phone = customerData.phone;
        if (customerData.zipCode !== undefined) existing.zipCode = customerData.zipCode;
        existing.email = normalizedEmail;
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
// GET /api/quotes/pending-overrides
// =============================================================
router.get('/pending-overrides', requireRole('admin', 'gm'), (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const results = [];

    quotes.forEach(q => {
        if (q.deleted) return;
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

    results.sort((a, b) => (b.requestedAt || '').localeCompare(a.requestedAt || ''));
    res.json({ pending: results, count: results.length });
});

// =============================================================
// GET /api/quotes
// =============================================================
router.get('/', (req, res) => {
    const quotes = readJSON(QUOTES_FILE);

    const scopeParam = (req.query.scope || '').trim().toLowerCase();
    const scopeDealerCode = (req.query.dealerCode || '').trim().toUpperCase();
    let mine;

    if (req.user.role === 'admin' && scopeParam === 'global') {
        mine = quotes.filter(q => !q.deleted);
    } else if (req.user.role === 'admin' && scopeDealerCode) {
        mine = quotes.filter(q => q.dealerCode === scopeDealerCode && !q.deleted);
    } else {
        mine = quotes.filter(q => q.dealerCode === req.user.dealerCode && !q.deleted);
    }

    if (req.user.role === 'frontdesk') {
        mine = mine.filter(q => q.createdBy === req.user.username);
    }

    const statusFilter = (req.query.status || '').trim().toLowerCase();
    if (statusFilter) {
        mine = mine.filter(q => q.status === statusFilter);
    }

    const customerIdFilter = (req.query.customerId || '').trim();
    if (customerIdFilter) {
        mine = mine.filter(q => q.customer && q.customer.customerId === customerIdFilter);
    }

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
            return sortDesc ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
        } else {
            aVal = new Date(a[sortField] || a.updatedAt || a.createdAt || 0).getTime();
            bVal = new Date(b[sortField] || b.updatedAt || b.createdAt || 0).getTime();
        }
        return sortDesc ? bVal - aVal : aVal - bVal;
    });

    if (!req.query.page) {
        return res.json(mine);
    }

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
    const quote = req.user.role === 'admin'
        ? quotes.find(q => q.id === req.params.id && !q.deleted)
        : quotes.find(q => q.id === req.params.id && q.dealerCode === req.user.dealerCode && !q.deleted);
    if (!quote) return res.status(404).json({ error: 'Quote not found' });

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
    const dealer = req.dealer;

    const items = (lineItems || []).map(item => buildLineItem(item, dealer));
    const totalAmount = items.reduce((sum, i) => sum + i.total, 0);

    const upsertedCustomer = upsertCustomer(customer, req.user.dealerCode, null);

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
        pricingModel: 'per-dealer',
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

    recalcCustomerStats(customerSnapshot.customerId);

    console.log('[Quotes] Created: ' + newQuote.quoteNumber + ' by ' + req.user.username + ' (' + req.user.role + ') | Dealer: ' + req.user.dealerCode + ' | Customer: ' + customerSnapshot.name + ' (' + (customerSnapshot.customerId || 'no-id') + ')');
    res.status(201).json(newQuote);
});

// =============================================================
// PUT /api/quotes/:id
// =============================================================
router.put('/:id', (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const idx = quotes.findIndex(q => q.id === req.params.id && q.dealerCode === req.user.dealerCode && !q.deleted);
    if (idx === -1) return res.status(404).json({ error: 'Quote not found' });

    if (req.user.role === 'frontdesk' && quotes[idx].createdBy !== req.user.username) {
        return res.status(403).json({ error: 'Access denied' });
    }

    if (quotes[idx].status !== 'draft' && quotes[idx].status !== 'revision') {
        return res.status(400).json({ error: 'Only draft or revision quotes can be edited' });
    }

    const { customer, lineItems, notes } = req.body;
    const oldCustomerId = quotes[idx].customer ? quotes[idx].customer.customerId : null;

    if (customer) {
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
        const dealer = req.dealer;
        quotes[idx].lineItems = lineItems.map(item => buildLineItem(item, dealer));
        recalcQuoteTotal(quotes[idx]);
        quotes[idx].hasPendingOverrides = quotes[idx].lineItems.some(
            i => i.priceOverride && i.priceOverride.status === 'pending'
        );
    }

    quotes[idx].updatedAt = new Date().toISOString();
    writeJSON(QUOTES_FILE, quotes);

    const newCustomerId = quotes[idx].customer ? quotes[idx].customer.customerId : null;
    if (newCustomerId) recalcCustomerStats(newCustomerId);
    if (oldCustomerId && oldCustomerId !== newCustomerId) recalcCustomerStats(oldCustomerId);

    res.json(quotes[idx]);
});

// =============================================================
// POST /api/quotes/:id/items/:itemIndex/request-override
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
    const quote = quotes.find(q => q.id === req.params.id && q.dealerCode === req.user.dealerCode && !q.deleted);
    if (!quote) return res.status(404).json({ error: 'Quote not found' });

    if (quote.status !== 'draft' && quote.status !== 'revision') {
        return res.status(400).json({ error: 'Price overrides can only be requested on draft or revision quotes' });
    }

    const itemIdx = parseInt(req.params.itemIndex);
    if (isNaN(itemIdx) || itemIdx < 0 || itemIdx >= quote.lineItems.length) {
        return res.status(404).json({ error: 'Line item not found at index ' + req.params.itemIndex });
    }

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

    if (isAutoApprover) {
        item.price = item.priceOverride.requestedPrice;
        item.total = calcItemTotal(item);
        recalcQuoteTotal(quote);
    }

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
// =============================================================
router.post('/:id/items/:itemIndex/approve-override', requireRole('admin', 'gm'), (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const quote = quotes.find(q => q.id === req.params.id && !q.deleted);
    if (!quote) return res.status(404).json({ error: 'Quote not found' });

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

    item.priceOverride.status = 'approved';
    item.priceOverride.approvedBy = req.user.username;
    item.priceOverride.approvedAt = new Date().toISOString();

    item.price = item.priceOverride.requestedPrice;
    item.total = calcItemTotal(item);

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

    res.json({ message: 'Price override approved', item: item, quote: quote });
});

// =============================================================
// POST /api/quotes/:id/items/:itemIndex/reject-override
// =============================================================
router.post('/:id/items/:itemIndex/reject-override', requireRole('admin', 'gm'), (req, res) => {
    const { rejectedReason } = req.body;

    const quotes = readJSON(QUOTES_FILE);
    const quote = quotes.find(q => q.id === req.params.id && !q.deleted);
    if (!quote) return res.status(404).json({ error: 'Quote not found' });

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

    item.priceOverride.status = 'rejected';
    item.priceOverride.rejectedBy = req.user.username;
    item.priceOverride.rejectedAt = new Date().toISOString();
    item.priceOverride.rejectedReason = (rejectedReason || '').trim() || null;

    // Revert to dealer price
    item.price = item.tierPrice;
    item.total = calcItemTotal(item);

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

    res.json({ message: 'Price override rejected', item: item, quote: quote });
});

// =============================================================
// POST /api/quotes/:id/submit
// =============================================================
router.post('/:id/submit', (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const idx = quotes.findIndex(q => q.id === req.params.id && q.dealerCode === req.user.dealerCode && !q.deleted);
    if (idx === -1) return res.status(404).json({ error: 'Quote not found' });

    if (req.user.role === 'frontdesk' && quotes[idx].createdBy !== req.user.username) {
        return res.status(403).json({ error: 'Access denied' });
    }

    if (quotes[idx].status !== 'draft' && quotes[idx].status !== 'revision') {
        return res.status(400).json({ error: 'Only draft or revision quotes can be submitted' });
    }
    if (!quotes[idx].lineItems || quotes[idx].lineItems.length === 0) {
        return res.status(400).json({ error: 'Cannot submit a quote with no line items' });
    }

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
// =============================================================
router.delete('/:id', requireRole('admin', 'gm'), (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const idx = req.user.role === 'admin'
        ? quotes.findIndex(q => q.id === req.params.id && !q.deleted)
        : quotes.findIndex(q => q.id === req.params.id && q.dealerCode === req.user.dealerCode && !q.deleted);
    if (idx === -1) return res.status(404).json({ error: 'Quote not found' });

    quotes[idx].deleted = true;
    quotes[idx].deletedBy = req.user.username;
    quotes[idx].deletedByRole = req.user.role;
    quotes[idx].deletedAt = new Date().toISOString();
    quotes[idx].updatedAt = new Date().toISOString();
    writeJSON(QUOTES_FILE, quotes);

    const custId = quotes[idx].customer ? quotes[idx].customer.customerId : null;
    if (custId) recalcCustomerStats(custId);

    console.log('[Quotes] Soft-deleted: ' + quotes[idx].quoteNumber + ' by ' + req.user.username + ' (' + req.user.role + ')');
    res.json({ message: 'Quote ' + quotes[idx].quoteNumber + ' deleted' });
});

// =============================================================
// POST /api/quotes/:id/duplicate
// =============================================================
router.post('/:id/duplicate', (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const original = req.user.role === 'admin'
        ? quotes.find(q => q.id === req.params.id && !q.deleted)
        : quotes.find(q => q.id === req.params.id && q.dealerCode === req.user.dealerCode && !q.deleted);
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
    dup.pricingModel = 'per-dealer';

    if (req.user.role === 'admin' && dup.dealerCode !== req.user.dealerCode) {
        dup.dealerCode = req.user.dealerCode;
    }

    // Clear overrides, revert to dealer price (tierPrice field)
    dup.lineItems.forEach(item => {
        item.priceOverride = null;
        item.price = item.tierPrice;
        item.total = calcItemTotal(item);
    });
    dup.hasPendingOverrides = false;
    recalcQuoteTotal(dup);

    quotes.push(dup);
    writeJSON(QUOTES_FILE, quotes);

    const custId = dup.customer ? dup.customer.customerId : null;
    if (custId) recalcCustomerStats(custId);

    console.log('[Quotes] Duplicated: ' + original.quoteNumber + ' -> ' + dup.quoteNumber + (dup.dealerCode !== original.dealerCode ? ' (reassigned to ' + dup.dealerCode + ')' : ''));
    res.status(201).json(dup);
});

module.exports = router;
