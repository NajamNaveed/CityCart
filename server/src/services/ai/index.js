const env = require('../../config/env');
const { AiUnavailableError } = require('./errors');
const providers = require('./providers');

/**
 * Provider router (docs/27 §3.3).
 *
 * Tries the providers named in AI_PROVIDER_ORDER that have a key, moving on
 * after any failure (timeout, 429, 5xx, bad response). Only when every one
 * fails does the caller see AiUnavailableError; nothing above this layer is
 * expected to catch a provider-specific error.
 */
function configuredProviders() {
  return env.ai.providerOrder
    .map((name) => providers[name])
    .filter((provider) => provider && provider.isConfigured());
}

async function generate({ task, messages, json = false, temperature, maxTokens, timeoutMs } = {}) {
  if (!env.ai.enabled) {
    throw new AiUnavailableError('disabled');
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('generate() needs at least one message');
  }

  const available = configuredProviders();
  if (available.length === 0) {
    throw new AiUnavailableError('no provider has a key');
  }

  const failures = [];
  for (const provider of available) {
    const startedAt = Date.now();
    try {
      const result = await provider.generate({
        messages,
        json,
        temperature,
        maxTokens,
        timeoutMs: timeoutMs || env.ai.requestTimeoutMs,
      });
      return {
        ...result,
        provider: provider.name,
        task: task || null,
        ms: Date.now() - startedAt,
      };
    } catch (err) {
      failures.push(`${provider.name}: ${err.message}`);
    }
  }

  throw new AiUnavailableError(`all providers failed (${failures.join('; ')})`);
}

module.exports = { generate, configuredProviders, AiUnavailableError };
