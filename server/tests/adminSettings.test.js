const request = require('supertest');

jest.mock('../src/models/user.model');
jest.mock('../src/models/platformSettings.model');

const User = require('../src/models/user.model');
const PlatformSettings = require('../src/models/platformSettings.model');
const app = require('../src/app');
const { ROLES } = require('../src/config/roles');
const { getAuthCookie } = require('./helpers/testAuth');

function makeUser(role) {
  return { _id: 'user-id', role, isActive: true };
}

function asUser(user) {
  User.findById.mockResolvedValue(user);
  return ['Cookie', getAuthCookie(user)];
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('/api/v1/admin/settings', () => {
  it('returns the singleton settings to a super admin', async () => {
    const settings = { key: 'platform', platformName: 'CityCart' };
    PlatformSettings.findOne.mockResolvedValue(settings);

    const res = await request(app).get('/api/v1/admin/settings').set(...asUser(makeUser(ROLES.SUPER_ADMIN)));

    expect(res.status).toBe(200);
    expect(res.body.settings).toMatchObject(settings);
    expect(PlatformSettings.findOne).toHaveBeenCalledWith({ key: 'platform' });
  });

  it('persists validated partial updates as the singleton document', async () => {
    const settings = { key: 'platform', commissionRate: 8.5 };
    PlatformSettings.findOneAndUpdate.mockResolvedValue(settings);

    const res = await request(app)
      .patch('/api/v1/admin/settings')
      .set(...asUser(makeUser(ROLES.SUPER_ADMIN)))
      .send({ commissionRate: 8.5 });

    expect(res.status).toBe(200);
    expect(res.body.settings).toMatchObject(settings);
    expect(PlatformSettings.findOneAndUpdate).toHaveBeenCalledWith(
      { key: 'platform' },
      { $set: { commissionRate: 8.5 }, $setOnInsert: { key: 'platform' } },
      expect.objectContaining({ upsert: true, runValidators: true })
    );
  });

  it('updates one announcement field without replacing its sibling', async () => {
    PlatformSettings.findOneAndUpdate.mockResolvedValue({ key: 'platform', announcement: { text: 'Sale', enabled: true } });

    const res = await request(app)
      .patch('/api/v1/admin/settings')
      .set(...asUser(makeUser(ROLES.SUPER_ADMIN)))
      .send({ announcement: { enabled: true } });

    expect(res.status).toBe(200);
    expect(PlatformSettings.findOneAndUpdate).toHaveBeenCalledWith(
      { key: 'platform' },
      { $set: { 'announcement.enabled': true }, $setOnInsert: { key: 'platform' } },
      expect.objectContaining({ upsert: true, runValidators: true })
    );
  });

  it('rejects invalid values and unknown fields', async () => {
    const cookie = asUser(makeUser(ROLES.SUPER_ADMIN));
    const invalidRate = await request(app).patch('/api/v1/admin/settings').set(...cookie).send({ commissionRate: 101 });
    const unknownField = await request(app).patch('/api/v1/admin/settings').set(...cookie).send({ key: 'other' });

    expect(invalidRate.status).toBe(400);
    expect(unknownField.status).toBe(400);
    expect(PlatformSettings.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('denies non-admin users', async () => {
    const res = await request(app)
      .get('/api/v1/admin/settings')
      .set(...asUser(makeUser(ROLES.BRAND_ADMIN)));

    expect(res.status).toBe(403);
    expect(PlatformSettings.findOne).not.toHaveBeenCalled();
  });
});