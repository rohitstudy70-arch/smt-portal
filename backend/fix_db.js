require('dotenv').config({ path: './.env' });
const mongoose = require('mongoose');
const Device = require('./models/Device');

async function run() {
  try {
    const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/smt_portal';
    await mongoose.connect(uri);
    console.log('Connected to MongoDB at:', uri.split('@').pop().split('/')[0]);
    
    // Find devices where presentDate is missing and set it to createdAt
    const result = await Device.updateMany(
      { presentDate: { $exists: false } },
      [ { $set: { presentDate: "$createdAt" } } ]
    );
    
    console.log('Successfully fixed devices missing presentDate:', result.modifiedCount);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

run();
