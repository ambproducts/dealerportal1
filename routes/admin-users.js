// ============================================================
// routes/admin-users.js - Admin User Management Endpoints
// Date: 2026-02-16
// ============================================================
// Provides CRUD for all user accounts across all dealers.
// Mounted at /api/admin/users in server.js.
//
// Endpoints:
//   GET    /api/admin/users              - List all users (filterable)
//   POST   /api/admin/users              - Create a new user
//   PUT    /api/admin/users/:id          - Update user details
//   POST   /api/admin/users/:id/reset-password  - Reset user password
//   POST   /api/admin/users/:id/disable  - Disable a user
//   POST   /api/admin/users/:id/enable   - Enable a user
//   DELETE /api/admin/users/:id          - Delete a user
// ============================================================

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

// In-memory store (replace with DB later)
let users = [
    {
        id: 'u-001',
        dealerCode: 'AMB001',
        username: 'admin',
        displayName: 'System Admin',
        role: 'admin',
        email: 'admin@ameridex.com',
        phone: '',
        status: 'active',
        passwordHash: '$admin$',
        createdAt: '2026-01-01T00:00:00Z',
        lastLogin: '2026-02-16T08:00:00Z'
    },
    {
        id: 'u-002',
        dealerCode: 'AMB001',
        username: 'gm.amb001',
        displayName: 'Mike Reynolds',
        role: 'gm',
        email: 'mike@ameridex.com',
        phone: '555-100-0001',
        status: 'active',
        passwordHash: '$gm$',
        createdAt: '2026-01-15T00:00:00Z',
        lastLogin: '2026-02-15T14:30:00Z'
    },
    {
        id: 'u-003',
        dealerCode: 'AMB001',
        username: 'sarah.amb',
        displayName: 'Sarah Chen',
        role: 'frontdesk',
        email: 'sarah@ameridex.com',
        phone: '555-100-0002',
        status: 'active',
        passwordHash: '$fd$',
        createdAt: '2026-02-01T00:00:00Z',
        lastLogin: '2026-02-16T07:45:00Z'
    },
    {
        id: 'u-004',
        dealerCode: 'AMB001',
        username: 'tom.amb',
        displayName: 'Tom Brady',
        role: 'frontdesk',
        email: '',
        phone: '555-100-0003',
        status: 'active',
        passwordHash: '$fd$',
        createdAt: '2026-02-05T00:00:00Z',
        lastLogin: '2026-02-14T16:00:00Z'
    },
    {
        id: 'u-005',
        dealerCode: 'DLR002',
        username: 'gm.dlr002',
        displayName: 'James Wilson',
        role: 'gm',
        email: 'james@coastaldecks.com',
        phone: '555-200-0001',
        status: 'active',
        passwordHash: '$gm$',
        createdAt: '2026-01-20T00:00:00Z',
        lastLogin: '2026-02-15T09:00:00Z'
    },
    {
        id: 'u-006',
        dealerCode: 'DLR002',
        username: 'lisa.dlr2',
        displayName: 'Lisa Park',
        role: 'frontdesk',
        email: 'lisa@coastaldecks.com',
        phone: '',
        status: 'active',
        passwordHash: '$fd$',
        createdAt: '2026-02-10T00:00:00Z',
        lastLogin: null
    },
    {
        id: 'u-007',
        dealerCode: 'DLR003',
        username: 'gm.dlr003',
        displayName: 'Dave Martinez',
        role: 'gm',
        email: 'dave@premiumoutdoor.com',
        phone: '555-300-0001',
        status: 'active',
        passwordHash: '$gm$',
        createdAt: '2026-01-25T00:00:00Z',
        lastLogin: '2026-02-13T11:00:00Z'
    },
    {
        id: 'u-008',
        dealerCode: 'DLR003',
        username: 'jen.dlr3',
        displayName: 'Jennifer Lee',
        role: 'frontdesk',
        email: '',
        phone: '555-300-0002',
        status: 'disabled',
        passwordHash: '$fd$',
        createdAt: '2026-02-08T00:00:00Z',
        lastLogin: '2026-02-10T10:00:00Z'
    }
];

// Strip passwordHash from responses
function sanitize(user) {
    const { passwordHash, ...safe } = user;
    return safe;
}

// -----------------------------------------------------------
// GET /api/admin/users - List all users
// Query params: ?dealerCode=AMB001&role=gm&status=active
// -----------------------------------------------------------
router.get('/', (req, res) => {
    let result = [...users];
    if (req.query.dealerCode) {
        result = result.filter(u => u.dealerCode === req.query.dealerCode.toUpperCase());
    }
    if (req.query.role) {
        result = result.filter(u => u.role === req.query.role);
    }
    if (req.query.status) {
        result = result.filter(u => u.status === req.query.status);
    }
    res.json(result.map(sanitize));
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
    const exists = users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (exists) {
        return res.status(409).json({ error: 'Username "' + username + '" already exists' });
    }

    const newUser = {
        id: 'u-' + uuidv4().slice(0, 8),
        dealerCode: dealerCode.toUpperCase(),
        username: username.toLowerCase(),
        displayName: displayName || username,
        role: role || 'frontdesk',
        email: email || '',
        phone: phone || '',
        status: 'active',
        passwordHash: '$hashed$' + password,
        createdAt: new Date().toISOString(),
        lastLogin: null
    };

    users.push(newUser);
    res.status(201).json(sanitize(newUser));
});

// -----------------------------------------------------------
// PUT /api/admin/users/:id - Update user details
// Body: { displayName?, role?, email?, phone?, dealerCode? }
// -----------------------------------------------------------
router.put('/:id', (req, res) => {
    const user = users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { displayName, role, email, phone, dealerCode } = req.body;
    if (displayName !== undefined) user.displayName = displayName;
    if (role !== undefined) {
        const validRoles = ['admin', 'gm', 'frontdesk', 'dealer', 'rep'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }
        user.role = role;
    }
    if (email !== undefined) user.email = email;
    if (phone !== undefined) user.phone = phone;
    if (dealerCode !== undefined) user.dealerCode = dealerCode.toUpperCase();

    res.json(sanitize(user));
});

// -----------------------------------------------------------
// POST /api/admin/users/:id/reset-password
// Body: { newPassword }
// -----------------------------------------------------------
router.post('/:id/reset-password', (req, res) => {
    const user = users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    user.passwordHash = '$hashed$' + newPassword;
    res.json({ message: 'Password reset for ' + user.username });
});

// -----------------------------------------------------------
// POST /api/admin/users/:id/disable
// -----------------------------------------------------------
router.post('/:id/disable', (req, res) => {
    const user = users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.status = 'disabled';
    res.json(sanitize(user));
});

// -----------------------------------------------------------
// POST /api/admin/users/:id/enable
// -----------------------------------------------------------
router.post('/:id/enable', (req, res) => {
    const user = users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.status = 'active';
    res.json(sanitize(user));
});

// -----------------------------------------------------------
// DELETE /api/admin/users/:id
// -----------------------------------------------------------
router.delete('/:id', (req, res) => {
    const idx = users.findIndex(u => u.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });
    const deleted = users.splice(idx, 1)[0];
    res.json({ message: 'User ' + deleted.username + ' deleted', id: deleted.id });
});

module.exports = router;
