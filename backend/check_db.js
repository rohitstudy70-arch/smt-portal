require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const mongoose = require('mongoose');
const Device = require('./models/Device');

async function run() {
  try {
    const uri = process.env.MONGO_URI;
    console.log('Connecting to:', uri.split('@')[1] || uri); // print connection host only for safety
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');
    
    const devices = await Device.find({});
    console.log('Devices found:', devices.length);
    devices.forEach((dev, idx) => {
      console.log(`[Device ${idx + 1}] IMEI: ${dev.imei} | Vendor: ${dev.vendor} | BillAmount: ${dev.billAmount} | ITR No: ${dev.itrNo}`);
    });
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

run();
