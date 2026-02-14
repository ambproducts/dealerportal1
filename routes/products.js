const express = require('express');
const router = express.Router();
const { readJSON, TIERS_FILE, PRODUCTS_FILE } = require('../lib/helpers');
const { requireAuth } = require('../middleware/auth');

// GET /api/products - Dealer-facing product list with tier pricing
router.get('/', requireAuth, (req, res) => {
    const allProducts = readJSON(PRODUCTS_FILE);
    const tiers = readJSON(TIERS_FILE);
    const dealerTier = req.dealer.pricingTier || 'standard';
    const tier = tiers.find(t => t.slug === dealerTier) || { multiplier: 1.0 };

    // Only return active products, sorted by sortOrder
    const activeProducts = allProducts
        .filter(p => p.isActive !== false)
        .sort((a, b) => (a.sortOrder || 99) - (b.sortOrder || 99));

    const products = activeProducts.map(p => {
        // Check for per-product tier override
        let multiplier = tier.multiplier || 1.0;
        if (p.tierOverrides && p.tierOverrides[dealerTier] && p.tierOverrides[dealerTier].multiplier !== undefined) {
            multiplier = p.tierOverrides[dealerTier].multiplier;
        }

        return {
            id: p.id,
            name: p.name,
            category: p.category,
            basePrice: p.basePrice,
            price: Math.round(p.basePrice * multiplier * 100) / 100,
            unit: p.unit,
            tier: dealerTier
        };
    });

    res.json(products);
});

module.exports = router;
