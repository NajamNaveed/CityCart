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
  // Auth cookie SameSite policy. The documented deployment architecture
  // (docs/17) puts the client on Vercel and the API on Render — separate
  // domains — so production defaults to 'none' (browsers only store
  // cross-domain auth cookies with SameSite=None; Secure, which production
  // always sets). Localhost development is same-site, so it stays 'lax'.
  // Override with COOKIE_SAMESITE=lax|strict|none when client and API end
  // up on the same domain.
  cookieSameSite: (() => {
    const raw = (process.env.COOKIE_SAMESITE || '').trim().toLowerCase();
    if (raw === 'none' || raw === 'lax' || raw === 'strict') return raw;
    return process.env.NODE_ENV === 'production' ? 'none' : 'lax';
  })(),
  // Staff (brand dashboard + platform admin) sessions are short-lived and
  // renewed on activity; shoppers keep the full-length session. Hours,
  // capped at 7 days.
  staffSessionHours: (() => {
    const raw = (process.env.STAFF_SESSION_HOURS || '').trim();
    const hours = Number(raw);
    return raw !== '' && Number.isFinite(hours) && hours > 0 ? Math.min(hours, 168) : 8;
  })(),
  // Image hosting (Cloudinary). Optional: without all three, image upload
  // answers 503 and the dashboard falls back to "add an image by link".
  cloudinary: {
    cloudName: (process.env.CLOUDINARY_CLOUD_NAME || '').trim(),
    apiKey: (process.env.CLOUDINARY_API_KEY || '').trim(),
    apiSecret: (process.env.CLOUDINARY_API_SECRET || '').trim(),
  },
  // Online payments (docs/10 §29). `provider` is 'none' until a gateway is set up; 'mock' is
  // a built-in TEST gateway for development and demos and is refused in production.
  // The webhook secret signs and verifies gateway notifications. The hold is how long
  // stock is kept for an online order that has not been paid yet.
  payments: {
    provider: (process.env.PAYMENT_PROVIDER || 'none').trim().toLowerCase(),
    webhookSecret: (process.env.PAYMENT_WEBHOOK_SECRET || '').trim(),
    publicApiUrl: (process.env.PUBLIC_API_URL || '').trim().replace(/\/+$/, ''),
    holdMinutes: (() => {
      const minutes = Number((process.env.ONLINE_PAYMENT_HOLD_MINUTES || '').trim());
      return Number.isFinite(minutes) && minutes >= 5 ? Math.min(minutes, 240) : 30;
    })(),
  },
  // Push notifications to the Partner app (docs/12 §31). Off unless PUSH_ENABLED=true, so development and
  // tests never call the push service. EXPO_ACCESS_TOKEN is optional (Expo's "enhanced security").
  push: {
    enabled: (process.env.PUSH_ENABLED || '').trim().toLowerCase() === 'true',
    accessToken: (process.env.EXPO_ACCESS_TOKEN || '').trim(),
  },
  // How long a terminated brand's staff keep (read-only) access, in hours.
  // 0 = cut off immediately. Capped at 30 days.
  terminationGraceHours: (() => {
    const raw = (process.env.TERMINATION_GRACE_HOURS || '').trim();
    const hours = Number(raw);
    return raw !== '' && Number.isFinite(hours) && hours >= 0 ? Math.min(hours, 720) : 24;
  })(),
  // Payment proof photos at the door (docs/21 §I.4). A staff member sees a proof
  // through a signed link valid for linkMinutes; the photo is deleted from
  // Cloudinary retentionDays after the brand verified or rejected it.
  paymentProof: {
    linkMinutes: (() => {
      const minutes = Number((process.env.PAYMENT_PROOF_LINK_MINUTES || '').trim());
      return Number.isFinite(minutes) && minutes >= 1 ? Math.min(minutes, 60) : 5;
    })(),
    retentionDays: (() => {
      const days = Number((process.env.PAYMENT_PROOF_RETENTION_DAYS || '').trim());
      return Number.isFinite(days) && days >= 1 ? Math.min(days, 3650) : 90;
    })(),
  },
};

module.exports = env;