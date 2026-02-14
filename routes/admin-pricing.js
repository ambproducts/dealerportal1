const express = require('express');
const router = express.Router();
const { readJSON, writeJSON, TIERS_FILE } = require('../lib/helpers');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.use(requireAuth, requireAdmin);

// GET /api/admin/pricing-tiers
router.get('/', (req, res) => {
    res.json(readJSON(TIERS_FILE));
});

// PUT /api/admin/pricing-tiers/:slug
router.put('/:slug', (req, res) => {
    const tiers = readJSON(TIERS_FILE);
    const idx = tiers.findIndex(t => t.slug === req.params.slug);
    if (idx === -1) return res.status(404).json({ error: 'Tier not found' });

    if (req.body.label !== undefined) tiers[idx].label = req.body.label;
    if (req.body.multiplier !== undefined) {
        const m = parseFloat(req.body.multiplier);
        if (isNaN(m) || m <= 0 || m > 2) {
            return res.status(400).json({ error: 'Multiplier must be between 0.01 and 2.00' });
        }
        tiers[idx].multiplier = Math.round(m * 100) / 100;
    }
    writeJSON(TIERS_FILE, tiers);
    res.json(tiers[idx]);
});

module.exports = router;
