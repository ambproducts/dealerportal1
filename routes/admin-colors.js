// ============================================================
// routes/admin-colors.js - Admin Color Management
// Full CRUD for the color catalog
// ============================================================
const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const {
    readJSON, writeJSON,
    COLORS_FILE, PRODUCTS_FILE, DEALERS_FILE
} = require('../lib/helpers');

router.use(requireAuth, requireAdmin);

// GET /api/admin/colors - List all colors (including inactive)
router.get('/', (req, res) => {
    const colors = readJSON(COLORS_FILE);
    colors.sort((a, b) => (a.sortOrder || 99) - (b.sortOrder || 99));
    res.json(colors);
});

// POST /api/admin/colors - Add a new color
router.post('/', (req, res) => {
    const colors = readJSON(COLORS_FILE);
    const { name, image, tier, sortOrder } = req.body;

    if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: 'Color name is required' });
    }
    if (!tier || !['solid', 'variegated'].includes(tier)) {
        return res.status(400).json({ error: 'Tier must be "solid" or "variegated"' });
    }

    const id = name.trim();
    if (colors.find(c => c.id === id)) {
        return res.status(409).json({ error: 'Color "' + id + '" already exists' });
    }

    const newColor = {
        id: id,
        name: name.trim(),
        image: image || id + '.png',
        tier: tier,
        isActive: true,
        sortOrder: sortOrder || colors.length + 1
    };

    colors.push(newColor);
    writeJSON(COLORS_FILE, colors);

    // Auto-add default pricing for new color to all decking products
    const products = readJSON(PRODUCTS_FILE);
    let productsUpdated = false;
    products.forEach(p => {
        if (p.category === 'decking' && p.isActive) {
            if (!p.colorPricing) p.colorPricing = {};
            // Use basePrice for solid tier, basePrice + 0.50 for variegated (matching the pattern)
            // Actually, derive from existing pattern: variegated = basePrice + 0.50 for system ($9.50 base, $10 variegated)
            // For grooved/solid: basePrice = $6.00, variegated = $6.50
            // Pattern: variegated adds $0.50 over solid basePrice
            if (tier === 'variegated') {
                // Find the highest existing variegated price for this product, or use basePrice + 0.50
                const existingVariegated = Object.entries(p.colorPricing)
                    .filter(([, price]) => {
                        const colorObj = colors.find(c => c.id !== id && c.tier === 'variegated');
                        return colorObj !== undefined;
                    });
                if (existingVariegated.length > 0) {
                    // Use the first variegated color's price as reference
                    const refColor = colors.find(c => c.id !== id && c.tier === 'variegated');
                    if (refColor && p.colorPricing[refColor.id] !== undefined) {
                        p.colorPricing[id] = p.colorPricing[refColor.id];
                    } else {
                        p.colorPricing[id] = Math.round((p.basePrice + 0.50) * 100) / 100;
                    }
                } else {
                    p.colorPricing[id] = Math.round((p.basePrice + 0.50) * 100) / 100;
                }
            } else {
                p.colorPricing[id] = p.basePrice;
            }
            productsUpdated = true;
        }
    });
    if (productsUpdated) {
        writeJSON(PRODUCTS_FILE, products);
    }

    // Auto-add default color pricing to all dealers for decking products
    const dealers = readJSON(DEALERS_FILE);
    let dealersUpdated = false;
    dealers.forEach(dealer => {
        if (dealer.isDeleted) return;
        if (!dealer.colorPricing) return; // empty = uses defaults, no need to add
        // Only add to dealers that already have colorPricing entries for decking products
        products.forEach(p => {
            if (p.category === 'decking' && p.isActive && dealer.colorPricing[p.id]) {
                dealer.colorPricing[p.id][id] = p.colorPricing[id];
                dealersUpdated = true;
            }
        });
    });
    if (dealersUpdated) {
        writeJSON(DEALERS_FILE, dealers);
    }

    console.log('[Admin Colors] New color created: ' + id + ' (tier: ' + tier + ') by ' + req.user.username);
    res.status(201).json(newColor);
});

// PUT /api/admin/colors/:id - Update a color
router.put('/:id', (req, res) => {
    const colors = readJSON(COLORS_FILE);
    const idx = colors.findIndex(c => c.id === req.params.id);
    if (idx === -1) {
        return res.status(404).json({ error: 'Color not found' });
    }

    const updates = req.body;
    if (updates.name !== undefined) colors[idx].name = updates.name.trim();
    if (updates.image !== undefined) colors[idx].image = updates.image;
    if (updates.tier !== undefined) {
        if (!['solid', 'variegated'].includes(updates.tier)) {
            return res.status(400).json({ error: 'Tier must be "solid" or "variegated"' });
        }
        colors[idx].tier = updates.tier;
    }
    if (updates.isActive !== undefined) colors[idx].isActive = Boolean(updates.isActive);
    if (updates.sortOrder !== undefined) colors[idx].sortOrder = Number(updates.sortOrder);

    writeJSON(COLORS_FILE, colors);

    console.log('[Admin Colors] Updated color: ' + req.params.id + ' by ' + req.user.username);
    res.json(colors[idx]);
});

// DELETE /api/admin/colors/:id - Delete a color
router.delete('/:id', (req, res) => {
    const colors = readJSON(COLORS_FILE);
    const idx = colors.findIndex(c => c.id === req.params.id);
    if (idx === -1) {
        return res.status(404).json({ error: 'Color not found' });
    }

    const colorId = colors[idx].id;
    colors.splice(idx, 1);
    writeJSON(COLORS_FILE, colors);

    // Clean up color from all product colorPricing maps
    const products = readJSON(PRODUCTS_FILE);
    let productsUpdated = false;
    products.forEach(p => {
        if (p.colorPricing && p.colorPricing[colorId] !== undefined) {
            delete p.colorPricing[colorId];
            productsUpdated = true;
        }
    });
    if (productsUpdated) {
        writeJSON(PRODUCTS_FILE, products);
    }

    // Clean up color from all dealer colorPricing maps
    const dealers = readJSON(DEALERS_FILE);
    let dealersUpdated = false;
    dealers.forEach(dealer => {
        if (dealer.isDeleted) return;
        if (!dealer.colorPricing) return;
        Object.keys(dealer.colorPricing).forEach(productId => {
            if (dealer.colorPricing[productId] && dealer.colorPricing[productId][colorId] !== undefined) {
                delete dealer.colorPricing[productId][colorId];
                dealersUpdated = true;
            }
        });
    });
    if (dealersUpdated) {
        writeJSON(DEALERS_FILE, dealers);
    }

    console.log('[Admin Colors] Deleted color: ' + colorId + ' by ' + req.user.username);
    res.json({ message: 'Color "' + colorId + '" deleted', id: colorId });
});

module.exports = router;
