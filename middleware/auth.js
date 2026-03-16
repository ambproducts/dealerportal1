const { verifyToken } = require('../lib/token');
const { readJSON, USERS_FILE, DEALERS_FILE } = require('../lib/helpers');

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

    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.id === payload.id && u.status === 'active');
    if (!user) {
        return res.status(401).json({ error: 'User account not found or inactive' });
    }

    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
        return res.status(403).json({ error: 'Account temporarily locked' });
    }

    // Salesrep: cross-dealer role, uses X-Dealer-Context header
    if (user.role === 'salesrep') {
        req.user = user;
        const dealerContext = req.headers['x-dealer-context'];
        if (dealerContext && dealerContext !== 'DIRECT') {
            // Validate the dealer is in their assigned list
            const assignedDealers = user.assignedDealers || [];
            if (!assignedDealers.includes(dealerContext.toUpperCase())) {
                return res.status(403).json({ error: 'Not authorized for dealer ' + dealerContext });
            }
            const dealers = readJSON(DEALERS_FILE);
            const dealer = dealers.find(d => d.dealerCode === dealerContext.toUpperCase() && d.isActive);
            if (!dealer) {
                return res.status(403).json({ error: 'Dealer account not found or inactive' });
            }
            req.dealer = dealer;
        } else {
            // Direct sale mode or no context — no dealer
            req.dealer = null;
        }
        return next();
    }

    // Non-salesrep: standard dealer lookup
    const dealers = readJSON(DEALERS_FILE);
    const dealer = dealers.find(d => d.dealerCode === user.dealerCode && d.isActive);
    if (!dealer) {
        return res.status(403).json({ error: 'Dealer account not found or inactive' });
    }

    req.user = user;
    req.dealer = dealer;
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
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions. Required: ' + roles.join(' or ') });
        }
        next();
    };
}

module.exports = { requireAuth, requireAdmin, requireRole };
