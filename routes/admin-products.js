// ============================================================
// Admin Product Management API
// Full CRUD for the product catalog
// ============================================================
const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { readJSON, writeJSON, PRODUCTS_FILE, DEALERS_FILE, COLORS_FILE, generateId } = require('../lib/helpers');

router.use(requireAuth, requireAdmin);

// Default seed products (used if products.json is empty/missing)
const SEED_PRODUCTS = [
    { id: 'system',   name: 'AmeriDex System Boards (Grooved + Dexerdry included)', category: 'decking',   basePrice: 8.00,   unit: 'ft',   tierOverrides: {}, isActive: true, sortOrder: 1 },
    { id: 'grooved',  name: 'Grooved Deck Boards (no Dexerdry)',                    category: 'decking',   basePrice: 6.00,   unit: 'ft',   tierOverrides: {}, isActive: true, sortOrder: 2 },
    { id: 'solid',    name: 'Solid Edge Deck Boards',                               category: 'decking',   basePrice: 6.00,   unit: 'ft',   tierOverrides: {}, isActive: true, sortOrder: 3 },
    { id: 'dexerdry', name: 'Dexerdry Seals (standalone)',                           category: 'sealing',   basePrice: 2.00,   unit: 'ft',   tierOverrides: {}, isActive: true, sortOrder: 4 },
    { id: 'screws',   name: 'Epoxy-Coated Screws',                                  category: 'fasteners', basePrice: 37.00,  unit: 'box',  tierOverrides: {}, isActive: true, sortOrder: 5 },
    { id: 'plugs',    name: 'Color-Matching Plugs',                                 category: 'fasteners', basePrice: 33.79,  unit: 'box',  tierOverrides: {}, isActive: true, sortOrder: 6 },
    { id: 'blueclaw', name: 'Dexerdry BlueClaw',                                    category: 'hardware',  basePrice: 150.00, unit: 'each', tierOverrides: { preferred: { multiplier: 1.0 }, vip: { multiplier: 1.0 } }, isActive: true, sortOrder: 7 },
    { id: 'custom',   name: 'Custom / Manual Item',                                 category: 'custom',    basePrice: 0.00,   unit: 'each', tierOverrides: {}, isActive: true, sortOrder: 99 }
];

function getProducts() {
    let products = readJSON(PRODUCTS_FILE);
    if (!products || products.length === 0) {
        products = JSON.parse(JSON.stringify(SEED_PRODUCTS));
        writeJSON(PRODUCTS_FILE, products);
    }
    return products;
}

// GET /api/admin/products - List all products (including inactive)
router.get('/', (req, res) => {
    const products = getProducts();
    products.sort((a, b) => (a.sortOrder || 99) - (b.sortOrder || 99));
    res.json(products);
});

// POST /api/admin/products - Add a new product
router.post('/', (req, res) => {
    const products = getProducts();
    const { name, category, basePrice, unit, tierOverrides, sortOrder } = req.body;

    if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: 'Product name is required' });
    }
    if (basePrice === undefined || basePrice === null || isNaN(Number(basePrice))) {
        return res.status(400).json({ error: 'Valid base price is required' });
    }

    // Generate a slug-style ID from name
    let id = req.body.id;
    if (!id) {
        id = name.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .substring(0, 30);
        // Ensure unique
        if (products.find(p => p.id === id)) {
            id = id + '-' + Date.now().toString(36);
        }
    } else {
        // Check for duplicate ID
        if (products.find(p => p.id === id)) {
            return res.status(409).json({ error: 'Product ID "' + id + '" already exists' });
        }
    }

    const normalizedCategory = (category || 'other').trim().toLowerCase();
    const roundedBasePrice = Math.round(Number(basePrice) * 100) / 100;

    const newProduct = {
        id: id,
        name: name.trim(),
        category: normalizedCategory,
        basePrice: roundedBasePrice,
        unit: (unit || 'each').trim().toLowerCase(),
        tierOverrides: tierOverrides || {},
        isActive: true,
        sortOrder: sortOrder || products.length + 1,
        createdAt: new Date().toISOString()
    };

    // If decking product, accept or auto-create colorPricing
    if (normalizedCategory === 'decking') {
        if (req.body.colorPricing && typeof req.body.colorPricing === 'object') {
            newProduct.colorPricing = req.body.colorPricing;
        } else {
            // Auto-create from colors.json using basePrice for all colors
            const colors = readJSON(COLORS_FILE);
            const colorPricing = {};
            colors.forEach(c => {
                if (c.isActive) {
                    colorPricing[c.id] = c.tier === 'variegated'
                        ? Math.round((roundedBasePrice + 0.50) * 100) / 100
                        : roundedBasePrice;
                }
            });
            newProduct.colorPricing = colorPricing;
        }
    }

    products.push(newProduct);
    writeJSON(PRODUCTS_FILE, products);
    res.status(201).json(newProduct);
});

// PUT /api/admin/products/:id - Update a product
router.put('/:id', (req, res) => {
    const products = getProducts();
    const idx = products.findIndex(p => p.id === req.params.id);
    if (idx === -1) {
        return res.status(404).json({ error: 'Product not found' });
    }

    const updates = req.body;
    const product = products[idx];
    const oldBasePrice = product.basePrice;
    const oldCategory = product.category;
    const oldColorPricing = product.colorPricing ? JSON.parse(JSON.stringify(product.colorPricing)) : null;

    // Updateable fields
    if (updates.name !== undefined) product.name = updates.name.trim();
    if (updates.category !== undefined) product.category = updates.category.trim().toLowerCase();
    if (updates.basePrice !== undefined) product.basePrice = Math.round(Number(updates.basePrice) * 100) / 100;
    if (updates.unit !== undefined) product.unit = updates.unit.trim().toLowerCase();
    if (updates.tierOverrides !== undefined) product.tierOverrides = updates.tierOverrides;
    if (updates.isActive !== undefined) product.isActive = Boolean(updates.isActive);
    if (updates.sortOrder !== undefined) product.sortOrder = Number(updates.sortOrder);

    // Handle colorPricing updates
    if (updates.colorPricing !== undefined) {
        product.colorPricing = updates.colorPricing;
    }

    // If category changed TO decking and product doesn't have colorPricing, auto-create it
    if (product.category === 'decking' && oldCategory !== 'decking' && !product.colorPricing) {
        const colors = readJSON(COLORS_FILE);
        const colorPricing = {};
        colors.forEach(c => {
            if (c.isActive) {
                colorPricing[c.id] = c.tier === 'variegated'
                    ? Math.round((product.basePrice + 0.50) * 100) / 100
                    : product.basePrice;
            }
        });
        product.colorPricing = colorPricing;
    }

    product.updatedAt = new Date().toISOString();
    products[idx] = product;
    writeJSON(PRODUCTS_FILE, products);

    // ----------------------------------------------------------
    // CASCADE: If basePrice changed, update all dealers whose
    // pricing for this product still matches the OLD basePrice.
    //
    // Logic: A dealer whose pricing[productId] === oldBasePrice
    // was never given a custom price; they were on the default.
    // Those dealers should follow the new base price.
    //
    // A dealer whose pricing[productId] differs from oldBasePrice
    // has a deliberate custom price and is NOT touched.
    // ----------------------------------------------------------
    let dealersCascaded = 0;
    let dealersSkipped = 0;

    if (updates.basePrice !== undefined && product.basePrice !== oldBasePrice) {
        const productId = product.id;
        const newBasePrice = product.basePrice;
        const roundedOld = Math.round(oldBasePrice * 100) / 100;

        try {
            const dealers = readJSON(DEALERS_FILE);
            let dealersChanged = false;

            dealers.forEach(dealer => {
                if (dealer.isDeleted) return;
                if (!dealer.pricing) return;

                const dealerCurrentPrice = dealer.pricing[productId];

                if (dealerCurrentPrice === undefined) {
                    return;
                }

                const roundedDealerPrice = Math.round(dealerCurrentPrice * 100) / 100;

                if (roundedDealerPrice === roundedOld) {
                    dealer.pricing[productId] = newBasePrice;
                    dealersCascaded++;
                    dealersChanged = true;
                } else {
                    dealersSkipped++;
                }
            });

            if (dealersChanged) {
                writeJSON(DEALERS_FILE, dealers);
                console.log(
                    '[Admin Products] Base price cascade for "' + productId + '": $' +
                    oldBasePrice.toFixed(2) + ' -> $' + newBasePrice.toFixed(2) +
                    ' | ' + dealersCascaded + ' dealer(s) updated, ' +
                    dealersSkipped + ' dealer(s) skipped (custom pricing)'
                );
            }
        } catch (err) {
            console.error('[Admin Products] Cascade failed for "' + product.id + '":', err.message);
        }
    }

    // ----------------------------------------------------------
    // CASCADE: If colorPricing changed for a decking product,
    // update dealers whose color prices matched the old defaults.
    // ----------------------------------------------------------
    let colorCascadeCount = 0;

    if (product.category === 'decking' && product.colorPricing && oldColorPricing) {
        try {
            const dealers = readJSON(DEALERS_FILE);
            let dealersChanged = false;
            const productId = product.id;

            dealers.forEach(dealer => {
                if (dealer.isDeleted) return;
                if (!dealer.colorPricing || !dealer.colorPricing[productId]) return;

                let dealerUpdated = false;
                Object.keys(product.colorPricing).forEach(colorName => {
                    const oldDefault = oldColorPricing[colorName];
                    const newDefault = product.colorPricing[colorName];
                    if (oldDefault === undefined || newDefault === undefined) return;
                    if (oldDefault === newDefault) return;

                    const dealerColorPrice = dealer.colorPricing[productId][colorName];
                    if (dealerColorPrice === undefined) return;

                    const roundedDealerColor = Math.round(dealerColorPrice * 100) / 100;
                    const roundedOldDefault = Math.round(oldDefault * 100) / 100;

                    if (roundedDealerColor === roundedOldDefault) {
                        dealer.colorPricing[productId][colorName] = newDefault;
                        dealerUpdated = true;
                    }
                });

                if (dealerUpdated) {
                    colorCascadeCount++;
                    dealersChanged = true;
                }
            });

            if (dealersChanged) {
                writeJSON(DEALERS_FILE, dealers);
                console.log('[Admin Products] Color price cascade for "' + product.id + '": ' + colorCascadeCount + ' dealer(s) updated');
            }
        } catch (err) {
            console.error('[Admin Products] Color cascade failed for "' + product.id + '":', err.message);
        }
    }

    res.json({
        product: product,
        cascade: (updates.basePrice !== undefined && product.basePrice !== oldBasePrice)
            ? {
                dealersUpdated: dealersCascaded,
                dealersSkipped: dealersSkipped,
                oldBasePrice: oldBasePrice,
                newBasePrice: product.basePrice,
                colorCascadeCount: colorCascadeCount
            }
            : null
    });
});

// DELETE /api/admin/products/:id - Remove a product
router.delete('/:id', (req, res) => {
    let products = getProducts();
    const idx = products.findIndex(p => p.id === req.params.id);
    if (idx === -1) {
        return res.status(404).json({ error: 'Product not found' });
    }

    // Prevent deleting 'custom' (it's a system product)
    if (req.params.id === 'custom') {
        return res.status(400).json({ error: 'Cannot delete the Custom / Manual Item product' });
    }

    const removed = products.splice(idx, 1)[0];
    writeJSON(PRODUCTS_FILE, products);
    res.json({ message: 'Product "' + removed.name + '" deleted', id: removed.id });
});

module.exports = router;
