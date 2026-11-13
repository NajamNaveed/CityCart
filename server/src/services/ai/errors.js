/**
 * Errors raised by the AI layer (docs/27 §3.3). Callers must never surface a
 * provider message to a client: the controller turns AiUnavailableError into a
 * generic 503 AI_UNAVAILABLE and the UI hides the feature.
 */
class AiUnavailableError extends Error {
  constructor(reason) {
    super(`AI unavailable: ${reason}`);
    this.name = 'AiUnavailableError';
    this.code = 'AI_UNAVAILABLE';
  }
}

/**
 * A single provider refused or broke. The router catches this, tries the next
 * provider and only turns the accumulated failures into AiUnavailableError.
 */
class AiProviderError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'AiProviderError';
    this.status = status;
  }
}

module.exports = { AiUnavailableError, AiProviderError };
