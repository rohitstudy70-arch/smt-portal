require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function run() {
  try {
    const uri = process.env.MONGO_URI;
    console.log('Connecting to:', uri);
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');

    const users = await User.find({}).select('username role userType parentId displayName');
    console.log('Total Users:', users.length);
    users.forEach((u) => {
      console.log(`ID: ${u._id} | User: ${u.username} | Display: ${u.displayName} | Role: ${u.role} | Type: ${u.userType} | Parent: ${u.parentId}`);
    });

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

run();
