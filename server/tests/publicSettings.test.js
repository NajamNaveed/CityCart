const request = require('supertest');

jest.mock('../src/models/platformSettings.model');

const PlatformSettings = require('../src/models/platformSettings.model');
const app = require('../src/app');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/v1/settings/public', () => {
  it('returns support details without authentication', async () => {
    PlatformSettings.findOne.mockResolvedValue({
      platformName: 'CityCart',
      supportEmail: 'help@citycart.pk',
      supportPhone: '+92 300 0000000',
    });

    const res = await request(app).get('/api/v1/settings/public');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.settings).toEqual({
      platformName: 'CityCart',
      supportEmail: 'help@citycart.pk',
      supportPhone: '+92 300 0000000',
    });
  });

  it('does not expose admin-only settings', async () => {
    PlatformSettings.findOne.mockResolvedValue({
      platformName: 'CityCart',
      supportEmail: 'help@citycart.pk',
      commissionRate: 1,
      codMaxOrderAmount: 50000,
      maintenanceMode: true,
      billing: { rateBps: 100, bank: { iban: 'PK00' } },
    });

    const res = await request(app).get('/api/v1/settings/public');

    expect(res.status).toBe(200);
    expect(Object.keys(res.body.settings).sort()).toEqual(['platformName', 'supportEmail', 'supportPhone']);
    expect(res.body.settings.commissionRate).toBeUndefined();
    expect(res.body.settings.billing).toBeUndefined();
  });

  it('falls back to safe defaults when no settings document exists', async () => {
    PlatformSettings.findOne.mockResolvedValue(null);

    const res = await request(app).get('/api/v1/settings/public');

    expect(res.status).toBe(200);
    expect(res.body.settings.platformName).toBe('CityCart');
    expect(res.body.settings.supportEmail).toBe('');
  });
});
