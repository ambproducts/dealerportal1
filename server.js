// ============================================================
// AmeriDex Dealer Portal - Backend Server v1.0
// Date: 2026-02-13
// ============================================================
// HOW TO RUN:
//   1. Install Node.js (https://nodejs.org)
//   2. In this folder, run: npm install
//   3. Then run: node server.js
//   4. Open http://localhost:3000 in your browser
// ============================================================

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const app = express();
const PORT = process.env.PORT || 3000;

// ---- Middleware ----
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- Data File Paths ----
const DATA_DIR = path.join(__dirname, 'data');
const DEALERS_FILE = path.join(DATA_DIR, 'dealers.json');
const QUOTES_FILE = path.join(DATA_DIR, 'quotes.json');
const TIERS_FILE = path.join(DATA_DIR, 'pricing-tiers.json');

// ---- Ensure data directory and files exist ----
function ensureDataFiles() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(TIERS_FILE)) {
        const defaultTiers = [
            { slug: 'standard', label: 'Standard', multiplier: 1.00 },
            { slug: 'preferred', label: 'Preferred', multiplier: 0.90 },
            { slug: 'vip', label: 'VIP', multiplier: 0.85 }
        ];
        fs.writeFileSync(TIERS_FILE, JSON.stringify(defaultTiers, null, 2));
    }
    if (!fs.existsSync(QUOTES_FILE)) {
        fs.writeFileSync(QUOTES_FILE, JSON.stringify([], null, 2));
    }
    if (!fs.existsSync(DEALERS_FILE)) {
        // Seed with the admin account (PAT123)
        const adminHash = hashPassword('ameridex2026');
        const defaultDealers = [
            {
                id: generateId(),
                dealerCode: 'PAT123',
                passwordHash: adminHash,
                dealerName: 'AmeriDex Admin',
                contactPerson: 'Pat',
                email: 'admin@ameridex.com',
                phone: '',
                pricingTier: 'standard',
                role: 'admin',
                isActive: true,
                createdAt: new Date().toISOString(),
                lastLoginAt: null
            }
        ];
        fs.writeFileSync(DEALERS_FILE, JSON.stringify(defaultDealers, null, 2));
        console.log('');
        console.log('========================================');
        console.log('  ADMIN ACCOUNT CREATED');
        console.log('  Dealer Code: PAT123');
        console.log('  Password:    ameridex2026');
        console.log('  ** Change this password immediately **');
        console.log('========================================');
        console.log('');
    }
}

// ---- Helpers ----
function generateId() {
    return 'd-' + crypto.randomBytes(8).toString('hex');
}

function hashPassword(plaintext) {
    // SHA-256 with salt. For <50 users on a private portal,
    // this is adequate. For public-facing, upgrade to bcrypt.
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.createHash('sha256')
        .update(salt + plaintext)
        .digest('hex');
    return salt + ':' + hash;
}

function verifyPassword(plaintext, stored) {
    const [salt, hash] = stored.split(':');
    const check = crypto.createHash('sha256')
        .update(salt + plaintext)
        .digest('hex');
    return check === hash;
}

function generateToken(dealer) {
    // Simple signed token: base64(payload).signature
    // For <50 users on a LAN/private host, this is practical.
    // For public internet, swap to jsonwebtoken (JWT) library.
    const payload = {
        id: dealer.id,
        dealerCode: dealer.dealerCode,
        role: dealer.role,
        pricingTier: dealer.pricingTier,
        iat: Date.now(),
        exp: Date.now() + (8 * 60 * 60 * 1000) // 8 hours
    };
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const secret = process.env.TOKEN_SECRET || 'ameridex-portal-secret-change-me';
    const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
    return payloadB64 + '.' + sig;
}

function verifyToken(token) {
    try {
        const [payloadB64, sig] = token.split('.');
        const secret = process.env.TOKEN_SECRET || 'ameridex-portal-secret-change-me';
        const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
        if (sig !== expectedSig) return null;
        const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
        if (payload.exp < Date.now()) return null;
        return payload;
    } catch (e) {
        return null;
    }
}

function readJSON(filepath) {
    return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
}

function writeJSON(filepath, data) {
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}

// ---- Auth Middleware ----
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    const token = authHeader.slice(7);
    const payload = verifyToken(token);
    if (!payload) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
    // Verify dealer is still active
    const dealers = readJSON(DEALERS_FILE);
    const dealer = dealers.find(d => d.id === payload.id && d.isActive);
    if (!dealer) {
        return res.status(401).json({ error: 'Account deactivated' });
    }
    req.dealer = payload;
    next();
}

function requireAdmin(req, res, next) {
    if (req.dealer.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}


// ===========================================================
// AUTH ENDPOINTS
// ===========================================================

// POST /api/auth/login
app.post('/api/auth/login', (req, res) => {
    const { dealerCode, password } = req.body;
    if (!dealerCode || !password) {
        return res.status(400).json({ error: 'Dealer code and password required' });
    }
    const dealers = readJSON(DEALERS_FILE);
    const dealer = dealers.find(
        d => d.dealerCode.toUpperCase() === dealerCode.toUpperCase() && d.isActive
    );
    if (!dealer || !verifyPassword(password, dealer.passwordHash)) {
        return res.status(401).json({ error: 'Invalid dealer code or password' });
    }
    // Update last login
    dealer.lastLoginAt = new Date().toISOString();
    writeJSON(DEALERS_FILE, dealers);

    const token = generateToken(dealer);
    res.json({
        token,
        dealer: {
            id: dealer.id,
            dealerCode: dealer.dealerCode,
            dealerName: dealer.dealerName,
            contactPerson: dealer.contactPerson,
            email: dealer.email,
            phone: dealer.phone,
            pricingTier: dealer.pricingTier,
            role: dealer.role
        }
    });
});

// POST /api/auth/logout (client discards token; server logs event)
app.post('/api/auth/logout', requireAuth, (req, res) => {
    res.json({ ok: true });
});

// GET /api/auth/me (verify token and return current dealer info)
app.get('/api/auth/me', requireAuth, (req, res) => {
    const dealers = readJSON(DEALERS_FILE);
    const dealer = dealers.find(d => d.id === req.dealer.id);
    if (!dealer) return res.status(404).json({ error: 'Dealer not found' });
    res.json({
        id: dealer.id,
        dealerCode: dealer.dealerCode,
        dealerName: dealer.dealerName,
        contactPerson: dealer.contactPerson,
        email: dealer.email,
        phone: dealer.phone,
        pricingTier: dealer.pricingTier,
        role: dealer.role
    });
});


// ===========================================================
// PRODUCT ENDPOINTS
// ===========================================================

// GET /api/products (returns catalog with tier-adjusted pricing)
app.get('/api/products', requireAuth, (req, res) => {
    const tiers = readJSON(TIERS_FILE);
    const tier = tiers.find(t => t.slug === req.dealer.pricingTier) || tiers[0];

    // Base product config (same structure as frontend PRODUCT_CONFIG)
    const baseProducts = {
        system:   { name: 'AmeriDex System Boards (Grooved, Dexerdry included)', basePrice: 8.00, isFt: true, hasColor: true, lengthType: 'board' },
        grooved:  { name: 'Grooved Deck Boards (no Dexerdry)', basePrice: 6.00, isFt: true, hasColor: true, lengthType: 'board' },
        solid:    { name: 'Solid Edge Deck Boards', basePrice: 6.00, isFt: true, hasColor: true, lengthType: 'board' },
        dexerdry: { name: 'Dexerdry Seals (standalone)', basePrice: 2.00, isFt: true, hasColor: false, lengthType: 'coil' },
        screws:   { name: 'Epoxy-Coated Screws', basePrice: 37.00, isFt: false, hasColor: false },
        plugs:    { name: 'Color-Matching Plugs', basePrice: 33.79, isFt: false, hasColor: false },
        blueclaw: { name: 'Dexerdry BlueClaw', basePrice: 150.00, isFt: false, hasColor: false },
        custom:   { name: 'Custom / Manual Item', basePrice: 0, isFt: false, hasColor: false }
    };

    // Apply tier multiplier
    const adjusted = {};
    for (const [key, prod] of Object.entries(baseProducts)) {
        adjusted[key] = {
            ...prod,
            price: Math.round(prod.basePrice * tier.multiplier * 100) / 100
        };
    }

    res.json({
        tier: { slug: tier.slug, label: tier.label, multiplier: tier.multiplier },
        products: adjusted
    });
});


// ===========================================================
// QUOTE ENDPOINTS (Dealer-facing)
// ===========================================================

// GET /api/quotes (dealer's own quotes)
app.get('/api/quotes', requireAuth, (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const mine = quotes.filter(q => q.dealerId === req.dealer.id);
    // Sort newest first
    mine.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
    res.json(mine);
});

// POST /api/quotes (create or save quote)
app.post('/api/quotes', requireAuth, (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const quote = {
        id: generateId(),
        quoteNumber: req.body.quoteNumber || null,
        dealerId: req.dealer.id,
        dealerCode: req.dealer.dealerCode,
        status: 'draft',
        customer: req.body.customer || {},
        lineItems: req.body.lineItems || [],
        options: req.body.options || {},
        specialInstructions: req.body.specialInstructions || '',
        internalNotes: req.body.internalNotes || '',
        shippingAddress: req.body.shippingAddress || '',
        deliveryDate: req.body.deliveryDate || null,
        totalAmount: req.body.totalAmount || 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        submittedAt: null
    };
    quotes.push(quote);
    writeJSON(QUOTES_FILE, quotes);
    res.status(201).json(quote);
});

// PUT /api/quotes/:id (update existing quote)
app.put('/api/quotes/:id', requireAuth, (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const idx = quotes.findIndex(q => q.id === req.params.id && q.dealerId === req.dealer.id);
    if (idx === -1) return res.status(404).json({ error: 'Quote not found' });
    if (quotes[idx].status === 'approved') {
        return res.status(400).json({ error: 'Cannot edit an approved quote' });
    }

    // Allow re-editing quotes marked "revision"
    const editable = ['draft', 'revision'];
    if (!editable.includes(quotes[idx].status)) {
        return res.status(400).json({ error: 'Quote cannot be edited in its current status' });
    }

    const updatable = ['customer', 'lineItems', 'options', 'specialInstructions',
                       'internalNotes', 'shippingAddress', 'deliveryDate', 'totalAmount'];
    updatable.forEach(field => {
        if (req.body[field] !== undefined) quotes[idx][field] = req.body[field];
    });
    quotes[idx].updatedAt = new Date().toISOString();
    writeJSON(QUOTES_FILE, quotes);
    res.json(quotes[idx]);
});

// DELETE /api/quotes/:id (delete draft only)
app.delete('/api/quotes/:id', requireAuth, (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const idx = quotes.findIndex(q => q.id === req.params.id && q.dealerId === req.dealer.id);
    if (idx === -1) return res.status(404).json({ error: 'Quote not found' });
    if (quotes[idx].status !== 'draft') {
        return res.status(400).json({ error: 'Only draft quotes can be deleted' });
    }
    quotes.splice(idx, 1);
    writeJSON(QUOTES_FILE, quotes);
    res.json({ ok: true });
});

// POST /api/quotes/:id/submit (submit for formal review)
app.post('/api/quotes/:id/submit', requireAuth, (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const idx = quotes.findIndex(q => q.id === req.params.id && q.dealerId === req.dealer.id);
    if (idx === -1) return res.status(404).json({ error: 'Quote not found' });
    if (!['draft', 'revision'].includes(quotes[idx].status)) {
        return res.status(400).json({ error: 'Quote cannot be submitted in its current status' });
    }
    quotes[idx].status = 'submitted';
    quotes[idx].submittedAt = new Date().toISOString();
    quotes[idx].updatedAt = new Date().toISOString();
    writeJSON(QUOTES_FILE, quotes);
    res.json(quotes[idx]);
});

// POST /api/quotes/:id/duplicate (copy quote as new draft)
app.post('/api/quotes/:id/duplicate', requireAuth, (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const original = quotes.find(q => q.id === req.params.id && q.dealerId === req.dealer.id);
    if (!original) return res.status(404).json({ error: 'Quote not found' });

    const duplicate = {
        id: generateId(),
        quoteNumber: null, // Will be assigned by frontend
        dealerId: req.dealer.id,
        dealerCode: req.dealer.dealerCode,
        status: 'draft',
        customer: { name: '', email: '', zipCode: '', company: '', phone: '' },
        lineItems: JSON.parse(JSON.stringify(original.lineItems)),
        options: { ...original.options },
        specialInstructions: original.specialInstructions,
        internalNotes: '',
        shippingAddress: '',
        deliveryDate: null,
        totalAmount: original.totalAmount,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        submittedAt: null
    };
    quotes.push(duplicate);
    writeJSON(QUOTES_FILE, quotes);
    res.status(201).json(duplicate);
});


// ===========================================================
// DEALER PROFILE ENDPOINT
// ===========================================================

// PUT /api/dealer/profile (update own contact info)
app.put('/api/dealer/profile', requireAuth, (req, res) => {
    const dealers = readJSON(DEALERS_FILE);
    const idx = dealers.findIndex(d => d.id === req.dealer.id);
    if (idx === -1) return res.status(404).json({ error: 'Dealer not found' });

    const allowed = ['dealerName', 'contactPerson', 'phone'];
    allowed.forEach(field => {
        if (req.body[field] !== undefined) dealers[idx][field] = req.body[field];
    });
    writeJSON(DEALERS_FILE, dealers);
    res.json({
        id: dealers[idx].id,
        dealerCode: dealers[idx].dealerCode,
        dealerName: dealers[idx].dealerName,
        contactPerson: dealers[idx].contactPerson,
        email: dealers[idx].email,
        phone: dealers[idx].phone,
        pricingTier: dealers[idx].pricingTier,
        role: dealers[idx].role
    });
});


// ===========================================================
// ADMIN ENDPOINTS
// ===========================================================

// GET /api/admin/dealers
app.get('/api/admin/dealers', requireAuth, requireAdmin, (req, res) => {
    const dealers = readJSON(DEALERS_FILE);
    // Strip password hashes from response
    const safe = dealers.map(d => {
        const { passwordHash, ...rest } = d;
        return rest;
    });
    res.json(safe);
});

// POST /api/admin/dealers (create new dealer)
app.post('/api/admin/dealers', requireAuth, requireAdmin, (req, res) => {
    const { dealerCode, password, dealerName, contactPerson, email, phone, pricingTier, role } = req.body;
    if (!dealerCode || !password) {
        return res.status(400).json({ error: 'Dealer code and password required' });
    }
    if (!/^[A-Z0-9]{6}$/i.test(dealerCode)) {
        return res.status(400).json({ error: 'Dealer code must be 6 alphanumeric characters' });
    }
    if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const dealers = readJSON(DEALERS_FILE);
    if (dealers.find(d => d.dealerCode.toUpperCase() === dealerCode.toUpperCase())) {
        return res.status(409).json({ error: 'Dealer code already exists' });
    }

    const newDealer = {
        id: generateId(),
        dealerCode: dealerCode.toUpperCase(),
        passwordHash: hashPassword(password),
        dealerName: dealerName || '',
        contactPerson: contactPerson || '',
        email: email || '',
        phone: phone || '',
        pricingTier: pricingTier || 'standard',
        role: role || 'dealer',
        isActive: true,
        createdAt: new Date().toISOString(),
        lastLoginAt: null
    };
    dealers.push(newDealer);
    writeJSON(DEALERS_FILE, dealers);

    const { passwordHash, ...safe } = newDealer;
    res.status(201).json(safe);
});

// PUT /api/admin/dealers/:id (edit dealer)
app.put('/api/admin/dealers/:id', requireAuth, requireAdmin, (req, res) => {
    const dealers = readJSON(DEALERS_FILE);
    const idx = dealers.findIndex(d => d.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Dealer not found' });

    const allowed = ['dealerName', 'contactPerson', 'email', 'phone', 'pricingTier', 'role', 'isActive'];
    allowed.forEach(field => {
        if (req.body[field] !== undefined) dealers[idx][field] = req.body[field];
    });
    writeJSON(DEALERS_FILE, dealers);

    const { passwordHash, ...safe } = dealers[idx];
    res.json(safe);
});

// DELETE /api/admin/dealers/:id (deactivate, not hard delete)
app.delete('/api/admin/dealers/:id', requireAuth, requireAdmin, (req, res) => {
    const dealers = readJSON(DEALERS_FILE);
    const idx = dealers.findIndex(d => d.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Dealer not found' });

    // Prevent deactivating yourself
    if (dealers[idx].id === req.dealer.id) {
        return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }
    dealers[idx].isActive = false;
    writeJSON(DEALERS_FILE, dealers);

    const { passwordHash, ...safe } = dealers[idx];
    res.json(safe);
});

// POST /api/admin/dealers/:id/reset (reset password)
app.post('/api/admin/dealers/:id/reset', requireAuth, requireAdmin, (req, res) => {
    const dealers = readJSON(DEALERS_FILE);
    const idx = dealers.findIndex(d => d.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Dealer not found' });

    // Generate a random temporary password
    const tempPassword = crypto.randomBytes(4).toString('hex'); // 8 chars hex
    dealers[idx].passwordHash = hashPassword(tempPassword);
    writeJSON(DEALERS_FILE, dealers);

    // Return the temp password ONCE for the admin to communicate
    res.json({
        dealerCode: dealers[idx].dealerCode,
        temporaryPassword: tempPassword,
        message: 'Give this password to the dealer. They should change it on first login.'
    });
});

// POST /api/admin/dealers/:id/change-password (admin or self)
app.post('/api/admin/dealers/:id/change-password', requireAuth, (req, res) => {
    const dealers = readJSON(DEALERS_FILE);
    const idx = dealers.findIndex(d => d.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Dealer not found' });

    // Only admin or the dealer themselves can change password
    if (req.dealer.role !== 'admin' && req.dealer.id !== req.params.id) {
        return res.status(403).json({ error: 'Not authorized' });
    }
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    dealers[idx].passwordHash = hashPassword(newPassword);
    writeJSON(DEALERS_FILE, dealers);
    res.json({ ok: true, message: 'Password updated successfully' });
});


// ===========================================================
// ADMIN: QUOTE MANAGEMENT
// ===========================================================

// GET /api/admin/quotes (all quotes across all dealers)
app.get('/api/admin/quotes', requireAuth, requireAdmin, (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    // Optional filters
    const { dealerCode, status, from, to } = req.query;
    let filtered = quotes;
    if (dealerCode) {
        filtered = filtered.filter(q => q.dealerCode === dealerCode.toUpperCase());
    }
    if (status) {
        filtered = filtered.filter(q => q.status === status);
    }
    if (from) {
        filtered = filtered.filter(q => new Date(q.createdAt) >= new Date(from));
    }
    if (to) {
        filtered = filtered.filter(q => new Date(q.createdAt) <= new Date(to + 'T23:59:59'));
    }
    filtered.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
    res.json(filtered);
});

// PUT /api/admin/quotes/:id/status (change quote status)
app.put('/api/admin/quotes/:id/status', requireAuth, requireAdmin, (req, res) => {
    const { status } = req.body;
    const validStatuses = ['draft', 'submitted', 'reviewed', 'approved', 'revision'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status. Must be: ' + validStatuses.join(', ') });
    }
    const quotes = readJSON(QUOTES_FILE);
    const idx = quotes.findIndex(q => q.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Quote not found' });

    quotes[idx].status = status;
    quotes[idx].updatedAt = new Date().toISOString();
    writeJSON(QUOTES_FILE, quotes);
    res.json(quotes[idx]);
});

// GET /api/admin/export/quotes (CSV download)
app.get('/api/admin/export/quotes', requireAuth, requireAdmin, (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const headers = ['Quote Number', 'Dealer Code', 'Status', 'Customer Name',
                     'Customer Email', 'Customer Zip', 'Total Amount',
                     'Created', 'Submitted', 'Line Item Count'];
    const rows = quotes.map(q => [
        q.quoteNumber || '',
        q.dealerCode || '',
        q.status || '',
        (q.customer && q.customer.name) || '',
        (q.customer && q.customer.email) || '',
        (q.customer && q.customer.zipCode) || '',
        q.totalAmount || 0,
        q.createdAt || '',
        q.submittedAt || '',
        (q.lineItems && q.lineItems.length) || 0
    ]);

    const csvContent = [headers.join(',')]
        .concat(rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')))
        .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="ameridex-quotes-export.csv"');
    res.send(csvContent);
});


// ===========================================================
// ADMIN: PRICING TIERS
// ===========================================================

// GET /api/admin/pricing-tiers
app.get('/api/admin/pricing-tiers', requireAuth, requireAdmin, (req, res) => {
    res.json(readJSON(TIERS_FILE));
});

// PUT /api/admin/pricing-tiers/:slug
app.put('/api/admin/pricing-tiers/:slug', requireAuth, requireAdmin, (req, res) => {
    const tiers = readJSON(TIERS_FILE);
    const idx = tiers.findIndex(t => t.slug === req.params.slug);
    if (idx === -1) return res.status(404).json({ error: 'Tier not found' });

    if (req.body.label !== undefined) tiers[idx].label = req.body.label;
    if (req.body.multiplier !== undefined) {
        const m = parseFloat(req.body.multiplier);
        if (isNaN(m) || m <= 0 || m > 2) {
            return res.status(400).json({ error: 'Multiplier must be between 0.01 and 2.00' });
        }
        tiers[idx].multiplier = Math.round(m * 100) / 100;
    }
    writeJSON(TIERS_FILE, tiers);
    res.json(tiers[idx]);
});


// ===========================================================
// CATCH-ALL: Serve the portal for any non-API route
// ===========================================================
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dealer-portal.html'));
});


// ===========================================================
// START SERVER
// ===========================================================
ensureDataFiles();
require('./admin-routes')(app, requireAuth);
app.listen(PORT, () => {
    console.log('');
    console.log('==============================================');
    console.log('  AmeriDex Dealer Portal Server v1.0');
    console.log('  Running on http://localhost:' + PORT);
    console.log('  Data stored in ./data/');
    console.log('==============================================');
    console.log('');
});
