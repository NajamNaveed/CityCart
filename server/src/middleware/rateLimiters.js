const rateLimit = require('express-rate-limit');

const env = require('../config/env');

/**
 * Rate limiting, per docs/06-authentication-and-security.md and
 * AGENTS.md (express-rate-limit is part of the approved stack).
 *
 * Disabled under test (NODE_ENV=test, which Jest sets) so the suites
 * don't trip limits; production/development are always limited.
 *
 * NOTE: behind a proxy (Render, Vercel) set `app.set('trust proxy', 1)`
 * — see app.js — otherwise every client shares the proxy's IP.
 */
const skip = () => env.nodeEnv === 'test';

const json429 = (message) => ({ success: false, message });

// Broad protection for the whole API.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip,
  message: json429('Too many requests. Please try again later.'),
});

// Strict limit for credential endpoints (brute-force / credential stuffing).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip,
  message: json429('Too many attempts. Please try again later.'),
});

// Money-moving endpoints (payment status / refunds) get their own tight cap.
const paymentWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip,
  message: json429('Too many payment updates. Please try again later.'),
});

module.exports = { apiLimiter, authLimiter, paymentWriteLimiter };
