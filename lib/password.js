const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const BCRYPT_ROUNDS = 12;

// ---------------------------------------------------------------
// Hash a plaintext password using bcrypt.
// All NEW passwords (create, reset, change) use this from now on.
// ---------------------------------------------------------------
function hashPassword(plaintext) {
    return bcrypt.hashSync(plaintext, BCRYPT_ROUNDS);
}

// ---------------------------------------------------------------
// Verify a plaintext password against a stored hash.
// Auto-detects format:
//   - bcrypt:       starts with $2a$ or $2b$
//   - legacy SHA-256: format is   salt:hex
//
// Legacy SHA-256 uses timing-safe comparison to prevent
// timing attacks (the old code used ===).
// ---------------------------------------------------------------
function verifyPassword(plaintext, stored) {
    if (!stored || typeof stored !== 'string') return false;

    // Bcrypt format
    if (stored.startsWith('$2a$') || stored.startsWith('$2b$')) {
        return bcrypt.compareSync(plaintext, stored);
    }

    // Legacy SHA-256 format: salt:hex
    if (!stored.includes(':')) return false;
    const [salt, hash] = stored.split(':');
    const check = crypto.createHash('sha256')
        .update(salt + plaintext)
        .digest('hex');

    // Timing-safe comparison (both are hex strings of equal length)
    if (check.length !== hash.length) return false;
    return crypto.timingSafeEqual(
        Buffer.from(check, 'utf8'),
        Buffer.from(hash, 'utf8')
    );
}

// ---------------------------------------------------------------
// Returns true if the stored hash is NOT bcrypt and should be
// re-hashed on next successful login.
// ---------------------------------------------------------------
function needsRehash(stored) {
    if (!stored || typeof stored !== 'string') return true;
    return !(stored.startsWith('$2a$') || stored.startsWith('$2b$'));
}

module.exports = { hashPassword, verifyPassword, needsRehash };
