const express = require('express');
const router = express.Router();
const { readJSON, TIERS_FILE } = require('../lib/helpers');
const { requireAuth } = require('../middleware/auth');

// ============================================================
// Real AmeriDex Product Catalog
// Matches PRODUCT_CONFIG in dealer-portal.html
// ============================================================
const PRODUCTS = [
    { id: 'system',   name: 'AmeriDex System Boards (Grooved + Dexerdry included)', category: 'decking',    basePrice: 8.00,   unit: 'ft'   },
    { id: 'grooved',  name: 'Grooved Deck Boards (no Dexerdry)',                    category: 'decking',    basePrice: 6.00,   unit: 'ft'   },
    { id: 'solid',    name: 'Solid Edge Deck Boards',                               category: 'decking',    basePrice: 6.00,   unit: 'ft'   },
    { id: 'dexerdry', name: 'Dexerdry Seals (standalone)',                           category: 'sealing',    basePrice: 2.00,   unit: 'ft'   },
    { id: 'screws',   name: 'Epoxy-Coated Screws',                                  category: 'fasteners',  basePrice: 37.00,  unit: 'box'  },
    { id: 'plugs',    name: 'Color-Matching Plugs',                                 category: 'fasteners',  basePrice: 33.79,  unit: 'box'  },
    { id: 'blueclaw', name: 'Dexerdry BlueClaw',                                    category: 'hardware',   basePrice: 150.00, unit: 'each' },
    { id: 'custom',   name: 'Custom / Manual Item',                                 category: 'custom',     basePrice: 0.00,   unit: 'each' }
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
        basePrice: p.basePrice,
        price: Math.round(p.basePrice * tier.multiplier * 100) / 100,
        unit: p.unit,
        tier: dealerTier
    }));

    res.json(products);
});

module.exports = router;
