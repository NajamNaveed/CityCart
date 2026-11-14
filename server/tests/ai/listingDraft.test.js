process.env.AI_ENABLED = 'true';
process.env.AI_PROVIDER_ORDER = 'gemini';
process.env.GEMINI_API_KEY = 'test-gemini-key';

const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../../src/models/user.model');
jest.mock('../../src/models/employee.model');
jest.mock('../../src/models/aiUsage.model', () => ({
  create: jest.fn(),
  countDocuments: jest.fn(),
}));
jest.mock('../../src/models/category.model', () => ({
  find: jest.fn(),
}));

const User = require('../../src/models/user.model');
const Employee = require('../../src/models/employee.model');
const AiUsage = require('../../src/models/aiUsage.model');
const Category = require('../../src/models/category.model');
const app = require('../../src/app');
const env = require('../../src/config/env');
const { ROLES } = require('../../src/config/roles');
const { getAuthCookie } = require('../helpers/testAuth');

const originalFetch = global.fetch;
const originalDailyLimit = env.ai.dailyLimit;

const categories = [
  { _id: 'p1', name: 'Pantry', parentId: null },
  { _id: 'c1', name: 'Rice', parentId: 'p1' },
  { _id: 'c2', name: 'Cooking oil', parentId: 'p1' },
];

function makeUser(role = ROLES.BRAND_ADMIN, extra = {}) {
  return { _id: new mongoose.Types.ObjectId(), role, isActive: true, ...extra };
}

function asUser(user) {
  User.findById.mockResolvedValue(user);
  return ['Cookie', getAuthCookie(user)];
}

function geminiResponse(text) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text }] } }],
      usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 30 },
    }),
  };
}

function mockCategories() {
  Category.find.mockReturnValue({
    select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(categories) }),
  });
}

function postDraft(user, body) {
  return request(app).post('/api/v1/ai/listing-draft').set(...asUser(user)).send(body);
}

beforeEach(() => {
  jest.clearAllMocks();
  env.ai.enabled = true;
  env.ai.dailyLimit = originalDailyLimit;
  AiUsage.countDocuments.mockResolvedValue(0);
  AiUsage.create.mockResolvedValue({});
  mockCategories();
  global.fetch = jest.fn().mockResolvedValue(
    geminiResponse('{"title":"Basmati Rice 1kg","description":"Long-grain basmati rice in a 1 kg bag, suited to everyday cooking.","category":"c1"}'),
  );
});

afterEach(() => {
  global.fetch = originalFetch;
});

afterAll(() => {
  env.ai.enabled = false;
  env.ai.dailyLimit = originalDailyLimit;
});

describe('POST /api/v1/ai/listing-draft', () => {
  it('requires a signed-in user', async () => {
    const res = await request(app).post('/api/v1/ai/listing-draft').send({ notes: '1 kg basmati rice' });

    expect(res.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('refuses a customer before calling a provider', async () => {
    const res = await postDraft(makeUser(ROLES.CUSTOMER), { notes: '1 kg basmati rice' });

    expect(res.status).toBe(403);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('lets a brand admin draft an entry from a few words', async () => {
    const admin = makeUser(ROLES.BRAND_ADMIN, { brandId: new mongoose.Types.ObjectId() });

    const res = await postDraft(admin, { notes: '1 kg basmati rice bag' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: {
        title: 'Basmati Rice 1kg',
        description: 'Long-grain basmati rice in a 1 kg bag, suited to everyday cooking.',
        category: { id: 'c1', name: 'Rice' },
      },
    });

    // The model receives the sanitized notes and the real leaf categories only.
    const sentBody = global.fetch.mock.calls[0][1].body;
    expect(sentBody).toContain('1 kg basmati rice bag');
    expect(sentBody).toContain('c1');
    expect(sentBody).not.toContain('p1');
    expect(AiUsage.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: admin._id, agent: 'listing-draft', ok: true }),
    );
  });

  it('strips markup from the notes and never sends it raw', async () => {
    const admin = makeUser();

    const res = await postDraft(admin, { notes: '<b>1 kg</b> basmati rice' });

    expect(res.status).toBe(200);
    const sentBody = global.fetch.mock.calls[0][1].body;
    expect(sentBody).toContain('1 kg basmati rice');
    expect(sentBody).not.toContain('<b>');
  });

  it('accepts a category name and maps it to the real id', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      geminiResponse('{"title":"Sunflower Oil 5L","description":"Refined sunflower cooking oil in a five litre bottle.","category":"Cooking oil"}'),
    );

    const res = await postDraft(makeUser(), { notes: '5 litre sunflower oil' });

    expect(res.status).toBe(200);
    expect(res.body.data.category).toEqual({ id: 'c2', name: 'Cooking oil' });
  });

  it('returns no category when the model invents one', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      geminiResponse('{"title":"Sunflower Oil 5L","description":"Refined sunflower cooking oil in a five litre bottle.","category":"c999"}'),
    );

    const res = await postDraft(makeUser(), { notes: '5 litre sunflower oil' });

    expect(res.status).toBe(200);
    expect(res.body.data.category).toBeNull();
  });

  it('rejects notes that are too short', async () => {
    const res = await postDraft(makeUser(), { notes: 'a' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, message: 'Validation failed.' });
    expect(res.body.errors[0].field).toBe('notes');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('answers 502 AI_BAD_OUTPUT when the model text is not the expected JSON', async () => {
    global.fetch = jest.fn().mockResolvedValue(geminiResponse('Sure! Here is a nice title.'));

    const res = await postDraft(makeUser(), { notes: '1 kg basmati rice' });

    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({ success: false, code: 'AI_BAD_OUTPUT' });
  });

  it('answers a clean 503 when the provider fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' });

    const res = await postDraft(makeUser(), { notes: '1 kg basmati rice' });

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      success: false,
      message: 'AI is unavailable right now.',
      code: 'AI_UNAVAILABLE',
    });
    expect(AiUsage.create).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
  });

  it('answers 503 without a provider call when the kill switch is off', async () => {
    env.ai.enabled = false;

    const res = await postDraft(makeUser(), { notes: '1 kg basmati rice' });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('AI_UNAVAILABLE');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('answers 429 AI_DAILY_LIMIT before spending a provider call', async () => {
    env.ai.dailyLimit = 3;
    AiUsage.countDocuments.mockResolvedValue(3);

    const res = await postDraft(makeUser(), { notes: '1 kg basmati rice' });

    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ success: false, code: 'AI_DAILY_LIMIT', limit: 3 });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('resolves a brand employee membership through the normal auth chain', async () => {
    const brandId = new mongoose.Types.ObjectId();
    const employee = makeUser(ROLES.BRAND_EMPLOYEE, { brandId });
    User.findById.mockResolvedValue(employee);
    Employee.findOne.mockResolvedValue({ _id: new mongoose.Types.ObjectId(), brandId, isActive: true });

    const res = await request(app)
      .post('/api/v1/ai/listing-draft')
      .set('Cookie', getAuthCookie(employee))
      .send({ notes: '1 kg basmati rice' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
