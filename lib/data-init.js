// ============================================================
// lib/data-init.js - Data File Initialization
// Date: 2026-02-28
// ============================================================
// Seeds required JSON data files on first run.
// v2.0: Removed pricing-tiers.json seeding (per-dealer pricing).
//       Default admin dealer now gets pricing map instead of tier.
// ============================================================

const fs = require('fs');
const { DATA_DIR, DEALERS_FILE, QUOTES_FILE, USERS_FILE } = require('./helpers');
const { readJSON, writeJSON, generateId, buildDefaultPricing } = require('./helpers');
const { hashPassword } = require('./password');

function ensureDataFiles() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (!fs.existsSync(QUOTES_FILE)) {
        writeJSON(QUOTES_FILE, []);
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
                pricing: buildDefaultPricing(),
                role: 'admin',
                isActive: true,
                isDeleted: false,
                deletedAt: null,
                deletedBy: null,
                deletedByRole: null,
                createdAt: new Date().toISOString(),
                lastLoginAt: null
            }
        ];
        writeJSON(DEALERS_FILE, defaultDealers);
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

    if (!fs.existsSync(USERS_FILE)) {
        const dealers = readJSON(DEALERS_FILE);
        const users = dealers.map(d => ({
            id: generateId(),
            username: d.role === 'admin' ? 'admin' : d.dealerCode.toLowerCase(),
            passwordHash: d.passwordHash,
            dealerCode: d.dealerCode,
            role: d.role === 'admin' ? 'admin' : 'gm',
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
        writeJSON(USERS_FILE, users);
        console.log('');
        console.log('========================================');
        console.log('  USER ACCOUNTS MIGRATED');
        console.log('  ' + users.length + ' user(s) created from existing dealers');
        users.forEach(u => {
            console.log('    ' + u.dealerCode + ' | ' + u.username + ' | ' + u.role);
        });
        console.log('');
        console.log('  Login requires: Dealer Code + Username + Password');
        console.log('========================================');
        console.log('');
    }
}

module.exports = { ensureDataFiles };
