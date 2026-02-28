// ============================================================
// routes/admin-pricing.js - DEPRECATED
// Date: 2026-02-28
// ============================================================
// Per-dealer pricing is now handled in routes/admin-dealers.js
// via GET/PUT /api/admin/dealers/:id/pricing
//
// This file is kept as a stub to avoid import errors if
// server.js still references it. It returns a helpful message.
// ============================================================

const express = require('express');
const router = express.Router();

router.all('*', (req, res) => {
    res.status(410).json({
        error: 'Pricing tiers have been removed.',
        message: 'Pricing is now managed per-dealer. Use GET/PUT /api/admin/dealers/:id/pricing instead.'
    });
});

module.exports = router;
