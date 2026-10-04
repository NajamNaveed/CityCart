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

module.exports = { createProductImageSignature, signParams, isConfigured, UploadError, ALLOWED_FORMATS };