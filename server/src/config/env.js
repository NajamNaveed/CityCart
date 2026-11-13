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
  // AI agents (docs/27). Off unless AI_ENABLED=true, so a fresh checkout never
  // calls a provider and every AI endpoint answers 503 AI_UNAVAILABLE.
  // Providers are tried in AI_PROVIDER_ORDER; one without a key is skipped.
  // Model names live here because providers rename and retire them often.
  ai: {
    enabled: (process.env.AI_ENABLED || '').trim().toLowerCase() === 'true',
    requestTimeoutMs: (() => {
      const ms = Number((process.env.AI_REQUEST_TIMEOUT_MS || '').trim());
      return Number.isFinite(ms) && ms >= 1000 ? Math.min(ms, 60000) : 15000;
    })(),
    providerOrder: (() => {
      const known = ['gemini', 'groq', 'openrouter'];
      const requested = (process.env.AI_PROVIDER_ORDER || known.join(','))
        .split(',')
        .map((name) => name.trim().toLowerCase())
        .filter((name) => known.includes(name));
      const order = [...new Set(requested)];
      return order.length > 0 ? order : known;
    })(),
    // Generations allowed per user per UTC day (docs/27 §3.2).
    dailyLimit: (() => {
      const limit = Number((process.env.AI_USER_DAILY_LIMIT || '').trim());
      return Number.isFinite(limit) && limit >= 1 ? Math.min(limit, 1000) : 30;
    })(),
    gemini: {
      apiKey: (process.env.GEMINI_API_KEY || '').trim(),
      model: (process.env.GEMINI_MODEL || 'gemini-2.0-flash').trim(),
    },
    groq: {
      apiKey: (process.env.GROQ_API_KEY || '').trim(),
      model: (process.env.GROQ_MODEL || 'llama-3.3-70b-versatile').trim(),
    },
    openrouter: {
      apiKey: (process.env.OPENROUTER_API_KEY || '').trim(),
      model: (process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free').trim(),
    },
  },
  // Push notifications to the Partner app (docs/12 §31). Off unless PUSH_ENABLED=true, so development and
  // tests never call the push service. EXPO_ACCESS_TOKEN is optional (Expo's "enhanced security").
  push: {
    enabled: (process.env.PUSH_ENABLED || '').trim().toLowerCase() === 'true',
    accessToken: (process.env.EXPO_ACCESS_TOKEN || '').trim(),
  },
  // Transactional email (email verification and password reset). Sent over
  // Brevo's HTTPS API because Render's free plan blocks outbound SMTP ports.
  // Without an API key and sender, links are logged to the console in
  // development and delivery is reported as unavailable in production.
  email: {
    brevoApiKey: (process.env.BREVO_API_KEY || '').trim(),
    fromEmail: (process.env.EMAIL_FROM || '').trim(),
    fromName: (process.env.EMAIL_FROM_NAME || 'CityCart').trim(),
    verifyTtlHours: (() => {
      const hours = Number((process.env.EMAIL_VERIFY_TTL_HOURS || '').trim());
      return Number.isFinite(hours) && hours >= 1 ? Math.min(hours, 168) : 24;
    })(),
    resetTtlMinutes: (() => {
      const minutes = Number((process.env.PASSWORD_RESET_TTL_MINUTES || '').trim());
      return Number.isFinite(minutes) && minutes >= 5 ? Math.min(minutes, 1440) : 60;
    })(),
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
  // Cloudinary retentionDays after the brand verified or rejected it. A
  // non-cash collection must be confirmed within confirmationMinutes or that
  // attempt fails and the rider collects again (docs/10 §31.3).
  paymentProof: {
    linkMinutes: (() => {
      const minutes = Number((process.env.PAYMENT_PROOF_LINK_MINUTES || '').trim());
      return Number.isFinite(minutes) && minutes >= 1 ? Math.min(minutes, 60) : 5;
    })(),
    confirmationMinutes: (() => {
      const minutes = Number((process.env.PAYMENT_CONFIRMATION_MINUTES || '').trim());
      return Number.isFinite(minutes) && minutes >= 1 ? Math.min(minutes, 60) : 5;
    })(),
    retentionDays: (() => {
      const days = Number((process.env.PAYMENT_PROOF_RETENTION_DAYS || '').trim());
      return Number.isFinite(days) && days >= 1 ? Math.min(days, 3650) : 90;
    })(),
  },
};

module.exports = env;