/**
 * Centralized environment configuration.
 *
 * Phase 0 added the variables required to start the HTTP server and
 * configure CORS. Phase 1 added MONGODB_URI for the database connection
 * (see ./db.js). This authentication pass adds JWT_SECRET/JWT_EXPIRES_IN
 * (see ./cookie.js and ../utils/jwt.js). Variables for later phases
 * (Cloudinary, etc.) are documented in `.env.example` but are not
 * consumed by application code yet.
 *
 * This module intentionally does not throw on a missing MONGODB_URI or
 * JWT_SECRET — that validation happens where each is actually used
 * (./db.js, ../utils/jwt.js) so that app.js (routes, CORS, the health
 * check) stays importable without a database or JWT secret configured,
 * e.g. for future lightweight route testing.
 */

require('dotenv').config();

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  mongodbUri: process.env.MONGODB_URI || '',
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
};

module.exports = env;