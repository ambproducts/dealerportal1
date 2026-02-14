const express = require('express');
const router = express.Router();
const { readJSON, writeJSON, DEALERS_FILE } = require('../lib/helpers');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/dealer/profile
router.get('/profile', (req, res) => {
    const { passwordHash, ...safe } = req.dealer;
    res.json(safe);
});

// PUT /api/dealer/profile
router.put('/profile', (req, res) => {
    const dealers = readJSON(DEALERS_FILE);
    const idx = dealers.findIndex(d => d.dealerCode === req.user.dealerCode);
    if (idx === -1) return res.status(404).json({ error: 'Dealer not found' });

    const allowed = ['dealerName', 'contactPerson', 'email', 'phone'];
    allowed.forEach(field => {
        if (req.body[field] !== undefined) dealers[idx][field] = req.body[field];
    });
    writeJSON(DEALERS_FILE, dealers);

    const { passwordHash, ...safe } = dealers[idx];
    res.json(safe);
});

module.exports = router;
