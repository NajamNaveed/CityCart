/**
 * Centralized environment configuration.
 *
 * Phase 0 scope: only the variables required to start the HTTP server and
 * configure CORS are read here. Variables for later phases (JWT, Cloudinary,
 * MongoDB connection, etc.) are documented in `.env.example` but are not
 * consumed by application code yet.
 */

require('dotenv').config();

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
};

module.exports = env;
