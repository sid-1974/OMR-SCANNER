const mongoose = require('mongoose');
const env = require('./env');

const connectDB = async () => {
  if (mongoose.connection.readyState >= 1) {
    return; // Already connected or connecting
  }

  try {
    const conn = await mongoose.connect(env.mongoUri, {
      serverSelectionTimeoutMS: 5000, // Fail fast after 5s instead of waiting 30s (causes Vercel 10s timeout)
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`MongoDB connection error: ${error.message}`);
    // Do not exit process in serverless environments
    if (process.env.NODE_ENV !== 'production') {
      process.exit(1);
    }
  }
};

module.exports = connectDB;
