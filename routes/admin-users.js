const express = require('express');
const router = express.Router();
const { readJSON, writeJSON, USERS_FILE, generateId } = require('../lib/helpers');
const { hashPassword } = require('../lib/password');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);
router.use(requireRole('admin'));

// GET /api/admin/users
// Returns ALL users across ALL dealers, with dealerCode populated.
// Supports optional query filters: ?dealerCode=ABC123&role=frontdesk&status=active
router.get('/', (req, res) => {
    const users = readJSON(USERS_FILE);
    let filtered = users;

    if (req.query.dealerCode) {
        filtered = filtered.filter(u => u.dealerCode === req.query.dealerCode.toUpperCase());
    }
    if (req.query.role) {
        filtered = filtered.filter(u => u.role === req.query.role);
    }
    if (req.query.status) {
        filtered = filtered.filter(u => u.status === req.query.status);
    }

    const safe = filtered.map(u => {
        const { passwordHash, ...rest } = u;
        return rest;
    });

    // Sort by dealerCode, then username
    safe.sort((a, b) => {
        if (a.dealerCode < b.dealerCode) return -1;
        if (a.dealerCode > b.dealerCode) return 1;
        if (a.username < b.username) return -1;
        if (a.username > b.username) return 1;
        return 0;
    });

    res.json(safe);
});

// POST /api/admin/users
// Admin can create any role at any dealerCode
router.post('/', (req, res) => {
    const { username, password, displayName, email, phone, role, dealerCode } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }
    if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (!dealerCode) {
        return res.status(400).json({ error: 'Dealer code is required' });
    }

    const allowedRoles = ['admin', 'gm', 'frontdesk', 'dealer', 'rep'];
    const effectiveRole = allowedRoles.includes(role) ? role : 'frontdesk';

    const users = readJSON(USERS_FILE);
    const exists = users.find(u =>
        u.username.toLowerCase() === username.toLowerCase() &&
        u.dealerCode === dealerCode.toUpperCase()
    );
    if (exists) {
        return res.status(409).json({ error: 'Username already exists for this dealer' });
    }

    const newUser = {
        id: generateId(),
        username: username.toLowerCase(),
        passwordHash: hashPassword(password),
        dealerCode: dealerCode.toUpperCase(),
        role: effectiveRole,
        displayName: displayName || username,
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
        lockedUntil: null
    };

    users.push(newUser);
    writeJSON(USERS_FILE, users);

    const { passwordHash: _, ...safe } = newUser;
    console.log('[Admin Users] Created: ' + newUser.username + ' (' + newUser.role + ') for ' + newUser.dealerCode + ' by ' + req.user.username);
    res.status(201).json(safe);
});

// PUT /api/admin/users/:id
// Admin can update any field on any user
router.put('/:id', (req, res) => {
    const users = readJSON(USERS_FILE);
    const idx = users.findIndex(u => u.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });

    const allowed = ['displayName', 'email', 'phone', 'role', 'dealerCode', 'status'];
    allowed.forEach(field => {
        if (req.body[field] !== undefined) users[idx][field] = req.body[field];
    });
    users[idx].updatedAt = new Date().toISOString();
    writeJSON(USERS_FILE, users);

    const { passwordHash, ...safe } = users[idx];
    console.log('[Admin Users] Updated: ' + users[idx].username + ' by ' + req.user.username);
    res.json(safe);
});

// POST /api/admin/users/:id/disable
router.post('/:id/disable', (req, res) => {
    const users = readJSON(USERS_FILE);
    const idx = users.findIndex(u => u.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });

    if (users[idx].id === req.user.id) {
        return res.status(400).json({ error: 'Cannot disable your own account' });
    }

    users[idx].status = 'disabled';
    users[idx].updatedAt = new Date().toISOString();
    writeJSON(USERS_FILE, users);

    const { passwordHash, ...safe } = users[idx];
    console.log('[Admin Users] Disabled: ' + users[idx].username + ' by ' + req.user.username);
    res.json(safe);
});

// POST /api/admin/users/:id/enable
router.post('/:id/enable', (req, res) => {
    const users = readJSON(USERS_FILE);
    const idx = users.findIndex(u => u.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });

    users[idx].status = 'active';
    users[idx].updatedAt = new Date().toISOString();
    writeJSON(USERS_FILE, users);

    const { passwordHash, ...safe } = users[idx];
    console.log('[Admin Users] Enabled: ' + users[idx].username + ' by ' + req.user.username);
    res.json(safe);
});

// POST /api/admin/users/:id/reset-password
router.post('/:id/reset-password', (req, res) => {
    const users = readJSON(USERS_FILE);
    const idx = users.findIndex(u => u.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });

    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    users[idx].passwordHash = hashPassword(newPassword);
    users[idx].updatedAt = new Date().toISOString();
    users[idx].failedLoginAttempts = 0;
    users[idx].lockedUntil = null;
    writeJSON(USERS_FILE, users);

    console.log('[Admin Users] Password reset for: ' + users[idx].username + ' by ' + req.user.username);
    res.json({ message: 'Password reset for ' + users[idx].username });
});

// DELETE /api/admin/users/:id
router.delete('/:id', (req, res) => {
    const users = readJSON(USERS_FILE);
    const idx = users.findIndex(u => u.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });

    if (users[idx].id === req.user.id) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const removed = users.splice(idx, 1)[0];
    writeJSON(USERS_FILE, users);

    console.log('[Admin Users] Deleted: ' + removed.username + ' by ' + req.user.username);
    res.json({ message: 'User ' + removed.username + ' deleted' });
});

module.exports = router;
