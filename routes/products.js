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
const { readJSON, PRODUCTS_FILE, COLORS_FILE, CATEGORIES_FILE, getDealerPrice, getRepPrice } = require('../lib/helpers');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, (req, res) => {
    const allProducts = readJSON(PRODUCTS_FILE);
    const dealer = req.dealer;

    const activeProducts = allProducts
        .filter(p => p.isActive !== false)
        .sort((a, b) => (a.sortOrder || 99) - (b.sortOrder || 99));

    // Salesrep in direct mode: use rep pricing
    const isSalesrepDirect = req.user.role === 'salesrep' && !dealer;

    const colors = readJSON(COLORS_FILE)
        .filter(c => c.isActive !== false)
        .sort((a, b) => (a.sortOrder || 99) - (b.sortOrder || 99))
        .map(c => ({ id: c.id, name: c.name, image: c.image, tier: c.tier }));

    const categories = readJSON(CATEGORIES_FILE)
        .filter(c => c.isActive !== false)
        .sort((a, b) => (a.sortOrder || 99) - (b.sortOrder || 99))
        .map(c => ({ slug: c.slug, label: c.label }));

    const products = {};
    activeProducts.forEach(p => {
        const price = isSalesrepDirect
            ? getRepPrice(req.user, p.id)
            : getDealerPrice(dealer, p.id);
        const productData = {
            id: p.id,
            name: p.name,
            category: p.category,
            basePrice: p.basePrice,
            price: Math.round(price * 100) / 100,
            unit: p.unit
        };

        // Add colorPricing for decking products
        if (p.category === 'decking' && p.colorPricing) {
            const colorPricingResult = {};
            Object.keys(p.colorPricing).forEach(colorName => {
                // Use dealer-specific color price if available, else product default
                if (!isSalesrepDirect && dealer && dealer.colorPricing && dealer.colorPricing[p.id] && dealer.colorPricing[p.id][colorName] !== undefined) {
                    colorPricingResult[colorName] = dealer.colorPricing[p.id][colorName];
                } else {
                    colorPricingResult[colorName] = p.colorPricing[colorName];
                }
            });
            productData.colorPricing = colorPricingResult;
        }

        products[p.id] = productData;
    });

    // Keep backward-compatible response shape, add colors and categories.
    res.json({
        products: products,
        colors: colors,
        categories: categories,
        tier: {
            slug: isSalesrepDirect ? 'per-rep' : 'per-dealer',
            label: isSalesrepDirect ? 'Per-Rep Pricing' : 'Per-Dealer Pricing',
            multiplier: 1.0
        }
    });
});

module.exports = router;
