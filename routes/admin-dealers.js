// ============================================================
// routes/admin-dealers.js - Admin Dealer Management v3.0
// Date: 2026-02-28
// ============================================================
// v3.0 Changes (2026-02-28):
//   - REMOVE: pricingTier field from dealers
//   - ADD: per-dealer pricing map (pricing: { productId: price })
//   - ADD: GET /:id/pricing - view dealer pricing with product info
//   - ADD: PUT /:id/pricing - update dealer-specific prices
//   - ADD: POST /:id/pricing/reset - reset to base prices
//   - ADD: POST /:id/pricing/copy-from/:sourceId - copy pricing
// ============================================================

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const {
    readJSON, writeJSON,
    DEALERS_FILE, USERS_FILE, PRODUCTS_FILE,
    generateId, buildDefaultPricing, getDealerPrice
} = require('../lib/helpers');
const { hashPassword } = require('../lib/password');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.use(requireAuth, requireAdmin);

// Soft-delete expiry: 30 days in milliseconds
const PURGE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

// ===========================================================
// DEALER CRUD
// ===========================================================

// GET /api/admin/dealers (excludes soft-deleted)
router.get('/', (req, res) => {
    const dealers = readJSON(DEALERS_FILE);
    const safe = dealers
        .filter(d => !d.isDeleted)
        .map(d => {
            const { passwordHash, ...rest } = d;
            return rest;
        });
    res.json(safe);
});

// GET /api/admin/dealers/deleted
router.get('/deleted', (req, res) => {
    const dealers = readJSON(DEALERS_FILE);
    const deleted = dealers
        .filter(d => d.isDeleted === true)
        .map(d => {
            const { passwordHash, ...rest } = d;
            return rest;
        });
    res.json(deleted);
});

// POST /api/admin/dealers/purge-expired
router.post('/purge-expired', (req, res) => {
    const dealers = readJSON(DEALERS_FILE);
    const now = Date.now();

    const kept = [];
    const purged = [];

    dealers.forEach(d => {
        if (d.isDeleted && d.deletedAt) {
            const deletedTime = new Date(d.deletedAt).getTime();
            if (now - deletedTime > PURGE_AFTER_MS) {
                purged.push({ id: d.id, dealerCode: d.dealerCode, deletedAt: d.deletedAt });
                return;
            }
        }
        kept.push(d);
    });

    writeJSON(DEALERS_FILE, kept);

    const purgedCodes = purged.map(p => p.dealerCode);
    if (purgedCodes.length > 0) {
        const users = readJSON(USERS_FILE);
        const keptUsers = users.filter(u => {
            if (u.isDeleted && purgedCodes.includes(u.dealerCode)) {
                return false;
            }
            return true;
        });
        writeJSON(USERS_FILE, keptUsers);
    }

    console.log('[Admin Dealers] Purged ' + purged.length + ' expired soft-deleted dealers by ' + req.user.username);
    res.json({
        purged: purged.length,
        remaining: kept.filter(d => d.isDeleted).length,
        details: purged
    });
});

// POST /api/admin/dealers
router.post('/', (req, res) => {
    const { dealerCode, password, dealerName, contactPerson, email, phone, role, username } = req.body;
    if (!dealerCode || !password) {
        return res.status(400).json({ error: 'Dealer code and password required' });
    }
    if (!/^[A-Z0-9]{6}$/i.test(dealerCode)) {
        return res.status(400).json({ error: 'Dealer code must be 6 alphanumeric characters' });
    }
    if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const dealers = readJSON(DEALERS_FILE);
    if (dealers.find(d => !d.isDeleted && d.dealerCode.toUpperCase() === dealerCode.toUpperCase())) {
        return res.status(409).json({ error: 'Dealer code already exists' });
    }

    const gmUsername = (username && username.trim().length > 0)
        ? username.trim().toLowerCase()
        : dealerCode.toLowerCase();

    const users = readJSON(USERS_FILE);
    if (users.find(u => !u.isDeleted && u.username.toLowerCase() === gmUsername)) {
        return res.status(409).json({ error: 'Username "' + gmUsername + '" already exists. Choose a different username.' });
    }

    const newDealer = {
        id: generateId(),
        dealerCode: dealerCode.toUpperCase(),
        passwordHash: hashPassword(password),
        dealerName: dealerName || '',
        contactPerson: contactPerson || '',
        email: email || '',
        phone: phone || '',
        pricing: buildDefaultPricing(),
        role: role || 'dealer',
        isActive: true,
        isDeleted: false,
        deletedAt: null,
        deletedBy: null,
        deletedByRole: null,
        createdAt: new Date().toISOString(),
        lastLoginAt: null
    };
    dealers.push(newDealer);
    writeJSON(DEALERS_FILE, dealers);

    const gmUser = {
        id: generateId(),
        username: gmUsername,
        passwordHash: hashPassword(password),
        dealerCode: dealerCode.toUpperCase(),
        role: 'gm',
        displayName: contactPerson || dealerName || dealerCode,
        email: email || '',
        phone: phone || '',
        status: 'active',
        createdBy: req.user.username,
        approvedBy: req.user.username,
        approvedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastLogin: null,
        loginCount: 0,
        failedLoginAttempts: 0,
        lockedUntil: null,
        isDeleted: false,
        deletedAt: null,
        deletedBy: null,
        deletedByRole: null
    };
    users.push(gmUser);
    writeJSON(USERS_FILE, users);

    console.log('[admin] New dealer created:', dealerCode.toUpperCase(), '| GM user:', gmUser.username);

    const { passwordHash: _, ...safe } = newDealer;
    res.status(201).json({
        dealer: safe,
        gmUser: {
            username: gmUser.username,
            displayName: gmUser.displayName,
            role: gmUser.role,
            message: 'GM account auto-created. Username: ' + gmUser.username + ', same password as dealer.'
        }
    });
});

// PUT /api/admin/dealers/:id
router.put('/:id', (req, res) => {
    const dealers = readJSON(DEALERS_FILE);
    const idx = dealers.findIndex(d => d.id === req.params.id && !d.isDeleted);
    if (idx === -1) return res.status(404).json({ error: 'Dealer not found' });

    const allowed = ['dealerName', 'contactPerson', 'email', 'phone', 'role', 'isActive'];
    allowed.forEach(field => {
        if (req.body[field] !== undefined) dealers[idx][field] = req.body[field];
    });
    writeJSON(DEALERS_FILE, dealers);

    const { passwordHash, ...safe } = dealers[idx];
    res.json(safe);
});

// DELETE /api/admin/dealers/:id - Soft-delete dealer + cascade-disable users
router.delete('/:id', (req, res) => {
    const dealers = readJSON(DEALERS_FILE);
    const idx = dealers.findIndex(d => d.id === req.params.id && !d.isDeleted);
    if (idx === -1) return res.status(404).json({ error: 'Dealer not found' });

    const now = new Date().toISOString();
    const dealerCode = dealers[idx].dealerCode;

    dealers[idx].isDeleted = true;
    dealers[idx].isActive = false;
    dealers[idx].deletedAt = now;
    dealers[idx].deletedBy = req.user.username;
    dealers[idx].deletedByRole = req.user.role || 'admin';
    dealers[idx].previouslyActive = dealers[idx].isActive;
    writeJSON(DEALERS_FILE, dealers);

    const users = readJSON(USERS_FILE);
    let usersAffected = 0;
    users.forEach(u => {
        if (u.dealerCode === dealerCode && !u.isDeleted) {
            if (u.id === req.user.id) return;
            u.isDeleted = true;
            u.deletedAt = now;
            u.deletedBy = req.user.username;
            u.deletedByRole = req.user.role || 'admin';
            u.previousStatus = u.status;
            u.status = 'deleted';
            u.deletedReason = 'cascade_dealer_deleted';
            u.updatedAt = now;
            usersAffected++;
        }
    });
    writeJSON(USERS_FILE, users);

    console.log('[Admin Dealers] Soft-deleted dealer ' + dealerCode + ' (' + usersAffected + ' users cascade-deleted) by ' + req.user.username);

    const { passwordHash, ...safe } = dealers[idx];
    res.json({
        dealer: safe,
        usersDeleted: usersAffected,
        message: 'Dealer ' + dealerCode + ' deleted (recoverable for 30 days). ' + usersAffected + ' user(s) also removed.'
    });
});

// POST /api/admin/dealers/:id/restore
router.post('/:id/restore', (req, res) => {
    const dealers = readJSON(DEALERS_FILE);
    const idx = dealers.findIndex(d => d.id === req.params.id && d.isDeleted === true);
    if (idx === -1) return res.status(404).json({ error: 'Deleted dealer not found' });

    const now = new Date().toISOString();
    const dealerCode = dealers[idx].dealerCode;

    dealers[idx].isDeleted = false;
    dealers[idx].isActive = true;
    dealers[idx].deletedAt = null;
    dealers[idx].deletedBy = null;
    dealers[idx].deletedByRole = null;
    dealers[idx].restoredAt = now;
    dealers[idx].restoredBy = req.user.username;
    writeJSON(DEALERS_FILE, dealers);

    const users = readJSON(USERS_FILE);
    let usersRestored = 0;
    users.forEach(u => {
        if (u.dealerCode === dealerCode && u.isDeleted && u.deletedReason === 'cascade_dealer_deleted') {
            u.isDeleted = false;
            u.status = u.previousStatus || 'active';
            u.deletedAt = null;
            u.deletedBy = null;
            u.deletedByRole = null;
            u.previousStatus = null;
            u.deletedReason = null;
            u.restoredAt = now;
            u.restoredBy = req.user.username;
            u.updatedAt = now;
            usersRestored++;
        }
    });
    writeJSON(USERS_FILE, users);

    console.log('[Admin Dealers] Restored dealer ' + dealerCode + ' (' + usersRestored + ' users restored) by ' + req.user.username);

    const { passwordHash, ...safe } = dealers[idx];
    res.json({
        dealer: safe,
        usersRestored: usersRestored,
        message: 'Dealer ' + dealerCode + ' restored. ' + usersRestored + ' user(s) also restored.'
    });
});

// DELETE /api/admin/dealers/:id/permanent
router.delete('/:id/permanent', (req, res) => {
    const dealers = readJSON(DEALERS_FILE);
    const idx = dealers.findIndex(d => d.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Dealer not found' });

    const dealerCode = dealers[idx].dealerCode;
    const deleted = dealers.splice(idx, 1)[0];
    writeJSON(DEALERS_FILE, dealers);

    const users = readJSON(USERS_FILE);
    const keptUsers = users.filter(u => {
        if (u.dealerCode === dealerCode && u.isDeleted) return false;
        return true;
    });
    const usersRemoved = users.length - keptUsers.length;
    writeJSON(USERS_FILE, keptUsers);

    console.log('[Admin Dealers] Permanently deleted dealer ' + dealerCode + ' (' + usersRemoved + ' users removed) by ' + req.user.username);
    res.json({
        message: 'Dealer ' + dealerCode + ' permanently deleted. ' + usersRemoved + ' associated user(s) also removed.',
        dealerCode: dealerCode
    });
});

// POST /api/admin/dealers/:id/reset
router.post('/:id/reset', (req, res) => {
    const dealers = readJSON(DEALERS_FILE);
    const idx = dealers.findIndex(d => d.id === req.params.id && !d.isDeleted);
    if (idx === -1) return res.status(404).json({ error: 'Dealer not found' });

    const tempPassword = crypto.randomBytes(4).toString('hex');
    dealers[idx].passwordHash = hashPassword(tempPassword);
    writeJSON(DEALERS_FILE, dealers);

    res.json({
        dealerCode: dealers[idx].dealerCode,
        temporaryPassword: tempPassword,
        message: 'Give this password to the dealer. They should change it on first login.'
    });
});

// POST /api/admin/dealers/:id/change-password
router.post('/:id/change-password', (req, res) => {
    const dealers = readJSON(DEALERS_FILE);
    const idx = dealers.findIndex(d => d.id === req.params.id && !d.isDeleted);
    if (idx === -1) return res.status(404).json({ error: 'Dealer not found' });

    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    dealers[idx].passwordHash = hashPassword(newPassword);
    writeJSON(DEALERS_FILE, dealers);
    res.json({ ok: true, message: 'Password updated successfully' });
});

// ===========================================================
// PER-DEALER PRICING ENDPOINTS
// ===========================================================

// GET /api/admin/dealers/:id/pricing
// Returns the dealer's pricing merged with product catalog info
router.get('/:id/pricing', (req, res) => {
    const dealers = readJSON(DEALERS_FILE);
    const dealer = dealers.find(d => d.id === req.params.id && !d.isDeleted);
    if (!dealer) return res.status(404).json({ error: 'Dealer not found' });

    const products = readJSON(PRODUCTS_FILE);
    const dealerPricing = dealer.pricing || {};

    const result = products
        .filter(p => p.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(p => ({
            productId: p.id,
            name: p.name,
            category: p.category,
            unit: p.unit,
            basePrice: p.basePrice,
            dealerPrice: dealerPricing[p.id] !== undefined ? dealerPricing[p.id] : p.basePrice,
            isCustomized: dealerPricing[p.id] !== undefined && dealerPricing[p.id] !== p.basePrice
        }));

    res.json({
        dealerId: dealer.id,
        dealerCode: dealer.dealerCode,
        dealerName: dealer.dealerName,
        products: result
    });
});

// PUT /api/admin/dealers/:id/pricing
// Update one or more product prices for this dealer
// Body: { "pricing": { "system": 7.50, "grooved": 5.25 } }
router.put('/:id/pricing', (req, res) => {
    const dealers = readJSON(DEALERS_FILE);
    const idx = dealers.findIndex(d => d.id === req.params.id && !d.isDeleted);
    if (idx === -1) return res.status(404).json({ error: 'Dealer not found' });

    const { pricing } = req.body;
    if (!pricing || typeof pricing !== 'object') {
        return res.status(400).json({ error: 'Request body must include a "pricing" object' });
    }

    const products = readJSON(PRODUCTS_FILE);
    const validProductIds = products.filter(p => p.isActive).map(p => p.id);

    if (!dealers[idx].pricing) {
        dealers[idx].pricing = buildDefaultPricing();
    }

    const errors = [];
    Object.entries(pricing).forEach(([productId, price]) => {
        if (!validProductIds.includes(productId)) {
            errors.push('Unknown product: ' + productId);
            return;
        }
        const numPrice = parseFloat(price);
        if (isNaN(numPrice) || numPrice < 0) {
            errors.push('Invalid price for ' + productId + ': must be a number >= 0');
            return;
        }
        dealers[idx].pricing[productId] = Math.round(numPrice * 100) / 100;
    });

    if (errors.length > 0) {
        return res.status(400).json({ error: 'Some prices were invalid', details: errors });
    }

    dealers[idx].pricingUpdatedAt = new Date().toISOString();
    dealers[idx].pricingUpdatedBy = req.user.username;
    writeJSON(DEALERS_FILE, dealers);

    const { passwordHash, ...safe } = dealers[idx];
    res.json({
        message: 'Pricing updated for ' + dealers[idx].dealerCode,
        dealer: safe
    });
});

// POST /api/admin/dealers/:id/pricing/reset
// Reset all dealer prices back to product base prices
router.post('/:id/pricing/reset', (req, res) => {
    const dealers = readJSON(DEALERS_FILE);
    const idx = dealers.findIndex(d => d.id === req.params.id && !d.isDeleted);
    if (idx === -1) return res.status(404).json({ error: 'Dealer not found' });

    dealers[idx].pricing = buildDefaultPricing();
    dealers[idx].pricingUpdatedAt = new Date().toISOString();
    dealers[idx].pricingUpdatedBy = req.user.username;
    writeJSON(DEALERS_FILE, dealers);

    const { passwordHash, ...safe } = dealers[idx];
    res.json({
        message: 'Pricing reset to base prices for ' + dealers[idx].dealerCode,
        dealer: safe
    });
});

// POST /api/admin/dealers/:id/pricing/copy-from/:sourceId
// Copy pricing from another dealer
router.post('/:id/pricing/copy-from/:sourceId', (req, res) => {
    const dealers = readJSON(DEALERS_FILE);
    const targetIdx = dealers.findIndex(d => d.id === req.params.id && !d.isDeleted);
    if (targetIdx === -1) return res.status(404).json({ error: 'Target dealer not found' });

    const source = dealers.find(d => d.id === req.params.sourceId && !d.isDeleted);
    if (!source) return res.status(404).json({ error: 'Source dealer not found' });

    if (!source.pricing || Object.keys(source.pricing).length === 0) {
        return res.status(400).json({ error: 'Source dealer has no custom pricing to copy' });
    }

    dealers[targetIdx].pricing = JSON.parse(JSON.stringify(source.pricing));
    dealers[targetIdx].pricingUpdatedAt = new Date().toISOString();
    dealers[targetIdx].pricingUpdatedBy = req.user.username;
    dealers[targetIdx].pricingCopiedFrom = source.dealerCode;
    writeJSON(DEALERS_FILE, dealers);

    const { passwordHash, ...safe } = dealers[targetIdx];
    res.json({
        message: 'Pricing copied from ' + source.dealerCode + ' to ' + dealers[targetIdx].dealerCode,
        dealer: safe
    });
});

module.exports = router;
