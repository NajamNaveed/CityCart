const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

jest.mock('../src/models/user.model');
jest.mock('../src/models/employee.model');
jest.mock('../src/models/brand.model');
jest.mock('../src/models/serviceProvider.model');

const User = require('../src/models/user.model');
const ServiceProvider = require('../src/models/serviceProvider.model');
const app = require('../src/app');
const env = require('../src/config/env');
const { signToken } = require('../src/utils/jwt');
const { hashPassword } = require('../src/utils/password');

const oid = () => new mongoose.Types.ObjectId();
const brandId = oid();
const PASSWORD = 'correcthorse123';
let passwordHash;

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

const brandOwner = (over = {}) => ({
  _id: oid(),
  name: 'Brand Owner',
  email: 'owner@example.com',
  role: 'BRAND_ADMIN',
  accountType: 'BRAND',
  brandId,
  isActive: true,
  passwordVersion: 0,
  emailVerifiedAt: new Date(),
  ...over,
});

const providerOwner = (over = {}) => ({
  _id: oid(),
  name: 'Sara Owner',
  email: 'sara@example.com',
  role: 'SERVICE_PROVIDER',
  accountType: 'SERVICE',
  isActive: true,
  passwordVersion: 0,
  emailVerifiedAt: new Date(),
  ...over,
});

const providerRow = (user, over = {}) => ({
  _id: oid(),
  userId: user._id,
  displayName: 'Sparkle Home',
  status: 'PENDING',
  ...over,
});

const tokenFor = (user, extra = {}) =>
  signToken({ userId: user._id, role: user.role, brandId: user.brandId, passwordVersion: 0, ...extra }, { expiresIn: '8h' });
const bearer = (token) => ['Authorization', `Bearer ${token}`];

const login = (path, client, body = { email: 'owner@example.com', password: PASSWORD }) => {
  const req = request(app).post(path);
  if (client) req.set('X-Client', client);
  return req.send(body);
};

const brandDoor = (client = 'business', body) => login('/api/v1/auth/business/brand/login', client, body);
const serviceDoor = (client = 'business', body) =>
  login('/api/v1/auth/business/service/login', client, body ?? { email: 'sara@example.com', password: PASSWORD });

function brandAccountExists(over = {}) {
  const user = brandOwner(over);
  User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue({ ...user, passwordHash }) });
  return user;
}

function providerAccountExists(providerOver = {}, userOver = {}) {
  const user = providerOwner(userOver);
  const provider = providerRow(user, providerOver);
  User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue({ ...user, passwordHash }) });
  ServiceProvider.findOne.mockResolvedValue(provider);
  return { user, provider };
}

beforeEach(() => jest.resetAllMocks());

describe('POST /api/v1/auth/business/brand/login', () => {
  it('403 BUSINESS_APP_ONLY without the business header, before any account lookup', async () => {
    const res = await brandDoor(null);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('BUSINESS_APP_ONLY');
    expect(User.findOne).not.toHaveBeenCalled();
  });

  it.each(['mobile', 'staff', 'delivery'])('the %s app header does not open the business sign-in', async (client) => {
    const res = await brandDoor(client);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('BUSINESS_APP_ONLY');
    expect(User.findOne).not.toHaveBeenCalled();
  });

  it('a brand owner gets a token in the body, no cookie, marked as a business token with a staff-length life', async () => {
    const user = brandAccountExists();

    const res = await brandDoor();

    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.body.user).toMatchObject({ role: 'BRAND_ADMIN', brandId: String(brandId) });
    expect(res.body.user.passwordHash).toBeUndefined();
    const payload = jwt.verify(res.body.token, env.jwtSecret);
    expect(payload).toMatchObject({ userId: String(user._id), role: 'BRAND_ADMIN', client: 'business' });
    expect(payload.exp - payload.iat).toBe(env.staffSessionHours * 3600);
    expect(User.findOne).toHaveBeenCalledWith({ email: 'owner@example.com', accountType: 'BRAND' });
  });

  it.each(['BRAND_EMPLOYEE', 'PICKER', 'RIDER', 'SUPER_ADMIN', 'ADMIN_PARTNER', 'CUSTOMER', 'SERVICE_PROVIDER'])(
    '%s cannot sign in here, with the same generic error as a wrong password',
    async (role) => {
      brandAccountExists({ role });
      const res = await brandDoor();
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Invalid email or password.');
      expect(res.body.token).toBeUndefined();
    }
  );

  it('an inactive brand owner cannot sign in', async () => {
    brandAccountExists({ isActive: false });
    expect((await brandDoor()).status).toBe(401);
  });

  it('400 for a malformed body', async () => {
    expect((await brandDoor('business', { email: 'nope' })).status).toBe(400);
  });
});

describe('POST /api/v1/auth/business/service/login', () => {
  it('403 BUSINESS_APP_ONLY without the business header, before any account lookup', async () => {
    const res = await serviceDoor(null);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('BUSINESS_APP_ONLY');
    expect(User.findOne).not.toHaveBeenCalled();
  });

  it.each(['mobile', 'staff', 'delivery'])('the %s app header does not open the business sign-in', async (client) => {
    const res = await serviceDoor(client);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('BUSINESS_APP_ONLY');
    expect(User.findOne).not.toHaveBeenCalled();
  });

  it('a PENDING provider may sign in: token in the body, no cookie, provider tenant attached', async () => {
    const { user, provider } = providerAccountExists({ status: 'PENDING' });

    const res = await serviceDoor();

    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.body.user).toMatchObject({
      role: 'SERVICE_PROVIDER',
      provider: { displayName: 'Sparkle Home', status: 'PENDING' },
    });
    expect(String(res.body.user.providerId)).toBe(String(provider._id));
    expect(res.body.user.brandId).toBeUndefined();
    const payload = jwt.verify(res.body.token, env.jwtSecret);
    expect(payload).toMatchObject({ userId: String(user._id), role: 'SERVICE_PROVIDER', client: 'business' });
    expect(payload.providerId).toBe(String(provider._id));
    expect(payload.exp - payload.iat).toBe(env.staffSessionHours * 3600);
    expect(User.findOne).toHaveBeenCalledWith({ email: 'sara@example.com', accountType: 'SERVICE' });
  });

  it('an ACTIVE provider may sign in too', async () => {
    providerAccountExists({ status: 'ACTIVE' });
    const res = await serviceDoor();
    expect(res.status).toBe(200);
    expect(res.body.user.provider.status).toBe('ACTIVE');
  });

  it.each(['SUSPENDED', 'TERMINATED'])('a %s provider cannot sign in', async (status) => {
    providerAccountExists({ status });
    const res = await serviceDoor();
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password.');
  });

  it('an unverified provider is refused with EMAIL_NOT_VERIFIED after the password is proven', async () => {
    providerAccountExists({}, { emailVerifiedAt: null });
    const res = await serviceDoor();
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it.each(['BRAND_ADMIN', 'BRAND_EMPLOYEE', 'CUSTOMER', 'RIDER'])('%s cannot sign in through the provider door', async (role) => {
    brandAccountExists({ role });
    const res = await serviceDoor();
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password.');
  });

  it('a brand owner cannot use the provider door and a provider cannot use the brand door', async () => {
    brandAccountExists();
    expect((await serviceDoor()).status).toBe(401);

    providerAccountExists();
    expect((await brandDoor()).status).toBe(401);
  });

  it('400 for a malformed body', async () => {
    expect((await serviceDoor('business', { email: 'nope' })).status).toBe(400);
  });
});

describe('web doors refuse the business app header', () => {
  it.each(['/api/v1/auth/login', '/api/v1/auth/brand/login', '/api/v1/auth/service/login', '/api/v1/auth/admin/login'])(
    '%s answers BUSINESS_APP_ONLY before any account lookup',
    async (path) => {
      const res = await login(path, 'business');
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('BUSINESS_APP_ONLY');
      expect(User.findOne).not.toHaveBeenCalled();
    }
  );

  it('the workspace chooser is not part of the business app', async () => {
    const res = await login('/api/v1/auth/workspace', 'business', { workspaceToken: 'x', brandId: oid().toString() });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('BUSINESS_APP_ONLY');
  });
});

describe('Bearer business tokens on the API', () => {
  const me = (...header) => request(app).get('/api/v1/auth/me').set(...header);

  it('works for a brand owner', async () => {
    const user = brandOwner();
    User.findById.mockResolvedValue(user);
    const res = await me(...bearer(tokenFor(user, { client: 'business' })));
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ role: 'BRAND_ADMIN', brandId: String(brandId) });
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('works for a provider owner and resolves the provider tenant on every request', async () => {
    const user = providerOwner();
    const provider = providerRow(user, { status: 'ACTIVE' });
    User.findById.mockResolvedValue(user);
    ServiceProvider.findOne.mockResolvedValue(provider);
    const res = await me(...bearer(tokenFor(user, { client: 'business' })));
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ role: 'SERVICE_PROVIDER' });
    expect(String(res.body.user.providerId)).toBe(String(provider._id));
    expect(ServiceProvider.findOne).toHaveBeenCalledWith({ userId: user._id });
  });

  it('a suspended provider token is refused at once', async () => {
    const user = providerOwner();
    User.findById.mockResolvedValue(user);
    ServiceProvider.findOne.mockResolvedValue(providerRow(user, { status: 'SUSPENDED' }));
    const res = await me(...bearer(tokenFor(user, { client: 'business' })));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('PROVIDER_INACTIVE');
  });

  it.each(['BRAND_EMPLOYEE', 'PICKER', 'RIDER', 'CUSTOMER'])('%s cannot use a business token', async (role) => {
    const user = { _id: oid(), role, isActive: true, passwordVersion: 0, brandId };
    User.findById.mockResolvedValue(user);
    const res = await me(...bearer(tokenFor(user, { client: 'business' })));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('WRONG_APP');
  });

  it.each(['SUPER_ADMIN', 'ADMIN_PARTNER'])('%s stays on the web even with a business token', async (role) => {
    const user = { _id: oid(), role, isActive: true, passwordVersion: 0 };
    User.findById.mockResolvedValue(user);
    const res = await me(...bearer(tokenFor(user, { client: 'business' })));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('WEB_ONLY');
  });

  it('a staff or delivery token never opens the business app', async () => {
    const user = brandOwner();
    User.findById.mockResolvedValue(user);
    for (const client of ['staff', 'delivery']) {
      const res = await me(...bearer(tokenFor(user, { client })));
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('WRONG_APP');
    }
  });

  it('a business token without the mark, or a shopper token, is refused (WRONG_APP)', async () => {
    const user = brandOwner();
    User.findById.mockResolvedValue(user);
    expect((await me(...bearer(tokenFor(user)))).body.code).toBe('WRONG_APP');

    const customer = { _id: oid(), role: 'CUSTOMER', isActive: true, passwordVersion: 0 };
    User.findById.mockResolvedValue(customer);
    const shopperStyle = await me(...bearer(tokenFor(customer)));
    expect(shopperStyle.status).toBe(200);
    const marked = await me(...bearer(tokenFor(customer, { client: 'business' })));
    expect(marked.status).toBe(403);
    expect(marked.body.code).toBe('WRONG_APP');
  });

  it('a password change with a business token returns a fresh business token and no cookie', async () => {
    const current = 'current-secret-123';
    const next = 'new-secret-456';
    const user = brandOwner();
    User.findById.mockResolvedValueOnce(user).mockReturnValueOnce({
      select: jest.fn().mockResolvedValue({ ...user, passwordHash: await hashPassword(current) }),
    });
    // Later requests load the rotated account.
    User.findById.mockResolvedValue({ ...user, passwordVersion: 1 });
    User.findOneAndUpdate.mockImplementation(async (_filter, update) => ({
      ...user,
      passwordHash: update.$set.passwordHash,
      passwordVersion: update.$inc.passwordVersion,
    }));

    const res = await request(app)
      .patch('/api/v1/auth/password')
      .set(...bearer(tokenFor(user, { client: 'business' })))
      .send({ currentPassword: current, newPassword: next, confirmPassword: next });

    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']).toBeUndefined();
    const payload = jwt.verify(res.body.token, env.jwtSecret);
    expect(payload).toMatchObject({ userId: String(user._id), role: 'BRAND_ADMIN', client: 'business', passwordVersion: 1 });
    const stale = await request(app)
      .get('/api/v1/auth/me')
      .set(...bearer(tokenFor(user, { client: 'business' })));
    expect(stale.status).toBe(401);
  });
});
