require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Device = require('./models/Device');

async function seed() {
  try {
    const uri = process.env.MONGO_URI;
    console.log('Connecting to MongoDB...');
    await mongoose.connect(uri);
    console.log('Connected!');

    // 1. Find the admin/partner user to own the device
    const user = await User.findOne({});
    if (!user) {
      console.error('No users found in database! Please register or seed users first.');
      process.exit(1);
    }
    console.log(`Found owner user: ${user.username} (${user.role})`);

    const imei = '888888888888888';
    // Clean up existing test device if any
    await Device.deleteOne({ imei });

    // 2. Create the test device
    const device = await Device.create({
      userId: user._id,
      dealerId: user._id,
      dealerName: user.displayName || user.companyName || user.username,
      vendor: 'iTriangle',
      imei,
      imeiNumber: imei,
      iccid: '89911025065605711111',
      iccidNumber: '89911025065605711111',
      serialNo: imei,
      serialNumber: imei,
      msisdn1: '9876543210',
      msisdn2: '9876543211',
      itrNo: 'ITR-999-SEEDED',
      billAmount: 1300,
      validity: '1 Year',
      status: 'Active',
      presentDate: new Date(),
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      createdBy: user._id,
      createdByRole: user.role
    });

    console.log('Seeded Device successfully!');
    console.log({
      _id: device._id,
      imei: device.imei,
      itrNo: device.itrNo,
      vendor: device.vendor,
      dealerName: device.dealerName
    });

    process.exit(0);
  } catch (err) {
    console.error('Error seeding device:', err);
    process.exit(1);
  }
}

seed();
