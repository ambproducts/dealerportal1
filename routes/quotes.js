// ============================================================
// routes/quotes.js - Quote CRUD with per-dealer pricing
// Date: 2026-03-15
// ============================================================
// v3.8.2 (2026-03-15):
//   FIX: Admin cross-dealer quote editing now resolves the quote
//        owner's dealer for pricing instead of using the admin's
//        dealer. Prevents pricing corruption when admin edits or
//        generates PDFs for another dealer's quotes.
//
// v3.8.1 (2026-03-04):
//   FIX: GET /api/quotes/pending-actions now merges BOTH:
//        1. Quotes with pendingAction (delete/revision requests)
//        2. Line items with pending price overrides
//        Single unified response: { count, items: [...] }
//        Each item has kind: 'action' | 'override' to distinguish.
//        Frontend floating bubble now shows one combined count.
//
// v3.8 (2026-03-03):
//   FEAT: Pending Actions system for GM approval flow.
//   - POST /api/quotes/:id/request-action
//   - POST /api/quotes/:id/resolve-action
//   - GET  /api/quotes/pending-actions
//
// v3.7 (2026-03-02):
//   FIX: All :id endpoints now resolve by EITHER q.id (UUID)
//        OR q.quoteNumber (e.g. Q260228-OOD9).
// ============================================================

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const {
    readJSON, writeJSON,
    QUOTES_FILE, CUSTOMERS_FILE, PRODUCTS_FILE, DEALERS_FILE,
    generateId, getDealerPrice, recalcCustomerStats,
    sanitizeInput
} = require('../lib/helpers');
const { requireAuth, requireRole } = require('../middleware/auth');
const { generateQuotePDF } = require('../lib/quote-pdf');

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
    const rawLength    = item.length;
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

function buildLineItem(item, dealer) {
    const basePrice = parseFloat(item.basePrice || item.price) || 0;
    const productId = item.productId || '';

    let dealerPrice;
    if (!productId || productId === 'custom') {
        dealerPrice = basePrice;
    } else {
        dealerPrice = getDealerPrice(dealer, productId);
    }
    dealerPrice = Math.round(dealerPrice * 100) / 100;

    const qty          = parseInt(item.quantity) || 1;
    const length       = item.length      != null ? item.length      : null;
    const customLength = item.customLength != null ? item.customLength : null;
    const existingOverride = item.priceOverride || null;
    let effectivePrice = dealerPrice;
    if (existingOverride && existingOverride.status === 'approved') {
        effectivePrice = existingOverride.requestedPrice;
    }

    return {
        productId:     productId,
        productName:   item.productName || '',
        quantity:      qty,
        length:        length,
        customLength:  customLength,
        basePrice:     basePrice,
        tierPrice:     dealerPrice,
        price:         effectivePrice,
        total:         calcItemTotal({ price: effectivePrice, quantity: qty, length, customLength }),
        color:         item.color  || '',
        color2:        item.color2 || '',
        type:          item.type   || '',
        priceOverride: existingOverride
    };
}


// =============================================================
// SHARED HELPERS: Dual UUID / quoteNumber lookup  (v3.7)
// =============================================================

function matchesParam(q, paramId) {
    return q.id === paramId || q.quoteNumber === paramId;
}

function findQuoteByParam(quotes, paramId, user) {
    if (user.role === 'admin') {
        return quotes.find(q => matchesParam(q, paramId) && !q.deleted) || null;
    }
    return quotes.find(q =>
        matchesParam(q, paramId) && q.dealerCode === user.dealerCode && !q.deleted
    ) || null;
}

function findQuoteIndexByParam(quotes, paramId, user) {
    if (user.role === 'admin') {
        return quotes.findIndex(q => matchesParam(q, paramId) && !q.deleted);
    }
    return quotes.findIndex(q =>
        matchesParam(q, paramId) && q.dealerCode === user.dealerCode && !q.deleted
    );
}


function upsertCustomer(customerData, dealerCode, existingCustomerId) {
    if (!customerData || !customerData.name || !customerData.zipCode) {
        return customerData || {};
    }

    const customers       = readJSON(CUSTOMERS_FILE);
    const normalizedEmail = (customerData.email || '').toLowerCase().trim();
    const trimmedName     = customerData.name.trim();
    const trimmedZip      = customerData.zipCode.trim();
    const now             = new Date().toISOString();

    let existing = null;
    if (existingCustomerId) existing = customers.find(c => c.id === existingCustomerId);
    if (!existing && normalizedEmail) {
        existing = customers.find(c =>
            c.email && c.email.toLowerCase() === normalizedEmail
            && c.dealers && c.dealers.includes(dealerCode)
        );
    }
    if (!existing && !normalizedEmail) {
        existing = customers.find(c =>
            (c.name || '').toLowerCase() === trimmedName.toLowerCase()
            && (c.zipCode || '') === trimmedZip
            && c.dealers && c.dealers.includes(dealerCode)
        );
    }

    if (existing) {
        existing.name = trimmedName;
        if (normalizedEmail) existing.email = normalizedEmail;
        if (customerData.company !== undefined) existing.company = customerData.company;
        if (customerData.phone   !== undefined) existing.phone   = customerData.phone;
        if (customerData.address !== undefined) existing.address = customerData.address;
        if (customerData.city    !== undefined) existing.city    = customerData.city;
        if (customerData.state   !== undefined) existing.state   = customerData.state;
        existing.zipCode = trimmedZip;
        if (!existing.dealers) existing.dealers = [];
        if (!existing.dealers.includes(dealerCode)) existing.dealers.push(dealerCode);
        existing.lastContact = now;
        existing.updatedAt   = now;
        writeJSON(CUSTOMERS_FILE, customers);
        return existing;
    }

    const newCustomer = {
        id:           crypto.randomUUID(),
        name:         trimmedName,
        email:        normalizedEmail,
        company:      customerData.company || '',
        phone:        customerData.phone   || '',
        address:      customerData.address || '',
        city:         customerData.city    || '',
        state:        customerData.state   || '',
        zipCode:      trimmedZip,
        dealers:      [dealerCode],
        quoteCount:   0,
        totalValue:   0,
        firstContact: now,
        lastContact:  now,
        createdAt:    now,
        updatedAt:    now,
        notes:        ''
    };
    customers.push(newCustomer);
    writeJSON(CUSTOMERS_FILE, customers);
    return newCustomer;
}


// =============================================================
// FORMSPREE HELPERS  (server-side, fire-and-forget)
// =============================================================

function buildLineItemSummary(lineItems) {
    return (lineItems || []).map((li, i) =>
        `  ${i + 1}. ${li.productName || li.productId || li.type || 'Item'} x${li.quantity} @ $${li.price}`
    ).join('\n') || '(none)';
}

async function postToFormspree(formId, payload, logLabel) {
    if (!formId) {
        console.warn(`[${logLabel}] Formspree form ID not set, skipping notification.`);
        return;
    }
    try {
        const res = await fetch(`https://formspree.io/f/${formId}`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body:    JSON.stringify(payload)
        });
        if (!res.ok) {
            const errText = await res.text().catch(() => res.status.toString());
            console.warn(`[${logLabel}] Formspree error:`, errText);
        } else {
            console.log(`[${logLabel}] Formspree notification sent:`, payload._subject || '(no subject)');
        }
    } catch (err) {
        console.warn(`[${logLabel}] Formspree fetch failed (non-fatal):`, err.message);
    }
}

async function notifyRevisionViaFormspree(quote, reason, requestedBy) {
    const formId = process.env.FORMSPREE_REVISION_FORM_ID;
    const customerName = quote.customer ? (quote.customer.name || '(no name)') : '(no customer)';
    await postToFormspree(formId, {
        _subject:    `[AmeriDex Portal] Revision Requested - ${quote.quoteNumber}`,
        quoteNumber: quote.quoteNumber,
        dealerCode:  quote.dealerCode,
        customer:    customerName,
        requestedBy: requestedBy,
        totalAmount: `$${(quote.totalAmount || 0).toFixed(2)}`,
        reason:      reason,
        lineItems:   buildLineItemSummary(quote.lineItems),
        timestamp:   new Date().toISOString()
    }, 'Revision');
}

async function notifyGmEditViaFormspree(quote, editedBy, editedByRole, previousStatus) {
    const formId = process.env.FORMSPREE_REVISION_FORM_ID;
    const customerName = quote.customer ? (quote.customer.name || '(no name)') : '(no customer)';
    await postToFormspree(formId, {
        _subject:       `[AmeriDex Portal] Submitted Quote Edited - ${quote.quoteNumber}`,
        quoteNumber:    quote.quoteNumber,
        dealerCode:     quote.dealerCode,
        customer:       customerName,
        editedBy:       editedBy,
        editedByRole:   editedByRole,
        previousStatus: previousStatus,
        newStatus:      quote.status,
        totalAmount:    `$${(quote.totalAmount || 0).toFixed(2)}`,
        lineItems:      buildLineItemSummary(quote.lineItems),
        note:           `This quote was edited directly by ${editedByRole} ${editedBy} after it was already ${previousStatus}.`,
        timestamp:      new Date().toISOString()
    }, 'GmEdit');
}

async function notifySubmissionViaFormspree(quote, submittedBy, approvedBy) {
    const formId = process.env.FORMSPREE_SUBMIT_FORM_ID;
    const customerName  = quote.customer ? (quote.customer.name  || '(no name)') : '(no customer)';
    const customerEmail = quote.customer ? (quote.customer.email || '') : '';
    const customerPhone = quote.customer ? (quote.customer.phone || '') : '';
    const customerZip   = quote.customer ? (quote.customer.zipCode || '') : '';

    await postToFormspree(formId, {
        _subject:      `[AmeriDex Portal] Quote Submitted - ${quote.quoteNumber}`,
        quoteNumber:   quote.quoteNumber,
        dealerCode:    quote.dealerCode,
        submittedBy:   submittedBy,
        ...(approvedBy ? { approvedBy } : {}),
        customer:      customerName,
        customerEmail: customerEmail,
        customerPhone: customerPhone,
        customerZip:   customerZip,
        totalAmount:   `$${(quote.totalAmount || 0).toFixed(2)}`,
        itemCount:     `${(quote.lineItems || []).length} line item(s)`,
        lineItems:     buildLineItemSummary(quote.lineItems),
        notes:         quote.notes || '(none)',
        timestamp:     new Date().toISOString()
    }, 'Submit');
}

// =============================================================
// FORMSPREE: Pending Action notification to GM  (v3.8)
// Uses FORMSPREE_ACTIONS_FORM_ID env var.
// =============================================================
async function notifyPendingActionViaFormspree(quote, actionType, requestedBy, note) {
    const formId = process.env.FORMSPREE_ACTIONS_FORM_ID;
    const customerName = quote.customer ? (quote.customer.name || '(no name)') : '(no customer)';
    const actionLabel  = actionType === 'delete' ? 'Delete Request' : 'Revision Request';
    await postToFormspree(formId, {
        _subject:    `[AmeriDex Portal] GM Action Required: ${actionLabel} - ${quote.quoteNumber}`,
        actionType:  actionLabel,
        quoteNumber: quote.quoteNumber,
        dealerCode:  quote.dealerCode,
        customer:    customerName,
        requestedBy: requestedBy,
        note:        note || '(no note)',
        totalAmount: `$${(quote.totalAmount || 0).toFixed(2)}`,
        status:      quote.status,
        message:     `${requestedBy} has requested a ${actionLabel.toLowerCase()} on Quote ${quote.quoteNumber}. Please log in to the dealer portal to approve or deny this request.`,
        timestamp:   new Date().toISOString()
    }, 'PendingAction');
}


// =============================================================
// GET /api/quotes/pending-overrides (kept for back-compat)
// =============================================================
router.get('/pending-overrides', requireRole('admin', 'gm'), (req, res) => {
    const quotes  = readJSON(QUOTES_FILE);
    const results = [];

    quotes.forEach(q => {
        if (q.deleted) return;
        if (req.user.role === 'gm' && q.dealerCode !== req.user.dealerCode) return;

        (q.lineItems || []).forEach((item, idx) => {
            if (item.priceOverride && item.priceOverride.status === 'pending') {
                results.push({
                    quoteId:        q.id,
                    quoteNumber:    q.quoteNumber,
                    dealerCode:     q.dealerCode,
                    customerName:   q.customer ? (q.customer.name || q.customer.firstName || '') : '',
                    itemIndex:      idx,
                    productName:    item.productName || '',
                    tierPrice:      item.tierPrice || item.price,
                    requestedPrice: item.priceOverride.requestedPrice,
                    reason:         item.priceOverride.reason,
                    requestedBy:    item.priceOverride.requestedBy,
                    requestedAt:    item.priceOverride.requestedAt,
                    quoteStatus:    q.status,
                    quoteCreatedBy: q.createdBy
                });
            }
        });
    });

    results.sort((a, b) => (b.requestedAt || '').localeCompare(a.requestedAt || ''));
    res.json({ pending: results, count: results.length });
});


// =============================================================
// GET /api/quotes/pending-actions  (v3.8.1 MERGED)
// GM/admin only. Returns unified list of:
//   1. Quotes with pendingAction (delete/revision requests)
//   2. Line items with pending price overrides
// Response: { count, items: [...] }
// Each item has kind: 'action' | 'override'
// =============================================================
router.get('/pending-actions', requireRole('admin', 'gm'), (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const items  = [];

    quotes.forEach(q => {
        if (q.deleted) return;
        if (req.user.role === 'gm' && q.dealerCode !== req.user.dealerCode) return;

        // 1. Pending quote-level actions (delete / revision requests)
        if (q.pendingAction && q.pendingAction.type) {
            items.push({
                kind:          'action',
                quoteId:       q.id,
                quoteNumber:   q.quoteNumber,
                dealerCode:    q.dealerCode,
                customerName:  q.customer ? (q.customer.name || '') : '',
                actionType:    q.pendingAction.type,
                requestedBy:   q.pendingAction.requestedBy,
                requestedAt:   q.pendingAction.requestedAt,
                note:          q.pendingAction.note || '',
                quoteStatus:   q.status,
                totalAmount:   q.totalAmount || 0
            });
        }

        // 2. Pending price overrides on line items
        (q.lineItems || []).forEach((item, idx) => {
            if (item.priceOverride && item.priceOverride.status === 'pending') {
                items.push({
                    kind:           'override',
                    quoteId:        q.id,
                    quoteNumber:    q.quoteNumber,
                    dealerCode:     q.dealerCode,
                    customerName:   q.customer ? (q.customer.name || '') : '',
                    itemIndex:      idx,
                    productName:    item.productName || '',
                    tierPrice:      item.tierPrice || item.price,
                    requestedPrice: item.priceOverride.requestedPrice,
                    reason:         item.priceOverride.reason,
                    requestedBy:    item.priceOverride.requestedBy,
                    requestedAt:    item.priceOverride.requestedAt,
                    quoteStatus:    q.status,
                    totalAmount:    q.totalAmount || 0
                });
            }
        });
    });

    items.sort((a, b) => (b.requestedAt || '').localeCompare(a.requestedAt || ''));
    res.json({ count: items.length, items });
});


// =============================================================
// POST /api/quotes/:id/request-action  (v3.8)
// Any authenticated role. Stores a pendingAction on the quote
// and fires a Formspree email to the GM.
// Body: { type: 'delete'|'revision', note?: string }
// =============================================================
router.post('/:id/request-action', async (req, res) => {
    const { type, note } = req.body;

    if (!type || !['delete', 'revision'].includes(type)) {
        return res.status(400).json({ error: 'type must be "delete" or "revision"' });
    }

    const quotes = readJSON(QUOTES_FILE);
    const idx    = findQuoteIndexByParam(quotes, req.params.id, req.user);
    if (idx === -1) return res.status(404).json({ error: 'Quote not found' });

    // Prevent stacking a second pending action on top of an existing one
    if (quotes[idx].pendingAction) {
        return res.status(409).json({
            error: 'This quote already has a pending action awaiting GM approval',
            existing: quotes[idx].pendingAction
        });
    }

    const previousStatus = quotes[idx].status;

    quotes[idx].pendingAction = {
        type:           type,
        requestedBy:    req.user.username,
        requestedByRole: req.user.role,
        requestedAt:    new Date().toISOString(),
        note:           (note || '').trim(),
        previousStatus: previousStatus
    };

    // Set a visual status so the quote table can show a badge
    quotes[idx].status    = type === 'delete' ? 'pending-delete' : 'pending-revision';
    quotes[idx].updatedAt = new Date().toISOString();

    writeJSON(QUOTES_FILE, quotes);

    console.log('[Quotes v3.8.1] Action requested:', quotes[idx].quoteNumber,
        '| type:', type, '| by:', req.user.username, '(' + req.user.role + ')');

    res.json({
        message:     `${type === 'delete' ? 'Delete' : 'Revision'} request submitted. Awaiting GM approval.`,
        quoteNumber: quotes[idx].quoteNumber,
        status:      quotes[idx].status,
        pendingAction: quotes[idx].pendingAction
    });

    // Fire-and-forget Formspree notification to GM
    notifyPendingActionViaFormspree(quotes[idx], type, req.user.username, note || '');
});


// =============================================================
// POST /api/quotes/:id/resolve-action  (v3.8)
// GM/admin only.
// Body: { approved: true|false }
//   approved=true  + type=delete   -> soft-delete the quote
//   approved=true  + type=revision -> set status to 'revision'
//   approved=false                 -> restore previousStatus,
//                                     clear pendingAction
// =============================================================
router.post('/:id/resolve-action', requireRole('admin', 'gm'), async (req, res) => {
    const { approved } = req.body;

    if (approved === undefined || approved === null) {
        return res.status(400).json({ error: '"approved" (true or false) is required' });
    }

    const quotes = readJSON(QUOTES_FILE);
    const idx    = findQuoteIndexByParam(quotes, req.params.id, req.user);
    if (idx === -1) return res.status(404).json({ error: 'Quote not found' });

    const action = quotes[idx].pendingAction;
    if (!action) {
        return res.status(400).json({ error: 'No pending action on this quote' });
    }

    const now        = new Date().toISOString();
    const isApproved = approved === true || approved === 'true';
    const actionType = action.type;

    if (isApproved) {
        if (actionType === 'delete') {
            quotes[idx].deleted       = true;
            quotes[idx].deletedBy     = req.user.username;
            quotes[idx].deletedByRole = req.user.role;
            quotes[idx].deletedAt     = now;
            quotes[idx].status        = 'deleted';
        } else if (actionType === 'revision') {
            quotes[idx].status              = 'revision';
            quotes[idx].revisionReason      = action.note || 'Revision approved by GM';
            quotes[idx].revisionRequestedBy = action.requestedBy;
            quotes[idx].revisionRequestedAt = action.requestedAt;
            quotes[idx].revisionApprovedBy  = req.user.username;
            quotes[idx].revisionApprovedAt  = now;
        }
    } else {
        // Denied: restore the status that existed before the request
        quotes[idx].status = action.previousStatus || 'draft';
    }

    // Always clear the pending action after resolution
    quotes[idx].pendingAction = null;
    quotes[idx].updatedAt     = now;

    writeJSON(QUOTES_FILE, quotes);

    const custId = quotes[idx].customer ? quotes[idx].customer.customerId : null;
    if (isApproved && actionType === 'delete' && custId) {
        recalcCustomerStats(custId);
    }

    const outcome = isApproved ? 'APPROVED' : 'DENIED';
    console.log('[Quotes v3.8.1] Action', outcome + ':', quotes[idx].quoteNumber,
        '| type:', actionType, '| by GM:', req.user.username);

    res.json({
        message:     `Action ${outcome.toLowerCase()} successfully`,
        quoteNumber: quotes[idx].quoteNumber,
        approved:    isApproved,
        actionType:  actionType,
        status:      quotes[idx].status
    });
});


// =============================================================
// GET /api/quotes
// =============================================================
router.get('/', (req, res) => {
    const quotes = readJSON(QUOTES_FILE);

    const scopeParam      = (req.query.scope      || '').trim().toLowerCase();
    const scopeDealerCode = (req.query.dealerCode || '').trim().toUpperCase();
    let mine;

    if (req.user.role === 'admin' && scopeParam === 'global') {
        mine = quotes.filter(q => !q.deleted);
    } else if (req.user.role === 'admin' && scopeDealerCode) {
        mine = quotes.filter(q => q.dealerCode === scopeDealerCode && !q.deleted);
    } else {
        mine = quotes.filter(q => q.dealerCode === req.user.dealerCode && !q.deleted);
    }

    const statusFilter = (req.query.status || '').trim().toLowerCase();
    if (statusFilter) mine = mine.filter(q => q.status === statusFilter);

    const customerIdFilter = (req.query.customerId || '').trim();
    if (customerIdFilter) mine = mine.filter(q => q.customer && q.customer.customerId === customerIdFilter);

    const sinceFilter = req.query.since;
    if (sinceFilter) {
        const sinceDate = new Date(sinceFilter);
        if (!isNaN(sinceDate.getTime())) {
            mine = mine.filter(q => new Date(q.updatedAt || q.createdAt) >= sinceDate);
        }
    }

    const search = (req.query.search || '').trim().toLowerCase();
    if (search) {
        mine = mine.filter(q => [
            q.quoteNumber || '',
            q.customer ? (q.customer.name    || '') : '',
            q.customer ? (q.customer.company || '') : '',
            q.customer ? (q.customer.email   || '') : '',
            q.customer ? (q.customer.zipCode || '') : '',
            q.notes || ''
        ].join(' ').toLowerCase().includes(search));
    }

    const sortParam = (req.query.sort || '-updatedAt').trim();
    const sortDesc  = sortParam.startsWith('-');
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

    if (!req.query.page) return res.json(mine);

    const totalCount = mine.length;
    const limit      = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const totalPages = Math.max(Math.ceil(totalCount / limit), 1);
    const page       = Math.min(Math.max(parseInt(req.query.page) || 1, 1), totalPages);
    const startIdx   = (page - 1) * limit;
    const paged      = mine.slice(startIdx, startIdx + limit);

    res.json({
        quotes: paged,
        pagination: { page, limit, totalCount, totalPages, hasNext: page < totalPages, hasPrev: page > 1 }
    });
});


// =============================================================
// GET /api/quotes/:id  (v3.7: dual UUID/quoteNumber lookup)
// =============================================================
router.get('/:id', (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const quote  = findQuoteByParam(quotes, req.params.id, req.user);
    if (!quote) return res.status(404).json({ error: 'Quote not found' });
    res.json(quote);
});


// =============================================================
// POST /api/quotes  (v3.6: persists all frontend fields)
// =============================================================
router.post('/', (req, res) => {
    const {
        customer, lineItems, notes,
        options, specialInstructions, internalNotes,
        shippingAddress, deliveryDate
    } = req.body;
    const dealer = req.dealer;

    const items       = (lineItems || []).map(item => buildLineItem(item, dealer));
    const totalAmount = items.reduce((sum, i) => sum + i.total, 0);
    const upsertedCustomer = upsertCustomer(customer, req.user.dealerCode, null);

    const customerSnapshot = {
        customerId: upsertedCustomer.id      || null,
        name:       upsertedCustomer.name    || (customer && customer.name)    || '',
        email:      upsertedCustomer.email   || (customer && customer.email)   || '',
        company:    upsertedCustomer.company || (customer && customer.company) || '',
        phone:      upsertedCustomer.phone   || (customer && customer.phone)   || '',
        address:    upsertedCustomer.address || (customer && customer.address) || '',
        city:       upsertedCustomer.city    || (customer && customer.city)    || '',
        state:      upsertedCustomer.state   || (customer && customer.state)   || '',
        zipCode:    upsertedCustomer.zipCode || (customer && customer.zipCode) || ''
    };

    const newQuote = {
        id:                  generateId(),
        quoteNumber:         generateQuoteNumber(),
        dealerCode:          req.user.dealerCode,
        createdBy:           req.user.username,
        createdByRole:       req.user.role,
        customer:            customerSnapshot,
        lineItems:           items,
        notes:               sanitizeInput(notes || ''),
        options:             options || { pictureFrame: false, stairs: false },
        specialInstructions: sanitizeInput(specialInstructions || ''),
        internalNotes:       sanitizeInput(internalNotes       || ''),
        shippingAddress:     sanitizeInput(shippingAddress     || ''),
        deliveryDate:        deliveryDate        || '',
        pricingModel:        'per-dealer',
        totalAmount:         Math.round(totalAmount * 100) / 100,
        hasPendingOverrides: false,
        pendingAction:       null,
        status:              'draft',
        createdAt:           new Date().toISOString(),
        updatedAt:           new Date().toISOString(),
        submittedAt:         null,
        reviewedAt:          null,
        approvedAt:          null
    };

    const quotes = readJSON(QUOTES_FILE);
    quotes.push(newQuote);
    writeJSON(QUOTES_FILE, quotes);
    recalcCustomerStats(customerSnapshot.customerId);

    console.log('[Quotes v3.8.1] Created:', newQuote.quoteNumber, 'by', req.user.username,
        '| Dealer:', req.user.dealerCode, '| Customer:', customerSnapshot.name);
    res.status(201).json(newQuote);
});


// =============================================================
// PUT /api/quotes/:id  (v3.7: dual lookup)
// =============================================================
router.put('/:id', async (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const isElevated = req.user.role === 'admin' || req.user.role === 'gm';

    const idx = findQuoteIndexByParam(quotes, req.params.id, req.user);

    if (idx === -1) return res.status(404).json({ error: 'Quote not found' });

    const currentStatus  = quotes[idx].status;
    const editableByAll      = currentStatus === 'draft' || currentStatus === 'revision';
    const editableByElevated = ['submitted', 'reviewed', 'approved'].includes(currentStatus);

    if (!editableByAll && !(isElevated && editableByElevated)) {
        return res.status(400).json({
            error: 'Only draft or revision quotes can be edited',
            tip:   'Contact your GM to request a revision'
        });
    }

    const {
        customer, lineItems, notes,
        options, specialInstructions, internalNotes,
        shippingAddress, deliveryDate
    } = req.body;
    const oldCustomerId = quotes[idx].customer ? quotes[idx].customer.customerId : null;

    if (customer) {
        const existingCustomerId = (quotes[idx].customer && quotes[idx].customer.customerId) || null;
        const upsertedCustomer   = upsertCustomer(customer, quotes[idx].dealerCode, existingCustomerId);
        quotes[idx].customer = {
            customerId: upsertedCustomer.id      || null,
            name:       upsertedCustomer.name    || customer.name    || '',
            email:      upsertedCustomer.email   || customer.email   || '',
            company:    upsertedCustomer.company || customer.company || '',
            phone:      upsertedCustomer.phone   || customer.phone   || '',
            address:    upsertedCustomer.address || customer.address || '',
            city:       upsertedCustomer.city    || customer.city    || '',
            state:      upsertedCustomer.state   || customer.state   || '',
            zipCode:    upsertedCustomer.zipCode || customer.zipCode || ''
        };
    }

    if (notes !== undefined)               quotes[idx].notes               = sanitizeInput(notes);
    if (options !== undefined)              quotes[idx].options             = options;
    if (specialInstructions !== undefined)  quotes[idx].specialInstructions = sanitizeInput(specialInstructions);
    if (internalNotes !== undefined)        quotes[idx].internalNotes       = sanitizeInput(internalNotes);
    if (shippingAddress !== undefined)      quotes[idx].shippingAddress     = sanitizeInput(shippingAddress);
    if (deliveryDate !== undefined)         quotes[idx].deliveryDate        = deliveryDate;

    if (lineItems) {
        // Use the quote owner's dealer for pricing, not the logged-in user's dealer.
        // When admin edits another dealer's quote, req.dealer is the admin's dealer
        // which would apply the wrong pricing. Look up the quote's dealerCode instead.
        let dealer = req.dealer;
        if (req.user.role === 'admin' && quotes[idx].dealerCode &&
            quotes[idx].dealerCode.toUpperCase() !== req.user.dealerCode.toUpperCase()) {
            const dealers = readJSON(DEALERS_FILE);
            const ownerDealer = dealers.find(d =>
                d.dealerCode.toUpperCase() === quotes[idx].dealerCode.toUpperCase() && d.isActive
            );
            if (ownerDealer) dealer = ownerDealer;
        }
        quotes[idx].lineItems = lineItems.map(item => buildLineItem(item, dealer));
        recalcQuoteTotal(quotes[idx]);
        quotes[idx].hasPendingOverrides = quotes[idx].lineItems.some(
            i => i.priceOverride && i.priceOverride.status === 'pending'
        );
    }

    if (isElevated && editableByElevated) {
        quotes[idx].editedBy     = req.user.username;
        quotes[idx].editedByRole = req.user.role;
        quotes[idx].gmEditedAt   = new Date().toISOString();
    }

    quotes[idx].updatedAt = new Date().toISOString();
    writeJSON(QUOTES_FILE, quotes);

    const newCustomerId = quotes[idx].customer ? quotes[idx].customer.customerId : null;
    if (newCustomerId) recalcCustomerStats(newCustomerId);
    if (oldCustomerId && oldCustomerId !== newCustomerId) recalcCustomerStats(oldCustomerId);

    console.log('[Quotes v3.8.1] PUT:', quotes[idx].quoteNumber,
        '| status:', currentStatus,
        '| by:', req.user.username, '(' + req.user.role + ')');

    res.json(quotes[idx]);

    if (isElevated && editableByElevated) {
        notifyGmEditViaFormspree(quotes[idx], req.user.username, req.user.role, currentStatus);
    }
});


// =============================================================
// PATCH /api/quotes/:id/revision  (v3.7: dual lookup)
// GM or admin only. Sets status -> 'revision'.
// =============================================================
router.patch('/:id/revision', requireRole('admin', 'gm'), async (req, res) => {
    const { reason, notify } = req.body;

    if (!reason || !reason.trim()) {
        return res.status(400).json({ error: 'A revision reason is required' });
    }

    const quotes = readJSON(QUOTES_FILE);
    const idx = findQuoteIndexByParam(quotes, req.params.id, req.user);

    if (idx === -1) return res.status(404).json({ error: 'Quote not found' });

    const allowedStatuses = ['submitted', 'reviewed', 'approved'];
    if (!allowedStatuses.includes(quotes[idx].status)) {
        return res.status(400).json({
            error: 'Revision can only be requested on submitted, reviewed, or approved quotes',
            currentStatus: quotes[idx].status
        });
    }

    quotes[idx].status               = 'revision';
    quotes[idx].revisionReason       = reason.trim();
    quotes[idx].revisionRequestedBy  = req.user.username;
    quotes[idx].revisionRequestedAt  = new Date().toISOString();
    quotes[idx].updatedAt            = new Date().toISOString();

    writeJSON(QUOTES_FILE, quotes);

    console.log('[Quotes v3.8.1] Revision requested:', quotes[idx].quoteNumber,
        'by', req.user.username, '| Reason:', reason.trim());

    res.json({ status: 'revision', quoteNumber: quotes[idx].quoteNumber });

    if (notify === true || notify === 'true') {
        notifyRevisionViaFormspree(quotes[idx], reason.trim(), req.user.username);
    }
});


// =============================================================
// POST /api/quotes/:id/approve-revision  (v3.7: dual lookup)
// GM or admin only.
// =============================================================
router.post('/:id/approve-revision', requireRole('admin', 'gm'), async (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const idx = findQuoteIndexByParam(quotes, req.params.id, req.user);

    if (idx === -1) return res.status(404).json({ error: 'Quote not found' });

    if (quotes[idx].status !== 'revision') {
        return res.status(400).json({
            error: 'Only revision-status quotes can be approved',
            currentStatus: quotes[idx].status
        });
    }

    if (!quotes[idx].lineItems || quotes[idx].lineItems.length === 0) {
        return res.status(400).json({ error: 'Cannot submit a quote with no line items' });
    }

    const pendingCount = quotes[idx].lineItems.filter(
        i => i.priceOverride && i.priceOverride.status === 'pending'
    ).length;
    if (pendingCount > 0) {
        return res.status(400).json({
            error: `Cannot approve revision with ${pendingCount} pending price override(s). Resolve overrides first.`,
            pendingOverrides: pendingCount
        });
    }

    const now = new Date().toISOString();
    quotes[idx].status               = 'submitted';
    quotes[idx].submittedAt          = now;
    quotes[idx].revisionApprovedBy   = req.user.username;
    quotes[idx].revisionApprovedAt   = now;
    quotes[idx].updatedAt            = now;

    writeJSON(QUOTES_FILE, quotes);

    console.log('[Quotes v3.8.1] Revision approved:', quotes[idx].quoteNumber,
        'by', req.user.username, '(' + req.user.role + ')');

    res.json(quotes[idx]);

    notifySubmissionViaFormspree(quotes[idx], quotes[idx].createdBy, req.user.username);
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
    const quote = quotes.find(q =>
        matchesParam(q, req.params.id) && q.dealerCode === req.user.dealerCode && !q.deleted
    );
    if (!quote) return res.status(404).json({ error: 'Quote not found' });
    if (quote.status !== 'draft' && quote.status !== 'revision') {
        return res.status(400).json({ error: 'Price overrides can only be requested on draft or revision quotes' });
    }

    const itemIdx = parseInt(req.params.itemIndex);
    if (isNaN(itemIdx) || itemIdx < 0 || itemIdx >= quote.lineItems.length) {
        return res.status(404).json({ error: 'Line item not found at index ' + req.params.itemIndex });
    }

    const item = quote.lineItems[itemIdx];
    const isAutoApprover = (req.user.role === 'gm' || req.user.role === 'admin');

    item.priceOverride = {
        requestedPrice:    Math.round(price * 100) / 100,
        originalTierPrice: item.tierPrice,
        reason:            reason.trim(),
        requestedBy:       req.user.username,
        requestedByRole:   req.user.role,
        requestedAt:       new Date().toISOString(),
        status:            isAutoApprover ? 'approved' : 'pending',
        approvedBy:        isAutoApprover ? req.user.username : null,
        approvedAt:        isAutoApprover ? new Date().toISOString() : null,
        rejectedBy:        null,
        rejectedAt:        null,
        rejectedReason:    null
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

    // Recalculate customer stats when auto-approved override changes totalAmount
    if (isAutoApprover) {
        const custId = quote.customer ? quote.customer.customerId : null;
        if (custId) recalcCustomerStats(custId);
    }

    const action = isAutoApprover ? 'Override applied' : 'Override requested';
    console.log('[Quotes v3.8.1]', action + ':', quote.quoteNumber, 'item #' + itemIdx,
        '$' + item.tierPrice, '->', '$' + item.priceOverride.requestedPrice,
        'by', req.user.username, '(' + req.user.role + ')',
        '| Reason:', reason.trim());

    res.json({ message: action + ' successfully', item, quote });
});


// =============================================================
// POST /api/quotes/:id/items/:itemIndex/approve-override
// =============================================================
router.post('/:id/items/:itemIndex/approve-override', requireRole('admin', 'gm'), (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const quote  = findQuoteByParam(quotes, req.params.id, { role: 'admin', dealerCode: req.user.dealerCode });
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

    item.priceOverride.status     = 'approved';
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

    // Recalculate customer stats (totalAmount changed)
    const custId = quote.customer ? quote.customer.customerId : null;
    if (custId) recalcCustomerStats(custId);

    console.log('[Quotes v3.8.1] Override APPROVED:', quote.quoteNumber, 'item #' + itemIdx,
        '$' + item.priceOverride.originalTierPrice, '->', '$' + item.priceOverride.requestedPrice,
        'by', req.user.username, '(requested by', item.priceOverride.requestedBy + ')');

    res.json({ message: 'Price override approved', item, quote });
});


// =============================================================
// POST /api/quotes/:id/items/:itemIndex/reject-override
// =============================================================
router.post('/:id/items/:itemIndex/reject-override', requireRole('admin', 'gm'), (req, res) => {
    const { rejectedReason } = req.body;

    const quotes = readJSON(QUOTES_FILE);
    const quote  = findQuoteByParam(quotes, req.params.id, { role: 'admin', dealerCode: req.user.dealerCode });
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

    item.priceOverride.status         = 'rejected';
    item.priceOverride.rejectedBy     = req.user.username;
    item.priceOverride.rejectedAt     = new Date().toISOString();
    item.priceOverride.rejectedReason = (rejectedReason || '').trim() || null;
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

    // Recalculate customer stats (totalAmount reverted to tier price)
    const custId = quote.customer ? quote.customer.customerId : null;
    if (custId) recalcCustomerStats(custId);

    console.log('[Quotes v3.8.1] Override REJECTED:', quote.quoteNumber, 'item #' + itemIdx,
        'requested $' + item.priceOverride.requestedPrice,
        'by', req.user.username, '| Reason:', item.priceOverride.rejectedReason || 'none');

    res.json({ message: 'Price override rejected', item, quote });
});


// =============================================================
// POST /api/quotes/:id/submit  (v3.7: dual lookup)
// =============================================================
router.post('/:id/submit', async (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const idx = quotes.findIndex(q =>
        matchesParam(q, req.params.id) && q.dealerCode === req.user.dealerCode && !q.deleted
    );
    if (idx === -1) return res.status(404).json({ error: 'Quote not found' });

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

    quotes[idx].status      = 'submitted';
    quotes[idx].submittedAt = new Date().toISOString();
    quotes[idx].updatedAt   = new Date().toISOString();
    writeJSON(QUOTES_FILE, quotes);

    console.log('[Quotes v3.8.1] Submitted:', quotes[idx].quoteNumber, 'by', req.user.username);

    res.json(quotes[idx]);

    notifySubmissionViaFormspree(quotes[idx], req.user.username, null);
});


// =============================================================
// DELETE /api/quotes/:id  (v3.7: dual lookup)
// GM/admin only direct delete (no pending action required)
// =============================================================
router.delete('/:id', requireRole('admin', 'gm'), (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const idx = findQuoteIndexByParam(quotes, req.params.id, req.user);
    if (idx === -1) return res.status(404).json({ error: 'Quote not found' });

    quotes[idx].deleted       = true;
    quotes[idx].deletedBy     = req.user.username;
    quotes[idx].deletedByRole = req.user.role;
    quotes[idx].deletedAt     = new Date().toISOString();
    quotes[idx].pendingAction = null;
    quotes[idx].updatedAt     = new Date().toISOString();
    writeJSON(QUOTES_FILE, quotes);

    const custId = quotes[idx].customer ? quotes[idx].customer.customerId : null;
    if (custId) recalcCustomerStats(custId);

    console.log('[Quotes v3.8.1] Soft-deleted:', quotes[idx].quoteNumber, 'by', req.user.username, '(' + req.user.role + ')');
    res.json({ message: 'Quote ' + quotes[idx].quoteNumber + ' deleted' });
});


// =============================================================
// POST /api/quotes/:id/duplicate  (v3.7: dual lookup)
// =============================================================
router.post('/:id/duplicate', (req, res) => {
    const quotes   = readJSON(QUOTES_FILE);
    const original = findQuoteByParam(quotes, req.params.id, req.user);
    if (!original) return res.status(404).json({ error: 'Quote not found' });

    const dup = JSON.parse(JSON.stringify(original));
    dup.id             = generateId();
    dup.quoteNumber    = generateQuoteNumber();
    dup.status         = 'draft';
    dup.createdBy      = req.user.username;
    dup.createdByRole  = req.user.role;
    dup.createdAt      = new Date().toISOString();
    dup.updatedAt      = new Date().toISOString();
    dup.submittedAt    = null;
    dup.reviewedAt     = null;
    dup.approvedAt     = null;
    dup.pricingModel   = 'per-dealer';
    dup.pendingAction  = null;
    dup.revisionReason        = null;
    dup.revisionRequestedBy   = null;
    dup.revisionRequestedAt   = null;
    dup.revisionApprovedBy    = null;
    dup.revisionApprovedAt    = null;
    dup.editedBy     = null;
    dup.editedByRole = null;
    dup.gmEditedAt   = null;

    if (req.user.role === 'admin' && dup.dealerCode !== req.user.dealerCode) {
        dup.dealerCode = req.user.dealerCode;
    }

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

    console.log('[Quotes v3.8.1] Duplicated:', original.quoteNumber, '->', dup.quoteNumber);
    res.status(201).json(dup);
});


// =============================================================
// GET /api/quotes/:id/pdf  (v3.7: dual lookup)
// =============================================================
router.get('/:id/pdf', async (req, res) => {
    try {
        const quotes = readJSON(QUOTES_FILE);
        const quote  = findQuoteByParam(quotes, req.params.id, req.user);
        if (!quote) return res.status(404).json({ error: 'Quote not found' });

        // Use the quote owner's dealer for PDF generation, not the logged-in user's dealer
        let dealer = req.dealer;
        if (req.user.role === 'admin' && quote.dealerCode &&
            quote.dealerCode.toUpperCase() !== req.user.dealerCode.toUpperCase()) {
            const dealers = readJSON(DEALERS_FILE);
            const ownerDealer = dealers.find(d =>
                d.dealerCode.toUpperCase() === quote.dealerCode.toUpperCase() && d.isActive
            );
            if (ownerDealer) dealer = ownerDealer;
        }
        const customers = readJSON(CUSTOMERS_FILE);
        const customer  = customers.find(c => c.id === quote.customer.customerId) || quote.customer;
        const pdfBuffer = await generateQuotePDF(quote, dealer, customer);
        const filename  = `${quote.quoteNumber}.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        res.send(pdfBuffer);

        console.log('[Quotes v3.8.1] PDF generated:', quote.quoteNumber, 'by', req.user.username);
    } catch (error) {
        console.error('[Quotes v3.8.1] PDF generation error:', error);
        res.status(500).json({ error: 'Failed to generate PDF', details: error.message });
    }
});


module.exports = router;
