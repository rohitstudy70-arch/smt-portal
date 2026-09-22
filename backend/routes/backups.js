const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const mongoose = require('mongoose');
const { protect } = require('../middleware/auth');
const { PORTAL_ROLES, requireRoles } = require('../middleware/hierarchy');

// Ensure backup storage directory exists
const backupDir = path.join(__dirname, '../storage/backups');
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

// Collections to backup
const getCollectionsMap = () => ({
  users: mongoose.model('User'),
  devices: mongoose.model('Device'),
  products: mongoose.model('Product'),
  activationrequests: mongoose.model('ActivationRequest'),
  renewalrequests: mongoose.model('RenewalRequest'),
  transactions: mongoose.model('Transaction'),
  invoices: mongoose.model('Invoice'),
  dealerdues: mongoose.model('DealerDue'),
  auditlogs: mongoose.model('AuditLog'),
  paymentverificationrequests: mongoose.model('PaymentVerificationRequest'),
});

// Helper: Create a Gzip Compressed Backup
const performBackup = async (label = 'monthly') => {
  try {
    const collectionsMap = getCollectionsMap();
    const backupData = {
      metadata: {
        createdAt: new Date().toISOString(),
        label,
        collections: {},
        totalDocuments: 0,
      },
      data: {},
    };

    for (const [key, model] of Object.entries(collectionsMap)) {
      if (model) {
        const docs = await model.find({}).lean();
        backupData.data[key] = docs;
        backupData.metadata.collections[key] = docs.length;
        backupData.metadata.totalDocuments += docs.length;
      }
    }

    const now = new Date();
    const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `smt_backup_${label}_${dateStr}.json.gz`;
    const filepath = path.join(backupDir, filename);

    const jsonString = JSON.stringify(backupData, null, 2);
    const compressed = zlib.gzipSync(Buffer.from(jsonString, 'utf-8'));

    fs.writeFileSync(filepath, compressed);
    console.log(`✅ [Automated Backup] Database snapshot created: ${filename} (${(compressed.length / 1024).toFixed(2)} KB, ${backupData.metadata.totalDocuments} docs)`);

    return {
      filename,
      filepath,
      sizeBytes: compressed.length,
      metadata: backupData.metadata,
    };
  } catch (error) {
    console.error('❌ [Automated Backup] Backup failed:', error.message);
    throw error;
  }
};

// Scheduler: Run monthly automatic backup check
const checkAndRunMonthlyBackup = async () => {
  try {
    const files = fs.readdirSync(backupDir);
    const now = new Date();
    const currentMonthPrefix = `smt_backup_monthly_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthBackupExists = files.some((f) => f.startsWith(currentMonthPrefix));

    if (!monthBackupExists) {
      console.log(`📅 [Automated Backup] No backup found for current month (${currentMonthPrefix}). Creating automatic monthly backup...`);
      await performBackup('monthly');
    }
  } catch (err) {
    console.error('Error checking monthly backup schedule:', err.message);
  }
};

// Run monthly backup check on startup and every 24 hours
setTimeout(checkAndRunMonthlyBackup, 5000);
setInterval(checkAndRunMonthlyBackup, 24 * 60 * 60 * 1000);

// @route   POST /api/backups/create
// @desc    Manually trigger a full database backup (Admin only)
// @access  Private (Admin)
router.post('/create', protect, requireRoles(PORTAL_ROLES.ADMIN), async (req, res) => {
  try {
    const result = await performBackup('manual');
    res.json({
      message: 'Backup created successfully!',
      backup: result,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create backup', error: error.message });
  }
});

// @route   GET /api/backups
// @desc    List all database backups (Admin only)
// @access  Private (Admin)
router.get('/', protect, requireRoles(PORTAL_ROLES.ADMIN), async (req, res) => {
  try {
    if (!fs.existsSync(backupDir)) {
      return res.json([]);
    }

    const files = fs.readdirSync(backupDir).filter((f) => f.endsWith('.json.gz') || f.endsWith('.json'));

    const list = files.map((filename) => {
      const filepath = path.join(backupDir, filename);
      const stat = fs.statSync(filepath);
      return {
        filename,
        sizeBytes: stat.size,
        sizeFormatted: `${(stat.size / 1024).toFixed(2)} KB`,
        createdAt: stat.birthtime || stat.mtime,
      };
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json(list);
  } catch (error) {
    res.status(500).json({ message: 'Failed to list backups', error: error.message });
  }
});

// @route   GET /api/backups/download/:filename
// @desc    Download a specific backup file (Admin only)
// @access  Private (Admin)
router.get('/download/:filename', protect, requireRoles(PORTAL_ROLES.ADMIN), async (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const filepath = path.join(backupDir, filename);

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ message: 'Backup file not found' });
    }

    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    fs.createReadStream(filepath).pipe(res);
  } catch (error) {
    res.status(500).json({ message: 'Failed to download backup', error: error.message });
  }
});

// @route   POST /api/backups/restore/:filename
// @desc    Restore database from a backup file (Admin only)
// @access  Private (Admin)
router.post('/restore/:filename', protect, requireRoles(PORTAL_ROLES.ADMIN), async (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const filepath = path.join(backupDir, filename);

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ message: 'Backup file not found' });
    }

    const fileBuffer = fs.readFileSync(filepath);
    const jsonString = filename.endsWith('.gz')
      ? zlib.gunzipSync(fileBuffer).toString('utf-8')
      : fileBuffer.toString('utf-8');

    const backupObj = JSON.parse(jsonString);

    if (!backupObj || !backupObj.data) {
      return res.status(400).json({ message: 'Invalid backup file format' });
    }

    const collectionsMap = getCollectionsMap();
    const restoredSummary = {};

    for (const [key, docs] of Object.entries(backupObj.data)) {
      const model = collectionsMap[key];
      if (model && Array.isArray(docs)) {
        await model.deleteMany({});
        if (docs.length > 0) {
          await model.insertMany(docs);
        }
        restoredSummary[key] = docs.length;
      }
    }

    console.log(`✅ [Database Restore] Database successfully restored from ${filename}:`, restoredSummary);

    res.json({
      message: 'Database restored successfully!',
      restoredSummary,
    });
  } catch (error) {
    console.error('Error restoring database:', error);
    res.status(500).json({ message: 'Failed to restore database', error: error.message });
  }
});

module.exports = {
  router,
  performBackup,
};
