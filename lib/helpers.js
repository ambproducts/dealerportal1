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

// =============================================================
// recalcCustomerStats
// Scans all non-deleted quotes to recompute quoteCount and
// totalValue for a given customerId. Excludes soft-deleted
// quotes so stats stay accurate after admin deletions.
//
// Called by:
//   - routes/quotes.js (after create, update, delete, duplicate)
//   - routes/admin-quotes.js (after soft-delete, restore, permanent-delete)
// =============================================================
function recalcCustomerStats(customerId) {
    if (!customerId) return;

    const customers = readJSON(CUSTOMERS_FILE);
    const custIdx = customers.findIndex(c => c.id === customerId);
    if (custIdx === -1) return;

    const quotes = readJSON(QUOTES_FILE);
    const customerQuotes = quotes.filter(q =>
        !q.deleted && q.customer && q.customer.customerId === customerId
    );

    customers[custIdx].quoteCount = customerQuotes.length;
    customers[custIdx].totalValue = Math.round(
        customerQuotes.reduce((sum, q) => sum + (q.totalAmount || 0), 0) * 100
    ) / 100;

    writeJSON(CUSTOMERS_FILE, customers);
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
    getDealerForUser,
    recalcCustomerStats
};
