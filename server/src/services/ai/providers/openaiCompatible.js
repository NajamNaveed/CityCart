const { AiProviderError } = require('../errors');

/**
 * Factory for providers that speak the OpenAI chat-completions shape
 * (Groq and OpenRouter). Node 22+ has a global fetch, so no SDK is needed
 * (docs/27 principle 4).
 */
function createOpenAiCompatibleProvider({ name, endpoint, model, apiKey, extraHeaders = {} }) {
  const isConfigured = () => Boolean(apiKey && model);

  async function generate({ messages, json = false, temperature = 0.4, maxTokens = 1024, timeoutMs }) {
    let response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
          ...extraHeaders,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
          ...(json ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new AiProviderError(`${name} unreachable (${err.name || 'Error'}): ${err.message}`);
    }

    if (!response.ok) {
      // Kept short: provider bodies can be long, and this text only ever
      // reaches the server log, never a client.
      const body = await response.text().catch(() => '');
      throw new AiProviderError(
        `${name} rejected the request (${response.status}): ${body.slice(0, 200)}`,
        response.status
      );
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || text.trim() === '') {
      throw new AiProviderError(`${name} returned an empty response`, response.status);
    }

    return {
      text,
      model,
      usage: {
        promptTokens: Number(data?.usage?.prompt_tokens) || 0,
        completionTokens: Number(data?.usage?.completion_tokens) || 0,
      },
    };
  }

  return { name, isConfigured, generate };
}

module.exports = { createOpenAiCompatibleProvider };
