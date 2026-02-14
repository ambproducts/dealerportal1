const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DEALERS_FILE = path.join(DATA_DIR, 'dealers.json');
const QUOTES_FILE = path.join(DATA_DIR, 'quotes.json');
const TIERS_FILE = path.join(DATA_DIR, 'pricing-tiers.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const CUSTOMERS_FILE = path.join(DATA_DIR, 'customers.json');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');

function generateId() {
    return 'd-' + crypto.randomBytes(8).toString('hex');
}

function readJSON(filepath) {
    try {
        if (fs.existsSync(filepath)) {
            return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
        }
    } catch (e) {
        console.error('[helpers] Error reading ' + filepath + ':', e.message);
    }
    return [];
}

function writeJSON(filepath, data) {
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const tmp = filepath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, filepath);
}

function getDealerForUser(user) {
    const dealers = readJSON(DEALERS_FILE);
    return dealers.find(d => d.dealerCode.toUpperCase() === user.dealerCode.toUpperCase());
}

module.exports = {
    DATA_DIR,
    DEALERS_FILE,
    QUOTES_FILE,
    TIERS_FILE,
    USERS_FILE,
    CUSTOMERS_FILE,
    PRODUCTS_FILE,
    generateId,
    readJSON,
    writeJSON,
    getDealerForUser
};
