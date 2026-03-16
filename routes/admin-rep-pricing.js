// ============================================================
// routes/admin-rep-pricing.js - Admin Rep Pricing Management
// Date: 2026-03-16
// ============================================================
// Admin-only endpoints to manage per-salesrep product pricing
// for direct sales.
//
// Mounted at /api/admin/rep-pricing in server.js.
//
// Endpoints:
//   GET  /api/admin/rep-pricing/:userId  - Get rep's pricing
//   PUT  /api/admin/rep-pricing/:userId  - Set rep's pricing
// ============================================================

const express = require('express');
const router = express.Router();
const { readJSON, writeJSON, USERS_FILE, PRODUCTS_FILE } = require('../lib/helpers');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.use(requireAuth);
router.use(requireAdmin);

// -----------------------------------------------------------
// GET /api/admin/rep-pricing/:userId
// Returns all active products with the rep's custom prices.
// -----------------------------------------------------------
router.get('/:userId', (req, res) => {
    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.id === req.params.userId && u.role === 'salesrep');
    if (!user) {
        return res.status(404).json({ error: 'Salesrep user not found' });
    }

    const products = readJSON(PRODUCTS_FILE);
    const repPricing = user.repPricing || {};

    const result = products
        .filter(p => p.isActive !== false && p.id !== 'custom')
        .sort((a, b) => (a.sortOrder || 99) - (b.sortOrder || 99))
        .map(p => ({
            productId: p.id,
            productName: p.name,
            category: p.category,
            basePrice: p.basePrice,
            repPrice: repPricing[p.id] !== undefined ? repPricing[p.id] : p.basePrice,
            hasCustomPrice: repPricing[p.id] !== undefined
        }));

    res.json({
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
        products: result
    });
});

// -----------------------------------------------------------
// PUT /api/admin/rep-pricing/:userId
// Body: { pricing: { "productId": price, ... } }
// Sets the rep's entire pricing map.
// -----------------------------------------------------------
router.put('/:userId', (req, res) => {
    const users = readJSON(USERS_FILE);
    const idx = users.findIndex(u => u.id === req.params.userId && u.role === 'salesrep');
    if (idx === -1) {
        return res.status(404).json({ error: 'Salesrep user not found' });
    }

    const { pricing } = req.body;
    if (!pricing || typeof pricing !== 'object') {
        return res.status(400).json({ error: 'pricing object is required' });
    }

    // Validate all prices are numbers >= 0
    for (const [productId, price] of Object.entries(pricing)) {
        const numPrice = parseFloat(price);
        if (isNaN(numPrice) || numPrice < 0) {
            return res.status(400).json({ error: 'Invalid price for product ' + productId });
        }
        pricing[productId] = Math.round(numPrice * 100) / 100;
    }

    users[idx].repPricing = pricing;
    users[idx].updatedAt = new Date().toISOString();
    writeJSON(USERS_FILE, users);

    console.log('[Admin Rep Pricing] Updated pricing for ' + users[idx].username + ' by ' + req.user.username +
        ' (' + Object.keys(pricing).length + ' products)');
    res.json({
        message: 'Pricing updated for ' + users[idx].username,
        productCount: Object.keys(pricing).length
    });
});

module.exports = router;
