const crypto = require('crypto');

const TOKEN_SECRET = process.env.TOKEN_SECRET;
const TOKEN_EXPIRY_MS = 8 * 60 * 60 * 1000; // 8 hours

if (!TOKEN_SECRET) {
    console.warn('');
    console.warn('========================================');
    console.warn('  WARNING: TOKEN_SECRET is not set!');
    console.warn('  Using insecure fallback. Set the');
    console.warn('  TOKEN_SECRET environment variable');
    console.warn('  before deploying to production.');
    console.warn('========================================');
    console.warn('');
}

const SECRET = TOKEN_SECRET || 'ameridex-dev-only-change-me';

function generateToken(user) {
    const payload = {
        id: user.id,
        username: user.username,
        dealerCode: user.dealerCode,
        role: user.role,
        displayName: user.displayName,
        iat: Date.now(),
        exp: Date.now() + TOKEN_EXPIRY_MS
    };
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', SECRET).update(payloadB64).digest('base64url');
    return payloadB64 + '.' + sig;
}

function verifyToken(token) {
    try {
        const [payloadB64, sig] = token.split('.');
        const expectedSig = crypto.createHmac('sha256', SECRET).update(payloadB64).digest('base64url');
        if (sig !== expectedSig) return null;
        const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
        if (payload.exp < Date.now()) return null;
        return payload;
    } catch (e) {
        return null;
    }
}

module.exports = { generateToken, verifyToken };
