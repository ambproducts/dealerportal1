const crypto = require('crypto');

const TOKEN_EXPIRY_MS = 8 * 60 * 60 * 1000; // 8 hours

const SECRET = process.env.TOKEN_SECRET;
if (!SECRET) {
    console.error('FATAL: TOKEN_SECRET environment variable must be set');
    process.exit(1);
}

function generateToken(user) {
    const payload = {
        id: user.id,
        username: user.username,
        role: user.role,
        displayName: user.displayName,
        iat: Date.now(),
        exp: Date.now() + TOKEN_EXPIRY_MS
    };
    // Salesrep tokens don't include dealerCode (cross-dealer role)
    if (user.role !== 'salesrep') {
        payload.dealerCode = user.dealerCode;
    }
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', SECRET).update(payloadB64).digest('base64url');
    return payloadB64 + '.' + sig;
}

function verifyToken(token) {
    try {
        const [payloadB64, sig] = token.split('.');
        const expectedSig = crypto.createHmac('sha256', SECRET).update(payloadB64).digest('base64url');
        const sigBuf = Buffer.from(sig, 'utf8');
        const expectedBuf = Buffer.from(expectedSig, 'utf8');
        if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
        const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
        if (payload.exp < Date.now()) return null;
        return payload;
    } catch (e) {
        return null;
    }
}

module.exports = { generateToken, verifyToken };
