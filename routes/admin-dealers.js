const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { readJSON, writeJSON, DEALERS_FILE, USERS_FILE, generateId } = require('../lib/helpers');
const { hashPassword } = require('../lib/password');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.use(requireAuth, requireAdmin);

// GET /api/admin/dealers
router.get('/', (req, res) => {
    const dealers = readJSON(DEALERS_FILE);
    const safe = dealers.map(d => {
        const { passwordHash, ...rest } = d;
        return rest;
    });
    res.json(safe);
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
    if (dealers.find(d => d.dealerCode.toUpperCase() === dealerCode.toUpperCase())) {
        return res.status(409).json({ error: 'Dealer code already exists' });
    }

    // Determine GM username: use provided username or fall back to dealer code
    const gmUsername = (username && username.trim().length > 0)
        ? username.trim().toLowerCase()
        : dealerCode.toLowerCase();

    // Check for duplicate username
    const users = readJSON(USERS_FILE);
    if (users.find(u => u.username.toLowerCase() === gmUsername)) {
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
        lockedUntil: null
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
    const idx = dealers.findIndex(d => d.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Dealer not found' });

    const allowed = ['dealerName', 'contactPerson', 'email', 'phone', 'pricingTier', 'role', 'isActive'];
    allowed.forEach(field => {
        if (req.body[field] !== undefined) dealers[idx][field] = req.body[field];
    });
    writeJSON(DEALERS_FILE, dealers);

    const { passwordHash, ...safe } = dealers[idx];
    res.json(safe);
});

// DELETE /api/admin/dealers/:id (soft deactivate)
router.delete('/:id', (req, res) => {
    const dealers = readJSON(DEALERS_FILE);
    const idx = dealers.findIndex(d => d.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Dealer not found' });

    if (dealers[idx].id === req.user.id) {
        return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }
    dealers[idx].isActive = false;
    writeJSON(DEALERS_FILE, dealers);

    const { passwordHash, ...safe } = dealers[idx];
    res.json(safe);
});

// POST /api/admin/dealers/:id/reset
router.post('/:id/reset', (req, res) => {
    const dealers = readJSON(DEALERS_FILE);
    const idx = dealers.findIndex(d => d.id === req.params.id);
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
    const idx = dealers.findIndex(d => d.id === req.params.id);
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
