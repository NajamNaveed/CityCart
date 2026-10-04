const request = require('supertest');

const app = require('../src/app');
const { describeConnectionError } = require('../src/config/db');
const { isAllowedOrigin } = require('../src/config/cors');

describe('describeConnectionError', () => {
  const hint = (message, extra = {}) => describeConnectionError(Object.assign(new Error(message), extra));

  it('explains a missing MONGODB_URI', () => {
    expect(hint('MONGODB_URI is not set. Add it to server/.env')).toMatch(/server\/\.env/);
  });

  it('explains wrong credentials', () => {
    expect(hint('bad auth : authentication failed')).toMatch(/username or password/);
  });

  it('explains a blocked SRV / DNS lookup and names the workaround', () => {
    const text = hint('querySrv ECONNREFUSED _mongodb._tcp.cluster0.abc.mongodb.net');
    expect(text).toMatch(/MONGODB_DNS_SERVERS/);
    expect(text).toMatch(/mongodb:\/\//);
  });

  it('explains an Atlas IP allow-list problem', () => {
    expect(hint('Server selection timed out after 10000 ms')).toMatch(/Network Access/);
  });

  it('says nothing for an unrecognised error', () => {
    expect(hint('something unexpected')).toBe('');
  });
});

describe('CORS origins', () => {
  const opts = { allowed: ['https://citycart.vercel.app'] };

  it('always allows the configured client address', () => {
    expect(isAllowedOrigin('https://citycart.vercel.app', { ...opts, nodeEnv: 'production' })).toBe(true);
  });

  it('allows any localhost / 127.0.0.1 port in development', () => {
    for (const origin of ['http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5173']) {
      expect(isAllowedOrigin(origin, { ...opts, nodeEnv: 'development' })).toBe(true);
    }
  });

  it('does NOT allow localhost in production, nor other sites in development', () => {
    expect(isAllowedOrigin('http://localhost:5173', { ...opts, nodeEnv: 'production' })).toBe(false);
    expect(isAllowedOrigin('https://evil.example', { ...opts, nodeEnv: 'development' })).toBe(false);
    expect(isAllowedOrigin('http://localhost.evil.example', { ...opts, nodeEnv: 'development' })).toBe(false);
  });

  it('sends credentials headers to an allowed origin and none to a stranger', async () => {
    const ok = await request(app).get('/health').set('Origin', 'http://localhost:5199');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5199');
    expect(ok.headers['access-control-allow-credentials']).toBe('true');

    const stranger = await request(app).get('/health').set('Origin', 'https://evil.example');
    expect(stranger.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('GET /health', () => {
  it('reports the database state alongside the status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.database).toBe('disconnected'); // no database is connected in unit tests
  });
});