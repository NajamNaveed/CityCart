const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/user.model');
jest.mock('../src/models/employee.model');
jest.mock('../src/models/category.model');
jest.mock('../src/models/adminPartner.model');
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
const Category = require('../src/models/category.model');
const AdminPartner = require('../src/models/adminPartner.model');
const Product = require('../src/models/product.model');
const app = require('../src/app');
const { ROLES } = require('../src/config/roles');
const { ADMIN_PERMISSIONS } = require('../src/config/adminPermissions');
const { getAuthCookie } = require('./helpers/testAuth');

const oid = () => new mongoose.Types.ObjectId();

function makeFakeUser(overrides = {}) {
  return { _id: oid(), role: ROLES.CUSTOMER, brandId: undefined, isActive: true, ...overrides };
}

function asUser(user) {
  User.findById.mockResolvedValue(user);
  return ['Cookie', getAuthCookie(user)];
}

const superAdmin = () => makeFakeUser({ role: ROLES.SUPER_ADMIN });

/** A partner account holding the given admin permissions. */
function asPartner(permissions, over = {}) {
  const user = makeFakeUser({ role: ROLES.ADMIN_PARTNER });
  AdminPartner.findOne.mockResolvedValue({
    _id: oid(),
    userId: user._id,
    permissions,
    readOnly: false,
    isActive: true,
    ...over,
  });
  return asUser(user);
}

/** A saved Category document with a working save(). */
function fakeCategory(over = {}) {
  const doc = { _id: oid(), name: 'Grocery', slug: 'grocery', parentId: null, isActive: true, ...over };
  doc.save = jest.fn().mockImplementation(async () => doc);
  return doc;
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe('GET /api/v1/categories (public)', () => {
  it('lists active categories with no authentication', async () => {
    const sort = jest.fn().mockResolvedValue([{ name: 'Grocery' }, { name: 'Bakery' }]);
    Category.find.mockReturnValue({ sort });

    const res = await request(app).get('/api/v1/categories');

    expect(res.status).toBe(200);
    expect(res.body.categories).toHaveLength(2);
    expect(Category.find).toHaveBeenCalledWith({ isActive: true });
    expect(sort).toHaveBeenCalledWith({ order: 1, name: 1 });
  });

  it('filters by parentId', async () => {
    const parentId = oid().toString();
    Category.find.mockReturnValue({ sort: jest.fn().mockResolvedValue([]) });

    const res = await request(app).get(`/api/v1/categories?parentId=${parentId}`);

    expect(res.status).toBe(200);
    expect(Category.find).toHaveBeenCalledWith({ isActive: true, parentId });
  });

  it('rejects an invalid parentId with 400', async () => {
    const res = await request(app).get('/api/v1/categories?parentId=nope');
    expect(res.status).toBe(400);
    expect(Category.find).not.toHaveBeenCalled();
  });

  it('ignores a client-supplied ?isActive=false and still returns active categories only', async () => {
    Category.find.mockReturnValue({ sort: jest.fn().mockResolvedValue([]) });
    await request(app).get('/api/v1/categories?isActive=false');
    expect(Category.find).toHaveBeenCalledWith({ isActive: true });
  });
});

describe('GET /api/v1/categories/tree (public)', () => {
  it('returns the whole active tree, not shadowed by /:id', async () => {
    const parent = { _id: oid(), name: 'Grocery' };
    const child = { _id: oid(), name: 'Cooking Oil & Ghee', parentId: parent._id };
    Category.find.mockReturnValue({ sort: jest.fn().mockResolvedValue([parent, child]) });

    const res = await request(app).get('/api/v1/categories/tree');

    expect(res.status).toBe(200);
    expect(res.body.categories).toHaveLength(1);
    expect(res.body.categories[0].children[0].name).toBe('Cooking Oil & Ghee');
    expect(Category.find).toHaveBeenCalledWith({ isActive: true });
  });
});

describe('GET /api/v1/categories/:id (public)', () => {
  it('returns an active category', async () => {
    const id = oid().toString();
    Category.findOne.mockResolvedValue({ _id: id, name: 'Grocery' });
    const res = await request(app).get(`/api/v1/categories/${id}`);
    expect(res.status).toBe(200);
    expect(Category.findOne).toHaveBeenCalledWith({ _id: id, isActive: true });
  });

  it('returns 404 for a missing or inactive category', async () => {
    Category.findOne.mockResolvedValue(null);
    const res = await request(app).get(`/api/v1/categories/${oid()}`);
    expect(res.status).toBe(404);
  });

  it('rejects an invalid id with 400', async () => {
    expect((await request(app).get('/api/v1/categories/not-an-id')).status).toBe(400);
  });
});

describe('POST /api/v1/categories (platform admins only)', () => {
  it('creates a top-level category as SUPER_ADMIN', async () => {
    Category.findOne.mockResolvedValue(null);
    Category.create.mockImplementation(async (doc) => ({ _id: oid(), ...doc }));

    const res = await request(app)
      .post('/api/v1/categories')
      .set(...asUser(superAdmin()))
      .send({ name: 'Cooking Oil & Ghee' });

    expect(res.status).toBe(201);
    expect(res.body.category.slug).toBe('cooking-oil-ghee');
    expect(Category.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Cooking Oil & Ghee', parentId: null })
    );
    // The category has no brand at all.
    expect(Category.create.mock.calls[0][0].brandId).toBeUndefined();
  });

  it('lets a partner with admin.catalog create one', async () => {
    Category.findOne.mockResolvedValue(null);
    Category.create.mockImplementation(async (doc) => ({ _id: oid(), ...doc }));

    const res = await request(app)
      .post('/api/v1/categories')
      .set(...asPartner([ADMIN_PERMISSIONS.CATALOG]))
      .send({ name: 'Bakery' });

    expect(res.status).toBe(201);
  });

  it('denies a partner without admin.catalog (403)', async () => {
    const res = await request(app)
      .post('/api/v1/categories')
      .set(...asPartner([ADMIN_PERMISSIONS.LOCATIONS]))
      .send({ name: 'Bakery' });
    expect(res.status).toBe(403);
    expect(Category.create).not.toHaveBeenCalled();
  });

  it('denies a read-only partner (403)', async () => {
    const res = await request(app)
      .post('/api/v1/categories')
      .set(...asPartner([ADMIN_PERMISSIONS.CATALOG], { readOnly: true }))
      .send({ name: 'Bakery' });
    expect(res.status).toBe(403);
    expect(Category.create).not.toHaveBeenCalled();
  });

  it('denies a BRAND_ADMIN (403): brands only choose from the tree', async () => {
    const brandAdmin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: oid() });
    const res = await request(app)
      .post('/api/v1/categories')
      .set(...asUser(brandAdmin))
      .send({ name: 'Bakery' });
    expect(res.status).toBe(403);
    expect(Category.create).not.toHaveBeenCalled();
  });

  it('denies a CUSTOMER (403) and rejects unauthenticated requests (401)', async () => {
    const customer = makeFakeUser();
    expect(
      (await request(app).post('/api/v1/categories').set(...asUser(customer)).send({ name: 'X' })).status
    ).toBe(403);
    expect((await request(app).post('/api/v1/categories').send({ name: 'X' })).status).toBe(401);
  });

  it('rejects a missing name with 400', async () => {
    const res = await request(app)
      .post('/api/v1/categories')
      .set(...asUser(superAdmin()))
      .send({ description: 'no name' });
    expect(res.status).toBe(400);
    expect(Category.create).not.toHaveBeenCalled();
  });

  it('creates a subcategory under a top-level parent', async () => {
    const parent = fakeCategory();
    Category.findById.mockResolvedValue(parent);
    Category.findOne.mockResolvedValue(null);
    Category.create.mockImplementation(async (doc) => ({ _id: oid(), ...doc }));

    const res = await request(app)
      .post('/api/v1/categories')
      .set(...asUser(superAdmin()))
      .send({ name: 'Ghee', parentId: parent._id.toString() });

    expect(res.status).toBe(201);
    expect(Category.create).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: parent._id.toString(), slug: 'ghee' })
    );
  });

  it('rejects a parent that does not exist (400)', async () => {
    Category.findById.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/v1/categories')
      .set(...asUser(superAdmin()))
      .send({ name: 'Ghee', parentId: oid().toString() });
    expect(res.status).toBe(400);
    expect(Category.create).not.toHaveBeenCalled();
  });

  it('rejects a parent that is itself a subcategory: two levels only (400)', async () => {
    Category.findById.mockResolvedValue(fakeCategory({ parentId: oid() }));
    const res = await request(app)
      .post('/api/v1/categories')
      .set(...asUser(superAdmin()))
      .send({ name: 'Too deep', parentId: oid().toString() });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/two levels/i);
    expect(Category.create).not.toHaveBeenCalled();
  });

  it('rejects an invalid parentId format (400)', async () => {
    const res = await request(app)
      .post('/api/v1/categories')
      .set(...asUser(superAdmin()))
      .send({ name: 'Ghee', parentId: 'nope' });
    expect(res.status).toBe(400);
  });

  it('refuses a duplicate name among siblings (409), checked by parent + slug', async () => {
    Category.findOne.mockResolvedValue({ _id: oid() });
    const res = await request(app)
      .post('/api/v1/categories')
      .set(...asUser(superAdmin()))
      .send({ name: 'Grocery' });
    expect(res.status).toBe(409);
    expect(Category.findOne).toHaveBeenCalledWith({ parentId: null, slug: 'grocery' });
    expect(Category.create).not.toHaveBeenCalled();
  });

  it('maps a database duplicate-key race to 409', async () => {
    Category.findOne.mockResolvedValue(null);
    Category.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));
    const res = await request(app)
      .post('/api/v1/categories')
      .set(...asUser(superAdmin()))
      .send({ name: 'Grocery' });
    expect(res.status).toBe(409);
  });
});

describe('PATCH /api/v1/categories/:id', () => {
  it('updates a category as SUPER_ADMIN and never changes its slug', async () => {
    const cat = fakeCategory();
    Category.findById.mockResolvedValue(cat);

    const res = await request(app)
      .patch(`/api/v1/categories/${cat._id}`)
      .set(...asUser(superAdmin()))
      .send({ name: 'Groceries', slug: 'hacked', order: 3 });

    expect(res.status).toBe(200);
    expect(cat.name).toBe('Groceries');
    expect(cat.order).toBe(3);
    expect(cat.slug).toBe('grocery'); // slug is stripped by the validator
    expect(cat.save).toHaveBeenCalled();
  });

  it('lets a partner with admin.catalog update, and denies a BRAND_ADMIN', async () => {
    const cat = fakeCategory();
    Category.findById.mockResolvedValue(cat);

    const ok = await request(app)
      .patch(`/api/v1/categories/${cat._id}`)
      .set(...asPartner([ADMIN_PERMISSIONS.CATALOG]))
      .send({ name: 'Groceries' });
    expect(ok.status).toBe(200);

    const brandAdmin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: oid() });
    const denied = await request(app)
      .patch(`/api/v1/categories/${cat._id}`)
      .set(...asUser(brandAdmin))
      .send({ name: 'Mine' });
    expect(denied.status).toBe(403);
  });

  it('rejects an empty body (400) and an invalid id (400)', async () => {
    const sa = superAdmin();
    expect(
      (await request(app).patch(`/api/v1/categories/${oid()}`).set(...asUser(sa)).send({})).status
    ).toBe(400);
    expect(
      (await request(app).patch('/api/v1/categories/not-an-id').set(...asUser(sa)).send({ name: 'x' })).status
    ).toBe(400);
  });

  it('returns 404 for a nonexistent category', async () => {
    Category.findById.mockResolvedValue(null);
    const res = await request(app)
      .patch(`/api/v1/categories/${oid()}`)
      .set(...asUser(superAdmin()))
      .send({ name: 'x' });
    expect(res.status).toBe(404);
  });

  it('rejects making a category its own parent (400)', async () => {
    const cat = fakeCategory();
    Category.findById.mockResolvedValue(cat);
    const res = await request(app)
      .patch(`/api/v1/categories/${cat._id}`)
      .set(...asUser(superAdmin()))
      .send({ parentId: cat._id.toString() });
    expect(res.status).toBe(400);
    expect(cat.save).not.toHaveBeenCalled();
  });

  it('rejects moving a category that has subcategories under another one (400)', async () => {
    const cat = fakeCategory();
    const newParent = fakeCategory({ name: 'Bakery', slug: 'bakery' });
    Category.findById.mockImplementation(async (id) =>
      String(id) === String(cat._id) ? cat : newParent
    );
    Category.countDocuments.mockResolvedValue(2); // it has children
    const res = await request(app)
      .patch(`/api/v1/categories/${cat._id}`)
      .set(...asUser(superAdmin()))
      .send({ parentId: newParent._id.toString() });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/subcategories/i);
    expect(cat.save).not.toHaveBeenCalled();
  });

  it('rejects moving under a parent that is a subcategory (400)', async () => {
    const cat = fakeCategory();
    const deepParent = fakeCategory({ parentId: oid() });
    Category.findById.mockImplementation(async (id) =>
      String(id) === String(cat._id) ? cat : deepParent
    );
    const res = await request(app)
      .patch(`/api/v1/categories/${cat._id}`)
      .set(...asUser(superAdmin()))
      .send({ parentId: deepParent._id.toString() });
    expect(res.status).toBe(400);
  });

  it('moves a childless category under a top-level parent', async () => {
    const cat = fakeCategory({ name: 'Ghee', slug: 'ghee' });
    const parent = fakeCategory();
    Category.findById.mockImplementation(async (id) => (String(id) === String(cat._id) ? cat : parent));
    Category.countDocuments.mockResolvedValue(0);
    Category.findOne.mockResolvedValue(null);
    const res = await request(app)
      .patch(`/api/v1/categories/${cat._id}`)
      .set(...asUser(superAdmin()))
      .send({ parentId: parent._id.toString() });
    expect(res.status).toBe(200);
    expect(String(cat.parentId)).toBe(String(parent._id));
  });

  it('refuses a move that would clash with a sibling slug (409)', async () => {
    const cat = fakeCategory({ name: 'Ghee', slug: 'ghee' });
    const parent = fakeCategory();
    Category.findById.mockImplementation(async (id) => (String(id) === String(cat._id) ? cat : parent));
    Category.countDocuments.mockResolvedValue(0);
    Category.findOne.mockResolvedValue({ _id: oid() }); // sibling already uses "ghee"
    const res = await request(app)
      .patch(`/api/v1/categories/${cat._id}`)
      .set(...asUser(superAdmin()))
      .send({ parentId: parent._id.toString() });
    expect(res.status).toBe(409);
  });

  it('refuses to deactivate a category that still has dependents (409)', async () => {
    const cat = fakeCategory();
    Category.findById.mockResolvedValue(cat);
    Category.countDocuments.mockResolvedValue(0);
    Product.countDocuments.mockResolvedValue(4);
    const res = await request(app)
      .patch(`/api/v1/categories/${cat._id}`)
      .set(...asUser(superAdmin()))
      .send({ isActive: false });
    expect(res.status).toBe(409);
    expect(cat.save).not.toHaveBeenCalled();
  });

  it('reactivates a category without a dependents check', async () => {
    const cat = fakeCategory({ isActive: false });
    Category.findById.mockResolvedValue(cat);
    const res = await request(app)
      .patch(`/api/v1/categories/${cat._id}`)
      .set(...asUser(superAdmin()))
      .send({ isActive: true });
    expect(res.status).toBe(200);
    expect(cat.isActive).toBe(true);
    expect(Category.countDocuments).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/v1/categories/:id', () => {
  it('deactivates (soft-deletes) a category with no dependents', async () => {
    const cat = fakeCategory();
    Category.findById.mockResolvedValue(cat);
    Category.countDocuments.mockResolvedValue(0);
    Product.countDocuments.mockResolvedValue(0);

    const res = await request(app)
      .delete(`/api/v1/categories/${cat._id}`)
      .set(...asUser(superAdmin()));

    expect(res.status).toBe(200);
    expect(cat.isActive).toBe(false);
    expect(cat.save).toHaveBeenCalled();
  });

  it('refuses with 409 while subcategories depend on it', async () => {
    const cat = fakeCategory();
    Category.findById.mockResolvedValue(cat);
    Category.countDocuments.mockResolvedValue(1);
    Product.countDocuments.mockResolvedValue(0);
    const res = await request(app)
      .delete(`/api/v1/categories/${cat._id}`)
      .set(...asUser(superAdmin()));
    expect(res.status).toBe(409);
    expect(cat.save).not.toHaveBeenCalled();
  });

  it('refuses with 409 while products depend on it', async () => {
    const cat = fakeCategory();
    Category.findById.mockResolvedValue(cat);
    Category.countDocuments.mockResolvedValue(0);
    Product.countDocuments.mockResolvedValue(3);
    const res = await request(app)
      .delete(`/api/v1/categories/${cat._id}`)
      .set(...asUser(superAdmin()));
    expect(res.status).toBe(409);
  });

  it('returns 404 for a nonexistent category and 400 for an invalid id', async () => {
    Category.findById.mockResolvedValue(null);
    const sa = superAdmin();
    expect((await request(app).delete(`/api/v1/categories/${oid()}`).set(...asUser(sa))).status).toBe(404);
    expect((await request(app).delete('/api/v1/categories/nope').set(...asUser(sa))).status).toBe(400);
  });

  it('denies a BRAND_ADMIN (403)', async () => {
    const brandAdmin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: oid() });
    const res = await request(app)
      .delete(`/api/v1/categories/${oid()}`)
      .set(...asUser(brandAdmin));
    expect(res.status).toBe(403);
  });
});
