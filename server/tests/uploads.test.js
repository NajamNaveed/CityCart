const crypto = require('crypto');
const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/user.model');
jest.mock('../src/models/employee.model');

const User = require('../src/models/user.model');
const Employee = require('../src/models/employee.model');
const app = require('../src/app');
const env = require('../src/config/env');
const { ROLES } = require('../src/config/roles');
const { PERMISSIONS } = require('../src/config/permissions');
const { getAuthCookie } = require('./helpers/testAuth');
const { signParams, isConfigured } = require('../src/services/upload.service');

const oid = () => new mongoose.Types.ObjectId();
const brandId = oid();
const CONFIG = { cloudName: 'democloud', apiKey: 'key123', apiSecret: 'secret456' };
const sha1 = (text) => crypto.createHash('sha1').update(text).digest('hex');

function asRole(role, permissions) {
  const user = { _id: oid(), role, isActive: true, ...(role.includes('BRAND') && { brandId }) };
  User.findById.mockResolvedValue(user);
  if (role === ROLES.BRAND_EMPLOYEE) {
    Employee.findOne.mockResolvedValue({ isActive: true, permissions: permissions || [] });
  }
  return ['Cookie', getAuthCookie(user)];
}

const original = { ...env.cloudinary };
beforeEach(() => {
  jest.resetAllMocks();
  env.cloudinary = { ...CONFIG };
});
afterAll(() => {
  env.cloudinary = original;
});

describe('Cloudinary signature', () => {
  it('sorts the parameters, joins them with &, appends the secret and takes SHA-1', () => {
    const signature = signParams({ timestamp: 1700000000, folder: 'a/b', allowed_formats: 'jpg,png' }, 'shh');
    expect(signature).toBe(sha1('allowed_formats=jpg,png&folder=a/b&timestamp=1700000000shh'));
  });

  it('leaves out empty and missing parameters', () => {
    expect(signParams({ b: '2', a: '', c: undefined, d: null }, 's')).toBe(sha1('b=2s'));
  });

  it('treats the .env.example placeholders as not configured', () => {
    expect(isConfigured({ cloudName: 'your_cloud_name', apiKey: 'your_api_key', apiSecret: 'your_api_secret' })).toBe(false);
    expect(isConfigured({ cloudName: '', apiKey: 'k', apiSecret: 's' })).toBe(false);
    expect(isConfigured(CONFIG)).toBe(true);
  });
});

describe('POST /api/v1/uploads/signature', () => {
  it('gives a brand admin a signature for ITS OWN brand folder', async () => {
    const res = await request(app).post('/api/v1/uploads/signature').set(...asRole(ROLES.BRAND_ADMIN));

    expect(res.status).toBe(200);
    const { upload } = res.body;
    expect(upload.uploadUrl).toBe('https://api.cloudinary.com/v1_1/democloud/image/upload');
    expect(upload.apiKey).toBe('key123');
    expect(upload.folder).toBe(`citycart/brands/${brandId}/products`);
    expect(upload.allowedFormats).toBe('jpg,png,webp');
    expect(upload.signature).toBe(
      sha1(`allowed_formats=jpg,png,webp&folder=citycart/brands/${brandId}/products&timestamp=${upload.timestamp}secret456`)
    );
  });

  it('never reveals the API secret', async () => {
    const res = await request(app).post('/api/v1/uploads/signature').set(...asRole(ROLES.BRAND_ADMIN));
    expect(JSON.stringify(res.body)).not.toContain('secret456');
  });

  it('ignores a client-supplied folder or brand id', async () => {
    const res = await request(app)
      .post(`/api/v1/uploads/signature?brandId=${oid()}`)
      .set(...asRole(ROLES.BRAND_ADMIN))
      .send({ folder: 'citycart/brands/someone-else', brandId: oid() });

    expect(res.body.upload.folder).toBe(`citycart/brands/${brandId}/products`);
  });

  it('answers 503 with a clear code when Cloudinary is not set up', async () => {
    env.cloudinary = { cloudName: 'your_cloud_name', apiKey: 'your_api_key', apiSecret: 'your_api_secret' };
    const res = await request(app).post('/api/v1/uploads/signature').set(...asRole(ROLES.BRAND_ADMIN));

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('UPLOAD_NOT_CONFIGURED');
  });

  it('lets an employee with products.update OR products.create in', async () => {
    for (const permission of [PERMISSIONS.PRODUCTS_UPDATE, PERMISSIONS.PRODUCTS_CREATE]) {
      const res = await request(app).post('/api/v1/uploads/signature').set(...asRole(ROLES.BRAND_EMPLOYEE, [permission]));
      expect(res.status).toBe(200);
    }
  });

  it('refuses an employee who can only view products', async () => {
    const res = await request(app)
      .post('/api/v1/uploads/signature')
      .set(...asRole(ROLES.BRAND_EMPLOYEE, [PERMISSIONS.PRODUCTS_VIEW, PERMISSIONS.ORDERS_VIEW]));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERMISSION_DENIED');
  });

  it('is closed to guests and customers, and to the super admin (no brand)', async () => {
    expect((await request(app).post('/api/v1/uploads/signature')).status).toBe(401);
    expect((await request(app).post('/api/v1/uploads/signature').set(...asRole(ROLES.CUSTOMER))).status).toBe(403);

    const admin = await request(app).post('/api/v1/uploads/signature').set(...asRole(ROLES.SUPER_ADMIN));
    expect(admin.status).toBe(403);
    expect(admin.body.code).toBe('NO_BRAND');
  });
});