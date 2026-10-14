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
  limit: env.nodeEnv === 'production' ? 1000 : 10000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip,
  message: json429('Too many requests. Please try again later.'),
});

// Strict limit for credential endpoints (brute-force / credential stuffing).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // Strict in production; relaxed locally so Postman/test runs aren't blocked.
  limit: env.nodeEnv === 'production' ? 10 : 100,
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

// Chat is user-to-user text, so spam is the abuse to stop. Limits are per
// signed-in user (not per IP, so a shared office or phone network is not
// punished) and these run after authenticate.
const perUser = (req) => String(req.user._id);

const chatSendLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  keyGenerator: perUser,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip,
  message: json429('You are sending messages too quickly. Please wait a moment.'),
});

// Opening a NEW conversation with a brand is rarer, so it is capped harder.
const chatStartLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 15,
  keyGenerator: perUser,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip,
  message: json429('You have started too many conversations. Please try again later.'),
});

module.exports = { apiLimiter, authLimiter, paymentWriteLimiter, chatSendLimiter, chatStartLimiter };
