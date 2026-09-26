/**
 * Centralized environment configuration.
 *
 * Phase 0 added the variables required to start the HTTP server and
 * configure CORS. Phase 1 adds MONGODB_URI for the database connection
 * (see ./db.js). Variables for later phases (JWT, Cloudinary, etc.) are
 * documented in `.env.example` but are not consumed by application code
 * yet.
 *
 * This module intentionally does not throw on a missing MONGODB_URI —
 * that validation happens in ./db.js so that app.js (routes, CORS, the
 * health check) stays importable without a database configured, e.g. for
 * future lightweight route testing.
 */

require('dotenv').config();

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  mongodbUri: process.env.MONGODB_URI || '',
};

module.exports = env;