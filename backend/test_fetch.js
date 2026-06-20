require('dotenv').config();
const mongoose = require('mongoose');
const Device = require('./models/Device');

async function test() {
  try {
    const uri = process.env.MONGO_URI;
    console.log('Connecting to:', uri.split('@')[1] || uri);
    await mongoose.connect(uri);
    console.log('Connected!');

    const imei = '888888888888888';
    await Device.deleteOne({ imei });

    // 1. Create device
    const dev = await Device.create({
      userId: new mongoose.Types.ObjectId(),
      imei,
      serialNo: imei,
      iccid: '11111111111111111111',
      itrNo: 'ITR-TEST-999',
      vendor: 'iTriangle',
      billAmount: 1300,
      validity: '1 Year'
    });

    console.log('Created Device ITR:', dev.itrNo);

    // 2. Fetch via find() similar to backend router
    const found = await Device.findOne({ imei });
    console.log('Fetched Device object keys:', Object.keys(found.toObject()));
    console.log('Fetched Device ITR:', found.itrNo);

    await Device.deleteOne({ imei });
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

test();
