const mongoose = require('mongoose');

const env = require('./env');

/**
 * Connects to MongoDB via Mongoose.
 *
 * Throws if MONGODB_URI is missing or the connection attempt fails, so the
 * caller (server.js) can stop startup before the HTTP server begins
 * accepting requests. This is intentionally the only place that validates
 * MONGODB_URI (see env.js).
 */
async function connectDB() {
  if (!env.mongodbUri) {
    throw new Error(
      'MONGODB_URI is not set. Add it to server/.env (see .env.example).'
    );
  }

  // Logged once here rather than attached repeatedly on reconnect attempts.
  mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err.message);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected.');
  });

  await mongoose.connect(env.mongodbUri, {
    // Fail reasonably fast on an unreachable/misconfigured database instead
    // of hanging on Mongoose's default 30s server selection timeout.
    serverSelectionTimeoutMS: 10000,
  });

  return mongoose.connection;
}

/**
 * Closes the Mongoose connection. Safe to call even if connectDB() never
 * succeeded (e.g. during shutdown after a failed startup).
 */
async function disconnectDB() {
  await mongoose.disconnect();
}

module.exports = { connectDB, disconnectDB };