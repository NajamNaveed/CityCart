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
  // Optional, comma-separated (e.g. "8.8.8.8,1.1.1.1"). Some networks block the DNS lookup
  // Atlas "mongodb+srv://" addresses need; naming a public DNS here works around that.
  mongodbDnsServers: (process.env.MONGODB_DNS_SERVERS || '')
    .split(',')
    .map((server) => server.trim())
    .filter(Boolean),
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  // Image hosting (Cloudinary). Optional: without all three, image upload
  // answers 503 and the dashboard falls back to "add an image by link".
  cloudinary: {
    cloudName: (process.env.CLOUDINARY_CLOUD_NAME || '').trim(),
    apiKey: (process.env.CLOUDINARY_API_KEY || '').trim(),
    apiSecret: (process.env.CLOUDINARY_API_SECRET || '').trim(),
  },
  // How long a terminated brand's staff keep (read-only) access, in hours.
  // 0 = cut off immediately. Capped at 30 days.
  terminationGraceHours: (() => {
    const raw = (process.env.TERMINATION_GRACE_HOURS || '').trim();
    const hours = Number(raw);
    return raw !== '' && Number.isFinite(hours) && hours >= 0 ? Math.min(hours, 720) : 24;
  })(),
};

module.exports = env;