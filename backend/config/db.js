const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/smt_local_db';
    const conn = await mongoose.connect(uri);
    console.log(`📡 MongoDB Connected: ${conn.connection.host}:${conn.connection.port || 27017} / DB: ${conn.connection.name}`);
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
