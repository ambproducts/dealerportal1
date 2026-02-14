const crypto = require('crypto');

function hashPassword(plaintext) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.createHash('sha256')
        .update(salt + plaintext)
        .digest('hex');
    return salt + ':' + hash;
}

function verifyPassword(plaintext, stored) {
    if (!stored || !stored.includes(':')) return false;
    const [salt, hash] = stored.split(':');
    const check = crypto.createHash('sha256')
        .update(salt + plaintext)
        .digest('hex');
    return check === hash;
}

module.exports = { hashPassword, verifyPassword };
