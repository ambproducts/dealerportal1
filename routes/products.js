const express = require('express');
const router = express.Router();
const { readJSON, TIERS_FILE } = require('../lib/helpers');
const { requireAuth } = require('../middleware/auth');

const PRODUCTS = [
    { id: 'idx-standard', name: 'AmeriDex Standard Index Tab Set', category: 'index-tabs', basePrice: 24.99, unit: 'set' },
    { id: 'idx-legal', name: 'AmeriDex Legal Size Index Tabs', category: 'index-tabs', basePrice: 29.99, unit: 'set' },
    { id: 'idx-custom', name: 'AmeriDex Custom Printed Tabs', category: 'index-tabs', basePrice: 49.99, unit: 'set' },
    { id: 'idx-exhibit', name: 'AmeriDex Exhibit Index Set (A-Z)', category: 'index-tabs', basePrice: 34.99, unit: 'set' },
    { id: 'idx-num25', name: 'AmeriDex Numbered Tabs 1-25', category: 'index-tabs', basePrice: 19.99, unit: 'set' },
    { id: 'idx-num50', name: 'AmeriDex Numbered Tabs 1-50', category: 'index-tabs', basePrice: 34.99, unit: 'set' },
    { id: 'idx-num100', name: 'AmeriDex Numbered Tabs 1-100', category: 'index-tabs', basePrice: 54.99, unit: 'set' },
    { id: 'idx-blank', name: 'AmeriDex Blank Tab Set', category: 'index-tabs', basePrice: 14.99, unit: 'set' },
    { id: 'idx-month', name: 'AmeriDex Monthly Index Tabs (Jan-Dec)', category: 'index-tabs', basePrice: 22.99, unit: 'set' },
    { id: 'bnd-half', name: 'AmeriDex Half-Inch Binder', category: 'binders', basePrice: 8.99, unit: 'each' },
    { id: 'bnd-one', name: 'AmeriDex 1-Inch Binder', category: 'binders', basePrice: 12.99, unit: 'each' },
    { id: 'bnd-onehalf', name: 'AmeriDex 1.5-Inch Binder', category: 'binders', basePrice: 16.99, unit: 'each' },
    { id: 'bnd-two', name: 'AmeriDex 2-Inch Binder', category: 'binders', basePrice: 19.99, unit: 'each' },
    { id: 'bnd-three', name: 'AmeriDex 3-Inch Binder', category: 'binders', basePrice: 24.99, unit: 'each' },
    { id: 'acc-sheet', name: 'AmeriDex Sheet Protectors (100pk)', category: 'accessories', basePrice: 18.99, unit: 'pack' },
    { id: 'acc-pocket', name: 'AmeriDex Expanding Pockets (25pk)', category: 'accessories', basePrice: 22.99, unit: 'pack' },
    { id: 'acc-spine', name: 'AmeriDex Spine Labels (50pk)', category: 'accessories', basePrice: 9.99, unit: 'pack' },
    { id: 'acc-divider', name: 'AmeriDex Divider Sheets (50pk)', category: 'accessories', basePrice: 15.99, unit: 'pack' }
];

// GET /api/products
router.get('/', requireAuth, (req, res) => {
    const tiers = readJSON(TIERS_FILE);
    const dealerTier = req.dealer.pricingTier || 'standard';
    const tier = tiers.find(t => t.slug === dealerTier) || { multiplier: 1.0 };

    const products = PRODUCTS.map(p => ({
        id: p.id,
        name: p.name,
        category: p.category,
        price: Math.round(p.basePrice * tier.multiplier * 100) / 100,
        unit: p.unit,
        tier: dealerTier
    }));

    res.json(products);
});

module.exports = router;
