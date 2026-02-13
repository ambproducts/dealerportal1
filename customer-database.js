// ============================================================
// AmeriDex Dealer Portal - Customer Database + Backup System v1.0
// Date: 2026-02-13
// ============================================================
//
// WHAT THIS FILE DOES:
//   1. Customer Database (/api/customers, /api/admin/customers)
//      - Standalone customer entities keyed by ID
//      - Dealer-scoped access: dealers see only their own customers
//      - Admin/master access: AmeriDex sees ALL customers
//      - Deduplication by email across dealers
//      - Quote-to-customer linking via customerId
//
//   2. Master Database Access (/api/master/*)
//      - Requires MASTER_KEY env var (set in Render dashboard)
//      - Full export of all data (dealers, customers, quotes, pricing)
//      - Import/restore from backup
//      - Independent of dealer/admin auth
//
//   3. Automated Backup System
//      - Rotating backups: hourly (keep 24), daily (keep 30), weekly (keep 12)
//      - Backup integrity checks with SHA-256 hashes
//      - Auto-restore from latest backup if primary files corrupted/missing
//      - Manual backup/restore via master API
//
//   4. Data Persistence Guard (for Render ephemeral filesystem)
//      - On startup, checks if data files exist
//      - If missing, attempts restore from backup
//      - Backups stored in /data/backups/ (also ephemeral on free tier)
//      - For TRUE persistence: use the /api/master/export endpoint
//        to download backups to your local machine or S3
//
// USAGE in server.js (add BEFORE app.listen):
//   require('./customer-database')(app, requireAuth);
//
// ENV VARS (set in Render dashboard):
//   MASTER_KEY  - Secret key for master database access
//                 (e.g., a long random string)
// ============================================================

module.exports = function (app, requireAuth) {
    const fs = require('fs');
    const path = require('path');
    const crypto = require('crypto');

    const DATA_DIR = path.join(__dirname, 'data');
    const BACKUP_DIR = path.join(DATA_DIR, 'backups');
    const CUSTOMERS_FILE = path.join(DATA_DIR, 'customers.json');
    const QUOTES_FILE = path.join(DATA_DIR, 'quotes.json');
    const DEALERS_FILE = path.join(DATA_DIR, 'dealers.json');
    const PRICING_FILE = path.join(DATA_DIR, 'pricing-tiers.json');

    const DATA_FILES = {
        customers: CUSTOMERS_FILE,
        quotes: QUOTES_FILE,
        dealers: DEALERS_FILE,
        pricing: PRICING_FILE
    };


    // ==========================================================
    // HELPERS
    // ==========================================================
    function ensureDir(dir) {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }

    function readJSON(file, fallback) {
        try {
            if (fs.existsSync(file)) {
                const raw = fs.readFileSync(file, 'utf8');
                const data = JSON.parse(raw);
                return data;
            }
        } catch (e) {
            console.error('[CustomerDB] Error reading ' + file + ':', e.message);
        }
        return fallback !== undefined ? fallback : [];
    }

    function writeJSON(file, data) {
        ensureDir(path.dirname(file));
        const tmp = file + '.tmp';
        // Write to temp file first, then rename (atomic write)
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
        fs.renameSync(tmp, file);
    }

    function sha256(data) {
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    function requireAdmin(req, res, next) {
        if (!req.dealer || req.dealer.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        next();
    }

    function requireMasterKey(req, res, next) {
        const masterKey = process.env.MASTER_KEY;
        if (!masterKey) {
            return res.status(503).json({ error: 'Master key not configured. Set MASTER_KEY env var in Render dashboard.' });
        }
        const provided = req.headers['x-master-key'] || req.query.masterKey;
        if (!provided || provided !== masterKey) {
            return res.status(401).json({ error: 'Invalid master key' });
        }
        next();
    }


    // ==========================================================
    // STARTUP: ENSURE CUSTOMERS FILE EXISTS
    // ==========================================================
    ensureDir(DATA_DIR);
    ensureDir(BACKUP_DIR);

    if (!fs.existsSync(CUSTOMERS_FILE)) {
        // Attempt restore from backup
        const restored = restoreLatestBackup('customers');
        if (!restored) {
            writeJSON(CUSTOMERS_FILE, []);
            console.log('[CustomerDB] Created empty customers.json');
        }
    }

    // Migrate existing quotes: extract customer data into customers.json
    migrateExistingCustomers();


    // ==========================================================
    // CUSTOMER MIGRATION (one-time, idempotent)
    // ==========================================================
    function migrateExistingCustomers() {
        const customers = readJSON(CUSTOMERS_FILE, []);
        const quotes = readJSON(QUOTES_FILE, []);
        let migrated = 0;

        quotes.forEach(quote => {
            if (quote.customerId) return; // already linked
            if (!quote.customer || !quote.customer.email) return;

            const email = quote.customer.email.toLowerCase().trim();

            // Find or create customer
            let existing = customers.find(c => c.email.toLowerCase() === email);
            if (!existing) {
                existing = {
                    id: crypto.randomUUID(),
                    name: quote.customer.name || '',
                    email: email,
                    company: quote.customer.company || '',
                    phone: quote.customer.phone || '',
                    zipCode: quote.customer.zipCode || '',
                    dealers: [quote.dealerCode].filter(Boolean),
                    quoteCount: 0,
                    totalValue: 0,
                    firstContact: quote.createdAt || new Date().toISOString(),
                    lastContact: quote.updatedAt || quote.createdAt || new Date().toISOString(),
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    notes: ''
                };
                customers.push(existing);
            }

            // Link quote to customer
            quote.customerId = existing.id;

            // Update customer stats
            if (quote.dealerCode && !existing.dealers.includes(quote.dealerCode)) {
                existing.dealers.push(quote.dealerCode);
            }
            existing.quoteCount++;
            existing.totalValue += (quote.totalAmount || 0);
            if (quote.updatedAt && quote.updatedAt > existing.lastContact) {
                existing.lastContact = quote.updatedAt;
            }

            migrated++;
        });

        if (migrated > 0) {
            writeJSON(CUSTOMERS_FILE, customers);
            writeJSON(QUOTES_FILE, quotes);
            console.log('[CustomerDB] Migrated ' + migrated + ' quotes to customer database (' + customers.length + ' customers)');
        }
    }


    // ==========================================================
    // BACKUP SYSTEM
    // ==========================================================
    const BACKUP_RETENTION = {
        hourly: 24,
        daily: 30,
        weekly: 12
    };

    function createBackup(type) {
        type = type || 'hourly';
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupName = type + '_' + timestamp;
        const backupPath = path.join(BACKUP_DIR, backupName);

        ensureDir(backupPath);

        const manifest = {
            type: type,
            timestamp: new Date().toISOString(),
            files: {},
            checksums: {}
        };

        // Back up each data file
        Object.entries(DATA_FILES).forEach(([key, filePath]) => {
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8');
                const backupFile = path.join(backupPath, key + '.json');
                fs.writeFileSync(backupFile, content, 'utf8');
                manifest.files[key] = key + '.json';
                manifest.checksums[key] = sha256(content);
            }
        });

        // Write manifest
        writeJSON(path.join(backupPath, 'manifest.json'), manifest);

        // Prune old backups of this type
        pruneBackups(type);

        console.log('[Backup] Created ' + type + ' backup: ' + backupName + ' (' + Object.keys(manifest.files).length + ' files)');
        return manifest;
    }

    function pruneBackups(type) {
        const retention = BACKUP_RETENTION[type] || 24;
        const prefix = type + '_';

        try {
            const dirs = fs.readdirSync(BACKUP_DIR)
                .filter(d => d.startsWith(prefix))
                .sort()
                .reverse();

            // Remove oldest beyond retention
            dirs.slice(retention).forEach(dir => {
                const fullPath = path.join(BACKUP_DIR, dir);
                fs.rmSync(fullPath, { recursive: true, force: true });
                console.log('[Backup] Pruned old backup: ' + dir);
            });
        } catch (e) {
            console.error('[Backup] Prune error:', e.message);
        }
    }

    function getLatestBackup(fileKey) {
        try {
            const dirs = fs.readdirSync(BACKUP_DIR)
                .filter(d => {
                    const mPath = path.join(BACKUP_DIR, d, 'manifest.json');
                    return fs.existsSync(mPath);
                })
                .sort()
                .reverse();

            for (const dir of dirs) {
                const manifestPath = path.join(BACKUP_DIR, dir, 'manifest.json');
                const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

                if (manifest.files[fileKey]) {
                    const filePath = path.join(BACKUP_DIR, dir, manifest.files[fileKey]);
                    if (fs.existsSync(filePath)) {
                        const content = fs.readFileSync(filePath, 'utf8');
                        const checksum = sha256(content);

                        // Verify integrity
                        if (manifest.checksums[fileKey] === checksum) {
                            return { content: content, backup: dir, checksum: checksum };
                        } else {
                            console.warn('[Backup] Checksum mismatch for ' + fileKey + ' in ' + dir + ', trying next...');
                        }
                    }
                }
            }
        } catch (e) {
            console.error('[Backup] Restore search error:', e.message);
        }
        return null;
    }

    function restoreLatestBackup(fileKey) {
        const result = getLatestBackup(fileKey);
        if (result) {
            const targetFile = DATA_FILES[fileKey];
            if (targetFile) {
                writeJSON(targetFile, JSON.parse(result.content));
                console.log('[Backup] RESTORED ' + fileKey + ' from backup ' + result.backup);
                return true;
            }
        }
        console.warn('[Backup] No valid backup found for ' + fileKey);
        return false;
    }

    function verifyDataIntegrity() {
        const issues = [];

        Object.entries(DATA_FILES).forEach(([key, filePath]) => {
            if (!fs.existsSync(filePath)) {
                issues.push({ file: key, issue: 'MISSING', restored: false });
                const restored = restoreLatestBackup(key);
                issues[issues.length - 1].restored = restored;
                return;
            }

            try {
                const content = fs.readFileSync(filePath, 'utf8');
                JSON.parse(content); // Verify valid JSON
            } catch (e) {
                issues.push({ file: key, issue: 'CORRUPTED: ' + e.message, restored: false });
                const restored = restoreLatestBackup(key);
                issues[issues.length - 1].restored = restored;
            }
        });

        return issues;
    }

    // Schedule backups
    // Hourly
    setInterval(() => {
        createBackup('hourly');
    }, 60 * 60 * 1000);

    // Daily (at next midnight-ish, then every 24h)
    const msToMidnight = (() => {
        const now = new Date();
        const midnight = new Date(now);
        midnight.setHours(24, 0, 0, 0);
        return midnight - now;
    })();
    setTimeout(() => {
        createBackup('daily');
        setInterval(() => createBackup('daily'), 24 * 60 * 60 * 1000);
    }, msToMidnight);

    // Weekly (every 7 days from startup)
    setTimeout(() => {
        createBackup('weekly');
        setInterval(() => createBackup('weekly'), 7 * 24 * 60 * 60 * 1000);
    }, 5000); // First weekly backup shortly after startup

    // Initial backup on startup
    setTimeout(() => {
        const issues = verifyDataIntegrity();
        if (issues.length > 0) {
            console.warn('[Startup] Data integrity issues found:', JSON.stringify(issues));
        }
        createBackup('hourly');
        console.log('[Backup] Startup backup complete. Schedule: hourly(keep 24), daily(keep 30), weekly(keep 12)');
    }, 3000);


    // ==========================================================
    // CUSTOMER API (Dealer-scoped)
    // ==========================================================

    // GET /api/customers - Dealer sees only customers they have quoted
    app.get('/api/customers', requireAuth, (req, res) => {
        const customers = readJSON(CUSTOMERS_FILE, []);
        const dealerCode = req.dealer.dealerCode;

        const myCustomers = customers.filter(c =>
            c.dealers && c.dealers.includes(dealerCode)
        );

        res.json(myCustomers);
    });

    // GET /api/customers/search?q=... - Autocomplete for dealer
    app.get('/api/customers/search', requireAuth, (req, res) => {
        const q = (req.query.q || '').toLowerCase().trim();
        if (q.length < 2) {
            return res.json([]);
        }

        const customers = readJSON(CUSTOMERS_FILE, []);
        const dealerCode = req.dealer.dealerCode;

        // Search all customers (not just dealer's own) for autocomplete
        // but mark which ones belong to this dealer
        const results = customers
            .filter(c => {
                return (c.name || '').toLowerCase().includes(q)
                    || (c.email || '').toLowerCase().includes(q)
                    || (c.company || '').toLowerCase().includes(q)
                    || (c.phone || '').includes(q);
            })
            .slice(0, 15)
            .map(c => ({
                id: c.id,
                name: c.name,
                email: c.email,
                company: c.company,
                phone: c.phone,
                zipCode: c.zipCode,
                isMyCustomer: c.dealers && c.dealers.includes(dealerCode),
                quoteCount: c.quoteCount || 0
            }));

        res.json(results);
    });

    // POST /api/customers - Create or update customer (from quote save)
    app.post('/api/customers', requireAuth, (req, res) => {
        const { name, email, company, phone, zipCode } = req.body;

        if (!email || !name) {
            return res.status(400).json({ error: 'Name and email are required' });
        }

        const customers = readJSON(CUSTOMERS_FILE, []);
        const dealerCode = req.dealer.dealerCode;
        const normalizedEmail = email.toLowerCase().trim();

        // Check for existing customer by email (dedup)
        let existing = customers.find(c => c.email.toLowerCase() === normalizedEmail);

        if (existing) {
            // Update fields if provided and non-empty
            if (name) existing.name = name;
            if (company !== undefined) existing.company = company;
            if (phone !== undefined) existing.phone = phone;
            if (zipCode !== undefined) existing.zipCode = zipCode;
            if (!existing.dealers) existing.dealers = [];
            if (!existing.dealers.includes(dealerCode)) {
                existing.dealers.push(dealerCode);
            }
            existing.updatedAt = new Date().toISOString();
            existing.lastContact = new Date().toISOString();

            writeJSON(CUSTOMERS_FILE, customers);
            return res.json(existing);
        }

        // Create new customer
        const newCustomer = {
            id: crypto.randomUUID(),
            name: name,
            email: normalizedEmail,
            company: company || '',
            phone: phone || '',
            zipCode: zipCode || '',
            dealers: [dealerCode],
            quoteCount: 0,
            totalValue: 0,
            firstContact: new Date().toISOString(),
            lastContact: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            notes: ''
        };

        customers.push(newCustomer);
        writeJSON(CUSTOMERS_FILE, customers);

        console.log('[CustomerDB] New customer: ' + name + ' (' + normalizedEmail + ') by ' + dealerCode);
        res.status(201).json(newCustomer);
    });

    // PUT /api/customers/:id - Update customer
    app.put('/api/customers/:id', requireAuth, (req, res) => {
        const customers = readJSON(CUSTOMERS_FILE, []);
        const idx = customers.findIndex(c => c.id === req.params.id);
        if (idx === -1) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        const allowed = ['name', 'email', 'company', 'phone', 'zipCode'];
        allowed.forEach(field => {
            if (req.body[field] !== undefined) {
                customers[idx][field] = field === 'email'
                    ? req.body[field].toLowerCase().trim()
                    : req.body[field];
            }
        });
        customers[idx].updatedAt = new Date().toISOString();

        writeJSON(CUSTOMERS_FILE, customers);
        res.json(customers[idx]);
    });


    // ==========================================================
    // ADMIN: CUSTOMERS (AmeriDex sees all)
    // ==========================================================

    // GET /api/admin/customers - All customers, all dealers
    app.get('/api/admin/customers', requireAuth, requireAdmin, (req, res) => {
        const customers = readJSON(CUSTOMERS_FILE, []);
        res.json(customers);
    });

    // PUT /api/admin/customers/:id - Admin edit any customer
    app.put('/api/admin/customers/:id', requireAuth, requireAdmin, (req, res) => {
        const customers = readJSON(CUSTOMERS_FILE, []);
        const idx = customers.findIndex(c => c.id === req.params.id);
        if (idx === -1) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        const allowed = ['name', 'email', 'company', 'phone', 'zipCode', 'notes', 'dealers'];
        allowed.forEach(field => {
            if (req.body[field] !== undefined) {
                customers[idx][field] = field === 'email'
                    ? req.body[field].toLowerCase().trim()
                    : req.body[field];
            }
        });
        customers[idx].updatedAt = new Date().toISOString();

        writeJSON(CUSTOMERS_FILE, customers);
        console.log('[Admin] Customer updated: ' + customers[idx].name);
        res.json(customers[idx]);
    });

    // DELETE /api/admin/customers/:id - Remove customer
    app.delete('/api/admin/customers/:id', requireAuth, requireAdmin, (req, res) => {
        const customers = readJSON(CUSTOMERS_FILE, []);
        const idx = customers.findIndex(c => c.id === req.params.id);
        if (idx === -1) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        const removed = customers.splice(idx, 1)[0];
        writeJSON(CUSTOMERS_FILE, customers);
        console.log('[Admin] Customer deleted: ' + removed.name);
        res.json({ message: 'Customer deleted' });
    });

    // GET /api/admin/customers/:id/quotes - All quotes for a customer
    app.get('/api/admin/customers/:id/quotes', requireAuth, requireAdmin, (req, res) => {
        const quotes = readJSON(QUOTES_FILE, []);
        const customerQuotes = quotes.filter(q => q.customerId === req.params.id);
        res.json(customerQuotes);
    });


    // ==========================================================
    // MASTER DATABASE ACCESS (AmeriDex only, key-based)
    // ==========================================================

    // GET /api/master/export - Full database export
    app.get('/api/master/export', requireMasterKey, (req, res) => {
        const exportData = {
            exportedAt: new Date().toISOString(),
            version: '1.0',
            data: {}
        };

        Object.entries(DATA_FILES).forEach(([key, filePath]) => {
            exportData.data[key] = readJSON(filePath, []);
        });

        // Add checksums for each dataset
        exportData.checksums = {};
        Object.entries(exportData.data).forEach(([key, data]) => {
            exportData.checksums[key] = sha256(JSON.stringify(data));
        });

        // Stats summary
        exportData.stats = {
            dealers: exportData.data.dealers ? exportData.data.dealers.length : 0,
            customers: exportData.data.customers ? exportData.data.customers.length : 0,
            quotes: exportData.data.quotes ? exportData.data.quotes.length : 0,
            pricingTiers: exportData.data.pricing ? exportData.data.pricing.length : 0
        };

        console.log('[Master] Full database exported. Stats:', JSON.stringify(exportData.stats));

        // Set headers for download
        if (req.query.download === 'true') {
            const filename = 'ameridex-backup-' + new Date().toISOString().split('T')[0] + '.json';
            res.setHeader('Content-Disposition', 'attachment; filename=' + filename);
        }

        res.json(exportData);
    });

    // POST /api/master/import - Full database import/restore
    app.post('/api/master/import', requireMasterKey, (req, res) => {
        const importData = req.body;

        if (!importData || !importData.data) {
            return res.status(400).json({ error: 'Invalid import format. Expected { data: { dealers, customers, quotes, pricing } }' });
        }

        // Create a backup before importing
        const preImportBackup = createBackup('daily');
        console.log('[Master] Pre-import backup created');

        const results = {};

        Object.entries(importData.data).forEach(([key, data]) => {
            if (DATA_FILES[key] && Array.isArray(data)) {
                writeJSON(DATA_FILES[key], data);
                results[key] = { imported: data.length };
                console.log('[Master] Imported ' + data.length + ' ' + key);
            }
        });

        // Verify checksums if provided
        if (importData.checksums) {
            Object.entries(importData.checksums).forEach(([key, expectedHash]) => {
                if (DATA_FILES[key]) {
                    const content = fs.readFileSync(DATA_FILES[key], 'utf8');
                    const actualHash = sha256(content);
                    results[key] = results[key] || {};
                    results[key].checksumValid = (actualHash === expectedHash);
                }
            });
        }

        res.json({
            message: 'Import complete',
            preImportBackup: preImportBackup.timestamp,
            results: results
        });
    });

    // GET /api/master/status - Database health check
    app.get('/api/master/status', requireMasterKey, (req, res) => {
        const status = {
            timestamp: new Date().toISOString(),
            uptime: Math.floor(process.uptime()) + 's',
            memory: {
                used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
                total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
            },
            files: {},
            backups: {},
            integrityCheck: verifyDataIntegrity()
        };

        // File stats
        Object.entries(DATA_FILES).forEach(([key, filePath]) => {
            if (fs.existsSync(filePath)) {
                const stat = fs.statSync(filePath);
                const data = readJSON(filePath, []);
                status.files[key] = {
                    exists: true,
                    size: (stat.size / 1024).toFixed(1) + ' KB',
                    records: Array.isArray(data) ? data.length : 'N/A',
                    lastModified: stat.mtime.toISOString()
                };
            } else {
                status.files[key] = { exists: false };
            }
        });

        // Backup stats
        try {
            const backupDirs = fs.readdirSync(BACKUP_DIR).filter(d =>
                fs.existsSync(path.join(BACKUP_DIR, d, 'manifest.json'))
            );
            status.backups = {
                total: backupDirs.length,
                hourly: backupDirs.filter(d => d.startsWith('hourly_')).length,
                daily: backupDirs.filter(d => d.startsWith('daily_')).length,
                weekly: backupDirs.filter(d => d.startsWith('weekly_')).length,
                latest: backupDirs.sort().reverse()[0] || 'none'
            };
        } catch (e) {
            status.backups = { error: e.message };
        }

        res.json(status);
    });

    // POST /api/master/backup - Trigger manual backup
    app.post('/api/master/backup', requireMasterKey, (req, res) => {
        const type = req.body.type || 'daily';
        const manifest = createBackup(type);
        res.json({ message: 'Backup created', manifest: manifest });
    });

    // POST /api/master/restore - Restore from latest backup
    app.post('/api/master/restore', requireMasterKey, (req, res) => {
        const fileKey = req.body.file; // e.g., 'customers', 'quotes', 'dealers', 'pricing'

        if (fileKey && DATA_FILES[fileKey]) {
            const restored = restoreLatestBackup(fileKey);
            return res.json({
                message: restored ? fileKey + ' restored from backup' : 'No valid backup found for ' + fileKey,
                restored: restored
            });
        }

        // Restore all
        const results = {};
        Object.keys(DATA_FILES).forEach(key => {
            results[key] = restoreLatestBackup(key);
        });

        res.json({ message: 'Full restore attempted', results: results });
    });

    // GET /api/master/backups - List all backups
    app.get('/api/master/backups', requireMasterKey, (req, res) => {
        try {
            const backupDirs = fs.readdirSync(BACKUP_DIR)
                .filter(d => fs.existsSync(path.join(BACKUP_DIR, d, 'manifest.json')))
                .sort()
                .reverse();

            const backups = backupDirs.map(dir => {
                const manifest = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, dir, 'manifest.json'), 'utf8'));
                return {
                    name: dir,
                    type: manifest.type,
                    timestamp: manifest.timestamp,
                    files: Object.keys(manifest.files),
                    checksums: manifest.checksums
                };
            });

            res.json(backups);
        } catch (e) {
            res.json([]);
        }
    });


    console.log('[CustomerDB] Mounted: /api/customers/*, /api/admin/customers/*, /api/master/*');
    console.log('[Backup] Automated backups active: hourly(24), daily(30), weekly(12)');
};
