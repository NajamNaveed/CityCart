const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/user.model');
jest.mock('../src/models/employee.model');
jest.mock('../src/models/category.model');
jest.mock('../src/models/brand.model');
// Factory mock: automock would turn Product.STATUSES into an empty array,
// which product.validator.js (loaded via app) needs for its status enum.
jest.mock('../src/models/product.model', () => {
  const actual = jest.requireActual('../src/models/product.model');
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    countDocuments: jest.fn(),
    STATUSES: actual.STATUSES,
  };
});

const User = require('../src/models/user.model');
const Employee = require('../src/models/employee.model');
const Category = require('../src/models/category.model');
const Brand = require('../src/models/brand.model');
const Product = require('../src/models/product.model');
const app = require('../src/app');
const { ROLES } = require('../src/config/roles');
const { PERMISSIONS } = require('../src/config/permissions');
const { getAuthCookie } = require('./helpers/testAuth');

function makeFakeUser(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    role: ROLES.CUSTOMER,
    brandId: undefined,
    isActive: true,
    ...overrides,
  };
}

function asUser(user) {
  User.findById.mockResolvedValue(user);
  return ['Cookie', getAuthCookie(user)];
}

function oid() {
  return new mongoose.Types.ObjectId();
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe('GET /api/v1/categories (public)', () => {
  it('lists active categories with no authentication', async () => {
    const activeBrand = oid();
    Brand.find.mockResolvedValue([{ _id: activeBrand }]);
    const sort = jest.fn().mockResolvedValue([{ name: 'Phones' }]);
    Category.find.mockReturnValue({ sort });

    const res = await request(app).get('/api/v1/categories');

    expect(res.status).toBe(200);
    expect(res.body.categories).toHaveLength(1);
    // Only categories of ACTIVE brands are public.
    expect(Brand.find).toHaveBeenCalledWith({ status: 'ACTIVE' }, '_id');
    expect(Category.find).toHaveBeenCalledWith({
      brandId: { $in: [activeBrand] },
      isActive: true,
    });
  });

  it('filters by brandId', async () => {
    const brandId = oid().toString();
    Brand.find.mockResolvedValue([{ _id: brandId }]);
    Category.find.mockReturnValue({ sort: jest.fn().mockResolvedValue([]) });

    const res = await request(app).get(`/api/v1/categories?brandId=${brandId}`);

    expect(res.status).toBe(200);
    expect(Brand.find).toHaveBeenCalledWith({ status: 'ACTIVE', _id: brandId }, '_id');
    expect(Category.find).toHaveBeenCalledWith({ brandId: { $in: [brandId] }, isActive: true });
  });

  it('rejects an invalid brandId with 400', async () => {
    const res = await request(app).get('/api/v1/categories?brandId=nope');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/categories/:id (public)', () => {
  it('returns an active category', async () => {
    const id = oid().toString();
    Category.findOne.mockResolvedValue({ _id: id, name: 'Phones', isActive: true });

    const res = await request(app).get(`/api/v1/categories/${id}`);

    expect(res.status).toBe(200);
    expect(Category.findOne).toHaveBeenCalledWith({ _id: id, isActive: true });
  });

  it('returns 404 for a nonexistent or inactive category', async () => {
    Category.findOne.mockResolvedValue(null);
    const res = await request(app).get(`/api/v1/categories/${oid().toString()}`);
    expect(res.status).toBe(404);
  });

  it('rejects an invalid id with 400', async () => {
    const res = await request(app).get('/api/v1/categories/not-an-id');
    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/categories', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app).post('/api/v1/categories').send({ name: 'Phones' });
    expect(res.status).toBe(401);
  });

  it('creates a category for a BRAND_ADMIN using the authenticated brand', async () => {
    const brandId = oid();
    const admin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId });
    Category.findOne.mockResolvedValue(null);
    Category.create.mockImplementation(async (data) => data);

    const res = await request(app)
      .post('/api/v1/categories')
      .set(...asUser(admin))
      .send({ name: 'Phones' });

    expect(res.status).toBe(201);
    expect(Category.create).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: brandId.toString(), name: 'Phones', slug: 'phones' })
    );
  });

  it('ignores a client-supplied brandId and uses the authenticated brand', async () => {
    const brandId = oid();
    const spoofed = oid().toString();
    const admin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId });
    Category.findOne.mockResolvedValue(null);
    Category.create.mockImplementation(async (data) => data);

    const res = await request(app)
      .post('/api/v1/categories')
      .set(...asUser(admin))
      .send({ name: 'Phones', brandId: spoofed });

    expect(res.status).toBe(201);
    const created = Category.create.mock.calls[0][0];
    expect(created.brandId).toBe(brandId.toString());
    expect(created.brandId).not.toBe(spoofed);
  });

  it('checks slug uniqueness scoped to the brand (brandId + slug)', async () => {
    const brandId = oid();
    const admin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId });
    Category.findOne.mockResolvedValue({ slug: 'phones' });

    const res = await request(app)
      .post('/api/v1/categories')
      .set(...asUser(admin))
      .send({ name: 'Phones' });

    expect(res.status).toBe(409);
    expect(Category.findOne).toHaveBeenCalledWith({ brandId: brandId.toString(), slug: 'phones' });
    expect(Category.create).not.toHaveBeenCalled();
  });

  it('allows a BRAND_EMPLOYEE with categories.create', async () => {
    const brandId = oid();
    const employee = makeFakeUser({ role: ROLES.BRAND_EMPLOYEE, brandId });
    Employee.findOne.mockResolvedValue({
      isActive: true,
      permissions: [PERMISSIONS.CATEGORIES_CREATE],
    });
    Category.findOne.mockResolvedValue(null);
    Category.create.mockImplementation(async (data) => data);

    const res = await request(app)
      .post('/api/v1/categories')
      .set(...asUser(employee))
      .send({ name: 'Phones' });

    expect(res.status).toBe(201);
  });

  it('denies a BRAND_EMPLOYEE without categories.create', async () => {
    const employee = makeFakeUser({ role: ROLES.BRAND_EMPLOYEE, brandId: oid() });
    Employee.findOne.mockResolvedValue({ isActive: true, permissions: [] });

    const res = await request(app)
      .post('/api/v1/categories')
      .set(...asUser(employee))
      .send({ name: 'Phones' });

    expect(res.status).toBe(403);
  });

  it('denies CUSTOMER with 403', async () => {
    const res = await request(app)
      .post('/api/v1/categories')
      .set(...asUser(makeFakeUser({ role: ROLES.CUSTOMER })))
      .send({ name: 'Phones' });
    expect(res.status).toBe(403);
  });

  it('denies a brand user with a missing brandId with 403', async () => {
    const admin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: undefined });

    const res = await request(app)
      .post('/api/v1/categories')
      .set(...asUser(admin))
      .send({ name: 'Phones' });

    expect(res.status).toBe(403);
    expect(Category.create).not.toHaveBeenCalled();
  });

  it('returns 400 (not 500) for SUPER_ADMIN, who has no brand context', async () => {
    const res = await request(app)
      .post('/api/v1/categories')
      .set(...asUser(makeFakeUser({ role: ROLES.SUPER_ADMIN })))
      .send({ name: 'Phones' });

    expect(res.status).toBe(400);
    expect(Category.create).not.toHaveBeenCalled();
  });

  it('rejects validation errors (missing name) with 400', async () => {
    const admin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: oid() });
    const res = await request(app)
      .post('/api/v1/categories')
      .set(...asUser(admin))
      .send({});
    expect(res.status).toBe(400);
  });

  it('rejects an invalid parentId format with 400', async () => {
    const admin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: oid() });
    const res = await request(app)
      .post('/api/v1/categories')
      .set(...asUser(admin))
      .send({ name: 'Phones', parentId: 'bad' });
    expect(res.status).toBe(400);
  });

  it('rejects a nonexistent parent category with 400', async () => {
    const admin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: oid() });
    Category.findById.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/categories')
      .set(...asUser(admin))
      .send({ name: 'Phones', parentId: oid().toString() });

    expect(res.status).toBe(400);
  });

  it("rejects a parent category belonging to another brand with 400", async () => {
    const admin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: oid() });
    Category.findById.mockResolvedValue({ _id: oid(), brandId: oid() });

    const res = await request(app)
      .post('/api/v1/categories')
      .set(...asUser(admin))
      .send({ name: 'Phones', parentId: oid().toString() });

    expect(res.status).toBe(400);
    expect(Category.create).not.toHaveBeenCalled();
  });

  it('accepts a same-brand parent category', async () => {
    const brandId = oid();
    const admin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId });
    Category.findById.mockResolvedValue({ _id: oid(), brandId });
    Category.findOne.mockResolvedValue(null);
    Category.create.mockImplementation(async (data) => data);

    const res = await request(app)
      .post('/api/v1/categories')
      .set(...asUser(admin))
      .send({ name: 'Phones', parentId: oid().toString() });

    expect(res.status).toBe(201);
  });
});

describe('PATCH /api/v1/categories/:id', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app)
      .patch(`/api/v1/categories/${oid().toString()}`)
      .send({ name: 'X' });
    expect(res.status).toBe(401);
  });

  it('allows a BRAND_ADMIN to update their own category', async () => {
    const brandId = oid();
    const categoryId = oid();
    const admin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId });
    const save = jest.fn().mockResolvedValue(true);
    Category.findById.mockResolvedValue({ _id: categoryId, brandId, name: 'Old', save });

    const res = await request(app)
      .patch(`/api/v1/categories/${categoryId.toString()}`)
      .set(...asUser(admin))
      .send({ name: 'New' });

    expect(res.status).toBe(200);
    expect(save).toHaveBeenCalled();
  });

  it('denies Brand A updating a Brand B category with 403', async () => {
    const categoryId = oid();
    const admin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: oid() });
    const save = jest.fn();
    Category.findById.mockResolvedValue({ _id: categoryId, brandId: oid(), name: 'B', save });

    const res = await request(app)
      .patch(`/api/v1/categories/${categoryId.toString()}`)
      .set(...asUser(admin))
      .send({ name: 'Hacked' });

    expect(res.status).toBe(403);
    expect(save).not.toHaveBeenCalled();
  });

  it('allows an authorized BRAND_EMPLOYEE in the same brand', async () => {
    const brandId = oid();
    const categoryId = oid();
    const employee = makeFakeUser({ role: ROLES.BRAND_EMPLOYEE, brandId });
    Employee.findOne.mockResolvedValue({
      isActive: true,
      permissions: [PERMISSIONS.CATEGORIES_UPDATE],
    });
    Category.findById.mockResolvedValue({
      _id: categoryId,
      brandId,
      save: jest.fn().mockResolvedValue(true),
    });

    const res = await request(app)
      .patch(`/api/v1/categories/${categoryId.toString()}`)
      .set(...asUser(employee))
      .send({ name: 'New' });

    expect(res.status).toBe(200);
  });

  it('denies a BRAND_EMPLOYEE without categories.update', async () => {
    const employee = makeFakeUser({ role: ROLES.BRAND_EMPLOYEE, brandId: oid() });
    Employee.findOne.mockResolvedValue({ isActive: true, permissions: [] });

    const res = await request(app)
      .patch(`/api/v1/categories/${oid().toString()}`)
      .set(...asUser(employee))
      .send({ name: 'X' });

    expect(res.status).toBe(403);
  });

  it('denies CUSTOMER with 403', async () => {
    const res = await request(app)
      .patch(`/api/v1/categories/${oid().toString()}`)
      .set(...asUser(makeFakeUser({ role: ROLES.CUSTOMER })))
      .send({ name: 'X' });
    expect(res.status).toBe(403);
  });

  it('denies a brand user with a missing brandId with 403', async () => {
    const res = await request(app)
      .patch(`/api/v1/categories/${oid().toString()}`)
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: undefined })))
      .send({ name: 'X' });
    expect(res.status).toBe(403);
  });

  it('allows SUPER_ADMIN to update any brand category', async () => {
    const categoryId = oid();
    Category.findById.mockResolvedValue({
      _id: categoryId,
      brandId: oid(),
      save: jest.fn().mockResolvedValue(true),
    });

    const res = await request(app)
      .patch(`/api/v1/categories/${categoryId.toString()}`)
      .set(...asUser(makeFakeUser({ role: ROLES.SUPER_ADMIN })))
      .send({ name: 'New' });

    expect(res.status).toBe(200);
  });

  it('cannot change brandId (field is stripped, never applied)', async () => {
    const brandId = oid();
    const categoryId = oid();
    const admin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId });
    const doc = { _id: categoryId, brandId, name: 'Old', save: jest.fn().mockResolvedValue(true) };
    Category.findById.mockResolvedValue(doc);

    const res = await request(app)
      .patch(`/api/v1/categories/${categoryId.toString()}`)
      .set(...asUser(admin))
      .send({ name: 'New', brandId: oid().toString() });

    expect(res.status).toBe(200);
    expect(doc.brandId).toBe(brandId);
    expect(doc.name).toBe('New');
  });

  it('rejects an invalid category id with 400', async () => {
    const admin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: oid() });
    const res = await request(app)
      .patch('/api/v1/categories/not-an-id')
      .set(...asUser(admin))
      .send({ name: 'X' });
    expect(res.status).toBe(400);
    expect(Category.findById).not.toHaveBeenCalled();
  });

  it('returns 404 for a nonexistent category', async () => {
    const admin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: oid() });
    Category.findById.mockResolvedValue(null);

    const res = await request(app)
      .patch(`/api/v1/categories/${oid().toString()}`)
      .set(...asUser(admin))
      .send({ name: 'X' });

    expect(res.status).toBe(404);
  });

  it('rejects an empty body with 400', async () => {
    const brandId = oid();
    const categoryId = oid();
    const admin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId });
    Category.findById.mockResolvedValue({ _id: categoryId, brandId, save: jest.fn() });

    const res = await request(app)
      .patch(`/api/v1/categories/${categoryId.toString()}`)
      .set(...asUser(admin))
      .send({});

    expect(res.status).toBe(400);
  });

  it('rejects making a category its own parent with 400', async () => {
    const brandId = oid();
    const categoryId = oid();
    const admin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId });
    Category.findById.mockResolvedValue({ _id: categoryId, brandId, save: jest.fn() });

    const res = await request(app)
      .patch(`/api/v1/categories/${categoryId.toString()}`)
      .set(...asUser(admin))
      .send({ parentId: categoryId.toString() });

    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/v1/categories/:id', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app).delete(`/api/v1/categories/${oid().toString()}`);
    expect(res.status).toBe(401);
  });

  it('deactivates (soft-deletes) an own category with no dependents', async () => {
    const brandId = oid();
    const categoryId = oid();
    const admin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId });
    const save = jest.fn().mockResolvedValue(true);
    const doc = { _id: categoryId, brandId, isActive: true, save };
    Category.findById.mockResolvedValue(doc);
    Category.countDocuments.mockResolvedValue(0);
    Product.countDocuments.mockResolvedValue(0);

    const res = await request(app)
      .delete(`/api/v1/categories/${categoryId.toString()}`)
      .set(...asUser(admin));

    expect(res.status).toBe(200);
    expect(doc.isActive).toBe(false);
    expect(save).toHaveBeenCalled();
  });

  it('refuses with 409 while products depend on the category', async () => {
    const brandId = oid();
    const categoryId = oid();
    const admin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId });
    const doc = { _id: categoryId, brandId, isActive: true, save: jest.fn() };
    Category.findById.mockResolvedValue(doc);
    Category.countDocuments.mockResolvedValue(0);
    Product.countDocuments.mockResolvedValue(3);

    const res = await request(app)
      .delete(`/api/v1/categories/${categoryId.toString()}`)
      .set(...asUser(admin));

    expect(res.status).toBe(409);
    expect(doc.isActive).toBe(true);
  });

  it('refuses with 409 while child categories depend on the category', async () => {
    const brandId = oid();
    const categoryId = oid();
    const admin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId });
    Category.findById.mockResolvedValue({ _id: categoryId, brandId, save: jest.fn() });
    Category.countDocuments.mockResolvedValue(2);
    Product.countDocuments.mockResolvedValue(0);

    const res = await request(app)
      .delete(`/api/v1/categories/${categoryId.toString()}`)
      .set(...asUser(admin));

    expect(res.status).toBe(409);
  });

  it('denies Brand A deleting a Brand B category with 403', async () => {
    const categoryId = oid();
    const admin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: oid() });
    Category.findById.mockResolvedValue({ _id: categoryId, brandId: oid(), save: jest.fn() });

    const res = await request(app)
      .delete(`/api/v1/categories/${categoryId.toString()}`)
      .set(...asUser(admin));

    expect(res.status).toBe(403);
  });

  it('denies CUSTOMER with 403', async () => {
    const res = await request(app)
      .delete(`/api/v1/categories/${oid().toString()}`)
      .set(...asUser(makeFakeUser({ role: ROLES.CUSTOMER })));
    expect(res.status).toBe(403);
  });

  it('denies a BRAND_EMPLOYEE without categories.delete', async () => {
    const employee = makeFakeUser({ role: ROLES.BRAND_EMPLOYEE, brandId: oid() });
    Employee.findOne.mockResolvedValue({
      isActive: true,
      permissions: [PERMISSIONS.CATEGORIES_UPDATE],
    });

    const res = await request(app)
      .delete(`/api/v1/categories/${oid().toString()}`)
      .set(...asUser(employee));

    expect(res.status).toBe(403);
  });

  it('allows SUPER_ADMIN to deactivate any brand category', async () => {
    const categoryId = oid();
    Category.findById.mockResolvedValue({
      _id: categoryId,
      brandId: oid(),
      isActive: true,
      save: jest.fn().mockResolvedValue(true),
    });
    Category.countDocuments.mockResolvedValue(0);
    Product.countDocuments.mockResolvedValue(0);

    const res = await request(app)
      .delete(`/api/v1/categories/${categoryId.toString()}`)
      .set(...asUser(makeFakeUser({ role: ROLES.SUPER_ADMIN })));

    expect(res.status).toBe(200);
  });

  it('rejects an invalid id with 400', async () => {
    const admin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: oid() });
    const res = await request(app).delete('/api/v1/categories/bad-id').set(...asUser(admin));
    expect(res.status).toBe(400);
  });

  it('returns 404 for a nonexistent category', async () => {
    const admin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: oid() });
    Category.findById.mockResolvedValue(null);

    const res = await request(app)
      .delete(`/api/v1/categories/${oid().toString()}`)
      .set(...asUser(admin));

    expect(res.status).toBe(404);
  });
});
describe('GET /api/v1/categories — hardening', () => {
  it('ignores a client-supplied ?isActive=false and still returns active categories only', async () => {
    Brand.find.mockResolvedValue([]);
    const sort = jest.fn().mockResolvedValue([]);
    Category.find.mockReturnValue({ sort });

    const res = await request(app).get('/api/v1/categories?isActive=false');

    expect(res.status).toBe(200);
    expect(Category.find).toHaveBeenCalledWith({ brandId: { $in: [] }, isActive: true });
  });
});
