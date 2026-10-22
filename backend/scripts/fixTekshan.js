const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/smt_portal';

async function run() {
  try {
    console.log('Connecting to MongoDB at:', uri);
    await mongoose.connect(uri);

    const User = require('../models/User');
    const Device = require('../models/Device');
    const Product = require('../models/Product');
    const DealerDue = require('../models/DealerDue');

    const matchedUsers = await User.find({
      $or: [
        { displayName: { $regex: /Tekshan/i } },
        { companyName: { $regex: /Tekshan/i } },
        { username: { $regex: /Tekshan/i } },
        { mobileNo: '7282884422' },
        { companyName: 'Rohit Enterprises', mobileNo: '7282884422' }
      ]
    });

    console.log(`Found ${matchedUsers.length} user(s) matching Tekshan / 7282884422:`);

    for (const u of matchedUsers) {
      console.log(`Updating User _id: ${u._id}, old companyName: "${u.companyName}", old displayName: "${u.displayName}"`);
      u.companyName = 'Tekshan Indicom Private Limited';
      if (!u.displayName || u.displayName === 'Rohit Enterprises') {
        u.displayName = 'Tekshan Indicom Private Limited';
      }
      await u.save();
      console.log(` -> Set companyName & displayName to "Tekshan Indicom Private Limited"`);

      const devRes = await Device.updateMany({ dealerId: u._id }, { $set: { dealerName: 'Tekshan Indicom Private Limited' } });
      const prodRes = await Product.updateMany({ dealerId: u._id }, { $set: { dealerName: 'Tekshan Indicom Private Limited' } });
      const dueRes = await DealerDue.updateMany({ dealerId: u._id }, { $set: { dealerName: 'Tekshan Indicom Private Limited' } });

      console.log(` -> Synced to ${devRes.modifiedCount} Devices, ${prodRes.modifiedCount} Products, ${dueRes.modifiedCount} DealerDues`);
    }

    console.log('✅ Done! All Tekshan Indicom records have been successfully updated.');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

run();
