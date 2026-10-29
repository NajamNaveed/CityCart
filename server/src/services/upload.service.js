const crypto = require('crypto');

const env = require('../config/env');

class UploadError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Only these formats may be uploaded (Cloudinary enforces this: it is part of the signature).
const ALLOWED_FORMATS = 'jpg,png,webp';

// "your_cloud_name" etc. are the placeholders in .env.example: treat them as not set up.
function isConfigured(config) {
  return ['cloudName', 'apiKey', 'apiSecret'].every((key) => {
    const value = config && config[key];
    return typeof value === 'string' && value !== '' && !value.startsWith('your_');
  });
}

/**
 * Cloudinary signature: sort the signed parameters alphabetically, join them as
 * name=value pairs with "&", append the API secret, and take the SHA-1 hex digest.
 * (Not an HMAC.) The file, api_key, cloud_name and resource_type are never signed.
 */
function signParams(params, apiSecret) {
  const toSign = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return crypto.createHash('sha1').update(toSign + apiSecret).digest('hex');
}

// Cloudinary's API-signature version 2 encodes "&" inside a value before hashing
// (its own SDK does exactly this). Used for API calls whose values may contain it.
function signApiParams(params, apiSecret) {
  const toSign = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .sort()
    .map((key) => `${key}=${String(params[key]).replace(/&/g, '%26')}`)
    .join('&');
  return crypto.createHash('sha1').update(toSign + apiSecret).digest('hex');
}

/**
 * Lets the browser upload ONE product image straight to Cloudinary without ever seeing
 * the API secret. The folder is derived from the caller's own brand (never from client
 * input), so a brand can only write inside its own folder. The signature is valid for
 * an hour (Cloudinary's rule, counted from the timestamp).
 */
function createProductImageSignature(brandId, { now = Date.now(), config = env.cloudinary } = {}) {
  if (!isConfigured(config)) {
    throw new UploadError(503, 'Image upload is not set up on this server yet.');
  }

  const timestamp = Math.floor(now / 1000);
  const folder = `citycart/brands/${brandId}/products`;
  const signedParams = { allowed_formats: ALLOWED_FORMATS, folder, timestamp };

  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`,
    apiKey: config.apiKey,
    timestamp,
    folder,
    allowedFormats: ALLOWED_FORMATS,
    signature: signParams(signedParams, config.apiSecret),
  };
}

/**
 * The proof of a payment taken at the door is private (docs/21 §I.4). The folder
 * is derived from the brand and delivery only — never from client input — and the
 * upload is `authenticated`, so it cannot be opened without a signed link.
 */
function paymentProofFolder(brandId, deliveryId) {
  return `citycart/brands/${brandId}/deliveries/${deliveryId}/payment-proofs`;
}

function createPaymentProofSignature(brandId, deliveryId, { now = Date.now(), config = env.cloudinary } = {}) {
  if (!isConfigured(config)) {
    throw new UploadError(503, 'Payment proof photos are not set up on this server yet.');
  }

  const timestamp = Math.floor(now / 1000);
  const folder = paymentProofFolder(brandId, deliveryId);
  // `type` is part of the signature: a photo cannot be uploaded as a public asset
  // and then passed off as a proof.
  const signedParams = { allowed_formats: ALLOWED_FORMATS, folder, timestamp, type: 'authenticated' };

  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`,
    apiKey: config.apiKey,
    timestamp,
    folder,
    allowedFormats: ALLOWED_FORMATS,
    type: 'authenticated',
    signature: signParams(signedParams, config.apiSecret),
  };
}

/**
 * A short-lived signed link for one private proof photo. It expires in
 * `paymentProof.linkMinutes` (about five by default) and is generated only after
 * the caller has been authorized for that brand's payments.
 */
function createProofDownloadUrl(publicId, { now = Date.now(), config = env.cloudinary, linkMinutes = env.paymentProof.linkMinutes } = {}) {
  if (!isConfigured(config)) {
    throw new UploadError(503, 'Payment proof photos are not set up on this server yet.');
  }
  if (!publicId) {
    throw new UploadError(404, 'There is no photo for this payment.');
  }

  const timestamp = Math.floor(now / 1000);
  const expiresAt = timestamp + linkMinutes * 60;
  const signed = { expires_at: expiresAt, public_id: publicId, timestamp, type: 'authenticated' };
  const query = new URLSearchParams({
    api_key: config.apiKey,
    expires_at: String(expiresAt),
    public_id: publicId,
    signature: signApiParams(signed, config.apiSecret),
    timestamp: String(timestamp),
    type: 'authenticated',
  });

  return {
    url: `https://api.cloudinary.com/v1_1/${config.cloudName}/image/download?${query.toString()}`,
    expiresAt: new Date(expiresAt * 1000),
  };
}

// Deletes one private proof from Cloudinary (the retention job). Returns true only
// when Cloudinary confirmed it; a network error rejects and is retried next run.
async function destroyPrivateAsset(publicId, { config = env.cloudinary, fetchImpl = global.fetch } = {}) {
  if (!isConfigured(config) || !publicId) return false;
  const query = new URLSearchParams({ type: 'authenticated' });
  query.append('public_ids[]', publicId);
  const response = await fetchImpl(`https://api.cloudinary.com/v1_1/${config.cloudName}/resources/image/upload?${query.toString()}`, {
    method: 'DELETE',
    headers: { Authorization: `Basic ${Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString('base64')}` },
  });
  return Boolean(response && response.ok);
}

module.exports = {
  createProductImageSignature,
  createPaymentProofSignature,
  createProofDownloadUrl,
  destroyPrivateAsset,
  paymentProofFolder,
  signParams,
  signApiParams,
  isConfigured,
  UploadError,
  ALLOWED_FORMATS,
};