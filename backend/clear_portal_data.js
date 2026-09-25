/**
 * clear_portal_data.js
 * 
 * Ye script CDB Portal ka saara operational aur transaction data clean karti hai:
 * - Devices
 * - Products
 * - Activation Requests
 * - Renewal Requests
 * - Invoices & Proforma Bills
 * - Transactions (Ledger)
 * - Dealer Dues & Due Payments
 * - Payment Verification Requests
 * - Audit Logs
 * 
 * NOTE: Sabhi Users / Dealers / Admins ke accounts SAFE rahenge (delete nahi honge),
 * sirf unke balance / dues reset ho jayenge.
 * 
 * Run: node clear_portal_data.js [optional_mongo_uri]
 */

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Explicitly load .env from backend directory
dotenv.config({ path: path.join(__dirname, '.env') });
if (fs.existsSync(path.join(__dirname, '.env.local'))) {
  dotenv.config({ path: path.join(__dirname, '.env.local'), override: true });
}

const mongoose = require('mongoose');

const User = require('./models/User');
const Device = require('./models/Device');
const Product = require('./models/Product');
const ActivationRequest = require('./models/ActivationRequest');
const RenewalRequest = require('./models/RenewalRequest');
const Transaction = require('./models/Transaction');
const Invoice = require('./models/Invoice');
const DealerDue = require('./models/DealerDue');
const DuePayment = require('./models/DuePayment');
const PaymentVerificationRequest = require('./models/PaymentVerificationRequest');
const AuditLog = require('./models/AuditLog');

const MONGO_URI = process.argv[2] || process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/smt_portal';

async function clearData() {
  try {
    console.log(`🔌 Attempting MongoDB connection to: ${MONGO_URI.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')}`);
    const conn = await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 15000,
    });
    console.log(`📡 MongoDB Connected: Host: ${conn.connection.host} | DB: ${conn.connection.name}\n`);

    console.log('🗑️  Starting data cleanup process (Keeping User & Dealer Accounts Safe)...\n');

    // 1. Devices
    const devRes = await Device.deleteMany({});
    console.log(`✅ Devices deleted: ${devRes.deletedCount}`);

    // 2. Products
    const prodRes = await Product.deleteMany({});
    console.log(`✅ Products deleted: ${prodRes.deletedCount}`);

    // 3. Activation Requests
    const actRes = await ActivationRequest.deleteMany({});
    console.log(`✅ Activation Requests deleted: ${actRes.deletedCount}`);

    // 4. Renewal Requests
    const renRes = await RenewalRequest.deleteMany({});
    console.log(`✅ Renewal Requests deleted: ${renRes.deletedCount}`);

    // 5. Invoices
    const invRes = await Invoice.deleteMany({});
    console.log(`✅ Invoices & Bills deleted: ${invRes.deletedCount}`);

    // 6. Transactions
    const txRes = await Transaction.deleteMany({});
    console.log(`✅ Ledger Transactions deleted: ${txRes.deletedCount}`);

    // 7. Dealer Dues
    const dueRes = await DealerDue.deleteMany({});
    console.log(`✅ Dealer Dues records deleted: ${dueRes.deletedCount}`);

    // 8. Due Payments
    const payRes = await DuePayment.deleteMany({});
    console.log(`✅ Due Payments deleted: ${payRes.deletedCount}`);

    // 9. Payment Verification Requests
    const pvrRes = await PaymentVerificationRequest.deleteMany({});
    console.log(`✅ Payment Verification Requests deleted: ${pvrRes.deletedCount}`);

    // 10. Audit Logs
    const logRes = await AuditLog.deleteMany({});
    console.log(`✅ Audit Logs deleted: ${logRes.deletedCount}`);

    // 11. Reset User Balances to 0 (Keep all accounts intact)
    const userUpdateRes = await User.updateMany({}, {
      $set: {
        availableBalance: 0,
        overDrawnAmount: 0,
      }
    });
    console.log(`✅ Users balance reset to ₹0: ${userUpdateRes.modifiedCount} accounts updated (All login accounts preserved).`);

    // Check if 0 items were deleted and if another local database might exist
    if (devRes.deletedCount === 0 && conn.connection.host === '127.0.0.1') {
      try {
        const adminDb = conn.connection.db.admin();
        const dbsList = await adminDb.listDatabases();
        console.log('\nℹ️ Databases found on this MongoDB server:', dbsList.databases.map(d => d.name));
        
        // If smt_local_db exists and current is smt_portal (or vice versa), check it
        const otherDbName = conn.connection.name === 'smt_portal' ? 'smt_local_db' : (conn.connection.name === 'smt_local_db' ? 'smt_portal' : null);
        if (otherDbName && dbsList.databases.some(d => d.name === otherDbName)) {
          console.log(`🔍 Checking "${otherDbName}" database for devices...`);
          const otherConn = await mongoose.createConnection(`mongodb://127.0.0.1:27017/${otherDbName}`).asPromise();
          const otherDevCount = await otherConn.collection('devices').countDocuments();
          console.log(`   Found ${otherDevCount} devices in "${otherDbName}".`);
          if (otherDevCount > 0) {
            console.log(`🧹 Clearing "${otherDbName}" as well...`);
            await otherConn.collection('devices').deleteMany({});
            await otherConn.collection('products').deleteMany({});
            await otherConn.collection('activationrequests').deleteMany({});
            await otherConn.collection('renewalrequests').deleteMany({});
            await otherConn.collection('invoices').deleteMany({});
            await otherConn.collection('transactions').deleteMany({});
            await otherConn.collection('dealerdues').deleteMany({});
            await otherConn.collection('duepayments').deleteMany({});
            await otherConn.collection('auditlogs').deleteMany({});
            await otherConn.collection('users').updateMany({}, { $set: { availableBalance: 0, overDrawnAmount: 0 } });
            console.log(`✅ "${otherDbName}" database also cleaned!`);
          }
          await otherConn.close();
        }
      } catch (e) {
        // Ignore admin db listing if unauthorized
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('🎉 ALL OPERATIONAL DATA HAS BEEN SUCCESSFULLY CLEARED!');
    console.log('🛡️  All Admin, Dealer, and User accounts remain safe and active.');
    console.log('='.repeat(60) + '\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error while clearing data:', error);
    process.exit(1);
  }
}

clearData();
