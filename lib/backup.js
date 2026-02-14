const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA_DIR, DEALERS_FILE, QUOTES_FILE, TIERS_FILE, USERS_FILE, CUSTOMERS_FILE } = require('./helpers');
const { readJSON, writeJSON } = require('./helpers');

const BACKUP_DIR = path.join(DATA_DIR, 'backups');

const DATA_FILES = {
    customers: CUSTOMERS_FILE,
    quotes: QUOTES_FILE,
    dealers: DEALERS_FILE,
    pricing: TIERS_FILE,
    users: USERS_FILE
};

const BACKUP_RETENTION = {
    hourly: 24,
    daily: 30,
    weekly: 12
};

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function sha256(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

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

    Object.entries(DATA_FILES).forEach(([key, filePath]) => {
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            const backupFile = path.join(backupPath, key + '.json');
            fs.writeFileSync(backupFile, content, 'utf8');
            manifest.files[key] = key + '.json';
            manifest.checksums[key] = sha256(content);
        }
    });

    writeJSON(path.join(backupPath, 'manifest.json'), manifest);
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
            JSON.parse(content);
        } catch (e) {
            issues.push({ file: key, issue: 'CORRUPTED: ' + e.message, restored: false });
            const restored = restoreLatestBackup(key);
            issues[issues.length - 1].restored = restored;
        }
    });

    return issues;
}

function startBackupSchedule() {
    ensureDir(BACKUP_DIR);

    setInterval(() => {
        createBackup('hourly');
    }, 60 * 60 * 1000);

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

    setTimeout(() => {
        createBackup('weekly');
        setInterval(() => createBackup('weekly'), 7 * 24 * 60 * 60 * 1000);
    }, 5000);

    setTimeout(() => {
        const issues = verifyDataIntegrity();
        if (issues.length > 0) {
            console.warn('[Startup] Data integrity issues found:', JSON.stringify(issues));
        }
        createBackup('hourly');
        console.log('[Backup] Startup backup complete. Schedule: hourly(keep 24), daily(keep 30), weekly(keep 12)');
    }, 3000);
}

function listBackups() {
    try {
        const backupDirs = fs.readdirSync(BACKUP_DIR)
            .filter(d => fs.existsSync(path.join(BACKUP_DIR, d, 'manifest.json')))
            .sort()
            .reverse();

        return backupDirs.map(dir => {
            const manifest = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, dir, 'manifest.json'), 'utf8'));
            return {
                name: dir,
                type: manifest.type,
                timestamp: manifest.timestamp,
                files: Object.keys(manifest.files),
                checksums: manifest.checksums
            };
        });
    } catch (e) {
        return [];
    }
}

module.exports = {
    DATA_FILES,
    createBackup,
    restoreLatestBackup,
    verifyDataIntegrity,
    startBackupSchedule,
    listBackups,
    BACKUP_DIR
};
