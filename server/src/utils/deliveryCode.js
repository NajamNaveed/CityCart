const crypto = require('crypto');

/**
 * Proof-of-delivery code (docs/11 §19). The customer reads it out when the
 * order arrives and the rider types it into the partner app; only then can the
 * rider mark the delivery as delivered (and, for cash on delivery, collected).
 */
const CODE_LENGTH = 6;
// A code locks after this many wrong tries; the brand can still complete the
// delivery from the dashboard after speaking to the customer.
const MAX_CODE_ATTEMPTS = 5;

function generateDeliveryCode() {
  return String(crypto.randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');
}

const CODE_PATTERN = new RegExp(`^[0-9]{${CODE_LENGTH}}$`);

// Constant-time comparison so the check leaks nothing about the stored code.
function codesMatch(stored, given) {
  const a = Buffer.from(String(stored || ''));
  const b = Buffer.from(String(given || ''));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

module.exports = { CODE_LENGTH, CODE_PATTERN, MAX_CODE_ATTEMPTS, generateDeliveryCode, codesMatch };
