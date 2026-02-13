// ============================================================
// AmeriDex Dealer Portal - Admin API Routes v1.0
// Date: 2026-02-13
// ============================================================
// USAGE: In server.js, add at the bottom (before app.listen):
//   require('./admin-routes')(app, requireAuth);
//
// Or paste the contents into server.js directly.
// ============================================================

module.exports = function (app, requireAuth) {
    const fs = require('fs');
    const path = require('path');
    const crypto = require('crypto');

    const DATA_DIR = path.join(__dirname, 'data');
    const DEALERS_FILE = path.join(DATA_DIR, 'dealers.json');
    const QUOTES_FILE = path.join(DATA_DIR, 'quotes.json');
    const PRICING_FILE = path.join(DATA_DIR, 'pricing-tiers.json');

    // ----------------------------------------------------------
    // HELPERS
    // ----------------------------------------------------------
    function readJSON(file, fallback) {
        try {
            if (fs.existsSync(file)) {
                return JSON.parse(fs.readFileSync(file, 'utf8'));
            }
        } catch (e) {
            console.error('Error reading ' + file + ':', e.message);
        }
        return fallback !== undefined ? fallback : [];
    }

    function writeJSON(file, data) {
        fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    }

    function hashPassword(pw) {
        return crypto.createHash('sha256').update(pw).digest('hex');
    }

    function requireAdmin(req, res, next) {
        if (!req.dealer || req.dealer.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        next();
    }


    // ==========================================================
    // ADMIN: DEALERS
    // ==========================================================

    // GET /api/admin/dealers - List all dealers
    app.get('/api/admin/dealers', requireAuth, requireAdmin, (req, res) => {
        const dealers = readJSON(DEALERS_FILE, []);
        // Return all fields except password hash
        const safe = dealers.map(d => {
            const { passwordHash, ...rest } = d;
            return rest;
        });
        res.json(safe);
    });

    // POST /api/admin/dealers - Create a new dealer
    app.post('/api/admin/dealers', requireAuth, requireAdmin, (req, res) => {
        const { dealerCode, password, dealerName, contactPerson, email, phone, role, pricingTier } = req.body;

        if (!dealerCode || dealerCode.length !== 6) {
            return res.status(400).json({ error: 'Dealer code must be exactly 6 characters' });
        }
        if (!password || password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }

        const dealers = readJSON(DEALERS_FILE, []);

        // Check for duplicate
        if (dealers.find(d => d.dealerCode.toUpperCase() === dealerCode.toUpperCase())) {
            return res.status(409).json({ error: 'Dealer code already exists' });
        }

        const newDealer = {
            id: crypto.randomUUID(),
            dealerCode: dealerCode.toUpperCase(),
            passwordHash: hashPassword(password),
            dealerName: dealerName || '',
            contactPerson: contactPerson || '',
            email: email || '',
            phone: phone || '',
            role: ['dealer', 'rep', 'admin'].includes(role) ? role : 'dealer',
            pricingTier: ['standard', 'preferred', 'vip'].includes(pricingTier) ? pricingTier : 'standard',
            isActive: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        dealers.push(newDealer);
        writeJSON(DEALERS_FILE, dealers);

        const { passwordHash, ...safe } = newDealer;
        console.log('[Admin] Dealer created:', newDealer.dealerCode);
        res.status(201).json(safe);
    });

    // PUT /api/admin/dealers/:id - Update a dealer
    app.put('/api/admin/dealers/:id', requireAuth, requireAdmin, (req, res) => {
        const dealers = readJSON(DEALERS_FILE, []);
        const idx = dealers.findIndex(d => d.id === req.params.id);
        if (idx === -1) {
            return res.status(404).json({ error: 'Dealer not found' });
        }

        const allowed = ['dealerName', 'contactPerson', 'email', 'phone', 'role', 'pricingTier', 'isActive'];
        allowed.forEach(field => {
            if (req.body[field] !== undefined) {
                if (field === 'role' && !['dealer', 'rep', 'admin'].includes(req.body[field])) return;
                if (field === 'pricingTier' && !['standard', 'preferred', 'vip'].includes(req.body[field])) return;
                dealers[idx][field] = req.body[field];
            }
        });
        dealers[idx].updatedAt = new Date().toISOString();

        writeJSON(DEALERS_FILE, dealers);

        const { passwordHash, ...safe } = dealers[idx];
        console.log('[Admin] Dealer updated:', dealers[idx].dealerCode);
        res.json(safe);
    });

    // POST /api/admin/dealers/:id/change-password - Change dealer password
    app.post('/api/admin/dealers/:id/change-password', requireAuth, requireAdmin, (req, res) => {
        const { newPassword } = req.body;
        if (!newPassword || newPassword.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }

        const dealers = readJSON(DEALERS_FILE, []);
        const idx = dealers.findIndex(d => d.id === req.params.id);
        if (idx === -1) {
            return res.status(404).json({ error: 'Dealer not found' });
        }

        dealers[idx].passwordHash = hashPassword(newPassword);
        dealers[idx].updatedAt = new Date().toISOString();
        writeJSON(DEALERS_FILE, dealers);

        console.log('[Admin] Password changed for:', dealers[idx].dealerCode);
        res.json({ message: 'Password updated' });
    });

    // DELETE /api/admin/dealers/:id - Delete a dealer (soft: just deactivate)
    app.delete('/api/admin/dealers/:id', requireAuth, requireAdmin, (req, res) => {
        const dealers = readJSON(DEALERS_FILE, []);
        const idx = dealers.findIndex(d => d.id === req.params.id);
        if (idx === -1) {
            return res.status(404).json({ error: 'Dealer not found' });
        }

        // Prevent deleting yourself
        if (dealers[idx].id === req.dealer.id) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }

        dealers[idx].isActive = false;
        dealers[idx].updatedAt = new Date().toISOString();
        writeJSON(DEALERS_FILE, dealers);

        console.log('[Admin] Dealer deactivated:', dealers[idx].dealerCode);
        res.json({ message: 'Dealer deactivated' });
    });


    // ==========================================================
    // ADMIN: QUOTES
    // ==========================================================

    // GET /api/admin/quotes - List ALL quotes (across all dealers)
    app.get('/api/admin/quotes', requireAuth, requireAdmin, (req, res) => {
        const quotes = readJSON(QUOTES_FILE, []);
        res.json(quotes);
    });

    // PUT /api/admin/quotes/:id/status - Change quote status
    app.put('/api/admin/quotes/:id/status', requireAuth, requireAdmin, (req, res) => {
        const { status } = req.body;
        const validStatuses = ['draft', 'submitted', 'reviewed', 'approved', 'rejected', 'revision'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status. Must be one of: ' + validStatuses.join(', ') });
        }

        const quotes = readJSON(QUOTES_FILE, []);
        const idx = quotes.findIndex(q => q.id === req.params.id);
        if (idx === -1) {
            return res.status(404).json({ error: 'Quote not found' });
        }

        quotes[idx].status = status;
        quotes[idx].updatedAt = new Date().toISOString();
        if (status === 'approved') quotes[idx].approvedAt = new Date().toISOString();
        if (status === 'reviewed') quotes[idx].reviewedAt = new Date().toISOString();

        writeJSON(QUOTES_FILE, quotes);
        console.log('[Admin] Quote', quotes[idx].quoteNumber || quotes[idx].id, 'status ->', status);
        res.json(quotes[idx]);
    });

    // DELETE /api/admin/quotes/:id - Permanently delete a quote
    app.delete('/api/admin/quotes/:id', requireAuth, requireAdmin, (req, res) => {
        const quotes = readJSON(QUOTES_FILE, []);
        const idx = quotes.findIndex(q => q.id === req.params.id);
        if (idx === -1) {
            return res.status(404).json({ error: 'Quote not found' });
        }

        const removed = quotes.splice(idx, 1)[0];
        writeJSON(QUOTES_FILE, quotes);
        console.log('[Admin] Quote deleted:', removed.quoteNumber || removed.id);
        res.json({ message: 'Quote deleted' });
    });


    // ==========================================================
    // ADMIN: PRICING TIERS
    // ==========================================================

    // GET /api/admin/pricing - Get all pricing tier definitions
    app.get('/api/admin/pricing', requireAuth, requireAdmin, (req, res) => {
        const tiers = readJSON(PRICING_FILE, null);

        if (!tiers) {
            // Generate default tiers from the product config
            const defaultProducts = {
                system: { name: 'AmeriDex System Boards', price: 8.00 },
                grooved: { name: 'Grooved Deck Boards', price: 6.00 },
                solid: { name: 'Solid Edge Deck Boards', price: 6.00 },
                dexerdry: { name: 'Dexerdry Seals', price: 2.00 },
                screws: { name: 'Epoxy-Coated Screws', price: 37.00 },
                plugs: { name: 'Color-Matching Plugs', price: 33.79 },
                blueclaw: { name: 'Dexerdry BlueClaw', price: 150.00 }
            };

            const defaultTiers = [
                {
                    id: 'standard',
                    label: 'Standard',
                    multiplier: 1.0,
                    products: JSON.parse(JSON.stringify(defaultProducts))
                },
                {
                    id: 'preferred',
                    label: 'Preferred',
                    multiplier: 0.95,
                    products: Object.fromEntries(
                        Object.entries(defaultProducts).map(([k, v]) => [k, { ...v, price: +(v.price * 0.95).toFixed(2) }])
                    )
                },
                {
                    id: 'vip',
                    label: 'VIP',
                    multiplier: 0.90,
                    products: Object.fromEntries(
                        Object.entries(defaultProducts).map(([k, v]) => [k, { ...v, price: +(v.price * 0.90).toFixed(2) }])
                    )
                }
            ];

            writeJSON(PRICING_FILE, defaultTiers);
            return res.json(defaultTiers);
        }

        res.json(tiers);
    });

    // PUT /api/admin/pricing - Update all pricing tiers
    app.put('/api/admin/pricing', requireAuth, requireAdmin, (req, res) => {
        const tiers = req.body;

        if (!Array.isArray(tiers) || tiers.length === 0) {
            return res.status(400).json({ error: 'Expected an array of pricing tiers' });
        }

        // Validate structure
        for (const tier of tiers) {
            if (!tier.id || !tier.label || typeof tier.multiplier !== 'number') {
                return res.status(400).json({ error: 'Each tier must have id, label, and multiplier' });
            }
        }

        writeJSON(PRICING_FILE, tiers);
        console.log('[Admin] Pricing tiers updated (' + tiers.length + ' tiers)');
        res.json({ message: 'Pricing tiers saved', count: tiers.length });
    });


    console.log('[Admin Routes] Mounted: /api/admin/*');
};
