// ============================================================
// routes/admin-categories.js - Admin Category Management
// Full CRUD for the category catalog
// ============================================================
const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const {
    readJSON, writeJSON,
    CATEGORIES_FILE, PRODUCTS_FILE
} = require('../lib/helpers');

router.use(requireAuth, requireAdmin);

// GET /api/admin/categories - List all categories
router.get('/', (req, res) => {
    const categories = readJSON(CATEGORIES_FILE);
    categories.sort((a, b) => (a.sortOrder || 99) - (b.sortOrder || 99));
    res.json(categories);
});

// POST /api/admin/categories - Add a new category
router.post('/', (req, res) => {
    const categories = readJSON(CATEGORIES_FILE);
    const { slug, label, sortOrder } = req.body;

    if (!slug || slug.trim().length === 0) {
        return res.status(400).json({ error: 'Category slug is required' });
    }
    if (!label || label.trim().length === 0) {
        return res.status(400).json({ error: 'Category label is required' });
    }

    const normalizedSlug = slug.trim().toLowerCase();
    if (categories.find(c => c.slug === normalizedSlug)) {
        return res.status(409).json({ error: 'Category "' + normalizedSlug + '" already exists' });
    }

    const newCategory = {
        slug: normalizedSlug,
        label: label.trim(),
        sortOrder: sortOrder || categories.length + 1,
        isActive: true
    };

    categories.push(newCategory);
    writeJSON(CATEGORIES_FILE, categories);

    console.log('[Admin Categories] New category created: ' + normalizedSlug + ' by ' + req.user.username);
    res.status(201).json(newCategory);
});

// PUT /api/admin/categories/:slug - Update a category
router.put('/:slug', (req, res) => {
    const categories = readJSON(CATEGORIES_FILE);
    const idx = categories.findIndex(c => c.slug === req.params.slug);
    if (idx === -1) {
        return res.status(404).json({ error: 'Category not found' });
    }

    const updates = req.body;
    if (updates.label !== undefined) categories[idx].label = updates.label.trim();
    if (updates.sortOrder !== undefined) categories[idx].sortOrder = Number(updates.sortOrder);
    if (updates.isActive !== undefined) categories[idx].isActive = Boolean(updates.isActive);

    writeJSON(CATEGORIES_FILE, categories);

    console.log('[Admin Categories] Updated category: ' + req.params.slug + ' by ' + req.user.username);
    res.json(categories[idx]);
});

// DELETE /api/admin/categories/:slug - Delete a category (only if no products use it)
router.delete('/:slug', (req, res) => {
    const categories = readJSON(CATEGORIES_FILE);
    const idx = categories.findIndex(c => c.slug === req.params.slug);
    if (idx === -1) {
        return res.status(404).json({ error: 'Category not found' });
    }

    // Check if any products use this category
    const products = readJSON(PRODUCTS_FILE);
    const productsInCategory = products.filter(p => p.category === req.params.slug);
    if (productsInCategory.length > 0) {
        return res.status(400).json({
            error: 'Cannot delete category "' + req.params.slug + '" - it has ' + productsInCategory.length + ' product(s)',
            products: productsInCategory.map(p => p.id)
        });
    }

    const removed = categories.splice(idx, 1)[0];
    writeJSON(CATEGORIES_FILE, categories);

    console.log('[Admin Categories] Deleted category: ' + removed.slug + ' by ' + req.user.username);
    res.json({ message: 'Category "' + removed.slug + '" deleted', slug: removed.slug });
});

module.exports = router;
