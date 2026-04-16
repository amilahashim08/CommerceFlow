// MongoDB connection setup
const mongoose = require('mongoose');

const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    console.warn('MONGO_URI is missing. Continuing without MongoDB connection.');
    return;
  }

  try {
    await mongoose.connect(mongoUri);
    console.log('MongoDB connected');
  } catch (err) {
    console.warn(`MongoDB connection failed: ${err.message}`);
    console.warn('Backend will continue without MongoDB.');
  }
};

module.exports = connectDB;
