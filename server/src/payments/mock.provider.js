const crypto = require('crypto');
const env = require('../config/env');

/**
 * The built-in TEST gateway (docs/10 §29). It behaves like a real hosted-checkout
 * gateway so the whole online-payment flow can be developed, demonstrated and tested
 * before a merchant account exists: it hands out a checkout page, and tells the server
 * about the result with a SIGNED notification that goes through exactly the same
 * verification and processing as a real gateway's. It is refused in production.
 *
 * A real provider is one more file next to this one with the same four members
 * (name, label, createCheckout, verifyWebhook); nothing else in the system changes.
 */
const SIGNATURE_HEADER = 'x-citycart-signature';

const sign = (rawBody) => `sha256=${crypto.createHmac('sha256', env.payments.webhookSecret).update(rawBody).digest('hex')}`;

class WebhookError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function baseUrl() {
  return env.payments.publicApiUrl || `http://localhost:${env.port}`;
}

/**
 * Starts a payment session. Reuses the payment's reference if it already has one from
 * this provider, so a customer who opens "Pay" twice still pays one payment.
 */
function createCheckout({ payment }) {
  const reference = payment.provider === 'mock' && payment.transactionReference ? payment.transactionReference : `mock_${crypto.randomUUID()}`;
  return { reference, checkoutUrl: `${baseUrl()}/api/v1/payments/mock-checkout/${reference}` };
}

// Verifies the signature over the RAW body (before parsing anything) and returns the
// notification in the one shape the payment service understands.
function verifyWebhook(rawBody, headers) {
  const given = String(headers[SIGNATURE_HEADER] || '');
  const expected = sign(rawBody);
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new WebhookError(401, 'Invalid signature.');
  }
  let body;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw new WebhookError(400, 'Invalid body.');
  }
  const { eventId, reference, status, amount, currency } = body || {};
  if (!eventId || !reference || !['PAID', 'FAILED'].includes(status) || typeof amount !== 'number' || !currency) {
    throw new WebhookError(400, 'Invalid notification.');
  }
  return { eventId: String(eventId), reference: String(reference), status, amount, currency: String(currency) };
}

// Used by the mock checkout page to tell the server about the customer's choice.
function buildSignedEvent({ reference, status, amount, currency }) {
  const rawBody = Buffer.from(JSON.stringify({ eventId: `evt_${crypto.randomUUID()}`, reference, status, amount, currency }));
  return { rawBody, headers: { [SIGNATURE_HEADER]: sign(rawBody) } };
}

module.exports = { name: 'mock', label: 'Online payment (test gateway)', createCheckout, verifyWebhook, buildSignedEvent, WebhookError, SIGNATURE_HEADER };
