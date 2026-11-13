process.env.AI_ENABLED = 'false';
process.env.GEMINI_API_KEY = 'test-gemini-key';

const { generate } = require('../../src/services/ai');

describe('AI kill switch', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('refuses with AI_UNAVAILABLE before any network call', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock;

    await expect(
      generate({ messages: [{ role: 'user', content: 'hello' }] })
    ).rejects.toMatchObject({ name: 'AiUnavailableError', code: 'AI_UNAVAILABLE' });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is disabled by default when AI_ENABLED is unset', () => {
    jest.resetModules();
    const saved = process.env.AI_ENABLED;
    delete process.env.AI_ENABLED;

    let isolatedEnv;
    jest.isolateModules(() => {
      isolatedEnv = require('../../src/config/env');
    });

    expect(isolatedEnv.ai.enabled).toBe(false);
    process.env.AI_ENABLED = saved;
  });
});
