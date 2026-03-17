// ============================================================
// lib/data-init.js - Data File Initialization
// Date: 2026-02-28
// ============================================================
// Seeds required JSON data files on first run.
// v2.0: Removed pricing-tiers.json seeding (per-dealer pricing).
//       Default admin dealer now gets pricing map instead of tier.
// ============================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA_DIR, DEALERS_FILE, QUOTES_FILE, USERS_FILE, COLORS_FILE, CATEGORIES_FILE, PRODUCTS_FILE } = require('./helpers');
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
        const adminPassword = crypto.randomBytes(9).toString('base64url').slice(0, 12);
        const adminHash = hashPassword(adminPassword);
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
        console.log('================================================');
        console.log('  INITIAL ADMIN CREDENTIALS (CHANGE IMMEDIATELY)');
        console.log('  Dealer Code: PAT123');
        console.log('  Username:    admin');
        console.log('  Password:    ' + adminPassword);
        console.log('================================================');
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

    // Seed colors.json if missing
    if (!fs.existsSync(COLORS_FILE)) {
        const bundledColors = path.join(__dirname, '..', 'data', 'colors.json');
        if (fs.existsSync(bundledColors)) {
            fs.copyFileSync(bundledColors, COLORS_FILE);
            console.log('[data-init] Seeded colors.json from bundled defaults');
        } else {
            const defaultColors = [
                { id: "Driftwood", name: "Driftwood", image: "Driftwood.png", tier: "solid", isActive: true, sortOrder: 1 },
                { id: "Khaki", name: "Khaki", image: "Khaki.png", tier: "solid", isActive: true, sortOrder: 2 },
                { id: "Slate", name: "Slate", image: "Slate.png", tier: "solid", isActive: true, sortOrder: 3 },
                { id: "Beachwood", name: "Beachwood", image: "Beachwood.png", tier: "variegated", isActive: true, sortOrder: 4 },
                { id: "Chestnut", name: "Chestnut", image: "Chestnut.png", tier: "variegated", isActive: true, sortOrder: 5 },
                { id: "Redwood", name: "Redwood", image: "Redwood.png", tier: "variegated", isActive: true, sortOrder: 6 },
                { id: "Hazelnut", name: "Hazelnut", image: "Hazelnut.png", tier: "variegated", isActive: true, sortOrder: 7 }
            ];
            writeJSON(COLORS_FILE, defaultColors);
            console.log('[data-init] Seeded colors.json with default colors');
        }
    }

    // One-time migration: fix color tier labels (solid <-> variegated were swapped)
    if (fs.existsSync(COLORS_FILE)) {
        var existingColors = readJSON(COLORS_FILE);
        var driftwood = existingColors.find(function(c) { return c.id === 'Driftwood'; });
        if (driftwood && driftwood.tier === 'variegated') {
            // Tiers are backwards, fix them
            var solidColors = ['Driftwood', 'Khaki', 'Slate'];
            existingColors.forEach(function(c) {
                if (solidColors.indexOf(c.id) !== -1) {
                    c.tier = 'solid';
                } else {
                    c.tier = 'variegated';
                }
            });
            writeJSON(COLORS_FILE, existingColors);
            console.log('[data-init] Migration: fixed color tier labels (solid <-> variegated)');
        }
    }

    // Seed categories.json if missing
    if (!fs.existsSync(CATEGORIES_FILE)) {
        const bundledCats = path.join(__dirname, '..', 'data', 'categories.json');
        if (fs.existsSync(bundledCats)) {
            fs.copyFileSync(bundledCats, CATEGORIES_FILE);
            console.log('[data-init] Seeded categories.json from bundled defaults');
        } else {
            const defaultCategories = [
                { slug: "decking", label: "Decking Boards", sortOrder: 1, isActive: true },
                { slug: "sealing", label: "Sealing & Protection", sortOrder: 2, isActive: true },
                { slug: "fasteners", label: "Fasteners & Hardware", sortOrder: 3, isActive: true },
                { slug: "hardware", label: "Hardware", sortOrder: 4, isActive: true },
                { slug: "custom", label: "Custom Items", sortOrder: 5, isActive: true }
            ];
            writeJSON(CATEGORIES_FILE, defaultCategories);
            console.log('[data-init] Seeded categories.json with default categories');
        }
    }

    // Migrate existing products.json to add colorPricing for decking products
    if (fs.existsSync(PRODUCTS_FILE)) {
        const products = readJSON(PRODUCTS_FILE);
        let needsUpdate = false;
        products.forEach(p => {
            if (p.category === 'decking' && !p.colorPricing) {
                const colors = readJSON(COLORS_FILE);
                p.colorPricing = {};
                colors.forEach(c => {
                    if (c.tier === 'solid') {
                        // Solid colors (Driftwood, Khaki, Slate) are premium = basePrice + 0.50
                        p.colorPricing[c.id] = Math.round((p.basePrice + 0.50) * 100) / 100;
                    } else {
                        // Variegated colors (Beachwood, Chestnut, Redwood, Hazelnut) = basePrice
                        p.colorPricing[c.id] = p.basePrice;
                    }
                });
                needsUpdate = true;
            }
        });
        if (needsUpdate) {
            writeJSON(PRODUCTS_FILE, products);
            console.log('[data-init] Migrated products.json: added colorPricing to decking products');
        }
    }
}

module.exports = { ensureDataFiles };
