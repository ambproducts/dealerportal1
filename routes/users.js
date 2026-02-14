const express = require('express');
const router = express.Router();
const { readJSON, writeJSON, USERS_FILE, generateId } = require('../lib/helpers');
const { hashPassword } = require('../lib/password');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/users
router.get('/', requireRole('admin', 'gm'), (req, res) => {
    const users = readJSON(USERS_FILE);
    let filtered = users;

    if (req.user.role === 'gm') {
        filtered = users.filter(u => u.dealerCode === req.user.dealerCode);
    }

    const safe = filtered.map(u => {
        const { passwordHash, ...rest } = u;
        return rest;
    });
    res.json(safe);
});

// POST /api/users
router.post('/', requireRole('admin', 'gm'), (req, res) => {
    const { username, password, displayName, email, phone, role, dealerCode } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }
    if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const effectiveDealerCode = req.user.role === 'admin' && dealerCode
        ? dealerCode.toUpperCase()
        : req.user.dealerCode;

    const allowedRoles = req.user.role === 'admin'
        ? ['admin', 'gm', 'frontdesk']
        : ['frontdesk'];

    const effectiveRole = allowedRoles.includes(role) ? role : 'frontdesk';

    const users = readJSON(USERS_FILE);
    const exists = users.find(u =>
        u.username.toLowerCase() === username.toLowerCase() &&
        u.dealerCode === effectiveDealerCode
    );
    if (exists) {
        return res.status(409).json({ error: 'Username already exists for this dealer' });
    }

    const needsApproval = req.user.role !== 'admin';

    const newUser = {
        id: generateId(),
        username: username.toLowerCase(),
        passwordHash: hashPassword(password),
        dealerCode: effectiveDealerCode,
        role: effectiveRole,
        displayName: displayName || username,
        email: email || '',
        phone: phone || '',
        status: needsApproval ? 'pending' : 'active',
        createdBy: req.user.username,
        approvedBy: needsApproval ? null : req.user.username,
        approvedAt: needsApproval ? null : new Date().toISOString(),
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
    console.log('[Users] Created: ' + newUser.username + ' (' + newUser.role + ') for ' + effectiveDealerCode + ' by ' + req.user.username);
    res.status(201).json(safe);
});

// PUT /api/users/:id
router.put('/:id', requireRole('admin', 'gm'), (req, res) => {
    const users = readJSON(USERS_FILE);
    const idx = users.findIndex(u => u.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });

    if (req.user.role === 'gm' && users[idx].dealerCode !== req.user.dealerCode) {
        return res.status(403).json({ error: 'Cannot modify users from another dealer' });
    }

    const allowed = ['displayName', 'email', 'phone'];
    if (req.user.role === 'admin') {
        allowed.push('role', 'dealerCode', 'status');
    }

    allowed.forEach(field => {
        if (req.body[field] !== undefined) users[idx][field] = req.body[field];
    });
    users[idx].updatedAt = new Date().toISOString();
    writeJSON(USERS_FILE, users);

    const { passwordHash, ...safe } = users[idx];
    res.json(safe);
});

// POST /api/users/:id/approve
router.post('/:id/approve', requireRole('admin'), (req, res) => {
    const users = readJSON(USERS_FILE);
    const idx = users.findIndex(u => u.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });

    users[idx].status = 'active';
    users[idx].approvedBy = req.user.username;
    users[idx].approvedAt = new Date().toISOString();
    users[idx].updatedAt = new Date().toISOString();
    writeJSON(USERS_FILE, users);

    const { passwordHash, ...safe } = users[idx];
    console.log('[Users] Approved: ' + users[idx].username + ' by ' + req.user.username);
    res.json(safe);
});

// POST /api/users/:id/reject
router.post('/:id/reject', requireRole('admin'), (req, res) => {
    const users = readJSON(USERS_FILE);
    const idx = users.findIndex(u => u.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });

    users[idx].status = 'rejected';
    users[idx].updatedAt = new Date().toISOString();
    writeJSON(USERS_FILE, users);

    const { passwordHash, ...safe } = users[idx];
    res.json(safe);
});

// POST /api/users/:id/disable
// Admin: can disable any user (except self)
// GM: can disable frontdesk users at their own dealerCode (not self, not other GMs/admins)
router.post('/:id/disable', requireRole('admin', 'gm'), (req, res) => {
    const users = readJSON(USERS_FILE);
    const idx = users.findIndex(u => u.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });

    if (users[idx].id === req.user.id) {
        return res.status(400).json({ error: 'Cannot disable your own account' });
    }

    // GM scope checks
    if (req.user.role === 'gm') {
        if (users[idx].dealerCode !== req.user.dealerCode) {
            return res.status(403).json({ error: 'Cannot modify users from another dealer' });
        }
        if (users[idx].role !== 'frontdesk') {
            return res.status(403).json({ error: 'GM can only disable frontdesk accounts' });
        }
    }

    users[idx].status = 'disabled';
    users[idx].updatedAt = new Date().toISOString();
    writeJSON(USERS_FILE, users);

    const { passwordHash, ...safe } = users[idx];
    console.log('[Users] Disabled: ' + users[idx].username + ' by ' + req.user.username);
    res.json(safe);
});

// POST /api/users/:id/enable
// Admin: can enable any user
// GM: can enable frontdesk users at their own dealerCode
router.post('/:id/enable', requireRole('admin', 'gm'), (req, res) => {
    const users = readJSON(USERS_FILE);
    const idx = users.findIndex(u => u.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });

    // GM scope checks
    if (req.user.role === 'gm') {
        if (users[idx].dealerCode !== req.user.dealerCode) {
            return res.status(403).json({ error: 'Cannot modify users from another dealer' });
        }
        if (users[idx].role !== 'frontdesk') {
            return res.status(403).json({ error: 'GM can only enable frontdesk accounts' });
        }
    }

    users[idx].status = 'active';
    users[idx].updatedAt = new Date().toISOString();
    writeJSON(USERS_FILE, users);

    const { passwordHash, ...safe } = users[idx];
    console.log('[Users] Enabled: ' + users[idx].username + ' by ' + req.user.username);
    res.json(safe);
});

// POST /api/users/:id/reset-password
// Admin: can reset any user's password
// GM: can reset frontdesk users' passwords at their own dealerCode
router.post('/:id/reset-password', requireRole('admin', 'gm'), (req, res) => {
    const users = readJSON(USERS_FILE);
    const idx = users.findIndex(u => u.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });

    // GM scope checks
    if (req.user.role === 'gm') {
        if (users[idx].dealerCode !== req.user.dealerCode) {
            return res.status(403).json({ error: 'Cannot modify users from another dealer' });
        }
        if (users[idx].role !== 'frontdesk') {
            return res.status(403).json({ error: 'GM can only reset passwords for frontdesk accounts' });
        }
    }

    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    users[idx].passwordHash = hashPassword(newPassword);
    users[idx].updatedAt = new Date().toISOString();
    users[idx].failedLoginAttempts = 0;
    users[idx].lockedUntil = null;
    writeJSON(USERS_FILE, users);

    console.log('[Users] Password reset for: ' + users[idx].username + ' by ' + req.user.username);
    res.json({ message: 'Password reset for ' + users[idx].username });
});

module.exports = router;
