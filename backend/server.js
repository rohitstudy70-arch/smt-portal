const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const connectDB = require('./config/db');
const { securityHeaders, nosqlSanitizer, authRateLimiter } = require('./middleware/security');

// Load environment variables
dotenv.config();
if (fs.existsSync(path.join(__dirname, '.env.local'))) {
  dotenv.config({ path: path.join(__dirname, '.env.local'), override: true });
}

// Connect to MongoDB & ensure default admin exists
connectDB().then(async () => {
  try {
    const Device = require('./models/Device');
    try {
      const indexes = await Device.collection.indexes();
      // Clean existing duplicate empty string values before building partial indexes
      await Device.updateMany({ iccid: '' }, { $unset: { iccid: 1, iccidNumber: 1 } });
      await Device.updateMany({ serialNo: '' }, { $unset: { serialNo: 1, serialNumber: 1 } });

      for (const idx of indexes) {
        if (idx.name === 'iccid_1' && !idx.partialFilterExpression) {
          console.log('🔄 Dropping legacy iccid_1 index to allow multiple empty/blank ICCIDs...');
          await Device.collection.dropIndex('iccid_1');
        }
        if (idx.name === 'serialNo_1' && !idx.partialFilterExpression) {
          console.log('🔄 Dropping legacy serialNo_1 index to allow multiple empty/blank Serial Numbers...');
          await Device.collection.dropIndex('serialNo_1');
        }
      }
      await Device.syncIndexes();
    } catch (idxErr) {
      // If collection doesn't exist yet, it's fine
    }

    const User = require('./models/User');
    const adminExists = await User.findOne({
      $or: [{ username: 'admin' }, { role: 'partner' }, { userType: 'Administration' }]
    });
    if (!adminExists) {
      console.log('🌱 No admin user found. Creating default admin (admin / admin123)...');
      await User.create({
        username: 'admin',
        password: 'admin123',
        displayName: 'System Admin',
        companyName: 'CDB Portal V2',
        role: 'partner',
        userType: 'Administration',
      });
      console.log('✅ Default admin user created successfully (username: admin, password: admin123)!');
    }

    // Automatic Migration: Update existing saved Invoices to use 'One Year Top-up' instead of 'Monthly Top-up'
    try {
      const Invoice = require('./models/Invoice');
      const existingInvoices = await Invoice.find({
        $or: [
          { 'items.description': /monthly/i },
          { 'items.category': /monthly/i },
          { 'items.validity': /monthly/i },
        ],
      });

      let migratedCount = 0;
      for (const inv of existingInvoices) {
        let modified = false;
        if (Array.isArray(inv.items)) {
          inv.items.forEach((it) => {
            if (/monthly.*top-?up/i.test(it.description) || /monthly.*recharge/i.test(it.description)) {
              it.description = 'AIS-140 VLTD - 1 Year Top-up / Recharge Plan';
              modified = true;
            }
            if (/monthly.*top-?up/i.test(it.category) || /monthly.*recharge/i.test(it.category)) {
              it.category = 'One Year Top-up Plan';
              modified = true;
            }
            if (/monthly.*recharge/i.test(it.validity) || /monthly.*top-?up/i.test(it.validity)) {
              it.validity = '12 Month Top-up';
              modified = true;
            }
            if (Array.isArray(it.imeis)) {
              it.imeis.forEach((im) => {
                if (typeof im === 'object' && im !== null) {
                  if (/monthly.*top-?up/i.test(im.deviceName) || /monthly.*recharge/i.test(im.deviceName)) {
                    im.deviceName = 'VLTD 1-Year Top-up / Recharge';
                    modified = true;
                  }
                  if (/monthly.*top-?up/i.test(im.plan) || /monthly.*recharge/i.test(im.plan)) {
                    im.plan = '1-Year Top-up / Recharge Plan';
                    modified = true;
                  }
                  if (/monthly/i.test(im.validity)) {
                    im.validity = '1 Year Top-up';
                    modified = true;
                  }
                }
              });
            }
          });
        }

        if (modified) {
          await inv.save();
          migratedCount++;
        }
      }
      if (migratedCount > 0) {
        console.log(`✅ Migrated ${migratedCount} existing saved invoices to 'One Year Top-up Plan'!`);
      }
    } catch (migErr) {
      console.error('Invoice topup migration error:', migErr.message);
    }
  } catch (err) {
    console.error('Error ensuring default admin or syncing indexes:', err.message);
  }
});

// Ensure upload folders exist
const uploadDir = path.join(__dirname, 'uploads');
const screenshotDir = path.join(uploadDir, 'screenshots');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir);
}

const app = express();

// CORS - allow all frontend origins including all vercel apps
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Explicitly handle preflight OPTIONS requests for all routes
app.options('*', cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Security headers
app.use(securityHeaders);

// Parse JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sanitize inputs to prevent NoSQL Injection
app.use(nosqlSanitizer);

// Serve static uploads & storage (under root and /api for production proxy support)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/storage', express.static(path.join(__dirname, 'storage')));
app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/storage', express.static(path.join(__dirname, 'storage')));

// Mount routes
app.use('/api/auth', authRateLimiter, require('./routes/auth'));
app.use('/api/activation-requests', require('./routes/activationRequests'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/wallet', require('./routes/wallet'));
app.use('/api/users', require('./routes/subUsers'));
app.use('/api/dealers', require('./routes/subUsers'));
app.use('/api/devices', require('./routes/devices'));
app.use('/api/devices', require('./routes/deviceDocuments'));
app.use('/api/products', require('./routes/products'));
app.use('/api/portal', require('./routes/portal'));
app.use('/api/due-dashboard', require('./routes/dueDashboard'));
app.use('/api/payment-verification-requests', require('./routes/paymentVerificationRequests'));
app.use('/api/certificates', require('./routes/certificates'));
app.use('/api/backups', require('./routes/backups').router);

// Health check route
app.get('/api/health', (req, res) => {
  const mongoose = require('mongoose');
  res.json({
    status: 'OK',
    dbHost: mongoose.connection.host || 'unknown',
    dbName: mongoose.connection.name || 'unknown',
    timestamp: new Date().toISOString()
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack);
  res.status(500).json({ message: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
