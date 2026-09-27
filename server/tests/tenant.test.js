const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');

const requireTenant = require('../src/middleware/requireTenant');
const requireBrandOwnership = require('../src/middleware/requireBrandOwnership');
const { ROLES } = require('../src/config/roles');

function makeFakeUser(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    role: ROLES.CUSTOMER,
    brandId: undefined,
    isActive: true,
    ...overrides,
  };
}

function buildTestApp(user, ...middlewares) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    if (user !== undefined) {
      req.user = user;
    }
    next();
  });
  app.all('/protected', ...middlewares, (req, res) => {
    res.status(200).json({
      success: true,
      tenantBrandId: req.tenantBrandId,
      resource: req.resource || null,
    });
  });
  return app;
}

describe('requireTenant', () => {
  it('rejects an unauthenticated request (no req.user) with 401', async () => {
    const app = buildTestApp(undefined, requireTenant);
    const res = await request(app).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('allows SUPER_ADMIN and sets tenantBrandId to null (platform-wide)', async () => {
    const app = buildTestApp(makeFakeUser({ role: ROLES.SUPER_ADMIN }), requireTenant);
    const res = await request(app).get('/protected');
    expect(res.status).toBe(200);
    expect(res.body.tenantBrandId).toBeNull();
  });

  it('allows BRAND_ADMIN with a valid brandId', async () => {
    const brandId = new mongoose.Types.ObjectId();
    const app = buildTestApp(
      makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId }),
      requireTenant
    );
    const res = await request(app).get('/protected');
    expect(res.status).toBe(200);
    expect(res.body.tenantBrandId).toBe(brandId.toString());
  });

  it('allows BRAND_EMPLOYEE with a valid brandId', async () => {
    const brandId = new mongoose.Types.ObjectId();
    const app = buildTestApp(
      makeFakeUser({ role: ROLES.BRAND_EMPLOYEE, brandId }),
      requireTenant
    );
    const res = await request(app).get('/protected');
    expect(res.status).toBe(200);
    expect(res.body.tenantBrandId).toBe(brandId.toString());
  });

  it('denies a brand user (BRAND_ADMIN) with no brandId', async () => {
    const app = buildTestApp(
      makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: undefined }),
      requireTenant
    );
    const res = await request(app).get('/protected');
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('denies a brand user (BRAND_EMPLOYEE) with no brandId', async () => {
    const app = buildTestApp(
      makeFakeUser({ role: ROLES.BRAND_EMPLOYEE, brandId: undefined }),
      requireTenant
    );
    const res = await request(app).get('/protected');
    expect(res.status).toBe(403);
  });

  it('denies CUSTOMER — not a brand-admin tenant user', async () => {
    const app = buildTestApp(makeFakeUser({ role: ROLES.CUSTOMER }), requireTenant);
    const res = await request(app).get('/protected');
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('never derives tenant scope from a client-supplied brandId', async () => {
    const realBrandId = new mongoose.Types.ObjectId();
    const spoofedBrandId = new mongoose.Types.ObjectId();
    const app = buildTestApp(
      makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: realBrandId }),
      requireTenant
    );
    // Attempt to override the tenant via body/query — must be ignored.
    const res = await request(app)
      .get(`/protected?brandId=${spoofedBrandId.toString()}`)
      .send({ brandId: spoofedBrandId.toString() });

    expect(res.status).toBe(200);
    expect(res.body.tenantBrandId).toBe(realBrandId.toString());
    expect(res.body.tenantBrandId).not.toBe(spoofedBrandId.toString());
  });
});

describe('requireBrandOwnership', () => {
  function fetchResourceFactory(resource) {
    return jest.fn().mockResolvedValue(resource);
  }

  it('rejects an unauthenticated request (no req.user) with 401', async () => {
    const fetchResource = fetchResourceFactory({ brandId: new mongoose.Types.ObjectId() });
    const app = buildTestApp(undefined, requireBrandOwnership(fetchResource));
    const res = await request(app).get('/protected');
    expect(res.status).toBe(401);
  });

  it('returns 404 when the resource does not exist', async () => {
    const fetchResource = fetchResourceFactory(null);
    const app = buildTestApp(
      makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: new mongoose.Types.ObjectId() }),
      requireBrandOwnership(fetchResource)
    );
    const res = await request(app).get('/protected');
    expect(res.status).toBe(404);
  });

  it('allows SUPER_ADMIN regardless of the resource brand', async () => {
    const resourceBrandId = new mongoose.Types.ObjectId();
    const fetchResource = fetchResourceFactory({ brandId: resourceBrandId });
    const app = buildTestApp(
      makeFakeUser({ role: ROLES.SUPER_ADMIN }),
      requireBrandOwnership(fetchResource)
    );
    const res = await request(app).get('/protected');
    expect(res.status).toBe(200);
    expect(res.body.resource.brandId).toBe(resourceBrandId.toString());
  });

  it('allows a Brand A user accessing a Brand A resource', async () => {
    const brandAId = new mongoose.Types.ObjectId();
    const fetchResource = fetchResourceFactory({ brandId: brandAId });
    const app = buildTestApp(
      makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: brandAId }),
      requireBrandOwnership(fetchResource)
    );
    const res = await request(app).get('/protected');
    expect(res.status).toBe(200);
  });

  it('allows a BRAND_EMPLOYEE of Brand A accessing a Brand A resource', async () => {
    const brandAId = new mongoose.Types.ObjectId();
    const fetchResource = fetchResourceFactory({ brandId: brandAId });
    const app = buildTestApp(
      makeFakeUser({ role: ROLES.BRAND_EMPLOYEE, brandId: brandAId }),
      requireBrandOwnership(fetchResource)
    );
    const res = await request(app).get('/protected');
    expect(res.status).toBe(200);
  });

  it('denies a Brand A user accessing a Brand B resource', async () => {
    const brandAId = new mongoose.Types.ObjectId();
    const brandBId = new mongoose.Types.ObjectId();
    const fetchResource = fetchResourceFactory({ brandId: brandBId });
    const app = buildTestApp(
      makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: brandAId }),
      requireBrandOwnership(fetchResource)
    );
    const res = await request(app).get('/protected');
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('denies a brand user with no brandId at all', async () => {
    const fetchResource = fetchResourceFactory({ brandId: new mongoose.Types.ObjectId() });
    const app = buildTestApp(
      makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: undefined }),
      requireBrandOwnership(fetchResource)
    );
    const res = await request(app).get('/protected');
    expect(res.status).toBe(403);
  });

  it('ignores a client-supplied brandId that tries to override the authenticated brand', async () => {
    const brandAId = new mongoose.Types.ObjectId();
    const brandBId = new mongoose.Types.ObjectId();
    // The resource actually belongs to Brand B.
    const fetchResource = fetchResourceFactory({ brandId: brandBId });
    const app = buildTestApp(
      makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: brandAId }),
      requireBrandOwnership(fetchResource)
    );

    // The request body/query claims brandId = Brand B (the resource's
    // real brand) to try to trick the check into passing.
    const res = await request(app)
      .get(`/protected?brandId=${brandBId.toString()}`)
      .send({ brandId: brandBId.toString() });

    // Still denied — the middleware never reads body/query brandId, only
    // req.user.brandId (Brand A) vs the fetched resource's brandId
    // (Brand B), which do not match.
    expect(res.status).toBe(403);
  });

  it('never allows CUSTOMER to use brand-tenant ownership to access a brand resource', async () => {
    const brandId = new mongoose.Types.ObjectId();
    const fetchResource = fetchResourceFactory({ brandId });
    const app = buildTestApp(
      makeFakeUser({ role: ROLES.CUSTOMER, brandId: undefined }),
      requireBrandOwnership(fetchResource)
    );
    const res = await request(app).get('/protected');
    expect(res.status).toBe(403);
  });

  it('attaches the loaded resource to req.resource on success', async () => {
    const brandId = new mongoose.Types.ObjectId();
    const resource = { _id: new mongoose.Types.ObjectId(), brandId, name: 'Widget' };
    const fetchResource = fetchResourceFactory(resource);
    const app = buildTestApp(
      makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId }),
      requireBrandOwnership(fetchResource)
    );
    const res = await request(app).get('/protected');
    expect(res.status).toBe(200);
    expect(res.body.resource.name).toBe('Widget');
  });

  it('supports a custom resourceKey option', async () => {
    const brandId = new mongoose.Types.ObjectId();
    const resource = { brandId, name: 'Custom' };
    const fetchResource = fetchResourceFactory(resource);
    const app = express();
    app.use((req, res, next) => {
      req.user = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId });
      next();
    });
    app.get(
      '/protected',
      requireBrandOwnership(fetchResource, { resourceKey: 'product' }),
      (req, res) => {
        res.status(200).json({ product: req.product, resource: req.resource || null });
      }
    );

    const res = await request(app).get('/protected');
    expect(res.status).toBe(200);
    expect(res.body.product.name).toBe('Custom');
    expect(res.body.resource).toBeNull();
  });

  describe("resourceType: 'tenant' (resource IS the brand, e.g. Brand itself)", () => {
    it('allows a BRAND_ADMIN to access their own brand via resource._id, not resource.brandId', async () => {
      const brandAId = new mongoose.Types.ObjectId();
      // No brandId field at all — matches the real Brand model.
      const fetchResource = fetchResourceFactory({ _id: brandAId, name: 'Brand A' });
      const app = buildTestApp(
        makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: brandAId }),
        requireBrandOwnership(fetchResource, { resourceType: 'tenant' })
      );
      const res = await request(app).get('/protected');
      expect(res.status).toBe(200);
      expect(res.body.resource.name).toBe('Brand A');
    });

    it('denies a BRAND_ADMIN of Brand A accessing Brand B via resourceType: tenant', async () => {
      const brandAId = new mongoose.Types.ObjectId();
      const brandBId = new mongoose.Types.ObjectId();
      const fetchResource = fetchResourceFactory({ _id: brandBId, name: 'Brand B' });
      const app = buildTestApp(
        makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: brandAId }),
        requireBrandOwnership(fetchResource, { resourceType: 'tenant' })
      );
      const res = await request(app).get('/protected');
      expect(res.status).toBe(403);
    });

    it('allows SUPER_ADMIN to access any brand via resourceType: tenant', async () => {
      const brandId = new mongoose.Types.ObjectId();
      const fetchResource = fetchResourceFactory({ _id: brandId, name: 'Any Brand' });
      const app = buildTestApp(
        makeFakeUser({ role: ROLES.SUPER_ADMIN }),
        requireBrandOwnership(fetchResource, { resourceType: 'tenant' })
      );
      const res = await request(app).get('/protected');
      expect(res.status).toBe(200);
    });

    it('denies CUSTOMER via resourceType: tenant', async () => {
      const brandId = new mongoose.Types.ObjectId();
      const fetchResource = fetchResourceFactory({ _id: brandId, name: 'Brand' });
      const app = buildTestApp(
        makeFakeUser({ role: ROLES.CUSTOMER }),
        requireBrandOwnership(fetchResource, { resourceType: 'tenant' })
      );
      const res = await request(app).get('/protected');
      expect(res.status).toBe(403);
    });

    it('does NOT fall back to a brandId field even if one is spuriously present on a tenant resource', async () => {
      // Regression guard: a resource.brandId that happens to equal the
      // caller's brandId must not be used to grant access under
      // resourceType: 'tenant' — only resource._id counts.
      const brandAId = new mongoose.Types.ObjectId();
      const actualBrandId = new mongoose.Types.ObjectId();
      const fetchResource = fetchResourceFactory({
        _id: actualBrandId,
        brandId: brandAId, // spurious — must be ignored under 'tenant'
        name: 'Brand',
      });
      const app = buildTestApp(
        makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: brandAId }),
        requireBrandOwnership(fetchResource, { resourceType: 'tenant' })
      );
      const res = await request(app).get('/protected');
      expect(res.status).toBe(403);
    });
  });
});

describe('full chain: requireTenant then requireBrandOwnership', () => {
  it('a Brand A employee can reach a Brand A resource through both steps', async () => {
    const brandAId = new mongoose.Types.ObjectId();
    const fetchResource = jest.fn().mockResolvedValue({ brandId: brandAId });
    const app = buildTestApp(
      makeFakeUser({ role: ROLES.BRAND_EMPLOYEE, brandId: brandAId }),
      requireTenant,
      requireBrandOwnership(fetchResource)
    );
    const res = await request(app).get('/protected');
    expect(res.status).toBe(200);
  });

  it('a Brand A employee is stopped at requireTenant before even reaching requireBrandOwnership if brandId is missing', async () => {
    const fetchResource = jest.fn().mockResolvedValue({ brandId: new mongoose.Types.ObjectId() });
    const app = buildTestApp(
      makeFakeUser({ role: ROLES.BRAND_EMPLOYEE, brandId: undefined }),
      requireTenant,
      requireBrandOwnership(fetchResource)
    );
    const res = await request(app).get('/protected');
    expect(res.status).toBe(403);
    // Never even attempted to load the resource.
    expect(fetchResource).not.toHaveBeenCalled();
  });

  it('a Brand A employee is stopped at requireBrandOwnership when accessing a Brand B resource', async () => {
    const brandAId = new mongoose.Types.ObjectId();
    const brandBId = new mongoose.Types.ObjectId();
    const fetchResource = jest.fn().mockResolvedValue({ brandId: brandBId });
    const app = buildTestApp(
      makeFakeUser({ role: ROLES.BRAND_EMPLOYEE, brandId: brandAId }),
      requireTenant,
      requireBrandOwnership(fetchResource)
    );
    const res = await request(app).get('/protected');
    expect(res.status).toBe(403);
  });
});