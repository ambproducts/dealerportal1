// ============================================================
// routes/admin-users.js - Admin User Management Endpoints v3.0
// Date: 2026-02-27
// ============================================================
// Provides admin-only CRUD for all user accounts across all dealers.
// Reads/writes data/users.json via lib/helpers.js (same data layer
// as routes/users.js so both routes see the same user records).
//
// Mounted at /api/admin/users in server.js.
//
// Endpoints:
//   GET    /api/admin/users                      - List all users (filterable, excludes soft-deleted)
//   GET    /api/admin/users/deleted               - List soft-deleted users
//   POST   /api/admin/users                      - Create a new user
//   PUT    /api/admin/users/:id                   - Update user details
//   POST   /api/admin/users/:id/reset-password    - Reset user password
//   POST   /api/admin/users/:id/disable           - Disable a user
//   POST   /api/admin/users/:id/enable            - Enable a user
//   DELETE /api/admin/users/:id                   - Soft-delete a user
//   POST   /api/admin/users/:id/restore           - Restore a soft-deleted user
//   DELETE /api/admin/users/:id/permanent          - Permanently delete a user
//   POST   /api/admin/users/purge-expired          - Purge users deleted 30+ days ago
//
// v3.0 Changes (2026-02-27):
//   - CHANGE: DELETE /:id now soft-deletes (sets isDeleted, deletedAt, deletedBy)
//   - ADD: GET /deleted endpoint for soft-deleted users
//   - ADD: POST /:id/restore to undo soft-delete
//   - ADD: DELETE /:id/permanent for hard delete
//   - ADD: POST /purge-expired to auto-clean records older than 30 days
//   - FIX: GET / now filters out soft-deleted users by default
// ============================================================

const express = require('express');
const router = express.Router();
const { readJSON, writeJSON, USERS_FILE, generateId } = require('../lib/helpers');
const { hashPassword } = require('../lib/password');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// All routes require authenticated admin
router.use(requireAuth);
router.use(requireAdmin);

// Soft-delete expiry: 30 days in milliseconds
const PURGE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

// Strip passwordHash (and other sensitive fields) from responses
function sanitize(user) {
    const {
        passwordHash,
        failedLoginAttempts,
        lockedUntil,
        ...safe
    } = user;
    return safe;
}

// -----------------------------------------------------------
// GET /api/admin/users - List all active (non-deleted) users
// Query params: ?dealerCode=AMB001&role=gm&status=active
// -----------------------------------------------------------
router.get('/', (req, res) => {
    let users = readJSON(USERS_FILE);

    // Filter out soft-deleted users by default
    users = users.filter(u => !u.isDeleted);

    if (req.query.dealerCode) {
        const code = req.query.dealerCode.toUpperCase();
        users = users.filter(u => u.dealerCode === code);
    }
    if (req.query.role) {
        users = users.filter(u => u.role === req.query.role);
    }
    if (req.query.status) {
        users = users.filter(u => u.status === req.query.status);
    }

    res.json(users.map(sanitize));
});

// -----------------------------------------------------------
// GET /api/admin/users/deleted - List soft-deleted users
// -----------------------------------------------------------
router.get('/deleted', (req, res) => {
    let users = readJSON(USERS_FILE);
    const deleted = users.filter(u => u.isDeleted === true);
    res.json(deleted.map(sanitize));
});

// -----------------------------------------------------------
// POST /api/admin/users/purge-expired
// Permanently removes users soft-deleted more than 30 days ago
// -----------------------------------------------------------
router.post('/purge-expired', (req, res) => {
    const users = readJSON(USERS_FILE);
    const now = Date.now();
    const before = users.length;

    const kept = [];
    const purged = [];

    users.forEach(u => {
        if (u.isDeleted && u.deletedAt) {
            const deletedTime = new Date(u.deletedAt).getTime();
            if (now - deletedTime > PURGE_AFTER_MS) {
                purged.push({ id: u.id, username: u.username, dealerCode: u.dealerCode, deletedAt: u.deletedAt });
                return; // skip, do not keep
            }
        }
        kept.push(u);
    });

    writeJSON(USERS_FILE, kept);
    console.log('[Admin Users] Purged ' + purged.length + ' expired soft-deleted users by ' + req.user.username);
    res.json({
        purged: purged.length,
        remaining: kept.filter(u => u.isDeleted).length,
        details: purged
    });
});

// -----------------------------------------------------------
// POST /api/admin/users - Create a new user
// Body: { dealerCode, username, displayName, role, password, email?, phone? }
// -----------------------------------------------------------
router.post('/', (req, res) => {
    const { dealerCode, username, displayName, role, password, email, phone } = req.body;

    if (!dealerCode || !username || !password) {
        return res.status(400).json({ error: 'dealerCode, username, and password are required' });
    }
    if (username.length < 3) {
        return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const validRoles = ['admin', 'gm', 'frontdesk', 'dealer', 'rep'];
    if (role && !validRoles.includes(role)) {
        return res.status(400).json({ error: 'Invalid role. Must be one of: ' + validRoles.join(', ') });
    }

    const users = readJSON(USERS_FILE);
    const normalizedUsername = username.toLowerCase();
    const normalizedCode = dealerCode.toUpperCase();

    // Check against non-deleted users only
    const exists = users.find(u =>
        !u.isDeleted &&
        u.username.toLowerCase() === normalizedUsername &&
        u.dealerCode === normalizedCode
    );
    if (exists) {
        return res.status(409).json({ error: 'Username "' + username + '" already exists for dealer ' + normalizedCode });
    }

    const now = new Date().toISOString();
    const newUser = {
        id: generateId(),
        dealerCode: normalizedCode,
        username: normalizedUsername,
        displayName: displayName || username,
        role: role || 'frontdesk',
        email: email || '',
        phone: phone || '',
        status: 'active',
        passwordHash: hashPassword(password),
        createdBy: req.user.username,
        approvedBy: req.user.username,
        approvedAt: now,
        createdAt: now,
        updatedAt: now,
        lastLogin: null,
        loginCount: 0,
        failedLoginAttempts: 0,
        lockedUntil: null,
        isDeleted: false,
        deletedAt: null,
        deletedBy: null,
        deletedByRole: null
    };

    users.push(newUser);
    writeJSON(USERS_FILE, users);

    console.log('[Admin Users] Created: ' + newUser.username + ' (' + newUser.role + ') for ' + newUser.dealerCode + ' by ' + req.user.username);
    res.status(201).json(sanitize(newUser));
});

// -----------------------------------------------------------
// PUT /api/admin/users/:id - Update user details
// Body: { displayName?, role?, email?, phone?, dealerCode?, status? }
// -----------------------------------------------------------
router.put('/:id', (req, res) => {
    const users = readJSON(USERS_FILE);
    const idx = users.findIndex(u => u.id === req.params.id && !u.isDeleted);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });

    const { displayName, role, email, phone, dealerCode, status } = req.body;

    if (displayName !== undefined) users[idx].displayName = displayName;
    if (email !== undefined) users[idx].email = email;
    if (phone !== undefined) users[idx].phone = phone;
    if (dealerCode !== undefined) users[idx].dealerCode = dealerCode.toUpperCase();
    if (status !== undefined) users[idx].status = status;

    if (role !== undefined) {
        const validRoles = ['admin', 'gm', 'frontdesk', 'dealer', 'rep'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ error: 'Invalid role. Must be one of: ' + validRoles.join(', ') });
        }
        users[idx].role = role;
    }

    users[idx].updatedAt = new Date().toISOString();
    writeJSON(USERS_FILE, users);

    console.log('[Admin Users] Updated: ' + users[idx].username + ' by ' + req.user.username);
    res.json(sanitize(users[idx]));
});

// -----------------------------------------------------------
// POST /api/admin/users/:id/reset-password
// Body: { newPassword }
// -----------------------------------------------------------
router.post('/:id/reset-password', (req, res) => {
    const users = readJSON(USERS_FILE);
    const idx = users.findIndex(u => u.id === req.params.id && !u.isDeleted);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });

    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    users[idx].passwordHash = hashPassword(newPassword);
    users[idx].failedLoginAttempts = 0;
    users[idx].lockedUntil = null;
    users[idx].updatedAt = new Date().toISOString();
    writeJSON(USERS_FILE, users);

    console.log('[Admin Users] Password reset for: ' + users[idx].username + ' by ' + req.user.username);
    res.json({ message: 'Password reset for ' + users[idx].username });
});

// -----------------------------------------------------------
// POST /api/admin/users/:id/disable
// -----------------------------------------------------------
router.post('/:id/disable', (req, res) => {
    const users = readJSON(USERS_FILE);
    const idx = users.findIndex(u => u.id === req.params.id && !u.isDeleted);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });

    if (users[idx].id === req.user.id) {
        return res.status(400).json({ error: 'Cannot disable your own account' });
    }

    users[idx].status = 'disabled';
    users[idx].updatedAt = new Date().toISOString();
    writeJSON(USERS_FILE, users);

    console.log('[Admin Users] Disabled: ' + users[idx].username + ' by ' + req.user.username);
    res.json(sanitize(users[idx]));
});

// -----------------------------------------------------------
// POST /api/admin/users/:id/enable
// -----------------------------------------------------------
router.post('/:id/enable', (req, res) => {
    const users = readJSON(USERS_FILE);
    const idx = users.findIndex(u => u.id === req.params.id && !u.isDeleted);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });

    users[idx].status = 'active';
    users[idx].updatedAt = new Date().toISOString();
    writeJSON(USERS_FILE, users);

    console.log('[Admin Users] Enabled: ' + users[idx].username + ' by ' + req.user.username);
    res.json(sanitize(users[idx]));
});

// -----------------------------------------------------------
// DELETE /api/admin/users/:id - Soft-delete a user
// -----------------------------------------------------------
router.delete('/:id', (req, res) => {
    const users = readJSON(USERS_FILE);
    const idx = users.findIndex(u => u.id === req.params.id && !u.isDeleted);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });

    if (users[idx].id === req.user.id) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const now = new Date().toISOString();
    users[idx].isDeleted = true;
    users[idx].deletedAt = now;
    users[idx].deletedBy = req.user.username;
    users[idx].deletedByRole = req.user.role || 'admin';
    users[idx].previousStatus = users[idx].status;
    users[idx].status = 'deleted';
    users[idx].updatedAt = now;
    writeJSON(USERS_FILE, users);

    console.log('[Admin Users] Soft-deleted: ' + users[idx].username + ' by ' + req.user.username);
    res.json({
        message: 'User ' + users[idx].username + ' deleted (recoverable for 30 days)',
        id: users[idx].id,
        username: users[idx].username,
        dealerCode: users[idx].dealerCode,
        deletedAt: now
    });
});

// -----------------------------------------------------------
// POST /api/admin/users/:id/restore - Restore a soft-deleted user
// -----------------------------------------------------------
router.post('/:id/restore', (req, res) => {
    const users = readJSON(USERS_FILE);
    const idx = users.findIndex(u => u.id === req.params.id && u.isDeleted === true);
    if (idx === -1) return res.status(404).json({ error: 'Deleted user not found' });

    const now = new Date().toISOString();
    users[idx].isDeleted = false;
    users[idx].status = users[idx].previousStatus || 'active';
    users[idx].deletedAt = null;
    users[idx].deletedBy = null;
    users[idx].deletedByRole = null;
    users[idx].previousStatus = null;
    users[idx].restoredAt = now;
    users[idx].restoredBy = req.user.username;
    users[idx].updatedAt = now;
    writeJSON(USERS_FILE, users);

    console.log('[Admin Users] Restored: ' + users[idx].username + ' by ' + req.user.username);
    res.json(sanitize(users[idx]));
});

// -----------------------------------------------------------
// DELETE /api/admin/users/:id/permanent - Hard-delete permanently
// -----------------------------------------------------------
router.delete('/:id/permanent', (req, res) => {
    const users = readJSON(USERS_FILE);
    const idx = users.findIndex(u => u.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });

    if (users[idx].id === req.user.id) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const deleted = users.splice(idx, 1)[0];
    writeJSON(USERS_FILE, users);

    console.log('[Admin Users] Permanently deleted: ' + deleted.username + ' by ' + req.user.username);
    res.json({ message: 'User ' + deleted.username + ' permanently deleted', id: deleted.id });
});

module.exports = router;
