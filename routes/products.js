// ============================================================
// routes/products.js - Dealer-facing product list
// Date: 2026-02-28
// ============================================================
// Returns products with dealer-specific pricing.
// Each dealer has a pricing map in their record; if a product
// is not in the map, falls back to the product's basePrice.
//
// Response shape (consumed by applyTierPricing() in ameridex-api.js):
//   {
//     products: {
//       "system":  { id, name, category, basePrice, price, unit },
//       ...
//     },
//     tier: { slug, label, multiplier }   // kept for backward compat
//   }
// ============================================================

const express = require('express');
const router = express.Router();
const { readJSON, PRODUCTS_FILE, getDealerPrice } = require('../lib/helpers');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, (req, res) => {
    const allProducts = readJSON(PRODUCTS_FILE);
    const dealer = req.dealer;

    const activeProducts = allProducts
        .filter(p => p.isActive !== false)
        .sort((a, b) => (a.sortOrder || 99) - (b.sortOrder || 99));

    const products = {};
    activeProducts.forEach(p => {
        const dealerPrice = getDealerPrice(dealer, p.id);
        products[p.id] = {
            id: p.id,
            name: p.name,
            category: p.category,
            basePrice: p.basePrice,
            price: Math.round(dealerPrice * 100) / 100,
            unit: p.unit
        };
    });

    // Keep backward-compatible response shape.
    // tier object is retained so frontend code that reads
    // data.tier doesn't break; multiplier 1.0 is neutral.
    res.json({
        products: products,
        tier: {
            slug: 'per-dealer',
            label: 'Per-Dealer Pricing',
            multiplier: 1.0
        }
    });
});

module.exports = router;
