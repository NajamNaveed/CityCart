process.env.AI_ENABLED = 'true';

const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../../src/models/user.model');
jest.mock('../../src/models/aiUsage.model', () => ({
  create: jest.fn(),
  countDocuments: jest.fn(),
}));

const User = require('../../src/models/user.model');
const AiUsage = require('../../src/models/aiUsage.model');
const app = require('../../src/app');
const env = require('../../src/config/env');
const { ROLES } = require('../../src/config/roles');
const { getAuthCookie } = require('../helpers/testAuth');

function makeUser(role = ROLES.CUSTOMER) {
  return { _id: new mongoose.Types.ObjectId(), role, isActive: true };
}

function asUser(user) {
  User.findById.mockResolvedValue(user);
  return ['Cookie', getAuthCookie(user)];
}

function loadLimitersInDevelopment() {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  let limiters;
  jest.isolateModules(() => {
    limiters = require('../../src/middleware/rateLimiters');
  });
  process.env.NODE_ENV = previous;
  return limiters;
}

const originalDailyLimit = env.ai.dailyLimit;

beforeEach(() => {
  jest.clearAllMocks();
  env.ai.enabled = true;
  env.ai.dailyLimit = originalDailyLimit;
  AiUsage.countDocuments.mockResolvedValue(0);
});

afterAll(() => {
  env.ai.enabled = false;
  env.ai.dailyLimit = originalDailyLimit;
});

describe('POST /api/v1/ai/ping', () => {
  it('requires a signed-in user', async () => {
    const res = await request(app).post('/api/v1/ai/ping');

    expect(res.status).toBe(401);
    expect(AiUsage.countDocuments).not.toHaveBeenCalled();
  });

  it('returns the daily allowance without spending it', async () => {
    const user = makeUser();
    AiUsage.countDocuments.mockResolvedValue(3);

    const res = await request(app).post('/api/v1/ai/ping').set(...asUser(user));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { dailyLimit: env.ai.dailyLimit, usedToday: 3, remaining: env.ai.dailyLimit - 3 },
    });
    expect(res.headers['x-ai-daily-limit']).toBe(String(env.ai.dailyLimit));
    expect(res.headers['x-ai-daily-remaining']).toBe(String(env.ai.dailyLimit - 3));
    expect(AiUsage.create).not.toHaveBeenCalled();
  });

  it('counts today for the authenticated user only', async () => {
    const user = makeUser();

    await request(app).post('/api/v1/ai/ping').set(...asUser(user));

    expect(AiUsage.countDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ userId: user._id }),
    );
  });

  it('answers 429 AI_DAILY_LIMIT once the allowance is used up', async () => {
    const user = makeUser();
    env.ai.dailyLimit = 2;
    AiUsage.countDocuments.mockResolvedValue(2);

    const res = await request(app).post('/api/v1/ai/ping').set(...asUser(user));

    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ success: false, code: 'AI_DAILY_LIMIT', limit: 2 });
  });

  it('answers 503 AI_UNAVAILABLE when the kill switch is off', async () => {
    env.ai.enabled = false;
    const user = makeUser();

    const res = await request(app).post('/api/v1/ai/ping').set(...asUser(user));

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ success: false, code: 'AI_UNAVAILABLE' });
    expect(AiUsage.countDocuments).not.toHaveBeenCalled();
  });
});

describe('AI burst limit', () => {
  it('allows 10 requests a minute per user, then answers 429', async () => {
    const limiter = loadLimitersInDevelopment().aiUserLimiter;
    const mini = express();
    mini.use((req, res, next) => {
      req.user = { _id: req.get('x-user') };
      next();
    });
    mini.post('/', limiter, (req, res) => res.sendStatus(201));

    for (let i = 0; i < 10; i += 1) {
      expect((await request(mini).post('/').set('x-user', 'u1')).status).toBe(201);
    }
    const blocked = await request(mini).post('/').set('x-user', 'u1');
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({ success: false });

    // Another user still has their own allowance.
    expect((await request(mini).post('/').set('x-user', 'u2')).status).toBe(201);
  });
});
