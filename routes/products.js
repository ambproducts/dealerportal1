const express = require('express');
const router = express.Router();
const { readJSON, TIERS_FILE, PRODUCTS_FILE } = require('../lib/helpers');
const { requireAuth } = require('../middleware/auth');

// GET /api/products - Dealer-facing product list with tier pricing
//
// Response shape (consumed by applyTierPricing() in ameridex-api.js):
//   {
//     products: {
//       "system":  { id, name, category, basePrice, price, unit },
//       "grooved": { id, name, category, basePrice, price, unit },
//       ...
//     },
//     tier: { slug, label, multiplier }
//   }
//
// The frontend iterates Object.keys(data.products) and updates the
// global PRODUCTS and PRODUCT_CONFIG objects with server prices.
router.get('/', requireAuth, (req, res) => {
    const allProducts = readJSON(PRODUCTS_FILE);
    const tiers = readJSON(TIERS_FILE);
    const dealerTier = req.dealer.pricingTier || 'standard';
    const tier = tiers.find(t => t.slug === dealerTier) || { slug: dealerTier, label: dealerTier, multiplier: 1.0 };

    // Only return active products, sorted by sortOrder
    const activeProducts = allProducts
        .filter(p => p.isActive !== false)
        .sort((a, b) => (a.sortOrder || 99) - (b.sortOrder || 99));

    // Build a keyed object { productId: { ...product data } }
    const products = {};
    activeProducts.forEach(p => {
        // Check for per-product tier override
        let multiplier = tier.multiplier || 1.0;
        if (p.tierOverrides && p.tierOverrides[dealerTier] && p.tierOverrides[dealerTier].multiplier !== undefined) {
            multiplier = p.tierOverrides[dealerTier].multiplier;
        }

        products[p.id] = {
            id: p.id,
            name: p.name,
            category: p.category,
            basePrice: p.basePrice,
            price: Math.round(p.basePrice * multiplier * 100) / 100,
            unit: p.unit
        };
    });

    // Return the shape expected by applyTierPricing() in ameridex-api.js:
    //   { products: { [id]: {...} }, tier: { slug, label, multiplier } }
    res.json({
        products: products,
        tier: {
            slug: tier.slug || dealerTier,
            label: tier.label || dealerTier,
            multiplier: tier.multiplier || 1.0
        }
    });
});

module.exports = router;
