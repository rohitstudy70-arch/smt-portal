/**
 * resync_all_dealers.js
 * 
 * Saare dealers ki DealerDue records ko naye fixed logic se re-sync karta hai.
 * Total Devices (saare assign kiye hue) = Total Purchase Revenue
 * 
 * Run: node resync_all_dealers.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const { syncDueForUser } = require('./services/dueService');

const MONGO_URI = process.env.MONGO_URI;

const run = async () => {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected!\n');

    // Saare dealers aur sub-dealers fetch karo
    const dealers = await User.find({
      $or: [
        { userType: 'Dealer' },
        { userType: 'Sub Dealer' },
        { role: 'dealer' },
        { role: 'sub_dealer' },
      ]
    }).select('_id displayName companyName username userType role').lean();

    console.log(`📦 Total dealers found: ${dealers.length}\n`);

    let success = 0;
    let failed = 0;

    for (const dealer of dealers) {
      const name = dealer.companyName || dealer.displayName || dealer.username || dealer._id;
      try {
        const record = await syncDueForUser(dealer._id);
        if (record) {
          console.log(`✅ ${name.padEnd(30)} | Devices: ${record.totalDevicesAssigned} | Purchase Revenue: ₹${record.totalBillAmount} | Outstanding: ₹${record.totalOutstanding}`);
          success++;
        } else {
          console.log(`⚠️  ${name.padEnd(30)} | Skipped (not a dealer role)`);
        }
      } catch (err) {
        console.log(`❌ ${name.padEnd(30)} | Error: ${err.message}`);
        failed++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`✅ Success: ${success} | ❌ Failed: ${failed}`);
    console.log('🎉 Re-sync complete!');

  } catch (err) {
    console.error('❌ Fatal error:', err.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB.');
  }
};

run();
