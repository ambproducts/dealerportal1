// ============================================================
// AmeriDex Dealer Portal - Auth Routes
// File: routes/auth.js
// Date: 2026-02-13
// ============================================================
// Handles login, token refresh, password changes, and user
// management (GM creating front desk accounts, admin approvals).
//
// Mount: app.use('/api/auth', require('./routes/auth'))
//        app.use('/api/users', require('./routes/auth').userRouter)
// ============================================================

const express = require('express');
const router = express.Router();
const userRouter = express.Router();
const User = require('../models/User');
const {
    authenticateToken,
    requireRole,
    requireSameDealer,
    generateToken
} = require('../middleware/auth');

// =============================================================
// AUTH ROUTES (public, no token required)
// =============================================================

// -------------------------------------------------------
// POST /api/auth/login
// Body: { dealerCode, username, password }
// Returns: { token, user }
// -------------------------------------------------------
router.post('/login', async (req, res) => {
    try {
        const { dealerCode, username, password } = req.body;

        // Validate input presence
        if (!dealerCode || !username || !password) {
            return res.status(400).json({
                error: 'Dealer code, username, and password are required',
                code: 'MISSING_FIELDS'
            });
        }

        // Find user
        const user = await User.findByCredentials(dealerCode, username);

        if (!user) {
            // Generic error message: do not reveal whether username exists
            return res.status(401).json({
                error: 'Invalid credentials',
                code: 'INVALID_CREDENTIALS'
            });
        }

        // Check account status
        if (user.status === 'pending_approval') {
            return res.status(403).json({
                error: 'Your account is pending approval by AmeriDex. Please contact your General Manager for status.',
                code: 'PENDING_APPROVAL'
            });
        }

        if (user.status === 'disabled') {
            return res.status(403).json({
                error: 'Your account has been disabled. Please contact your General Manager.',
                code: 'ACCOUNT_DISABLED'
            });
        }

        // Check lockout
        if (user.isLocked()) {
            const minutesLeft = Math.ceil((user.lockedUntil - Date.now()) / 60000);
            return res.status(429).json({
                error: 'Account temporarily locked due to too many failed attempts. Try again in ' + minutesLeft + ' minutes.',
                code: 'ACCOUNT_LOCKED',
                retryAfter: minutesLeft
            });
        }

        // Verify password
        const validPassword = await user.verifyPassword(password);
        if (!validPassword) {
            await user.recordFailedLogin();

            const attemptsLeft = 5 - user.failedLoginAttempts;
            return res.status(401).json({
                error: 'Invalid credentials',
                code: 'INVALID_CREDENTIALS',
                attemptsRemaining: Math.max(0, attemptsLeft)
            });
        }

        // Successful login
        await user.recordSuccessfulLogin();

        const token = generateToken(user.toTokenPayload());

        res.json({
            token,
            user: user.toSafeObject()
        });

    } catch (err) {
        console.error('[auth] Login error:', err.message);
        res.status(500).json({ error: 'Login failed', code: 'SERVER_ERROR' });
    }
});

// -------------------------------------------------------
// POST /api/auth/verify
// Verifies a token is still valid (used on page load)
// Header: Authorization: Bearer <token>
// Returns: { valid: true, user }
// -------------------------------------------------------
router.post('/verify', authenticateToken, async (req, res) => {
    try {
        // Token is valid (authenticateToken already verified it)
        // Fetch fresh user data in case status changed
        const user = await User.findById(req.user.id);

        if (!user || user.status !== 'active') {
            return res.status(401).json({
                valid: false,
                error: 'Account no longer active',
                code: 'ACCOUNT_INACTIVE'
            });
        }

        res.json({
            valid: true,
            user: user.toSafeObject()
        });
    } catch (err) {
        res.status(401).json({ valid: false, error: 'Verification failed' });
    }
});

// -------------------------------------------------------
// POST /api/auth/refresh
// Issues a new token with a fresh expiry
// Requires valid (non-expired) token
// -------------------------------------------------------
router.post('/refresh', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user || user.status !== 'active') {
            return res.status(401).json({ error: 'Account no longer active' });
        }

        const token = generateToken(user.toTokenPayload());
        res.json({ token, user: user.toSafeObject() });
    } catch (err) {
        res.status(500).json({ error: 'Token refresh failed' });
    }
});

// -------------------------------------------------------
// POST /api/auth/change-password
// Body: { currentPassword, newPassword }
// Requires valid token
// -------------------------------------------------------
router.post('/change-password', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                error: 'Current password and new password are required',
                code: 'MISSING_FIELDS'
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                error: 'New password must be at least 6 characters',
                code: 'PASSWORD_TOO_SHORT'
            });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const validCurrent = await user.verifyPassword(currentPassword);
        if (!validCurrent) {
            return res.status(401).json({
                error: 'Current password is incorrect',
                code: 'WRONG_PASSWORD'
            });
        }

        await user.setPassword(newPassword);
        await user.save();

        res.json({ message: 'Password updated successfully' });
    } catch (err) {
        console.error('[auth] Change password error:', err.message);
        res.status(500).json({ error: 'Password change failed' });
    }
});


// =============================================================
// USER MANAGEMENT ROUTES (require authentication)
// =============================================================
userRouter.use(authenticateToken);

// -------------------------------------------------------
// GET /api/users
// GM: returns users for their dealer only
// Admin: returns all users (optionally filtered by dealerCode)
// Query params: dealerCode, status, role
// -------------------------------------------------------
userRouter.get('/', async (req, res) => {
    try {
        if (req.user.role !== 'admin' && req.user.role !== 'gm') {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        const filter = {};

        if (req.user.role === 'admin') {
            // Admin can filter by any dealer
            if (req.query.dealerCode) {
                filter.dealerCode = req.query.dealerCode.toUpperCase();
            }
        } else {
            // GM scoped to own dealer
            filter.dealerCode = req.user.dealerCode;
        }

        if (req.query.status) filter.status = req.query.status;
        if (req.query.role) filter.role = req.query.role;

        const users = await User.find(filter)
            .select('-passwordHash -failedLoginAttempts -lockedUntil -__v')
            .sort({ createdAt: -1 })
            .lean();

        res.json({ users });
    } catch (err) {
        console.error('[users] GET / error:', err.message);
        res.status(500).json({ error: 'Failed to retrieve users' });
    }
});

// -------------------------------------------------------
// POST /api/users
// GM creates a new front desk account (pending approval)
// Body: { username, displayName, password, email?, phone? }
// -------------------------------------------------------
userRouter.post('/', requireRole('gm', 'admin'), async (req, res) => {
    try {
        const { username, displayName, password, email, phone, role, dealerCode } = req.body;

        // Validate required fields
        if (!username || !displayName || !password) {
            return res.status(400).json({
                error: 'Username, display name, and password are required',
                code: 'MISSING_FIELDS'
            });
        }

        // Determine role and status based on who is creating
        let effectiveRole = 'frontdesk';
        let effectiveStatus = 'pending_approval';
        let effectiveDealer = req.user.dealerCode;

        if (req.user.role === 'admin') {
            // Admins can create any role, immediately active, for any dealer
            effectiveRole = role || 'frontdesk';
            effectiveStatus = 'active';
            effectiveDealer = (dealerCode || req.user.dealerCode || '').toUpperCase();

            if (!effectiveDealer) {
                return res.status(400).json({
                    error: 'Dealer code is required when admin creates a user',
                    code: 'MISSING_DEALER'
                });
            }
        } else if (req.user.role === 'gm') {
            // GMs can only create frontdesk users for their own dealer
            if (role && role !== 'frontdesk') {
                return res.status(403).json({
                    error: 'General Managers can only create Front Desk accounts. Contact AmeriDex to request a GM account.',
                    code: 'ROLE_ESCALATION_DENIED'
                });
            }
            effectiveRole = 'frontdesk';
            effectiveStatus = 'pending_approval';
            effectiveDealer = req.user.dealerCode;
        }

        // Check username uniqueness (Mongoose will also catch this, but
        // a friendly error is better than a duplicate key error)
        const existing = await User.findOne({ username: username.toLowerCase() });
        if (existing) {
            return res.status(409).json({
                error: 'Username "' + username + '" is already taken',
                code: 'USERNAME_TAKEN'
            });
        }

        // Create user
        const user = new User({
            username: username.toLowerCase(),
            dealerCode: effectiveDealer,
            role: effectiveRole,
            displayName: displayName.trim(),
            email: (email || '').trim(),
            phone: (phone || '').trim(),
            status: effectiveStatus,
            createdBy: req.user.username
        });

        await user.setPassword(password);
        await user.save();

        console.log('[users] Account created:', user.username,
            '| dealer:', user.dealerCode,
            '| role:', user.role,
            '| status:', user.status,
            '| by:', req.user.username);

        res.status(201).json({
            user: user.toSafeObject(),
            message: effectiveStatus === 'pending_approval'
                ? 'Account created and pending AmeriDex approval'
                : 'Account created and active'
        });

    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ error: 'Username already exists', code: 'DUPLICATE' });
        }
        console.error('[users] POST / error:', err.message);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

// -------------------------------------------------------
// PUT /api/users/:id/disable
// GM: can disable front desk users for their dealer
// Admin: can disable any user
// -------------------------------------------------------
userRouter.put('/:id/disable', requireRole('gm', 'admin'), async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // GM can only disable users in their own dealer
        if (req.user.role === 'gm') {
            if (user.dealerCode !== req.user.dealerCode) {
                return res.status(403).json({ error: 'Access denied' });
            }
            // GM cannot disable another GM
            if (user.role === 'gm') {
                return res.status(403).json({
                    error: 'Cannot disable a General Manager account. Contact AmeriDex.',
                    code: 'CANNOT_DISABLE_GM'
                });
            }
            // GM cannot disable themselves
            if (user._id.toString() === req.user.id) {
                return res.status(400).json({ error: 'Cannot disable your own account' });
            }
        }

        user.status = 'disabled';
        user.updatedAt = new Date();
        await user.save();

        res.json({ message: 'User disabled', user: user.toSafeObject() });
    } catch (err) {
        console.error('[users] disable error:', err.message);
        res.status(500).json({ error: 'Failed to disable user' });
    }
});

// -------------------------------------------------------
// PUT /api/users/:id/enable
// GM: can re-enable front desk users for their dealer
// Admin: can re-enable any user
// -------------------------------------------------------
userRouter.put('/:id/enable', requireRole('gm', 'admin'), async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (req.user.role === 'gm') {
            if (user.dealerCode !== req.user.dealerCode) {
                return res.status(403).json({ error: 'Access denied' });
            }
            if (user.role === 'gm') {
                return res.status(403).json({
                    error: 'Cannot modify a General Manager account. Contact AmeriDex.',
                    code: 'CANNOT_MODIFY_GM'
                });
            }
        }

        user.status = 'active';
        user.failedLoginAttempts = 0;
        user.lockedUntil = null;
        user.updatedAt = new Date();
        await user.save();

        res.json({ message: 'User enabled', user: user.toSafeObject() });
    } catch (err) {
        console.error('[users] enable error:', err.message);
        res.status(500).json({ error: 'Failed to enable user' });
    }
});

// -------------------------------------------------------
// ADMIN-ONLY ROUTES
// -------------------------------------------------------

// GET /api/users/pending  (admin sees all pending approvals)
userRouter.get('/pending', requireRole('admin'), async (req, res) => {
    try {
        const users = await User.find({ status: 'pending_approval' })
            .select('-passwordHash -failedLoginAttempts -lockedUntil -__v')
            .sort({ createdAt: -1 })
            .lean();

        res.json({ users });
    } catch (err) {
        res.status(500).json({ error: 'Failed to retrieve pending users' });
    }
});

// PUT /api/users/:id/approve  (admin approves pending account)
userRouter.put('/:id/approve', requireRole('admin'), async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (user.status !== 'pending_approval') {
            return res.status(400).json({
                error: 'User is not pending approval (current status: ' + user.status + ')',
                code: 'NOT_PENDING'
            });
        }

        user.status = 'active';
        user.approvedBy = req.user.username;
        user.approvedAt = new Date();
        user.updatedAt = new Date();
        await user.save();

        console.log('[users] Approved:', user.username,
            '| dealer:', user.dealerCode,
            '| by:', req.user.username);

        res.json({ message: 'User approved', user: user.toSafeObject() });
    } catch (err) {
        console.error('[users] approve error:', err.message);
        res.status(500).json({ error: 'Failed to approve user' });
    }
});

// PUT /api/users/:id/reject  (admin rejects pending account)
userRouter.put('/:id/reject', requireRole('admin'), async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (user.status !== 'pending_approval') {
            return res.status(400).json({
                error: 'User is not pending approval',
                code: 'NOT_PENDING'
            });
        }

        user.status = 'disabled';
        user.updatedAt = new Date();
        await user.save();

        console.log('[users] Rejected:', user.username, '| by:', req.user.username);

        res.json({ message: 'User rejected and disabled', user: user.toSafeObject() });
    } catch (err) {
        console.error('[users] reject error:', err.message);
        res.status(500).json({ error: 'Failed to reject user' });
    }
});

// PUT /api/users/:id/role  (admin changes a user's role)
userRouter.put('/:id/role', requireRole('admin'), async (req, res) => {
    try {
        const { role } = req.body;
        if (!role || !User.VALID_ROLES.includes(role)) {
            return res.status(400).json({
                error: 'Valid role required: ' + User.VALID_ROLES.join(', '),
                code: 'INVALID_ROLE'
            });
        }

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const oldRole = user.role;
        user.role = role;
        user.updatedAt = new Date();
        await user.save();

        console.log('[users] Role changed:', user.username,
            '| from:', oldRole, '| to:', role,
            '| by:', req.user.username);

        res.json({ message: 'Role updated', user: user.toSafeObject() });
    } catch (err) {
        console.error('[users] role change error:', err.message);
        res.status(500).json({ error: 'Failed to update role' });
    }
});

// DELETE /api/users/:id  (admin only, permanent delete)
userRouter.delete('/:id', requireRole('admin'), async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        console.log('[users] Deleted:', user.username, '| by:', req.user.username);

        res.json({ message: 'User permanently deleted', id: req.params.id });
    } catch (err) {
        console.error('[users] delete error:', err.message);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// -------------------------------------------------------
// EXPORTS
// -------------------------------------------------------
module.exports = { authRouter: router, userRouter };
