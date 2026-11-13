const env = require('../../config/env');
const { AiUnavailableError } = require('./errors');
const providers = require('./providers');
const { recordAiUsage } = require('./usage');

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

async function generate({
  task,
  messages,
  json = false,
  temperature,
  maxTokens,
  timeoutMs,
  userId = null,
  role = null,
} = {}) {
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

  const startedAt = Date.now();
  const failures = [];
  let attempts = 0;

  for (const provider of available) {
    attempts += 1;
    try {
      const result = await provider.generate({
        messages,
        json,
        temperature,
        maxTokens,
        timeoutMs: timeoutMs || env.ai.requestTimeoutMs,
      });
      const ms = Date.now() - startedAt;
      // Only requests made for a signed-in user are logged; the service is
      // also used from tests and jobs before a user context exists.
      if (userId) {
        await recordAiUsage({
          userId,
          role,
          agent: task,
          provider: provider.name,
          model: result.model,
          promptTokens: result.usage?.promptTokens,
          completionTokens: result.usage?.completionTokens,
          attempts,
          ms,
          ok: true,
        });
      }
      return {
        ...result,
        provider: provider.name,
        task: task || null,
        ms,
      };
    } catch (err) {
      failures.push(`${provider.name}: ${err.message}`);
    }
  }

  if (userId) {
    await recordAiUsage({
      userId,
      role,
      agent: task,
      attempts,
      ms: Date.now() - startedAt,
      ok: false,
      error: failures.join('; '),
    });
  }

  throw new AiUnavailableError(`all providers failed (${failures.join('; ')})`);
}

module.exports = { generate, configuredProviders, AiUnavailableError };
