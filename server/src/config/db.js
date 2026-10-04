const dns = require('dns');
const mongoose = require('mongoose');

const env = require('./env');

/**
 * Turns the driver's connection errors into a plain-English next step.
 * Returns '' when the error is not one of the well-known setup problems.
 */
function describeConnectionError(err) {
  const text = `${(err && err.name) || ''} ${(err && err.code) || ''} ${(err && err.message) || ''}`;

  if (/MONGODB_URI is not set/i.test(text)) {
    return 'Create server/.env (copy server/.env.example) and put your MongoDB connection string in MONGODB_URI.';
  }
  if (/bad auth|authentication failed|AuthenticationFailed/i.test(text)) {
    return 'The database username or password in MONGODB_URI is wrong. If the password contains special characters (@ : / ? # %), they must be URL-encoded.';
  }
  if (/querySrv|ENOTFOUND|EAI_AGAIN/i.test(text)) {
    return (
      'This computer could not look up the database address (a DNS problem, common on some networks). Try one of: ' +
      '(1) add MONGODB_DNS_SERVERS=8.8.8.8,1.1.1.1 to server/.env; ' +
      '(2) use the long "mongodb://" connection string from Atlas (Connect > Drivers) instead of "mongodb+srv://"; ' +
      '(3) switch network or use a VPN.'
    );
  }
  if (/ECONNREFUSED/i.test(text)) {
    return 'Nothing is listening at the database address. If you use a local MongoDB, start it first; if you use Atlas, check the address in MONGODB_URI.';
  }
  if (/server selection timed out|ServerSelection|ReplicaSetNoPrimary|whitelist/i.test(text)) {
    return 'The database did not answer. On MongoDB Atlas, open Network Access and add your current IP address (or 0.0.0.0/0 while developing), then try again. Also check that the cluster is not paused.';
  }
  return '';
}

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

  if (env.mongodbDnsServers.length > 0) {
    dns.setServers(env.mongodbDnsServers);
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

module.exports = { connectDB, disconnectDB, describeConnectionError };