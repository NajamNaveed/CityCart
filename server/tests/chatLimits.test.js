const express = require('express');
const request = require('supertest');

/**
 * The limiters are switched off under NODE_ENV=test so other suites don't trip
 * them. This suite loads them in "development" mode (isolated, so nothing else
 * is affected) to prove the limits really apply, and apply PER USER.
 */
function loadLimiters() {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  let limiters;
  jest.isolateModules(() => {
    limiters = require('../src/middleware/rateLimiters');
  });
  process.env.NODE_ENV = previous;
  return limiters;
}

function appWith(limiter) {
  const app = express();
  // Stand-in for authenticate: the user comes from a header.
  app.use((req, res, next) => {
    req.user = { _id: req.get('x-user') };
    next();
  });
  app.post('/', limiter, (req, res) => res.sendStatus(201));
  return app;
}

describe('chat rate limits', () => {
  it('lets a user send 20 messages a minute, then answers 429 in the API\'s error shape', async () => {
    const app = appWith(loadLimiters().chatSendLimiter);
    for (let i = 0; i < 20; i += 1) {
      expect((await request(app).post('/').set('x-user', 'u1')).status).toBe(201);
    }
    const blocked = await request(app).post('/').set('x-user', 'u1');
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({ success: false });
  });

  it('counts each user separately, so one spammer does not block everyone else', async () => {
    const app = appWith(loadLimiters().chatSendLimiter);
    for (let i = 0; i < 21; i += 1) await request(app).post('/').set('x-user', 'spammer');
    expect((await request(app).post('/').set('x-user', 'spammer')).status).toBe(429);
    expect((await request(app).post('/').set('x-user', 'someone-else')).status).toBe(201);
  });

  it('caps new conversations at 15 an hour per user', async () => {
    const app = appWith(loadLimiters().chatStartLimiter);
    for (let i = 0; i < 15; i += 1) {
      expect((await request(app).post('/').set('x-user', 'u1')).status).toBe(201);
    }
    expect((await request(app).post('/').set('x-user', 'u1')).status).toBe(429);
  });
});
