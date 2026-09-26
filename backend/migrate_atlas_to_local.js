/**
 * migrate_atlas_to_local.js
 * 
 * Script to safely migrate all live data from MongoDB Atlas to Local VPS MongoDB.
 * 
 * Steps:
 * 1. Reads current Atlas MONGO_URI from .env
 * 2. Connects to Atlas (Source) and Local MongoDB (Target: mongodb://127.0.0.1:27017/smt_portal)
 * 3. Copies all Users, Devices, Products, Invoices, Requests, Ledgers, Dues, etc.
 * 4. Automatically updates .env to use Local MongoDB
 * 5. After running, you can safely delete the MongoDB Atlas free cluster!
 * 
 * Usage:
 * node migrate_atlas_to_local.js
 */

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

const envPath = path.join(__dirname, '.env');
dotenv.config({ path: envPath });

const SOURCE_ATLAS_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
const TARGET_LOCAL_URI = process.argv[2] || 'mongodb://127.0.0.1:27017/smt_portal';

if (!SOURCE_ATLAS_URI || !SOURCE_ATLAS_URI.startsWith('mongodb')) {
  console.error('❌ Error: No valid Atlas MONGO_URI found in backend/.env');
  process.exit(1);
}

const User = require('./models/User');
const Device = require('./models/Device');
const Product = require('./models/Product');
const ActivationRequest = require('./models/ActivationRequest');
const RenewalRequest = require('./models/RenewalRequest');
const Invoice = require('./models/Invoice');
const Transaction = require('./models/Transaction');
const DealerDue = require('./models/DealerDue');
const DuePayment = require('./models/DuePayment');
const PaymentVerificationRequest = require('./models/PaymentVerificationRequest');
const AuditLog = require('./models/AuditLog');

const collections = [
  { name: 'Users', model: User },
  { name: 'Devices', model: Device },
  { name: 'Products', model: Product },
  { name: 'ActivationRequests', model: ActivationRequest },
  { name: 'RenewalRequests', model: RenewalRequest },
  { name: 'Invoices', model: Invoice },
  { name: 'Transactions', model: Transaction },
  { name: 'DealerDues', model: DealerDue },
  { name: 'DuePayments', model: DuePayment },
  { name: 'PaymentVerificationRequests', model: PaymentVerificationRequest },
  { name: 'AuditLogs', model: AuditLog },
];

async function migrate() {
  console.log('=====================================================');
  console.log('🚀 MONGODB ATLAS TO LOCAL VPS MIGRATION TOOL');
  console.log('=====================================================\n');

  let sourceConn = null;
  let targetConn = null;

  try {
    console.log(`🔌 1. Connecting to Source (Atlas Cluster):`);
    console.log(`   ${SOURCE_ATLAS_URI.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')}`);
    sourceConn = await mongoose.createConnection(SOURCE_ATLAS_URI, {
      serverSelectionTimeoutMS: 15000,
    }).asPromise();
    console.log(`   ✅ Connected to Atlas DB: "${sourceConn.name}"\n`);

    console.log(`🔌 2. Connecting to Target (Local VPS MongoDB):`);
    console.log(`   ${TARGET_LOCAL_URI}`);
    targetConn = await mongoose.createConnection(TARGET_LOCAL_URI, {
      serverSelectionTimeoutMS: 15000,
    }).asPromise();
    console.log(`   ✅ Connected to Local DB: "${targetConn.name}"\n`);

    console.log('📦 3. Copying Collections from Atlas to Local VPS MongoDB:\n');

    const summary = {};

    for (const item of collections) {
      const colName = item.model.collection.name;
      const sourceCol = sourceConn.collection(colName);
      const targetCol = targetConn.collection(colName);

      const docs = await sourceCol.find({}).toArray();

      if (docs.length > 0) {
        // Clear target collection first
        await targetCol.deleteMany({});
        // Insert docs exactly as is
        await targetCol.insertMany(docs, { ordered: false });
        console.log(`   ✅ ${item.name} (${colName}): ${docs.length} documents copied.`);
        summary[item.name] = docs.length;
      } else {
        console.log(`   ℹ️  ${item.name} (${colName}): 0 documents found.`);
        summary[item.name] = 0;
      }
    }

    console.log('\n=====================================================');
    console.log('🔄 4. Updating backend/.env to use Local MongoDB...');

    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, 'utf-8');
      if (envContent.includes('MONGO_URI=')) {
        envContent = envContent.replace(/MONGO_URI=.*(\r?\n|$)/, `MONGO_URI=${TARGET_LOCAL_URI}$1`);
      } else {
        envContent = `MONGO_URI=${TARGET_LOCAL_URI}\n` + envContent;
      }
      fs.writeFileSync(envPath, envContent, 'utf-8');
      console.log(`   ✅ backend/.env updated to: MONGO_URI=${TARGET_LOCAL_URI}`);
    }

    console.log('\n=====================================================');
    console.log('🎉 MIGRATION COMPLETED SUCCESSFULLY!');
    console.log('=====================================================');
    console.log('Next Steps:');
    console.log('1. Run: pm2 restart all');
    console.log('2. Check your website at https://cdbportal.cloud');
    console.log('3. Once you verify everything works, you can SAFELY DELETE the MongoDB Atlas Cluster!');
    console.log('=====================================================\n');

  } catch (error) {
    console.error('\n❌ Migration Failed:', error.message);
    if (error.message.includes('ECONNREFUSED') && error.message.includes('127.0.0.1:27017')) {
      console.error('\n💡 Tip: Local MongoDB is not running on VPS.');
      console.error('   Start it using: systemctl start mongod && systemctl enable mongod');
    }
    process.exit(1);
  } finally {
    if (sourceConn) await sourceConn.close();
    if (targetConn) await targetConn.close();
    process.exit(0);
  }
}

migrate();
