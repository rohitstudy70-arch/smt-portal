const mongoose = require('mongoose');
const Device = require('./backend/models/Device');

async function run() {
  try {
    // Read the mongo connection string from backend/server.js or check env
    const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/smt-portal';
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');
    
    const devices = await Device.find({}).limit(10);
    console.log('Devices found:', devices.length);
    devices.forEach((dev, idx) => {
      console.log(`[Device ${idx + 1}] IMEI: ${dev.imei} | Vendor: ${dev.vendor} | BillAmount: ${dev.billAmount}`);
    });
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

run();
