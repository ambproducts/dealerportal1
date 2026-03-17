// ============================================================
// routes/colors.js - Dealer-facing read-only colors endpoint
// Returns active colors sorted by sortOrder
// ============================================================
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { readJSON, COLORS_FILE } = require('../lib/helpers');

// GET /api/colors - Returns active colors (requires auth, NOT admin)
router.get('/', requireAuth, (req, res) => {
    const colors = readJSON(COLORS_FILE);
    const active = colors
        .filter(c => c.isActive !== false)
        .sort((a, b) => (a.sortOrder || 99) - (b.sortOrder || 99))
        .map(c => ({
            id: c.id,
            name: c.name,
            image: c.image,
            tier: c.tier
        }));
    res.json(active);
});

module.exports = router;
