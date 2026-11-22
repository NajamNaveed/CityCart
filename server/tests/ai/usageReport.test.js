process.env.AI_ENABLED = 'false';

const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../../src/models/user.model', () => ({
  ...jest.requireActual('../../src/models/user.model'),
  findById: jest.fn(),
}));
jest.mock('../../src/models/adminPartner.model', () => ({
  ...jest.requireActual('../../src/models/adminPartner.model'),
  findOne: jest.fn(),
}));
jest.mock('../../src/models/aiUsage.model', () => ({
  find: jest.fn(),
}));

const User = require('../../src/models/user.model');
const AdminPartner = require('../../src/models/adminPartner.model');
const AiUsage = require('../../src/models/aiUsage.model');
const app = require('../../src/app');
const env = require('../../src/config/env');
const { ROLES } = require('../../src/config/roles');
const { getAuthCookie } = require('../helpers/testAuth');
const { summarizeUsage } = require('../../src/services/ai/usageReport');

const superAdmin = { _id: new mongoose.Types.ObjectId(), name: 'Platform Admin', role: ROLES.SUPER_ADMIN, isActive: true };
const partner = { _id: new mongoose.Types.ObjectId(), name: 'Partner Admin', role: ROLES.ADMIN_PARTNER, isActive: true };
const brandAdmin = { _id: new mongoose.Types.ObjectId(), name: 'Shop Owner', role: ROLES.BRAND_ADMIN, isActive: true };
const customer = { _id: new mongoose.Types.ObjectId(), name: 'Shopper', role: ROLES.CUSTOMER, isActive: true };
const users = [superAdmin, partner, brandAdmin, customer];

function queryOf(doc) {
  const query = {
    select: () => query,
    lean: () => Promise.resolve(doc),
    then: (resolve, reject) => Promise.resolve(doc).then(resolve, reject),
  };
  return query;
}

function asUser(user) {
  User.findById.mockImplementation((id) => queryOf(users.find((row) => String(row._id) === String(id)) || null));
  return ['Cookie', getAuthCookie(user)];
}

function rowsOf(rows) {
  const chain = {
    select: () => chain,
    sort: () => chain,
    limit: () => chain,
    lean: async () => rows,
  };
  return chain;
}

function ask(user = superAdmin, query = {}) {
  return request(app)
    .get('/api/v1/admin/ai-usage')
    .query(query)
    .set('Cookie', asUser(user));
}

const ROWS = [
  { agent: 'substitutions', ok: true, attempts: 1, promptTokens: 100, completionTokens: 50, ms: 800, userId: 'u1' },
  { agent: 'substitutions', ok: false, attempts: 2, promptTokens: 90, completionTokens: 0, ms: 3000, error: 'groq: timeout', userId: 'u1' },
  { agent: 'moderation', ok: true, attempts: 1, promptTokens: 60, completionTokens: 20, ms: 500, userId: 'u2' },
  { agent: null, ok: true, attempts: 1, promptTokens: 10, completionTokens: 5, ms: 200, userId: null },
];

beforeEach(() => {
  jest.clearAllMocks();
  AdminPartner.findOne.mockResolvedValue(null);
  AiUsage.find.mockReturnValue(rowsOf(ROWS));
  asUser(superAdmin);
});

afterAll(() => {
  env.ai.enabled = false;
});

// ---------------------------------------------------------------------------
// The aggregation is pure, so every figure can be checked without Express.
// ---------------------------------------------------------------------------
describe('summarizeUsage', () => {
  it('counts requests, fallbacks, retries, tokens and distinct users per agent', () => {
    const { totals, agents } = summarizeUsage(ROWS);

    expect(totals).toMatchObject({
      agent: null,
      requests: 4,
      ok: 3,
      failed: 1,
      successRate: 75,
      fallbackRate: 25,
      retried: 1,
      retryRate: 25,
      promptTokens: 260,
      completionTokens: 75,
      totalTokens: 335,
      avgMs: 1125,
      users: 2,
    });

    expect(agents.map((row) => row.agent)).toEqual(['substitutions', 'moderation', 'unknown']);
    expect(agents[0]).toMatchObject({
      requests: 2,
      ok: 1,
      failed: 1,
      fallbackRate: 50,
      retryRate: 50,
      totalTokens: 240,
      avgMs: 1900,
      users: 1,
      lastError: 'groq: timeout',
    });
  });

  it('keeps the newest failure text when several requests failed', () => {
    const { agents } = summarizeUsage([
      { agent: 'moderation', ok: false, attempts: 1, error: 'newest failure', userId: 'u1' },
      { agent: 'moderation', ok: false, attempts: 1, error: 'older failure', userId: 'u1' },
    ]);
    expect(agents[0].lastError).toBe('newest failure');
  });

  it('returns clean zeros for an empty range', () => {
    const { totals, agents } = summarizeUsage([]);
    expect(agents).toEqual([]);
    expect(totals).toMatchObject({ requests: 0, successRate: 0, fallbackRate: 0, avgMs: 0, users: 0 });
    expect(Number.isNaN(totals.avgMs)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The endpoint is the admin.analytics read, not the AI generation door.
// ---------------------------------------------------------------------------
describe('GET /api/v1/admin/ai-usage', () => {
  it('requires a signed-in user', async () => {
    const res = await request(app).get('/api/v1/admin/ai-usage');
    expect(res.status).toBe(401);
    expect(AiUsage.find).not.toHaveBeenCalled();
  });

  it('refuses roles that are not platform admins', async () => {
    for (const user of [brandAdmin, customer]) {
      const res = await ask(user);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ROLE_NOT_ALLOWED');
    }
  });

  it('allows a partner holding admin.analytics, including a read-only one', async () => {
    AdminPartner.findOne.mockResolvedValue({ permissions: ['admin.analytics'], isActive: true, readOnly: true });
    const res = await ask(partner);
    expect(res.status).toBe(200);
    expect(res.body.usage.totals.requests).toBe(4);
  });

  it('refuses a partner without admin.analytics', async () => {
    AdminPartner.findOne.mockResolvedValue({ permissions: ['admin.orders'], isActive: true, readOnly: false });
    const res = await ask(partner);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERMISSION_DENIED');
  });

  it('returns the per-agent report for the requested range', async () => {
    const res = await ask(superAdmin, { from: '2026-11-01', to: '2026-11-07' });

    expect(res.status).toBe(200);
    expect(res.body.usage.labels).toEqual({ from: '2026-11-01', to: '2026-11-07' });
    expect(res.body.usage.totals).toMatchObject({ requests: 4, fallbackRate: 25 });
    expect(res.body.usage.agents.map((row) => row.agent)).toEqual(['substitutions', 'moderation', 'unknown']);

    const filter = AiUsage.find.mock.calls[0][0];
    expect(filter.createdAt.$gte.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(filter.createdAt.$lt.toISOString()).toBe('2026-11-08T00:00:00.000Z');
  });

  it('rejects a malformed date range', async () => {
    for (const query of [{ from: '2026-13-01' }, { from: '2026-11-07', to: '2026-11-01' }]) {
      const res = await ask(superAdmin, query);
      expect(res.status).toBe(400);
    }
    expect(AiUsage.find).not.toHaveBeenCalled();
  });

  it('still reports past usage when the AI kill switch is off', async () => {
    env.ai.enabled = false;
    const res = await ask(superAdmin);
    expect(res.status).toBe(200);
    expect(res.body.usage.totals.requests).toBe(4);
  });

  it('only reads usage rows and never writes', async () => {
    await ask(superAdmin);
    expect(AiUsage.find).toHaveBeenCalledTimes(1);
    expect(AiUsage.create).toBeUndefined();
    expect(AiUsage.findOneAndUpdate).toBeUndefined();
    expect(AiUsage.deleteMany).toBeUndefined();
  });
});
