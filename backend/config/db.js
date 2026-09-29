const mongoose = require('mongoose');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const connectDB = async () => {
  let retryCount = 0;
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/smt_local_db';
  const maskedUri = uri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');

  while (true) {
    try {
      console.log(`🔌 Attempting MongoDB connection to: ${maskedUri} (Attempt ${retryCount + 1})...`);
      const conn = await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
      });
      console.log(`📡 MongoDB Connected: ${conn.connection.host}:${conn.connection.port || 27017} / DB: ${conn.connection.name}`);
      return conn;
    } catch (error) {
      retryCount++;
      // Exponential backoff: 5s, 10s, 15s, up to max 30s
      const delayMs = Math.min(5000 * retryCount, 30000);
      console.error(`❌ MongoDB Connection Error (${error.message}). Retrying in ${Math.round(delayMs / 1000)}s...`);

      // Never call process.exit(1) in a tight loop to prevent PM2 CPU spike
      await sleep(delayMs);
    }
  }
};

module.exports = connectDB;
