const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const mongoose = require('mongoose');
const { protect } = require('../middleware/auth');
const { PORTAL_ROLES, requireRoles } = require('../middleware/hierarchy');

// Helper: Ensure backup storage directory exists safely with permission fallback
const getBackupDir = () => {
  const candidateDirs = [
    path.join(__dirname, '../storage/backups'),
    path.join(__dirname, '../uploads/backups'),
    path.join(process.cwd(), 'storage/backups'),
    path.join(process.cwd(), 'uploads/backups'),
    '/tmp/smt_backups'
  ];

  for (const dir of candidateDirs) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const testFile = path.join(dir, '.perm_test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      return dir;
    } catch (err) {
      console.warn(`[Backup Dir] Cannot write to ${dir}:`, err.message);
    }
  }

  // Final fallback to process.cwd()
  const defaultDir = path.join(process.cwd(), 'backups');
  if (!fs.existsSync(defaultDir)) {
    fs.mkdirSync(defaultDir, { recursive: true });
  }
  return defaultDir;
};

// Import models directly to prevent MissingSchemaError
const User = require('../models/User');
const Device = require('../models/Device');
const Product = require('../models/Product');
const ActivationRequest = require('../models/ActivationRequest');
const RenewalRequest = require('../models/RenewalRequest');
const Transaction = require('../models/Transaction');
const Invoice = require('../models/Invoice');
const DealerDue = require('../models/DealerDue');
const AuditLog = require('../models/AuditLog');
const PaymentVerificationRequest = require('../models/PaymentVerificationRequest');

// Collections to backup
const getCollectionsMap = () => ({
  users: User,
  devices: Device,
  products: Product,
  activationrequests: ActivationRequest,
  renewalrequests: RenewalRequest,
  transactions: Transaction,
  invoices: Invoice,
  dealerdues: DealerDue,
  auditlogs: AuditLog,
  paymentverificationrequests: PaymentVerificationRequest,
});

// Helper: Create a Gzip Compressed Backup
const performBackup = async (label = 'monthly') => {
  try {
    const backupDir = getBackupDir();
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
      try {
        if (model) {
          const docs = await model.find({}).lean();
          backupData.data[key] = docs;
          backupData.metadata.collections[key] = docs.length;
          backupData.metadata.totalDocuments += docs.length;
        }
      } catch (colErr) {
        console.error(`Warning: Collection ${key} backup query error:`, colErr.message);
        backupData.data[key] = [];
        backupData.metadata.collections[key] = 0;
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

// Helper: Get ISO week number
const getWeekNumber = (date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
};

// Scheduler: Run weekly + monthly automatic backup checks
const checkAndRunScheduledBackups = async () => {
  // First, ensure MongoDB is actually connected
  if (mongoose.connection.readyState !== 1) {
    console.log('⏳ [Automated Backup] MongoDB not ready yet, skipping this cycle...');
    return;
  }

  try {
    const backupDir = getBackupDir();
    const files = fs.readdirSync(backupDir);
    const now = new Date();

    // --- Weekly Backup Check ---
    const weekNum = getWeekNumber(now);
    const weekPrefix = `smt_backup_weekly_${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
    const weekBackupExists = files.some((f) => f.startsWith(weekPrefix));

    if (!weekBackupExists) {
      console.log(`📅 [Automated Backup] No backup found for current week (${weekPrefix}). Creating automatic weekly backup...`);
      await performBackup(`weekly_${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`);
    } else {
      console.log(`✅ [Automated Backup] Weekly backup already exists for ${weekPrefix}.`);
    }

    // --- Monthly Backup Check ---
    const currentMonthPrefix = `smt_backup_monthly_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthBackupExists = files.some((f) => f.startsWith(currentMonthPrefix));

    if (!monthBackupExists) {
      console.log(`📅 [Automated Backup] No backup found for current month (${currentMonthPrefix}). Creating automatic monthly backup...`);
      await performBackup('monthly');
    } else {
      console.log(`✅ [Automated Backup] Monthly backup already exists for ${currentMonthPrefix}.`);
    }
  } catch (err) {
    console.error('Error checking backup schedule:', err.message);
  }
};

// Wait for MongoDB to connect, then run backup checks
const waitForDbAndRunBackups = () => {
  let attempts = 0;
  const maxAttempts = 30; // Try for up to 5 minutes (30 x 10s)

  const interval = setInterval(async () => {
    attempts++;
    if (mongoose.connection.readyState === 1) {
      clearInterval(interval);
      console.log('🔗 [Automated Backup] MongoDB connected! Running backup schedule check...');
      await checkAndRunScheduledBackups();
    } else if (attempts >= maxAttempts) {
      clearInterval(interval);
      console.error('❌ [Automated Backup] MongoDB did not connect within 5 minutes. Skipping automatic backup.');
    }
  }, 10000); // Check every 10 seconds
};

// Start waiting for DB connection on startup
waitForDbAndRunBackups();

// Run backup check every 12 hours (catches weekly + monthly)
setInterval(checkAndRunScheduledBackups, 12 * 60 * 60 * 1000);

// @route   POST /api/backups/create
// @desc    Manually trigger a full database backup (Admin only)
// @access  Private (Admin)
router.post('/create', protect, requireRoles(PORTAL_ROLES.ADMIN), async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ message: 'Database not connected. Please wait a moment and try again.' });
    }
    const result = await performBackup('manual');
    res.json({
      message: 'Backup created successfully!',
      backup: result,
    });
  } catch (error) {
    console.error('Create backup API error:', error);
    res.status(500).json({ message: `Backup creation failed: ${error.message}` });
  }
});

// @route   GET /api/backups
// @desc    List all database backups (Admin only)
// @access  Private (Admin)
router.get('/', protect, requireRoles(PORTAL_ROLES.ADMIN), async (req, res) => {
  try {
    const backupDir = getBackupDir();
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
    console.error('List backups API error:', error);
    res.status(500).json({ message: `Failed to list backups: ${error.message}` });
  }
});

// @route   GET /api/backups/download/:filename
// @desc    Download a specific backup file (Admin only)
// @access  Private (Admin)
router.get('/download/:filename', protect, requireRoles(PORTAL_ROLES.ADMIN), async (req, res) => {
  try {
    const backupDir = getBackupDir();
    const filename = path.basename(req.params.filename);
    const filepath = path.join(backupDir, filename);

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ message: 'Backup file not found' });
    }

    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    fs.createReadStream(filepath).pipe(res);
  } catch (error) {
    console.error('Download backup API error:', error);
    res.status(500).json({ message: `Failed to download backup: ${error.message}` });
  }
});

// Core helper: Restore database from any backup file path
const executeRestoreFromPath = async (filepath) => {
  const filename = path.basename(filepath);
  const fileBuffer = fs.readFileSync(filepath);
  const jsonString = filename.endsWith('.gz')
    ? zlib.gunzipSync(fileBuffer).toString('utf-8')
    : fileBuffer.toString('utf-8');

  const backupObj = JSON.parse(jsonString);
  if (!backupObj || !backupObj.data) {
    throw new Error('Invalid backup file format');
  }

  const collectionsMap = getCollectionsMap();
  const restoredSummary = {};

  for (const [key, docs] of Object.entries(backupObj.data)) {
    const model = collectionsMap[key];
    if (model && Array.isArray(docs)) {
      try {
        await model.collection.deleteMany({});
        if (docs.length > 0) {
          const preparedDocs = docs.map((doc) => {
            if (doc._id && typeof doc._id === 'string' && mongoose.Types.ObjectId.isValid(doc._id)) {
              return { ...doc, _id: new mongoose.Types.ObjectId(doc._id) };
            }
            return doc;
          });
          await model.collection.insertMany(preparedDocs, { ordered: false });
        }
        restoredSummary[key] = docs.length;
      } catch (colErr) {
        console.warn(`Warning: Collection ${key} partial restore:`, colErr.message);
        restoredSummary[key] = `${docs.length} (partial: ${colErr.message})`;
      }
    }
  }

  return restoredSummary;
};

// @route   GET /api/backups/undo-status
// @desc    Check if a 1-time undo checkpoint is available (Admin only)
// @access  Private (Admin)
router.get('/undo-status', protect, requireRoles(PORTAL_ROLES.ADMIN), async (req, res) => {
  try {
    const backupDir = getBackupDir();
    const undoMetaPath = path.join(backupDir, 'undo_checkpoint.json');
    if (!fs.existsSync(undoMetaPath)) {
      return res.json({ canUndo: false });
    }
    const undoData = JSON.parse(fs.readFileSync(undoMetaPath, 'utf-8'));
    const undoFilePath = path.join(backupDir, undoData.undoFilename);
    if (!fs.existsSync(undoFilePath)) {
      return res.json({ canUndo: false });
    }
    res.json({
      canUndo: true,
      undoFilename: undoData.undoFilename,
      restoredFrom: undoData.restoredFrom,
      timestamp: undoData.timestamp,
    });
  } catch (err) {
    res.json({ canUndo: false });
  }
});

// @route   POST /api/backups/undo
// @desc    One-Time Undo: Revert database to the state immediately before the last restore (Admin only)
// @access  Private (Admin)
router.post('/undo', protect, requireRoles(PORTAL_ROLES.ADMIN), async (req, res) => {
  try {
    const backupDir = getBackupDir();
    const undoMetaPath = path.join(backupDir, 'undo_checkpoint.json');
    if (!fs.existsSync(undoMetaPath)) {
      return res.status(400).json({ message: 'No undo checkpoint available to revert.' });
    }

    const undoData = JSON.parse(fs.readFileSync(undoMetaPath, 'utf-8'));
    const undoFilePath = path.join(backupDir, undoData.undoFilename);

    if (!fs.existsSync(undoFilePath)) {
      return res.status(404).json({ message: 'Undo snapshot file no longer exists.' });
    }

    const restoredSummary = await executeRestoreFromPath(undoFilePath);

    // Consume the 1-time undo checkpoint
    try {
      fs.unlinkSync(undoMetaPath);
    } catch (e) {}

    console.log(`✅ [Database 1-Time Undo] Successfully reverted database to pre-restore state (${undoData.undoFilename}):`, restoredSummary);

    res.json({
      message: 'Database successfully reverted to pre-restore state! (1-Time Undo completed)',
      restoredSummary,
    });
  } catch (error) {
    console.error('Error executing 1-Time Undo:', error);
    res.status(500).json({ message: 'Failed to execute Undo', error: error.message });
  }
});

// @route   POST /api/backups/restore/:filename
// @desc    Restore database from a backup file with automatic undo checkpoint (Admin only)
// @access  Private (Admin)
router.post('/restore/:filename', protect, requireRoles(PORTAL_ROLES.ADMIN), async (req, res) => {
  try {
    const backupDir = getBackupDir();
    const filename = path.basename(req.params.filename);
    const filepath = path.join(backupDir, filename);

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ message: 'Backup file not found' });
    }

    // 1. Auto-create pre-restore safety checkpoint for 1-Time Undo
    try {
      const undoCheckpoint = await performBackup('undo_checkpoint');
      const undoMetaPath = path.join(backupDir, 'undo_checkpoint.json');
      fs.writeFileSync(undoMetaPath, JSON.stringify({
        undoFilename: undoCheckpoint.filename,
        restoredFrom: filename,
        timestamp: new Date().toISOString(),
      }, null, 2));
      console.log(`🛡️ [Safety Checkpoint] 1-Time Undo checkpoint created before restoring ${filename}: ${undoCheckpoint.filename}`);
    } catch (checkpointErr) {
      console.warn('Warning: Could not create undo safety checkpoint:', checkpointErr.message);
    }

    // 2. Perform restoration
    const restoredSummary = await executeRestoreFromPath(filepath);

    console.log(`✅ [Database Restore] Database successfully restored from ${filename}:`, restoredSummary);

    res.json({
      message: 'Database restored successfully! (1-Time Undo point has been saved)',
      restoredSummary,
    });
  } catch (error) {
    console.error('Error restoring database:', error);
    res.status(500).json({ message: 'Failed to restore database', error: error.message });
  }
});

// @route   POST /api/backups/clear-operational-data
// @desc    Clear all operational/test data while preserving user accounts (Admin only)
// @access  Private (Admin)
router.post('/clear-operational-data', protect, requireRoles(PORTAL_ROLES.ADMIN), async (req, res) => {
  try {
    const Device = require('../models/Device');
    const Product = require('../models/Product');
    const ActivationRequest = require('../models/ActivationRequest');
    const RenewalRequest = require('../models/RenewalRequest');
    const Invoice = require('../models/Invoice');
    const Transaction = require('../models/Transaction');
    const DealerDue = require('../models/DealerDue');
    const DuePayment = require('../models/DuePayment');
    const PaymentVerificationRequest = require('../models/PaymentVerificationRequest');
    const AuditLog = require('../models/AuditLog');
    const User = require('../models/User');

    const [
      devRes,
      prodRes,
      actRes,
      renRes,
      invRes,
      txRes,
      dueRes,
      payRes,
      pvrRes,
      logRes
    ] = await Promise.all([
      Device.deleteMany({}),
      Product.deleteMany({}),
      ActivationRequest.deleteMany({}),
      RenewalRequest.deleteMany({}),
      Invoice.deleteMany({}),
      Transaction.deleteMany({}),
      DealerDue.deleteMany({}),
      DuePayment.deleteMany({}),
      PaymentVerificationRequest.deleteMany({}),
      AuditLog.deleteMany({}),
    ]);

    await User.updateMany({}, {
      $set: {
        availableBalance: 0,
        overDrawnAmount: 0,
      }
    });

    console.log('🧹 [Clear Operational Data] Completed:', {
      devices: devRes.deletedCount,
      activationRequests: actRes.deletedCount,
      invoices: invRes.deletedCount,
      transactions: txRes.deletedCount,
    });

    res.json({
      message: 'All operational data cleared successfully! All User and Dealer accounts are preserved.',
      deleted: {
        devices: devRes.deletedCount,
        products: prodRes.deletedCount,
        activationRequests: actRes.deletedCount,
        renewalRequests: renRes.deletedCount,
        invoices: invRes.deletedCount,
        transactions: txRes.deletedCount,
        dealerDues: dueRes.deletedCount,
        duePayments: payRes.deletedCount,
        paymentVerificationRequests: pvrRes.deletedCount,
        auditLogs: logRes.deletedCount,
      }
    });
  } catch (error) {
    console.error('Error clearing operational data:', error);
    res.status(500).json({ message: 'Failed to clear operational data', error: error.message });
  }
});

module.exports = {
  router,
  performBackup,
};
