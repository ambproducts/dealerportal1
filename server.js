// ============================================================
// AmeriDex Dealer Portal - Backend Server v2.0
// Date: 2026-02-13
// ============================================================
// WHAT CHANGED FROM v1.0:
//   1. Added USERS_FILE (data/users.json) for individual user accounts
//   2. Login now requires dealerCode + username + password (3 fields)
//   3. Users have roles: "admin", "gm", "frontdesk"
//   4. GM can create frontdesk accounts (pending admin approval)
//   5. req.dealer renamed to req.user throughout for clarity
//   6. Token now carries: id, dealerCode, role, username, displayName
//   7. All existing dealer/quote/pricing endpoints preserved
//   8. New /api/users/* endpoints for user management
//
// MIGRATION: On first run, if users.json doesn't exist, the server
//   auto-creates one user per existing dealer (same credentials,
//   role carried over). Existing dealers.json is NOT deleted.
//   Dealers still hold org-level data (name, pricing tier, etc).
//   Users hold individual login credentials.
//
// HOW TO RUN (same as before):
//   1. npm install
//   2. node server.js
//   3. Open http://localhost:3000
// ============================================================

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const app = express();
const PORT = process.env.PORT || 3000;

// ---- Middleware ----
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- Data File Paths ----
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DEALERS_FILE = path.join(DATA_DIR, 'dealers.json');
const QUOTES_FILE = path.join(DATA_DIR, 'quotes.json');
const TIERS_FILE = path.join(DATA_DIR, 'pricing-tiers.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');  // NEW in v2

// ---- Ensure data directory and files exist ----
function ensureDataFiles() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(TIERS_FILE)) {
        const defaultTiers = [
            { slug: 'standard', label: 'Standard', multiplier: 1.00 },
            { slug: 'preferred', label: 'Preferred', multiplier: 0.90 },
            { slug: 'vip', label: 'VIP', multiplier: 0.85 }
        ];
        fs.writeFileSync(TIERS_FILE, JSON.stringify(defaultTiers, null, 2));
    }
    if (!fs.existsSync(QUOTES_FILE)) {
        fs.writeFileSync(QUOTES_FILE, JSON.stringify([], null, 2));
    }
    if (!fs.existsSync(DEALERS_FILE)) {
        const adminHash = hashPassword('ameridex2026');
        const defaultDealers = [
            {
                id: generateId(),
                dealerCode: 'PAT123',
                passwordHash: adminHash,
                dealerName: 'AmeriDex Admin',
                contactPerson: 'Pat',
                email: 'admin@ameridex.com',
                phone: '',
                pricingTier: 'standard',
                role: 'admin',
                isActive: true,
                createdAt: new Date().toISOString(),
                lastLoginAt: null
            }
        ];
        fs.writeFileSync(DEALERS_FILE, JSON.stringify(defaultDealers, null, 2));
        console.log('');
        console.log('========================================');
        console.log('  ADMIN ACCOUNT CREATED');
        console.log('  Dealer Code: PAT123');
        console.log('  Username:    admin');
        console.log('  Password:    ameridex2026');
        console.log('  ** Change this password immediately **');
        console.log('========================================');
        console.log('');
    }

    // ---- NEW: Create users.json and migrate existing dealers ----
    if (!fs.existsSync(USERS_FILE)) {
        const dealers = readJSON(DEALERS_FILE);
        const users = dealers.map(d => ({
            id: generateId(),
            username: d.role === 'admin' ? 'admin' : d.dealerCode.toLowerCase(),
            passwordHash: d.passwordHash,  // same hash, same credentials
            dealerCode: d.dealerCode,
            role: d.role === 'admin' ? 'admin' : 'gm',  // existing dealers become GMs
            displayName: d.contactPerson || d.dealerName || d.dealerCode,
            email: d.email || '',
            phone: d.phone || '',
            status: 'active',
            createdBy: 'system-migration',
            approvedBy: 'system-migration',
            approvedAt: new Date().toISOString(),
            createdAt: d.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastLogin: d.lastLoginAt || null,
            loginCount: 0,
            failedLoginAttempts: 0,
            lockedUntil: null
        }));
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        console.log('');
        console.log('========================================');
        console.log('  USER ACCOUNTS MIGRATED');
        console.log('  ' + users.length + ' user(s) created from existing dealers');
        users.forEach(u => {
            console.log('    ' + u.dealerCode + ' | ' + u.username + ' | ' + u.role);
        });
        console.log('');
        console.log('  Existing dealer passwords still work.');
        console.log('  Login now requires: Dealer Code + Username + Password');
        console.log('========================================');
        console.log('');
    }
}

// ---- Helpers ----
function generateId() {
    return 'd-' + crypto.randomBytes(8).toString('hex');
}

function hashPassword(plaintext) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.createHash('sha256')
        .update(salt + plaintext)
        .digest('hex');
    return salt + ':' + hash;
}

function verifyPassword(plaintext, stored) {
    const [salt, hash] = stored.split(':');
    const check = crypto.createHash('sha256')
        .update(salt + plaintext)
        .digest('hex');
    return check === hash;
}

function generateToken(user) {
    // Token now carries user-level identity, not just dealer-level
    const payload = {
        id: user.id,
        username: user.username,
        dealerCode: user.dealerCode,
        role: user.role,
        displayName: user.displayName,
        iat: Date.now(),
        exp: Date.now() + (8 * 60 * 60 * 1000) // 8 hours
    };
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const secret = process.env.TOKEN_SECRET || 'ameridex-portal-secret-change-me';
    const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
    return payloadB64 + '.' + sig;
}

function verifyToken(token) {
    try {
        const [payloadB64, sig] = token.split('.');
        const secret = process.env.TOKEN_SECRET || 'ameridex-portal-secret-change-me';
        const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
        if (sig !== expectedSig) return null;
        const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
        if (payload.exp < Date.now()) return null;
        return payload;
    } catch (e) {
        return null;
    }
}

function readJSON(filepath) {
    return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
}

function writeJSON(filepath, data) {
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}

// Helper: get dealer org data for a user
function getDealerForUser(user) {
    const dealers = readJSON(DEALERS_FILE);
    return dealers.find(d => d.dealerCode.toUpperCase() === user.dealerCode.toUpperCase());
}

// ---- Auth Middleware ----
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    const token = authHeader.slice(7);
    const payload = verifyToken(token);
    if (!payload) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
    // Verify user is still active
    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.id === payload.id && u.status === 'active');
    if (!user) {
        return res.status(401).json({ error: 'Account deactivated or not found' });
    }
    // Populate req.user (replaces old req.dealer)
    // Also set req.dealer for backward compatibility with admin-routes and customer-database
    req.user = payload;
    req.dealer = payload;  // backward compat
    next();
}

function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}

function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                error: 'Insufficient permissions. Required: ' + roles.join(' or '),
                requiredRoles: roles,
                currentRole: req.user.role
            });
        }
        next();
    };
}


// ===========================================================
// AUTH ENDPOINTS (updated for user-based login)
// ===========================================================

// POST /api/auth/login
// Body: { dealerCode, username, password }
// Changed from v1: now requires username in addition to dealerCode
app.post('/api/auth/login', (req, res) => {
    const { dealerCode, username, password } = req.body;

    if (!dealerCode || !password) {
        return res.status(400).json({ error: 'Dealer code and password required' });
    }

    // If no username provided, fall back to legacy dealer-only login
    // This keeps backward compatibility during the transition period
    if (!username) {
        return legacyDealerLogin(req, res, dealerCode, password);
    }

    // ---- New user-based login ----
    const users = readJSON(USERS_FILE);
    const user = users.find(
        u => u.dealerCode.toUpperCase() === dealerCode.toUpperCase()
          && u.username.toLowerCase() === username.toLowerCase()
    );

    if (!user || !verifyPassword(password, user.passwordHash)) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check account status
    if (user.status === 'pending_approval') {
        return res.status(403).json({
            error: 'Your account is pending approval by AmeriDex. Contact your General Manager for status.',
            code: 'PENDING_APPROVAL'
        });
    }

    if (user.status === 'disabled') {
        return res.status(403).json({
            error: 'Your account has been disabled. Contact your General Manager.',
            code: 'ACCOUNT_DISABLED'
        });
    }

    // Check lockout (5 failed attempts = 15 min lock)
    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
        const minutesLeft = Math.ceil((new Date(user.lockedUntil) - Date.now()) / 60000);
        return res.status(429).json({
            error: 'Account temporarily locked. Try again in ' + minutesLeft + ' minutes.',
            code: 'ACCOUNT_LOCKED'
        });
    }

    // Reset failed attempts on success
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    user.lastLogin = new Date().toISOString();
    user.loginCount = (user.loginCount || 0) + 1;
    writeJSON(USERS_FILE, users);

    // Also update dealer's lastLoginAt
    const dealers = readJSON(DEALERS_FILE);
    const dealer = dealers.find(d => d.dealerCode.toUpperCase() === dealerCode.toUpperCase());
    if (dealer) {
        dealer.lastLoginAt = new Date().toISOString();
        writeJSON(DEALERS_FILE, dealers);
    }

    const token = generateToken(user);
    res.json({
        token,
        user: {
            id: user.id,
            username: user.username,
            dealerCode: user.dealerCode,
            role: user.role,
            displayName: user.displayName,
            email: user.email,
            phone: user.phone
        },
        // Include dealer org info for the frontend
        dealer: dealer ? {
            id: dealer.id,
            dealerCode: dealer.dealerCode,
            dealerName: dealer.dealerName,
            contactPerson: dealer.contactPerson,
            email: dealer.email,
            phone: dealer.phone,
            pricingTier: dealer.pricingTier,
            role: dealer.role
        } : null
    });
});

// Legacy login for backward compatibility (no username, just dealerCode + password)
function legacyDealerLogin(req, res, dealerCode, password) {
    const dealers = readJSON(DEALERS_FILE);
    const dealer = dealers.find(
        d => d.dealerCode.toUpperCase() === dealerCode.toUpperCase() && d.isActive
    );
    if (!dealer || !verifyPassword(password, dealer.passwordHash)) {
        return res.status(401).json({ error: 'Invalid dealer code or password' });
    }
    dealer.lastLoginAt = new Date().toISOString();
    writeJSON(DEALERS_FILE, dealers);

    // Check if there's a user record for this dealer; if so, use it
    const users = readJSON(USERS_FILE);
    const matchingUser = users.find(
        u => u.dealerCode.toUpperCase() === dealerCode.toUpperCase()
          && u.status === 'active'
          && verifyPassword(password, u.passwordHash)
    );

    if (matchingUser) {
        matchingUser.lastLogin = new Date().toISOString();
        matchingUser.loginCount = (matchingUser.loginCount || 0) + 1;
        writeJSON(USERS_FILE, users);
        const token = generateToken(matchingUser);
        return res.json({
            token,
            user: {
                id: matchingUser.id,
                username: matchingUser.username,
                dealerCode: matchingUser.dealerCode,
                role: matchingUser.role,
                displayName: matchingUser.displayName
            },
            dealer: {
                id: dealer.id,
                dealerCode: dealer.dealerCode,
                dealerName: dealer.dealerName,
                contactPerson: dealer.contactPerson,
                email: dealer.email,
                phone: dealer.phone,
                pricingTier: dealer.pricingTier,
                role: dealer.role
            }
        });
    }

    // No user record exists, return old-style response
    const token = generateToken({
        id: dealer.id,
        username: dealer.dealerCode.toLowerCase(),
        dealerCode: dealer.dealerCode,
        role: dealer.role,
        displayName: dealer.contactPerson || dealer.dealerName
    });
    res.json({
        token,
        dealer: {
            id: dealer.id,
            dealerCode: dealer.dealerCode,
            dealerName: dealer.dealerName,
            contactPerson: dealer.contactPerson,
            email: dealer.email,
            phone: dealer.phone,
            pricingTier: dealer.pricingTier,
            role: dealer.role
        }
    });
}

// POST /api/auth/logout
app.post('/api/auth/logout', requireAuth, (req, res) => {
    res.json({ ok: true });
});

// GET /api/auth/me (verify token, return current user + dealer info)
app.get('/api/auth/me', requireAuth, (req, res) => {
    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const dealer = getDealerForUser(user);

    res.json({
        user: {
            id: user.id,
            username: user.username,
            dealerCode: user.dealerCode,
            role: user.role,
            displayName: user.displayName,
            email: user.email,
            phone: user.phone
        },
        dealer: dealer ? {
            id: dealer.id,
            dealerCode: dealer.dealerCode,
            dealerName: dealer.dealerName,
            contactPerson: dealer.contactPerson,
            email: dealer.email,
            phone: dealer.phone,
            pricingTier: dealer.pricingTier
        } : null
    });
});

// POST /api/auth/change-password
app.post('/api/auth/change-password', requireAuth, (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current and new password required' });
    }
    if (newPassword.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!verifyPassword(currentPassword, user.passwordHash)) {
        return res.status(401).json({ error: 'Current password is incorrect' });
    }

    user.passwordHash = hashPassword(newPassword);
    user.updatedAt = new Date().toISOString();
    writeJSON(USERS_FILE, users);

    res.json({ message: 'Password updated successfully' });
});


// ===========================================================
// USER MANAGEMENT ENDPOINTS (NEW in v2)
// ===========================================================

// GET /api/users (GM: own dealer | Admin: all or filtered)
app.get('/api/users', requireAuth, requireRole('gm', 'admin'), (req, res) => {
    const users = readJSON(USERS_FILE);
    let filtered = users;

    if (req.user.role === 'gm') {
        // GM can only see their own dealer's users
        filtered = users.filter(u => u.dealerCode.toUpperCase() === req.user.dealerCode.toUpperCase());
    } else if (req.query.dealerCode) {
        // Admin filtering by dealer
        filtered = users.filter(u => u.dealerCode.toUpperCase() === req.query.dealerCode.toUpperCase());
    }

    if (req.query.status) {
        filtered = filtered.filter(u => u.status === req.query.status);
    }
    if (req.query.role) {
        filtered = filtered.filter(u => u.role === req.query.role);
    }

    // Strip sensitive fields
    const safe = filtered.map(u => {
        const { passwordHash, failedLoginAttempts, lockedUntil, ...rest } = u;
        return rest;
    });

    safe.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ users: safe });
});

// POST /api/users (GM creates frontdesk account, pending approval)
app.post('/api/users', requireAuth, requireRole('gm', 'admin'), (req, res) => {
    const { username, displayName, password, email, phone, role, dealerCode } = req.body;

    if (!username || !displayName || !password) {
        return res.status(400).json({ error: 'Username, display name, and password required' });
    }
    if (username.length < 3 || username.length > 20) {
        return res.status(400).json({ error: 'Username must be 3-20 characters' });
    }
    if (!/^[a-z0-9._-]+$/i.test(username)) {
        return res.status(400).json({ error: 'Username can only contain letters, numbers, dots, hyphens, underscores' });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const users = readJSON(USERS_FILE);

    // Check username uniqueness
    if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
        return res.status(409).json({ error: 'Username "' + username + '" is already taken' });
    }

    // Determine effective role and status
    let effectiveRole = 'frontdesk';
    let effectiveStatus = 'pending_approval';
    let effectiveDealer = req.user.dealerCode;

    if (req.user.role === 'admin') {
        effectiveRole = role || 'frontdesk';
        effectiveStatus = 'active';  // admin-created accounts are immediately active
        effectiveDealer = (dealerCode || '').toUpperCase() || req.user.dealerCode;
        if (!['admin', 'gm', 'frontdesk'].includes(effectiveRole)) {
            return res.status(400).json({ error: 'Invalid role' });
        }
    } else if (req.user.role === 'gm') {
        // GM cannot create GM or admin accounts
        if (role && role !== 'frontdesk') {
            return res.status(403).json({
                error: 'General Managers can only create Front Desk accounts. Contact AmeriDex for GM accounts.',
                code: 'ROLE_ESCALATION_DENIED'
            });
        }
    }

    const newUser = {
        id: generateId(),
        username: username.toLowerCase(),
        passwordHash: hashPassword(password),
        dealerCode: effectiveDealer.toUpperCase(),
        role: effectiveRole,
        displayName: displayName.trim(),
        email: (email || '').trim(),
        phone: (phone || '').trim(),
        status: effectiveStatus,
        createdBy: req.user.username,
        approvedBy: effectiveStatus === 'active' ? req.user.username : null,
        approvedAt: effectiveStatus === 'active' ? new Date().toISOString() : null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastLogin: null,
        loginCount: 0,
        failedLoginAttempts: 0,
        lockedUntil: null
    };

    users.push(newUser);
    writeJSON(USERS_FILE, users);

    const { passwordHash, failedLoginAttempts, lockedUntil, ...safe } = newUser;

    console.log('[users] Created:', newUser.username,
        '| dealer:', newUser.dealerCode,
        '| role:', newUser.role,
        '| status:', newUser.status,
        '| by:', req.user.username);

    res.status(201).json({
        user: safe,
        message: effectiveStatus === 'pending_approval'
            ? 'Account created and pending AmeriDex approval'
            : 'Account created and active'
    });
});

// PUT /api/users/:id/disable
app.put('/api/users/:id/disable', requireAuth, requireRole('gm', 'admin'), (req, res) => {
    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (req.user.role === 'gm') {
        if (user.dealerCode.toUpperCase() !== req.user.dealerCode.toUpperCase()) {
            return res.status(403).json({ error: 'Access denied' });
        }
        if (user.role === 'gm') {
            return res.status(403).json({ error: 'Cannot disable a General Manager. Contact AmeriDex.' });
        }
        if (user.id === req.user.id) {
            return res.status(400).json({ error: 'Cannot disable your own account' });
        }
    }

    user.status = 'disabled';
    user.updatedAt = new Date().toISOString();
    writeJSON(USERS_FILE, users);

    const { passwordHash, failedLoginAttempts, lockedUntil, ...safe } = user;
    res.json({ message: 'User disabled', user: safe });
});

// PUT /api/users/:id/enable
app.put('/api/users/:id/enable', requireAuth, requireRole('gm', 'admin'), (req, res) => {
    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (req.user.role === 'gm') {
        if (user.dealerCode.toUpperCase() !== req.user.dealerCode.toUpperCase()) {
            return res.status(403).json({ error: 'Access denied' });
        }
        if (user.role === 'gm') {
            return res.status(403).json({ error: 'Cannot modify a General Manager. Contact AmeriDex.' });
        }
    }

    user.status = 'active';
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    user.updatedAt = new Date().toISOString();
    writeJSON(USERS_FILE, users);

    const { passwordHash, failedLoginAttempts, lockedUntil, ...safe } = user;
    res.json({ message: 'User enabled', user: safe });
});

// GET /api/users/pending (admin only: pending approvals)
app.get('/api/users/pending', requireAuth, requireAdmin, (req, res) => {
    const users = readJSON(USERS_FILE);
    const pending = users
        .filter(u => u.status === 'pending_approval')
        .map(u => {
            const { passwordHash, failedLoginAttempts, lockedUntil, ...safe } = u;
            return safe;
        })
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ users: pending });
});

// PUT /api/users/:id/approve (admin only)
app.put('/api/users/:id/approve', requireAuth, requireAdmin, (req, res) => {
    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.status !== 'pending_approval') {
        return res.status(400).json({ error: 'User is not pending approval (status: ' + user.status + ')' });
    }

    user.status = 'active';
    user.approvedBy = req.user.username;
    user.approvedAt = new Date().toISOString();
    user.updatedAt = new Date().toISOString();
    writeJSON(USERS_FILE, users);

    console.log('[users] Approved:', user.username, '| dealer:', user.dealerCode, '| by:', req.user.username);

    const { passwordHash, failedLoginAttempts, lockedUntil, ...safe } = user;
    res.json({ message: 'User approved', user: safe });
});

// PUT /api/users/:id/reject (admin only)
app.put('/api/users/:id/reject', requireAuth, requireAdmin, (req, res) => {
    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.status !== 'pending_approval') {
        return res.status(400).json({ error: 'User is not pending approval' });
    }

    user.status = 'disabled';
    user.updatedAt = new Date().toISOString();
    writeJSON(USERS_FILE, users);

    console.log('[users] Rejected:', user.username, '| by:', req.user.username);

    const { passwordHash, failedLoginAttempts, lockedUntil, ...safe } = user;
    res.json({ message: 'User rejected and disabled', user: safe });
});

// PUT /api/users/:id/role (admin only: change role, e.g. promote to GM)
app.put('/api/users/:id/role', requireAuth, requireAdmin, (req, res) => {
    const { role } = req.body;
    const validRoles = ['admin', 'gm', 'frontdesk'];
    if (!role || !validRoles.includes(role)) {
        return res.status(400).json({ error: 'Valid role required: ' + validRoles.join(', ') });
    }

    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const oldRole = user.role;
    user.role = role;
    user.updatedAt = new Date().toISOString();
    writeJSON(USERS_FILE, users);

    console.log('[users] Role changed:', user.username, '| from:', oldRole, '| to:', role, '| by:', req.user.username);

    const { passwordHash, failedLoginAttempts, lockedUntil, ...safe } = user;
    res.json({ message: 'Role updated', user: safe });
});

// DELETE /api/users/:id (admin only: permanent delete)
app.delete('/api/users/:id', requireAuth, requireAdmin, (req, res) => {
    const users = readJSON(USERS_FILE);
    const idx = users.findIndex(u => u.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });

    const deleted = users.splice(idx, 1)[0];
    writeJSON(USERS_FILE, users);

    console.log('[users] Deleted:', deleted.username, '| by:', req.user.username);

    res.json({ message: 'User permanently deleted', id: req.params.id });
});

// POST /api/users/:id/reset-password (admin or GM for own dealer's frontdesk)
app.post('/api/users/:id/reset-password', requireAuth, requireRole('gm', 'admin'), (req, res) => {
    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (req.user.role === 'gm') {
        if (user.dealerCode.toUpperCase() !== req.user.dealerCode.toUpperCase()) {
            return res.status(403).json({ error: 'Access denied' });
        }
        if (user.role !== 'frontdesk') {
            return res.status(403).json({ error: 'GMs can only reset Front Desk passwords' });
        }
    }

    const tempPassword = crypto.randomBytes(4).toString('hex');
    user.passwordHash = hashPassword(tempPassword);
    user.updatedAt = new Date().toISOString();
    writeJSON(USERS_FILE, users);

    res.json({
        username: user.username,
        temporaryPassword: tempPassword,
        message: 'Give this password to the user. They should change it after logging in.'
    });
});


// ===========================================================
// PRODUCT ENDPOINTS (unchanged, uses dealer pricing tier)
// ===========================================================

app.get('/api/products', requireAuth, (req, res) => {
    const tiers = readJSON(TIERS_FILE);
    const dealer = getDealerForUser(req.user);
    const tierSlug = dealer ? dealer.pricingTier : 'standard';
    const tier = tiers.find(t => t.slug === tierSlug) || tiers[0];

    const baseProducts = {
        system:   { name: 'AmeriDex System Boards (Grooved, Dexerdry included)', basePrice: 8.00, isFt: true, hasColor: true, lengthType: 'board' },
        grooved:  { name: 'Grooved Deck Boards (no Dexerdry)', basePrice: 6.00, isFt: true, hasColor: true, lengthType: 'board' },
        solid:    { name: 'Solid Edge Deck Boards', basePrice: 6.00, isFt: true, hasColor: true, lengthType: 'board' },
        dexerdry: { name: 'Dexerdry Seals (standalone)', basePrice: 2.00, isFt: true, hasColor: false, lengthType: 'coil' },
        screws:   { name: 'Epoxy-Coated Screws', basePrice: 37.00, isFt: false, hasColor: false },
        plugs:    { name: 'Color-Matching Plugs', basePrice: 33.79, isFt: false, hasColor: false },
        blueclaw: { name: 'Dexerdry BlueClaw', basePrice: 150.00, isFt: false, hasColor: false },
        custom:   { name: 'Custom / Manual Item', basePrice: 0, isFt: false, hasColor: false }
    };

    const adjusted = {};
    for (const [key, prod] of Object.entries(baseProducts)) {
        adjusted[key] = {
            ...prod,
            price: Math.round(prod.basePrice * tier.multiplier * 100) / 100
        };
    }

    res.json({
        tier: { slug: tier.slug, label: tier.label, multiplier: tier.multiplier },
        products: adjusted
    });
});


// ===========================================================
// QUOTE ENDPOINTS (unchanged logic, req.dealer still works)
// ===========================================================

app.get('/api/quotes', requireAuth, (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    // Dealer users see only their dealer's quotes
    let mine;
    if (req.user.role === 'admin') {
        mine = quotes;
    } else {
        mine = quotes.filter(q => q.dealerCode && q.dealerCode.toUpperCase() === req.user.dealerCode.toUpperCase());
    }
    mine.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
    res.json(mine);
});

app.post('/api/quotes', requireAuth, (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const quote = {
        id: generateId(),
        quoteNumber: req.body.quoteNumber || null,
        dealerId: req.user.id,
        dealerCode: req.user.dealerCode,
        submittedBy: req.user.username,        // NEW: track which user
        submittedByRole: req.user.role,         // NEW: track role
        submittedByName: req.user.displayName,  // NEW: track display name
        status: 'draft',
        customer: req.body.customer || {},
        lineItems: req.body.lineItems || [],
        options: req.body.options || {},
        specialInstructions: req.body.specialInstructions || '',
        internalNotes: req.body.internalNotes || '',
        shippingAddress: req.body.shippingAddress || '',
        deliveryDate: req.body.deliveryDate || null,
        totalAmount: req.body.totalAmount || 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        submittedAt: null
    };
    quotes.push(quote);
    writeJSON(QUOTES_FILE, quotes);
    res.status(201).json(quote);
});

app.put('/api/quotes/:id', requireAuth, (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const idx = quotes.findIndex(q => q.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Quote not found' });

    // Non-admin users can only edit their dealer's quotes
    if (req.user.role !== 'admin' && quotes[idx].dealerCode.toUpperCase() !== req.user.dealerCode.toUpperCase()) {
        return res.status(403).json({ error: 'Access denied' });
    }

    if (quotes[idx].status === 'approved') {
        return res.status(400).json({ error: 'Cannot edit an approved quote' });
    }
    const editable = ['draft', 'revision'];
    if (!editable.includes(quotes[idx].status)) {
        return res.status(400).json({ error: 'Quote cannot be edited in its current status' });
    }

    const updatable = ['customer', 'lineItems', 'options', 'specialInstructions',
                       'internalNotes', 'shippingAddress', 'deliveryDate', 'totalAmount'];
    updatable.forEach(field => {
        if (req.body[field] !== undefined) quotes[idx][field] = req.body[field];
    });
    quotes[idx].updatedAt = new Date().toISOString();
    writeJSON(QUOTES_FILE, quotes);
    res.json(quotes[idx]);
});

app.delete('/api/quotes/:id', requireAuth, (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const idx = quotes.findIndex(q => q.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Quote not found' });

    if (req.user.role !== 'admin' && quotes[idx].dealerCode.toUpperCase() !== req.user.dealerCode.toUpperCase()) {
        return res.status(403).json({ error: 'Access denied' });
    }
    if (quotes[idx].status !== 'draft') {
        return res.status(400).json({ error: 'Only draft quotes can be deleted' });
    }
    quotes.splice(idx, 1);
    writeJSON(QUOTES_FILE, quotes);
    res.json({ ok: true });
});

app.post('/api/quotes/:id/submit', requireAuth, (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const idx = quotes.findIndex(q => q.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Quote not found' });

    if (req.user.role !== 'admin' && quotes[idx].dealerCode.toUpperCase() !== req.user.dealerCode.toUpperCase()) {
        return res.status(403).json({ error: 'Access denied' });
    }
    if (!['draft', 'revision'].includes(quotes[idx].status)) {
        return res.status(400).json({ error: 'Quote cannot be submitted in its current status' });
    }

    quotes[idx].status = 'submitted';
    quotes[idx].submittedAt = new Date().toISOString();
    quotes[idx].submittedBy = req.user.username;       // track who submitted
    quotes[idx].submittedByName = req.user.displayName;
    quotes[idx].submittedByRole = req.user.role;
    quotes[idx].updatedAt = new Date().toISOString();
    writeJSON(QUOTES_FILE, quotes);
    res.json(quotes[idx]);
});

app.post('/api/quotes/:id/duplicate', requireAuth, (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const original = quotes.find(q => q.id === req.params.id);
    if (!original) return res.status(404).json({ error: 'Quote not found' });

    if (req.user.role !== 'admin' && original.dealerCode.toUpperCase() !== req.user.dealerCode.toUpperCase()) {
        return res.status(403).json({ error: 'Access denied' });
    }

    const duplicate = {
        id: generateId(),
        quoteNumber: null,
        dealerId: req.user.id,
        dealerCode: req.user.dealerCode,
        submittedBy: req.user.username,
        submittedByRole: req.user.role,
        submittedByName: req.user.displayName,
        status: 'draft',
        customer: { name: '', email: '', zipCode: '', company: '', phone: '' },
        lineItems: JSON.parse(JSON.stringify(original.lineItems)),
        options: { ...original.options },
        specialInstructions: original.specialInstructions,
        internalNotes: '',
        shippingAddress: '',
        deliveryDate: null,
        totalAmount: original.totalAmount,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        submittedAt: null
    };
    quotes.push(duplicate);
    writeJSON(QUOTES_FILE, quotes);
    res.status(201).json(duplicate);
});


// ===========================================================
// DEALER PROFILE ENDPOINT (unchanged)
// ===========================================================

app.put('/api/dealer/profile', requireAuth, (req, res) => {
    const dealers = readJSON(DEALERS_FILE);
    const dealer = dealers.find(d => d.dealerCode.toUpperCase() === req.user.dealerCode.toUpperCase());
    if (!dealer) return res.status(404).json({ error: 'Dealer not found' });

    const allowed = ['dealerName', 'contactPerson', 'phone'];
    allowed.forEach(field => {
        if (req.body[field] !== undefined) dealer[field] = req.body[field];
    });
    writeJSON(DEALERS_FILE, dealers);
    res.json({
        id: dealer.id,
        dealerCode: dealer.dealerCode,
        dealerName: dealer.dealerName,
        contactPerson: dealer.contactPerson,
        email: dealer.email,
        phone: dealer.phone,
        pricingTier: dealer.pricingTier,
        role: dealer.role
    });
});


// ===========================================================
// ADMIN ENDPOINTS (unchanged, all still work via req.dealer compat)
// ===========================================================

app.get('/api/admin/dealers', requireAuth, requireAdmin, (req, res) => {
    const dealers = readJSON(DEALERS_FILE);
    const safe = dealers.map(d => {
        const { passwordHash, ...rest } = d;
        return rest;
    });
    res.json(safe);
});

app.post('/api/admin/dealers', requireAuth, requireAdmin, (req, res) => {
    const { dealerCode, password, dealerName, contactPerson, email, phone, pricingTier, role } = req.body;
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

    // Also auto-create a GM user for this new dealer
    const users = readJSON(USERS_FILE);
    const gmUser = {
        id: generateId(),
        username: dealerCode.toLowerCase(),
        passwordHash: hashPassword(password),  // same initial password
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

app.put('/api/admin/dealers/:id', requireAuth, requireAdmin, (req, res) => {
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

app.delete('/api/admin/dealers/:id', requireAuth, requireAdmin, (req, res) => {
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

app.post('/api/admin/dealers/:id/reset', requireAuth, requireAdmin, (req, res) => {
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

app.post('/api/admin/dealers/:id/change-password', requireAuth, (req, res) => {
    const dealers = readJSON(DEALERS_FILE);
    const idx = dealers.findIndex(d => d.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Dealer not found' });

    if (req.user.role !== 'admin' && req.user.id !== req.params.id) {
        return res.status(403).json({ error: 'Not authorized' });
    }
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    dealers[idx].passwordHash = hashPassword(newPassword);
    writeJSON(DEALERS_FILE, dealers);
    res.json({ ok: true, message: 'Password updated successfully' });
});


// ===========================================================
// ADMIN: QUOTE MANAGEMENT (unchanged)
// ===========================================================

app.get('/api/admin/quotes', requireAuth, requireAdmin, (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const { dealerCode, status, from, to } = req.query;
    let filtered = quotes;
    if (dealerCode) {
        filtered = filtered.filter(q => q.dealerCode === dealerCode.toUpperCase());
    }
    if (status) {
        filtered = filtered.filter(q => q.status === status);
    }
    if (from) {
        filtered = filtered.filter(q => new Date(q.createdAt) >= new Date(from));
    }
    if (to) {
        filtered = filtered.filter(q => new Date(q.createdAt) <= new Date(to + 'T23:59:59'));
    }
    filtered.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
    res.json(filtered);
});

app.put('/api/admin/quotes/:id/status', requireAuth, requireAdmin, (req, res) => {
    const { status } = req.body;
    const validStatuses = ['draft', 'submitted', 'reviewed', 'approved', 'revision'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status. Must be: ' + validStatuses.join(', ') });
    }
    const quotes = readJSON(QUOTES_FILE);
    const idx = quotes.findIndex(q => q.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Quote not found' });

    quotes[idx].status = status;
    quotes[idx].updatedAt = new Date().toISOString();
    writeJSON(QUOTES_FILE, quotes);
    res.json(quotes[idx]);
});

app.get('/api/admin/export/quotes', requireAuth, requireAdmin, (req, res) => {
    const quotes = readJSON(QUOTES_FILE);
    const headers = ['Quote Number', 'Dealer Code', 'Status', 'Customer Name',
                     'Customer Email', 'Customer Zip', 'Total Amount',
                     'Created', 'Submitted', 'Line Item Count'];
    const rows = quotes.map(q => [
        q.quoteNumber || '',
        q.dealerCode || '',
        q.status || '',
        (q.customer && q.customer.name) || '',
        (q.customer && q.customer.email) || '',
        (q.customer && q.customer.zipCode) || '',
        q.totalAmount || 0,
        q.createdAt || '',
        q.submittedAt || '',
        (q.lineItems && q.lineItems.length) || 0
    ]);

    const csvContent = [headers.join(',')]
        .concat(rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')))
        .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="ameridex-quotes-export.csv"');
    res.send(csvContent);
});


// ===========================================================
// ADMIN: PRICING TIERS (unchanged)
// ===========================================================

app.get('/api/admin/pricing-tiers', requireAuth, requireAdmin, (req, res) => {
    res.json(readJSON(TIERS_FILE));
});

app.put('/api/admin/pricing-tiers/:slug', requireAuth, requireAdmin, (req, res) => {
    const tiers = readJSON(TIERS_FILE);
    const idx = tiers.findIndex(t => t.slug === req.params.slug);
    if (idx === -1) return res.status(404).json({ error: 'Tier not found' });

    if (req.body.label !== undefined) tiers[idx].label = req.body.label;
    if (req.body.multiplier !== undefined) {
        const m = parseFloat(req.body.multiplier);
        if (isNaN(m) || m <= 0 || m > 2) {
            return res.status(400).json({ error: 'Multiplier must be between 0.01 and 2.00' });
        }
        tiers[idx].multiplier = Math.round(m * 100) / 100;
    }
    writeJSON(TIERS_FILE, tiers);
    res.json(tiers[idx]);
});


// ===========================================================
// CATCH-ALL: Serve the portal for any non-API route
// ===========================================================
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dealer-portal.html'));
});


// ===========================================================
// START SERVER
// ===========================================================
ensureDataFiles();
require('./admin-routes')(app, requireAuth);
require('./customer-database')(app, requireAuth);
app.listen(PORT, () => {
    console.log('');
    console.log('==============================================');
    console.log('  AmeriDex Dealer Portal Server v2.0');
    console.log('  Running on http://localhost:' + PORT);
    console.log('  Data stored in ./data/');
    console.log('  User accounts: ./data/users.json');
    console.log('==============================================');
    console.log('');
});
