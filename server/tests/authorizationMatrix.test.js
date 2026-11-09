const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/user.model');

const User = require('../src/models/user.model');
const app = require('../src/app');
const { signToken } = require('../src/utils/jwt');
const { ROLES } = require('../src/config/roles');

// The routes a signed-out visitor may reach on purpose (docs/05, docs/24 §8.2).
// Every other mounted route must refuse a request that carries no session.
// This list is asserted against the real router below, so a route that loses
// its `authenticate` guard — or a new public route — fails the suite instead
// of shipping silently.
const PUBLIC_ROUTES = [
  // Foundation and crawler files.
  'GET /health',
  'GET /robots.txt',
  'GET /sitemap.xml',
  'GET /api/v1',
  // Sign-in, registration, account recovery and the workspace chooser. Logout
  // is public because it only clears a cookie the caller may not even hold.
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/brand/login',
  'POST /api/v1/auth/admin/login',
  'POST /api/v1/auth/staff/login',
  'POST /api/v1/auth/delivery/login',
  'POST /api/v1/auth/service/login',
  'POST /api/v1/auth/workspace',
  'POST /api/v1/auth/register',
  'POST /api/v1/auth/forgot-password',
  'POST /api/v1/auth/reset-password',
  'POST /api/v1/auth/verify-email',
  'POST /api/v1/auth/verify-email/resend',
  'POST /api/v1/auth/logout',
  // Public marketplace discovery and storefronts.
  'GET /api/v1/blocks',
  'GET /api/v1/blocks/at',
  'GET /api/v1/blocks/resolve',
  'GET /api/v1/brands',
  'GET /api/v1/brands/check-name',
  'GET /api/v1/brands/:id',
  'GET /api/v1/brands/:id/storefront',
  'GET /api/v1/categories',
  'GET /api/v1/categories/tree',
  'GET /api/v1/categories/:id',
  'GET /api/v1/cities',
  'GET /api/v1/cities/:id',
  'GET /api/v1/catalog/browse/:id',
  'GET /api/v1/discover',
  'GET /api/v1/products/:id',
  'GET /api/v1/products/:id/reviews',
  'GET /api/v1/reviews/summary',
  'GET /api/v1/settings/public',
  'GET /api/v1/stores/:id',
  // Seller and provider applications are public by design: they create the
  // account that will sign in afterwards.
  'POST /api/v1/brands/apply',
  'POST /api/v1/services/apply',
  // Public service discovery.
  'GET /api/v1/services/categories',
  'GET /api/v1/services/discover',
  'GET /api/v1/services/providers/:slug',
];

const BOOTSTRAP_MIDDLEWARE = new Set([
  'query',
  'expressInit',
  'helmetMiddleware',
  'requestLogger',
  'corsMiddleware',
  'jsonParser',
  'urlencodedParser',
  'cookieParser',
]);

function mountedPath(layer) {
  const source = layer.regexp && layer.regexp.source;
  if (!source) return '';
  let path = source.startsWith('^') ? source.slice(1) : source;
  const lookahead = path.indexOf('(?=');
  if (lookahead !== -1) path = path.slice(0, lookahead);
  return path.replace(/\\\//g, '/').replace(/\\/g, '').replace(/\/\?$/, '').replace(/\/$/, '');
}

/**
 * Walks the real Express router (not a hand-written list) and records, for
 * every endpoint, the middleware that will run before the handler. Router-level
 * `use` middleware is inherited by the routes declared after it, so the chain
 * reflects the order a request actually takes.
 */
function collectRoutes() {
  const routes = [];
  const walk = (stack, prefix, inherited) => {
    let chain = inherited;
    for (const layer of stack) {
      if (layer.route) {
        const path = prefix + (layer.route.path === '/' ? '' : layer.route.path);
        const names = [...chain, ...layer.route.stack.map((l) => l.name)].filter(
          (name) => !BOOTSTRAP_MIDDLEWARE.has(name)
        );
        for (const method of Object.keys(layer.route.methods)) {
          routes.push({ key: `${method.toUpperCase()} ${path || '/'}`, method: method.toUpperCase(), path: path || '/', names });
        }
      } else if (layer.name === 'router' && layer.handle.stack) {
        walk(layer.handle.stack, prefix + mountedPath(layer), chain);
      } else if (typeof layer.handle === 'function') {
        chain = [...chain, layer.name];
      }
    }
  };
  walk((app._router || app.router).stack, '', []);
  return routes;
}

const ROUTES = collectRoutes();
const GUARDED_ROUTES = ROUTES.filter((route) => route.names.includes('authenticate'));
const UNGUARDED_ROUTES = ROUTES.filter((route) => !route.names.includes('authenticate'));

// Every path parameter is given a well-formed ObjectId so a request that
// somehow reaches a controller cannot fail on a cast error instead of auth.
function requestPath(path) {
  const oid = new mongoose.Types.ObjectId().toString();
  return path.replace(/:[A-Za-z]+/g, (param) => (param === ':slug' ? 'demo-provider' : oid));
}

function send(route, token) {
  const req = request(app)[route.method.toLowerCase()](requestPath(route.path));
  return token ? req.set('Authorization', token) : req;
}

const userId = new mongoose.Types.ObjectId();

beforeEach(() => {
  jest.clearAllMocks();
});

describe('route inventory', () => {
  it('walks the mounted app and finds every router', () => {
    expect(ROUTES.length).toBeGreaterThan(200);
    expect(GUARDED_ROUTES.length).toBeGreaterThan(200);
  });

  it('has exactly the declared routes as public', () => {
    expect(UNGUARDED_ROUTES.map((route) => route.key).sort()).toEqual([...PUBLIC_ROUTES].sort());
  });

  it('keeps every public route free of role and tenant guards', () => {
    for (const route of UNGUARDED_ROUTES) {
      expect(route.names).not.toContain('adminPermissionMiddleware');
      expect(route.names).not.toContain('requireTenant');
    }
  });
});

describe('signed-out access', () => {
  it('refuses every guarded route with 401', async () => {
    const failures = [];
    for (const route of GUARDED_ROUTES) {
      const res = await send(route);
      if (res.status !== 401) failures.push(`${route.key} -> ${res.status}`);
    }
    expect(failures).toEqual([]);
  });

  it('refuses every guarded route when the bearer token is malformed', async () => {
    const failures = [];
    for (const route of GUARDED_ROUTES) {
      const res = await send(route, 'Bearer not-a-real-token');
      if (res.status !== 401) failures.push(`${route.key} -> ${res.status}`);
    }
    expect(failures).toEqual([]);
  });

  it('refuses an empty Bearer header rather than falling back to the cookie', async () => {
    const res = await request(app).get('/api/v1/cart').set('Authorization', 'Bearer');
    expect(res.status).toBe(401);
  });

  it('never accepts a workspace-chooser token as a session', async () => {
    const token = signToken({ userId, role: ROLES.BRAND_EMPLOYEE, purpose: 'workspace' });
    const res = await request(app).get('/api/v1/cart').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});

describe('native-app token marks', () => {
  function tokenFor(user, client) {
    return signToken({
      userId: user._id,
      role: user.role,
      brandId: user.brandId,
      passwordVersion: user.passwordVersion,
      client,
    });
  }

  const customer = {
    _id: new mongoose.Types.ObjectId(),
    role: ROLES.CUSTOMER,
    isActive: true,
    passwordVersion: 0,
  };
  const brandAdmin = {
    _id: new mongoose.Types.ObjectId(),
    role: ROLES.BRAND_ADMIN,
    brandId: new mongoose.Types.ObjectId(),
    isActive: true,
    passwordVersion: 0,
  };
  const rider = {
    _id: new mongoose.Types.ObjectId(),
    role: ROLES.RIDER,
    brandId: new mongoose.Types.ObjectId(),
    isActive: true,
    passwordVersion: 0,
  };

  it('refuses a Staff app token for a shopper account', async () => {
    User.findById.mockResolvedValue(customer);
    const res = await request(app).get('/api/v1/cart').set('Authorization', `Bearer ${tokenFor(customer, 'staff')}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('WRONG_APP');
  });

  it('refuses a Delivery app token for a shopper account', async () => {
    User.findById.mockResolvedValue(customer);
    const res = await request(app).get('/api/v1/cart').set('Authorization', `Bearer ${tokenFor(customer, 'delivery')}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('WRONG_APP');
  });

  it('refuses a shopper token for a brand owner', async () => {
    User.findById.mockResolvedValue(brandAdmin);
    const res = await request(app).get('/api/v1/cart').set('Authorization', `Bearer ${tokenFor(brandAdmin)}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('WEB_ONLY');
  });

  it('refuses a Staff app token for a rider', async () => {
    User.findById.mockResolvedValue(rider);
    const res = await request(app).get('/api/v1/rider/deliveries').set('Authorization', `Bearer ${tokenFor(rider, 'staff')}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('WRONG_APP');
  });

  it('refuses a Delivery app token for a brand owner', async () => {
    User.findById.mockResolvedValue(brandAdmin);
    const res = await request(app).get('/api/v1/cart').set('Authorization', `Bearer ${tokenFor(brandAdmin, 'delivery')}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('WEB_ONLY');
  });
});

describe('cross-role denial', () => {
  const uid = mongoose.Types.ObjectId;
  const users = {
    [ROLES.CUSTOMER]: { _id: new uid(), role: ROLES.CUSTOMER, isActive: true, passwordVersion: 0 },
    [ROLES.BRAND_ADMIN]: { _id: new uid(), role: ROLES.BRAND_ADMIN, brandId: new uid(), isActive: true, passwordVersion: 0 },
    [ROLES.RIDER]: { _id: new uid(), role: ROLES.RIDER, brandId: new uid(), isActive: true, passwordVersion: 0 },
    [ROLES.SERVICE_PROVIDER]: { _id: new uid(), role: ROLES.SERVICE_PROVIDER, isActive: true, passwordVersion: 0 },
  };

  const cases = [
    ['CUSTOMER cannot read the admin panel', ROLES.CUSTOMER, 'get', '/api/v1/admin/users'],
    ['CUSTOMER cannot manage brands', ROLES.CUSTOMER, 'get', '/api/v1/brands/me'],
    ['BRAND_ADMIN cannot read the admin panel', ROLES.BRAND_ADMIN, 'get', '/api/v1/admin/users'],
    ['BRAND_ADMIN cannot use the picker queue', ROLES.BRAND_ADMIN, 'get', '/api/v1/picker'],
    ['RIDER cannot read brand staff', ROLES.RIDER, 'get', '/api/v1/employees'],
    ['RIDER cannot read the brand dashboard analytics', ROLES.RIDER, 'get', '/api/v1/analytics/brand'],
    ['SERVICE_PROVIDER cannot read brand orders', ROLES.SERVICE_PROVIDER, 'get', '/api/v1/brand/orders'],
    ['SERVICE_PROVIDER cannot read the admin panel', ROLES.SERVICE_PROVIDER, 'get', '/api/v1/admin/users'],
  ];

  it.each(cases)('%s', async (_label, role, method, path) => {
    User.findById.mockResolvedValue(users[role]);
    const token = signToken({ userId: users[role]._id, role, brandId: users[role].brandId });
    const res = await request(app)
      [method](path)
      .set('Authorization', `Bearer ${token}`);
    expect([401, 403]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });
});
