process.env.AI_ENABLED = 'true';
process.env.AI_PROVIDER_ORDER = 'gemini,groq,openrouter';
process.env.GEMINI_API_KEY = 'test-gemini-key';
process.env.GROQ_API_KEY = 'test-groq-key';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';

jest.mock('../../src/models/aiUsage.model', () => ({
  create: jest.fn(),
  countDocuments: jest.fn(),
}));
jest.mock('../../src/models/aiCache.model', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));

const AiUsage = require('../../src/models/aiUsage.model');
const AiCache = require('../../src/models/aiCache.model');
const { generate } = require('../../src/services/ai');
const { recordAiUsage, countUsageToday } = require('../../src/services/ai/usage');
const { getCached, setCached } = require('../../src/services/ai/cache');

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

const messages = [{ role: 'user', content: 'Draft a title' }];

describe('AI usage logging', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('logs a successful call with the winning provider', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(jsonResponse(geminiPayload));

    await generate({ task: 'listing-draft', messages, userId: 'user-1', role: 'BRAND_ADMIN' });

    expect(AiUsage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        role: 'BRAND_ADMIN',
        agent: 'listing-draft',
        provider: 'gemini',
        promptTokens: 12,
        completionTokens: 8,
        attempts: 1,
        ok: true,
        error: null,
      })
    );
  });

  it('logs a failure once every provider has been tried', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({ error: 'down' }, 503));

    await expect(
      generate({ task: 'listing-draft', messages, userId: 'user-1', role: 'BRAND_ADMIN' })
    ).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });

    expect(AiUsage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        agent: 'listing-draft',
        provider: null,
        attempts: 3,
        ok: false,
        error: expect.stringContaining('gemini'),
      })
    );
  });

  it('does not write a log entry without a user', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(jsonResponse(geminiPayload));

    await generate({ messages });

    expect(AiUsage.create).not.toHaveBeenCalled();
  });

  it('caps the stored error at 300 characters', async () => {
    await recordAiUsage({ error: 'x'.repeat(500) });

    const payload = AiUsage.create.mock.calls[0][0];
    expect(payload.error).toHaveLength(300);
  });

  it('never throws when the log insert fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    AiUsage.create.mockRejectedValueOnce(new Error('db down'));

    await expect(recordAiUsage({ userId: 'user-1' })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('usage log failed'));
  });

  it('counts requests since UTC midnight', async () => {
    AiUsage.countDocuments.mockResolvedValueOnce(4);

    const count = await countUsageToday('user-1', new Date('2026-11-13T18:00:00+05:00'));

    expect(count).toBe(4);
    expect(AiUsage.countDocuments).toHaveBeenCalledWith({
      userId: 'user-1',
      createdAt: { $gte: new Date('2026-11-13T00:00:00.000Z') },
    });
  });

  it('returns 0 when the daily count query fails', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    AiUsage.countDocuments.mockRejectedValueOnce(new Error('db down'));

    await expect(countUsageToday('user-1')).resolves.toBe(0);
  });
});

describe('AI cache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns a live cached value', async () => {
    AiCache.findOne.mockReturnValue({
      lean: async () => ({
        value: { summary: 'good rice' },
        expiresAt: new Date(Date.now() + 60_000),
      }),
    });

    await expect(getCached('review:product-1:5')).resolves.toEqual({ summary: 'good rice' });
  });

  it('ignores an expired entry even before its TTL deletion', async () => {
    AiCache.findOne.mockReturnValue({
      lean: async () => ({
        value: { summary: 'old' },
        expiresAt: new Date(Date.now() - 1000),
      }),
    });

    await expect(getCached('review:product-1:5')).resolves.toBeNull();
  });

  it('returns null when the read fails', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    AiCache.findOne.mockReturnValue({ lean: async () => { throw new Error('db down'); } });

    await expect(getCached('key')).resolves.toBeNull();
  });

  it('upserts with an expiry and clamps very long TTLs', async () => {
    AiCache.findOneAndUpdate.mockResolvedValue({});

    await setCached('key', { ok: true }, 60 * 60 * 24 * 365);

    const [filter, update, options] = AiCache.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ key: 'key' });
    expect(options).toEqual({ upsert: true });
    expect(update.$set.value).toEqual({ ok: true });
    const ttlMs = update.$set.expiresAt.getTime() - Date.now();
    expect(ttlMs).toBeLessThanOrEqual(30 * 24 * 60 * 60 * 1000);
  });

  it('never throws when the write fails', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    AiCache.findOneAndUpdate.mockRejectedValueOnce(new Error('db down'));

    await expect(setCached('key', { ok: true })).resolves.toBeUndefined();
  });
});
