/**
 * Parses a simple duration string like "7d", "12h", "30m", or "45s" into
 * milliseconds. Supports only single-unit values, which is all
 * JWT_EXPIRES_IN needs to express for this project's env format
 * (see .env.example).
 *
 * This exists so the auth cookie's maxAge (config/cookie.js) can be
 * derived from the same JWT_EXPIRES_IN value the JWT itself uses,
 * instead of a second hardcoded number that could silently drift out of
 * sync with the token's real lifetime.
 */
const UNIT_TO_MS = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

function parseDurationToMs(duration, fallbackMs) {
  if (typeof duration === 'number') {
    return duration;
  }

  const match = /^(\d+)(s|m|h|d)$/.exec(String(duration).trim());
  if (!match) {
    return fallbackMs;
  }

  const [, amount, unit] = match;
  return Number(amount) * UNIT_TO_MS[unit];
}

module.exports = { parseDurationToMs };