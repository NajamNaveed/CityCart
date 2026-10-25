const env = require('../config/env');
const mock = require('./mock.provider');

// Every provider the system knows. A real gateway is added here, in its own file.
const PROVIDERS = { [mock.name]: mock };

const MIN_SECRET_LENGTH = 16;

/**
 * The provider online payments currently use, or null when they are off. Read at
 * call time (not at startup) so it always reflects the environment. It is off
 * unless a known provider is named AND a strong webhook secret is set, and the
 * test gateway can never be on in production: customers would pay nothing.
 */
function activeProvider() {
  const { provider, webhookSecret } = env.payments;
  const found = PROVIDERS[provider];
  if (!found) return null;
  if (found.name === 'mock' && env.nodeEnv === 'production') return null;
  if (webhookSecret.length < MIN_SECRET_LENGTH) return null;
  return found;
}

module.exports = { activeProvider, PROVIDERS, MIN_SECRET_LENGTH };
