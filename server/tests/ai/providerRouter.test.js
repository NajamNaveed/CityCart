process.env.AI_ENABLED = 'true';
process.env.AI_PROVIDER_ORDER = 'gemini,groq,openrouter';
process.env.GEMINI_API_KEY = 'test-gemini-key';
process.env.GROQ_API_KEY = 'test-groq-key';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
process.env.AI_REQUEST_TIMEOUT_MS = '5000';

const { generate, AiUnavailableError } = require('../../src/services/ai');

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

const geminiPayload = {
  candidates: [{ content: { parts: [{ text: 'Gemini answer' }] } }],
  usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 8 },
};

const groqPayload = {
  choices: [{ message: { content: 'Groq answer' } }],
  usage: { prompt_tokens: 5, completion_tokens: 3 },
};

const openrouterPayload = {
  choices: [{ message: { content: 'OpenRouter answer' } }],
  usage: { prompt_tokens: 4, completion_tokens: 2 },
};

const messages = [{ role: 'user', content: 'Draft a title for rice' }];

describe('AI provider router', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('moves to the next provider when the first returns 500', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'boom' }, 500))
      .mockResolvedValueOnce(jsonResponse(groqPayload));

    const result = await generate({ task: 'test', messages });

    expect(result.provider).toBe('groq');
    expect(result.text).toBe('Groq answer');
    expect(result.usage).toEqual({ promptTokens: 5, completionTokens: 3 });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(String(global.fetch.mock.calls[1][0])).toContain('api.groq.com');
  });

  it('moves on after a timeout', async () => {
    const timeout = Object.assign(new Error('The operation was aborted due to timeout'), {
      name: 'TimeoutError',
    });
    global.fetch = jest
      .fn()
      .mockRejectedValueOnce(timeout)
      .mockResolvedValueOnce(jsonResponse(groqPayload));

    const result = await generate({ messages });

    expect(result.provider).toBe('groq');
  });

  it('falls through when a provider answers with an empty body', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ candidates: [{ content: { parts: [] } }] }))
      .mockResolvedValueOnce(jsonResponse(groqPayload));

    const result = await generate({ messages });

    expect(result.provider).toBe('groq');
  });

  it('throws AiUnavailableError only after every provider fails', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({ error: 'down' }, 503));

    await expect(generate({ messages })).rejects.toMatchObject({
      name: 'AiUnavailableError',
      code: 'AI_UNAVAILABLE',
    });

    const error = await generate({ messages }).catch((err) => err);
    expect(error).toBeInstanceOf(AiUnavailableError);
    expect(error.message).toContain('gemini');
    expect(error.message).toContain('groq');
    expect(error.message).toContain('openrouter');
    expect(global.fetch).toHaveBeenCalledTimes(6);
  });

  it('sends the Gemini key in a header and never in the URL', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(jsonResponse(geminiPayload));

    const result = await generate({ messages });

    const [url, options] = global.fetch.mock.calls[0];
    expect(result.provider).toBe('gemini');
    expect(result.usage).toEqual({ promptTokens: 12, completionTokens: 8 });
    expect(options.headers['x-goog-api-key']).toBe('test-gemini-key');
    expect(String(url)).not.toContain('test-gemini-key');
    expect(String(url)).toContain('generativelanguage.googleapis.com');
  });

  it('asks Gemini for JSON when json is true', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(jsonResponse(geminiPayload));

    await generate({ messages, json: true });

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.systemInstruction).toBeUndefined();
  });

  it('asks Groq for a JSON object when json is true', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'boom' }, 500))
      .mockResolvedValueOnce(jsonResponse(groqPayload));

    await generate({ messages, json: true });

    const body = JSON.parse(global.fetch.mock.calls[1][1].body);
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('passes a system prompt to Gemini as systemInstruction', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(jsonResponse(geminiPayload));

    await generate({
      messages: [
        { role: 'system', content: 'You are a listing writer.' },
        { role: 'user', content: 'Rice' },
      ],
    });

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.systemInstruction.parts[0].text).toBe('You are a listing writer.');
    expect(body.contents).toEqual([{ role: 'user', parts: [{ text: 'Rice' }] }]);
  });

  it('skips a provider in the order that has no key', async () => {
    const savedGroqKey = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;
    jest.resetModules();

    let isolated;
    jest.isolateModules(() => {
      isolated = require('../../src/services/ai');
    });

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'boom' }, 500))
      .mockResolvedValueOnce(jsonResponse(openrouterPayload));

    const result = await isolated.generate({ messages });

    expect(result.provider).toBe('openrouter');
    expect(String(global.fetch.mock.calls[1][0])).toContain('openrouter.ai');

    process.env.GROQ_API_KEY = savedGroqKey;
  });
});
