const mongoose = require('mongoose');

const connectDB = async () => {
  const primaryUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  const fallbackUri =
    process.env.MONGODB_FALLBACK_URI || 'mongodb://127.0.0.1:27017/whatsapp-replicate';

  if (!primaryUri) {
    console.error('MongoDB connection error: Missing MONGODB_URI (or MONGO_URI) in backend/.env');
    process.exit(1);
  }

  try {
    const conn = await mongoose.connect(primaryUri, { serverSelectionTimeoutMS: 7000 });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return;
  } catch (primaryError) {
    console.warn('Primary MongoDB connection failed. Trying local fallback...');

    try {
      const fallbackConn = await mongoose.connect(fallbackUri, { serverSelectionTimeoutMS: 4000 });
      console.log(`MongoDB Connected (fallback): ${fallbackConn.connection.host}`);
      return;
    } catch (fallbackError) {
      console.error(
        'MongoDB connection error: failed to connect to primary and fallback URIs. ' +
          'If you use Atlas, add your IP in Atlas Network Access.'
      );
      process.exit(1);
    }
  }
};

module.exports = connectDB;