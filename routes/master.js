const express = require('express');
const router = express.Router();
const fs = require('fs');
const { DATA_FILES, createBackup, restoreLatestBackup, verifyDataIntegrity, listBackups } = require('../lib/backup');
const { readJSON, writeJSON } = require('../lib/helpers');

function requireMasterKey(req, res, next) {
    const masterKey = process.env.MASTER_KEY;
    if (!masterKey) {
        return res.status(503).json({ error: 'Master key not configured. Set MASTER_KEY env var.' });
    }
    const provided = req.headers['x-master-key'] || req.query.masterKey;
    if (!provided || provided !== masterKey) {
        return res.status(401).json({ error: 'Invalid master key' });
    }
    next();
}

function sha256(data) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(data).digest('hex');
}

router.use(requireMasterKey);

// GET /api/master/export
router.get('/export', (req, res) => {
    const exportData = {
        exportedAt: new Date().toISOString(),
        version: '1.0',
        data: {}
    };

    Object.entries(DATA_FILES).forEach(([key, filePath]) => {
        exportData.data[key] = readJSON(filePath);
    });

    exportData.checksums = {};
    Object.entries(exportData.data).forEach(([key, data]) => {
        exportData.checksums[key] = sha256(JSON.stringify(data));
    });

    exportData.stats = {
        dealers: exportData.data.dealers ? exportData.data.dealers.length : 0,
        customers: exportData.data.customers ? exportData.data.customers.length : 0,
        quotes: exportData.data.quotes ? exportData.data.quotes.length : 0,
        pricingTiers: exportData.data.pricing ? exportData.data.pricing.length : 0,
        users: exportData.data.users ? exportData.data.users.length : 0
    };

    console.log('[Master] Full database exported. Stats:', JSON.stringify(exportData.stats));

    if (req.query.download === 'true') {
        const filename = 'ameridex-backup-' + new Date().toISOString().split('T')[0] + '.json';
        res.setHeader('Content-Disposition', 'attachment; filename=' + filename);
    }

    res.json(exportData);
});

// POST /api/master/import
router.post('/import', (req, res) => {
    const importData = req.body;

    if (!importData || !importData.data) {
        return res.status(400).json({ error: 'Invalid import format. Expected { data: { dealers, customers, quotes, pricing, users } }' });
    }

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

// GET /api/master/status
router.get('/status', (req, res) => {
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

    Object.entries(DATA_FILES).forEach(([key, filePath]) => {
        if (fs.existsSync(filePath)) {
            const stat = fs.statSync(filePath);
            const data = readJSON(filePath);
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

    const backups = listBackups();
    status.backups = {
        total: backups.length,
        hourly: backups.filter(b => b.type === 'hourly').length,
        daily: backups.filter(b => b.type === 'daily').length,
        weekly: backups.filter(b => b.type === 'weekly').length,
        latest: backups[0] ? backups[0].name : 'none'
    };

    res.json(status);
});

// POST /api/master/backup
router.post('/backup', (req, res) => {
    const type = req.body.type || 'daily';
    const manifest = createBackup(type);
    res.json({ message: 'Backup created', manifest: manifest });
});

// POST /api/master/restore
router.post('/restore', (req, res) => {
    const fileKey = req.body.file;

    if (fileKey && DATA_FILES[fileKey]) {
        const restored = restoreLatestBackup(fileKey);
        return res.json({
            message: restored ? fileKey + ' restored from backup' : 'No valid backup found for ' + fileKey,
            restored: restored
        });
    }

    const results = {};
    Object.keys(DATA_FILES).forEach(key => {
        results[key] = restoreLatestBackup(key);
    });

    res.json({ message: 'Full restore attempted', results: results });
});

// GET /api/master/backups
router.get('/backups', (req, res) => {
    res.json(listBackups());
});

module.exports = router;
