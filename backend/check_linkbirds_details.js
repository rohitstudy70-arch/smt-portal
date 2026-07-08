require('dotenv').config();
const mongoose = require('mongoose');
const Device = require('./models/Device');

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://rohitstudy70_db_user:UkTQ7NsQChvV6b2q@cluster0.egh9cim.mongodb.net/?appName=Cluster0';

async function main() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const sample = await Device.findOne({
      dealerId: '6a34ec050ddbf0acd4825a05',
      assignedTo: null
    });
    console.log('Sample device with dealerId set and assignedTo null:');
    console.log(JSON.stringify(sample, null, 2));

    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

main();
