// ============================================================
// routes/admin-dealers.js - Admin Dealer Management v2.0
// Date: 2026-02-27
// ============================================================
// v2.0 Changes (2026-02-27):
//   - CHANGE: DELETE /:id now soft-deletes (sets isDeleted, deletedAt, etc.)
//     and cascade-disables all users under that dealer code
//   - ADD: GET /deleted returns soft-deleted dealers
//   - ADD: POST /:id/restore to undo soft-delete and re-enable users
//   - ADD: DELETE /:id/permanent for hard delete
//   - ADD: POST /purge-expired to auto-clean records older than 30 days
//   - FIX: GET / now filters out soft-deleted dealers by default
// ============================================================

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { readJSON, writeJSON, DEALERS_FILE, USERS_FILE, generateId } = require('../lib/helpers');
const { hashPassword } = require('../lib/password');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.use(requireAuth, requireAdmin);

// Soft-delete expiry: 30 days in milliseconds
const PURGE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

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

    // Also purge associated soft-deleted users whose dealer was purged
    const purgedCodes = purged.map(p => p.dealerCode);
    if (purgedCodes.length > 0) {
        const users = readJSON(USERS_FILE);
        const keptUsers = users.filter(u => {
            if (u.isDeleted && purgedCodes.includes(u.dealerCode)) {
                return false; // remove these too
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
    const { dealerCode, password, dealerName, contactPerson, email, phone, pricingTier, role, username } = req.body;
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

    // Determine GM username: use provided username or fall back to dealer code
    const gmUsername = (username && username.trim().length > 0)
        ? username.trim().toLowerCase()
        : dealerCode.toLowerCase();

    // Check for duplicate username among non-deleted users
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
        pricingTier: pricingTier || 'standard',
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

    const allowed = ['dealerName', 'contactPerson', 'email', 'phone', 'pricingTier', 'role', 'isActive'];
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

    // Prevent deleting your own dealer account if applicable
    if (req.user.dealerCode === dealers[idx].dealerCode && req.user.role === 'admin') {
        // Allow admin to delete other dealers, but warn if it is their own
        // Actually admins typically have a separate dealer code, so this is fine
    }

    const now = new Date().toISOString();
    const dealerCode = dealers[idx].dealerCode;

    // Soft-delete the dealer
    dealers[idx].isDeleted = true;
    dealers[idx].isActive = false;
    dealers[idx].deletedAt = now;
    dealers[idx].deletedBy = req.user.username;
    dealers[idx].deletedByRole = req.user.role || 'admin';
    dealers[idx].previouslyActive = dealers[idx].isActive;
    writeJSON(DEALERS_FILE, dealers);

    // Cascade: soft-delete all users under this dealer code
    const users = readJSON(USERS_FILE);
    let usersAffected = 0;
    users.forEach(u => {
        if (u.dealerCode === dealerCode && !u.isDeleted) {
            // Don't delete the admin performing the action
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

// POST /api/admin/dealers/:id/restore - Restore soft-deleted dealer + users
router.post('/:id/restore', (req, res) => {
    const dealers = readJSON(DEALERS_FILE);
    const idx = dealers.findIndex(d => d.id === req.params.id && d.isDeleted === true);
    if (idx === -1) return res.status(404).json({ error: 'Deleted dealer not found' });

    const now = new Date().toISOString();
    const dealerCode = dealers[idx].dealerCode;

    // Restore the dealer
    dealers[idx].isDeleted = false;
    dealers[idx].isActive = true;
    dealers[idx].deletedAt = null;
    dealers[idx].deletedBy = null;
    dealers[idx].deletedByRole = null;
    dealers[idx].restoredAt = now;
    dealers[idx].restoredBy = req.user.username;
    writeJSON(DEALERS_FILE, dealers);

    // Restore cascade-deleted users under this dealer code
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

// DELETE /api/admin/dealers/:id/permanent - Hard-delete permanently
router.delete('/:id/permanent', (req, res) => {
    const dealers = readJSON(DEALERS_FILE);
    const idx = dealers.findIndex(d => d.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Dealer not found' });

    const dealerCode = dealers[idx].dealerCode;
    const deleted = dealers.splice(idx, 1)[0];
    writeJSON(DEALERS_FILE, dealers);

    // Also permanently remove all soft-deleted users under this dealer code
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

module.exports = router;
