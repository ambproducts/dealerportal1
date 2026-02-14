// ============================================================
// AmeriDex Dealer Portal - Authentication Middleware
// File: middleware/auth.js
// Date: 2026-02-13
// ============================================================
// This is the middleware that routes/customers.js and every
// other protected route requires. It:
//   1. Extracts the JWT from the Authorization header
//   2. Verifies it against the JWT_SECRET
//   3. Populates req.user with { id, username, dealerCode, role, displayName }
//   4. Rejects the request if the token is missing, expired, or invalid
//
// Usage in any route file:
//   const { authenticateToken, requireRole } = require('../middleware/auth');
//   router.use(authenticateToken);              // all routes need login
//   router.delete('/:id', requireRole('admin'), handler);  // admin only
// ============================================================

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'ameridex-dev-secret-change-in-production';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '8h';

// -------------------------------------------------------
// 1. authenticateToken
//    Verifies JWT and populates req.user
// -------------------------------------------------------
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];

    // Expect: "Bearer <token>"
    if (!authHeader) {
        return res.status(401).json({
            error: 'Authentication required',
            code: 'NO_TOKEN'
        });
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return res.status(401).json({
            error: 'Invalid authorization format. Expected: Bearer <token>',
            code: 'BAD_FORMAT'
        });
    }

    const token = parts[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        // Populate req.user with the fields every route depends on
        req.user = {
            id:         decoded.id         || decoded.sub || null,
            username:   decoded.username   || '',
            dealerCode: decoded.dealerCode || '',
            role:       decoded.role       || 'frontdesk',
            displayName: decoded.displayName || decoded.username || ''
        };

        // Validate that critical fields exist
        if (!req.user.dealerCode && req.user.role !== 'admin') {
            return res.status(401).json({
                error: 'Token missing dealer code',
                code: 'INCOMPLETE_TOKEN'
            });
        }

        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({
                error: 'Session expired. Please log in again.',
                code: 'TOKEN_EXPIRED',
                expiredAt: err.expiredAt
            });
        }

        if (err.name === 'JsonWebTokenError') {
            return res.status(401).json({
                error: 'Invalid token',
                code: 'INVALID_TOKEN'
            });
        }

        return res.status(401).json({
            error: 'Authentication failed',
            code: 'AUTH_ERROR'
        });
    }
}

// -------------------------------------------------------
// 2. requireRole(...roles)
//    Restricts a route to specific roles.
//    Must be used AFTER authenticateToken.
//
//    Examples:
//      requireRole('admin')           // admin only
//      requireRole('admin', 'gm')     // admin or GM
//      requireRole('gm', 'frontdesk') // any dealer user
// -------------------------------------------------------
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                error: 'Authentication required',
                code: 'NO_USER'
            });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                error: 'Insufficient permissions. Required role: ' + roles.join(' or '),
                code: 'FORBIDDEN',
                requiredRoles: roles,
                currentRole: req.user.role
            });
        }

        next();
    };
}

// -------------------------------------------------------
// 3. requireSameDealer
//    Ensures a dealer-role user can only access their own
//    dealer's resources. Admins bypass this check.
//    Reads dealerCode from req.params.dealerCode or
//    req.query.dealerCode or req.body.dealerCode.
// -------------------------------------------------------
function requireSameDealer(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required', code: 'NO_USER' });
    }

    // Admins can access any dealer's resources
    if (req.user.role === 'admin') {
        return next();
    }

    // Determine which dealer is being accessed
    const targetDealer = (
        req.params.dealerCode ||
        req.query.dealerCode ||
        (req.body && req.body.dealerCode) ||
        ''
    ).toUpperCase();

    // If no target dealer specified, the route will use req.user.dealerCode
    // by default, which is always the user's own dealer. Allow it.
    if (!targetDealer) {
        return next();
    }

    if (targetDealer !== req.user.dealerCode) {
        return res.status(403).json({
            error: 'Access denied. You can only access your own dealer resources.',
            code: 'CROSS_DEALER_DENIED'
        });
    }

    next();
}

// -------------------------------------------------------
// 4. generateToken(payload)
//    Creates a signed JWT. Used by the login route.
//
//    payload: { id, username, dealerCode, role, displayName }
//    returns: string (the JWT)
// -------------------------------------------------------
function generateToken(payload) {
    return jwt.sign(
        {
            id:          payload.id,
            username:    payload.username,
            dealerCode:  payload.dealerCode,
            role:        payload.role,
            displayName: payload.displayName
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRY }
    );
}

// -------------------------------------------------------
// 5. optionalAuth
//    Like authenticateToken but does NOT reject if no token.
//    If token is present and valid, populates req.user.
//    If token is absent or invalid, sets req.user = null
//    and continues.
//    Use for routes that behave differently for logged-in
//    vs anonymous users.
// -------------------------------------------------------
function optionalAuth(req, res, next) {
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
        req.user = null;
        return next();
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        req.user = null;
        return next();
    }

    try {
        const decoded = jwt.verify(parts[1], JWT_SECRET);
        req.user = {
            id:          decoded.id || decoded.sub || null,
            username:    decoded.username || '',
            dealerCode:  decoded.dealerCode || '',
            role:        decoded.role || 'frontdesk',
            displayName: decoded.displayName || decoded.username || ''
        };
    } catch (err) {
        req.user = null;
    }

    next();
}

// -------------------------------------------------------
// EXPORTS
// -------------------------------------------------------
module.exports = {
    authenticateToken,
    requireRole,
    requireSameDealer,
    generateToken,
    optionalAuth,
    JWT_SECRET,
    JWT_EXPIRY
};
