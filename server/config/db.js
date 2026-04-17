// MongoDB connection setup
const mongoose = require('mongoose');

const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    console.warn('MONGO_URI is missing. Continuing without MongoDB connection.');
    return;
  }

  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10_000,
    });
    console.log('MongoDB connected');
  } catch (err) {
    const code = err && typeof err.code !== 'undefined' ? String(err.code) : 'unknown';
    console.warn(`MongoDB connection failed (code: ${code}): ${err.message}`);
    console.warn(
      [
        'Fix tips:',
        '- If using MongoDB Atlas: verify username/password in MONGO_URI, and ensure your IP is allowed in Atlas Network Access.',
        '- If using local MongoDB with auth enabled: include username/password and authSource (often "admin") in MONGO_URI.',
      ].join('\n')
    );
    console.warn('Backend will continue without MongoDB (custom products cannot be saved).');
  }
};

module.exports = connectDB;
