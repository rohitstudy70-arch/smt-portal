require('dotenv').config();
const mongoose = require('mongoose');
const Device = require('./models/Device');

async function test() {
  try {
    const uri = process.env.MONGO_URI;
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');

    // Create a dummy device
    const testImei = '999998888877777';
    // Clean up if exists
    await Device.deleteOne({ imei: testImei });

    const newDevice = await Device.create({
      userId: '658123456789012345678901', // dummy ObjectId
      dealerId: '658123456789012345678902',
      dealerName: 'Test Dealer',
      vendor: 'iTriangle',
      imei: testImei,
      imeiNumber: testImei,
      iccid: '89911025065605711111',
      iccidNumber: '89911025065605711111',
      serialNo: '999998888877777',
      serialNumber: '999998888877777',
      billAmount: 1250,
      validity: '1 Year'
    });

    console.log('Successfully created test device!');
    console.log('Saved Vendor:', newDevice.vendor);
    console.log('Saved Bill Amount:', newDevice.billAmount);

    // Fetch from DB to verify
    const fetched = await Device.findOne({ imei: testImei });
    console.log('Fetched Vendor:', fetched.vendor);
    console.log('Fetched Bill Amount:', fetched.billAmount);

    // Clean up
    await Device.deleteOne({ imei: testImei });
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

test();
