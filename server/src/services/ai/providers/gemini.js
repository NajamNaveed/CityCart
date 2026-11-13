const env = require('../../../config/env');
const { AiProviderError } = require('../errors');

/**
 * Google Gemini generateContent adapter. The key travels in the
 * `x-goog-api-key` header, not the URL, so request logs never contain it.
 */
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

const isConfigured = () => Boolean(env.ai.gemini.apiKey && env.ai.gemini.model);

function toGeminiPayload(messages, { json, temperature, maxTokens }) {
  const system = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n');
  const contents = messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    }));

  return {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
      ...(json ? { responseMimeType: 'application/json' } : {}),
    },
  };
}

async function generate({ messages, json = false, temperature = 0.4, maxTokens = 1024, timeoutMs }) {
  const { apiKey, model } = env.ai.gemini;
  let response;
  try {
    response = await fetch(`${ENDPOINT}/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(toGeminiPayload(messages, { json, temperature, maxTokens })),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new AiProviderError(`gemini unreachable (${err.name || 'Error'}): ${err.message}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new AiProviderError(
      `gemini rejected the request (${response.status}): ${body.slice(0, 200)}`,
      response.status
    );
  }

  const data = await response.json();
  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map((part) => part.text)
    .filter(Boolean)
    .join('');
  if (text.trim() === '') {
    throw new AiProviderError('gemini returned an empty response', response.status);
  }

  return {
    text,
    model,
    usage: {
      promptTokens: Number(data?.usageMetadata?.promptTokenCount) || 0,
      completionTokens: Number(data?.usageMetadata?.candidatesTokenCount) || 0,
    },
  };
}

module.exports = { name: 'gemini', isConfigured, generate };
