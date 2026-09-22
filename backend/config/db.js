const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/smt_local_db';
    console.log(`🔌 Attempting MongoDB connection to: ${uri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')}`);
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
    });
    console.log(`📡 MongoDB Connected: ${conn.connection.host}:${conn.connection.port || 27017} / DB: ${conn.connection.name}`);
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
