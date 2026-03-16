const express = require('express');
const router = express.Router();
const { readJSON, writeJSON, USERS_FILE, DEALERS_FILE } = require('../lib/helpers');
const { verifyPassword, hashPassword, needsRehash } = require('../lib/password');
const { generateToken } = require('../lib/token');
const { requireAuth } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', (req, res) => {
    const { dealerCode, username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    const users = readJSON(USERS_FILE);
    const dealers = readJSON(DEALERS_FILE);

    // --- Salesrep login: no dealer code required ---
    if (!dealerCode || dealerCode.trim() === '') {
        const user = users.find(u =>
            u.username.toLowerCase() === username.toLowerCase() &&
            u.role === 'salesrep' &&
            u.status === 'active'
        );

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
            const mins = Math.ceil((new Date(user.lockedUntil) - new Date()) / 60000);
            return res.status(403).json({ error: 'Account locked. Try again in ' + mins + ' minutes.' });
        }

        if (!verifyPassword(password, user.passwordHash)) {
            user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
            if (user.failedLoginAttempts >= 5) {
                user.lockedUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();
                user.failedLoginAttempts = 0;
            }
            writeJSON(USERS_FILE, users);
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        if (needsRehash(user.passwordHash)) {
            user.passwordHash = hashPassword(password);
        }

        user.failedLoginAttempts = 0;
        user.lockedUntil = null;
        user.lastLogin = new Date().toISOString();
        user.loginCount = (user.loginCount || 0) + 1;
        writeJSON(USERS_FILE, users);

        const token = generateToken(user);

        // Resolve assigned dealer objects
        const assignedDealers = (user.assignedDealers || []).map(code => {
            const d = dealers.find(dl => dl.dealerCode === code && dl.isActive);
            if (!d) return null;
            const { passwordHash: __, ...safe } = d;
            return safe;
        }).filter(Boolean);

        console.log('[Auth] Salesrep login: ' + user.username + ' | Dealers: ' + (user.assignedDealers || []).join(','));

        const { passwordHash, ...safeUser } = user;
        return res.json({
            token: token,
            user: safeUser,
            dealers: assignedDealers
        });
    }

    // --- Standard login: dealer code required ---
    const dealer = dealers.find(d => d.dealerCode.toUpperCase() === dealerCode.toUpperCase() && d.isActive);
    if (!dealer) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = users.find(u =>
        u.dealerCode.toUpperCase() === dealerCode.toUpperCase() &&
        u.username.toLowerCase() === username.toLowerCase() &&
        u.status === 'active'
    );

    if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
        const mins = Math.ceil((new Date(user.lockedUntil) - new Date()) / 60000);
        return res.status(403).json({ error: 'Account locked. Try again in ' + mins + ' minutes.' });
    }

    if (!verifyPassword(password, user.passwordHash)) {
        user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
        if (user.failedLoginAttempts >= 5) {
            user.lockedUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();
            user.failedLoginAttempts = 0;
        }
        writeJSON(USERS_FILE, users);
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Transparent rehash: upgrade legacy SHA-256 hashes to bcrypt
    if (needsRehash(user.passwordHash)) {
        user.passwordHash = hashPassword(password);
    }

    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    user.lastLogin = new Date().toISOString();
    user.loginCount = (user.loginCount || 0) + 1;
    writeJSON(USERS_FILE, users);

    dealer.lastLoginAt = new Date().toISOString();
    writeJSON(DEALERS_FILE, dealers);

    const token = generateToken(user);

    console.log('[Auth] Login: ' + user.username + ' (' + user.role + ') | Dealer: ' + dealer.dealerCode);

    const { passwordHash, ...safeUser } = user;
    const { passwordHash: _, ...safeDealer } = dealer;

    res.json({
        token: token,
        user: safeUser,
        dealer: safeDealer
    });
});

// POST /api/auth/logout
router.post('/logout', requireAuth, (req, res) => {
    console.log('[Auth] Logout: ' + req.user.username);
    res.json({ message: 'Logged out successfully' });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
    const { passwordHash, ...safeUser } = req.user;

    // Salesrep: return dealers array instead of single dealer
    if (req.user.role === 'salesrep') {
        const dealers = readJSON(DEALERS_FILE);
        const assignedDealers = (req.user.assignedDealers || []).map(code => {
            const d = dealers.find(dl => dl.dealerCode === code && dl.isActive);
            if (!d) return null;
            const { passwordHash: __, ...safe } = d;
            return safe;
        }).filter(Boolean);
        return res.json({ user: safeUser, dealers: assignedDealers });
    }

    const { passwordHash: _, ...safeDealer } = req.dealer;
    res.json({ user: safeUser, dealer: safeDealer });
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current password and new password required' });
    }
    if (newPassword.length < 8) {
        return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }
    if (!verifyPassword(currentPassword, req.user.passwordHash)) {
        return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const users = readJSON(USERS_FILE);
    const idx = users.findIndex(u => u.id === req.user.id);
    if (idx !== -1) {
        users[idx].passwordHash = hashPassword(newPassword);
        users[idx].updatedAt = new Date().toISOString();
        writeJSON(USERS_FILE, users);
    }
    res.json({ message: 'Password changed successfully' });
});

module.exports = router;
