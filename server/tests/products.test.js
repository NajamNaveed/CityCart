const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/user.model');
jest.mock('../src/models/employee.model');
jest.mock('../src/models/category.model');
jest.mock('../src/models/brand.model');
// Factory mock: automock would turn Product.STATUSES into an empty array,
// which product.validator.js needs for its status enum.
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

// Chainable stand-in for Product.find().sort().skip().limit()
function mockProductFind(items) {
  const limit = jest.fn().mockResolvedValue(items);
  const skip = jest.fn().mockReturnValue({ limit });
  const sort = jest.fn().mockReturnValue({ skip });
  Product.find.mockReturnValue({ sort });
  return { sort, skip, limit };
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe('GET /api/v1/products (public)', () => {
  it('lists ACTIVE products with pagination and no authentication', async () => {
    const chain = mockProductFind([{ name: 'Phone' }]);
    Product.countDocuments.mockResolvedValue(45);

    const res = await request(app).get('/api/v1/products');

    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(1);
    expect(res.body.pagination).toEqual({ page: 1, limit: 20, total: 45, pages: 3 });
    expect(Product.find).toHaveBeenCalledWith({ isActive: true, status: 'ACTIVE' });
    expect(chain.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(chain.skip).toHaveBeenCalledWith(0);
    expect(chain.limit).toHaveBeenCalledWith(20);
  });

  it('applies brandId, categoryId, search, price range, status, page, limit and sort', async () => {
    const brandId = oid().toString();
    const categoryId = oid().toString();
    const chain = mockProductFind([]);
    Product.countDocuments.mockResolvedValue(0);

    const res = await request(app).get(
      `/api/v1/products?brandId=${brandId}&categoryId=${categoryId}&search=phone` +
        '&minPrice=10&maxPrice=500&status=DRAFT&page=2&limit=5&sort=price&order=asc'
    );

    expect(res.status).toBe(200);
    expect(Product.find).toHaveBeenCalledWith({
      isActive: true,
      status: 'DRAFT',
      brandId,
      categoryId,
      name: { $regex: 'phone', $options: 'i' },
      price: { $gte: 10, $lte: 500 },
    });
    expect(chain.sort).toHaveBeenCalledWith({ price: 1 });
    expect(chain.skip).toHaveBeenCalledWith(5);
    expect(chain.limit).toHaveBeenCalledWith(5);
  });

  it('resolves cityId to the brands in that city', async () => {
    const cityId = oid().toString();
    const brandA = oid();
    const brandB = oid();
    Brand.find.mockResolvedValue([{ _id: brandA }, { _id: brandB }]);
    mockProductFind([]);
    Product.countDocuments.mockResolvedValue(0);

    const res = await request(app).get(`/api/v1/products?cityId=${cityId}`);

    expect(res.status).toBe(200);
    expect(Brand.find).toHaveBeenCalledWith({ cityId }, '_id');
    expect(Product.find).toHaveBeenCalledWith({
      isActive: true,
      status: 'ACTIVE',
      brandId: { $in: [brandA, brandB] },
    });
  });

  it('rejects a disallowed sort field with 400', async () => {
    const res = await request(app).get('/api/v1/products?sort=passwordHash');
    expect(res.status).toBe(400);
  });

  it('rejects an invalid status with 400', async () => {
    const res = await request(app).get('/api/v1/products?status=BOGUS');
    expect(res.status).toBe(400);
  });

  it('rejects an invalid categoryId with 400', async () => {
    const res = await request(app).get('/api/v1/products?categoryId=nope');
    expect(res.status).toBe(400);
  });

  it('rejects a non-numeric price and an oversized limit with 400', async () => {
    const a = await request(app).get('/api/v1/products?minPrice=abc');
    const b = await request(app).get('/api/v1/products?limit=1000');
    expect(a.status).toBe(400);
    expect(b.status).toBe(400);
  });
});

describe('GET /api/v1/products/:id (public)', () => {
  it('returns an active product', async () => {
    const id = oid().toString();
    Product.findOne.mockResolvedValue({ _id: id, name: 'Phone' });

    const res = await request(app).get(`/api/v1/products/${id}`);

    expect(res.status).toBe(200);
    expect(Product.findOne).toHaveBeenCalledWith({ _id: id, status: 'ACTIVE', isActive: true });
  });

  it('returns 404 for a nonexistent or non-active product', async () => {
    Product.findOne.mockResolvedValue(null);
    const res = await request(app).get(`/api/v1/products/${oid().toString()}`);
    expect(res.status).toBe(404);
  });

  it('rejects an invalid id with 400', async () => {
    const res = await request(app).get('/api/v1/products/not-an-id');
    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/products', () => {
  const validBody = (categoryId) => ({
    name: 'Phone X',
    price: 999,
    categoryId: categoryId.toString(),
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app).post('/api/v1/products').send(validBody(oid()));
    expect(res.status).toBe(401);
  });

  it("creates a product using the authenticated user's brand (same-brand category allowed)", async () => {
    const brandId = oid();
    const categoryId = oid();
    const admin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId });
    Category.findById.mockResolvedValue({ _id: categoryId, brandId });
    Product.findOne.mockResolvedValue(null);
    Product.create.mockImplementation(async (data) => data);

    const res = await request(app)
      .post('/api/v1/products')
      .set(...asUser(admin))
      .send(validBody(categoryId));

    expect(res.status).toBe(201);
    expect(Product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: brandId.toString(),
        categoryId: categoryId.toString(),
        name: 'Phone X',
        slug: 'phone-x',
        price: 999,
      })
    );
  });

  it('ignores a client-supplied brandId and uses the authenticated brand', async () => {
    const brandId = oid();
    const categoryId = oid();
    const spoofed = oid().toString();
    const admin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId });
    Category.findById.mockResolvedValue({ _id: categoryId, brandId });
    Product.findOne.mockResolvedValue(null);
    Product.create.mockImplementation(async (data) => data);

    const res = await request(app)
      .post('/api/v1/products')
      .set(...asUser(admin))
      .send({ ...validBody(categoryId), brandId: spoofed });

    expect(res.status).toBe(201);
    const created = Product.create.mock.calls[0][0];
    expect(created.brandId).toBe(brandId.toString());
    expect(created.brandId).not.toBe(spoofed);
  });

  it('denies a cross-brand category reference with 400', async () => {
    const brandId = oid();
    const categoryId = oid();
    const admin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId });
    Category.findById.mockResolvedValue({ _id: categoryId, brandId: oid() });

    const res = await request(app)
      .post('/api/v1/products')
      .set(...asUser(admin))
      .send(validBody(categoryId));

    expect(res.status).toBe(400);
    expect(Product.create).not.toHaveBeenCalled();
  });

  it('rejects a nonexistent category with 400', async () => {
    const admin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: oid() });
    Category.findById.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/products')
      .set(...asUser(admin))
      .send(validBody(oid()));

    expect(res.status).toBe(400);
    expect(Product.create).not.toHaveBeenCalled();
  });

  it('rejects an invalid categoryId format with 400', async () => {
    const admin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: oid() });
    const res = await request(app)
      .post('/api/v1/products')
      .set(...asUser(admin))
      .send({ name: 'Phone', price: 5, categoryId: 'bad' });
    expect(res.status).toBe(400);
    expect(Category.findById).not.toHaveBeenCalled();
  });

  it('checks slug uniqueness scoped to the brand (brandId + slug)', async () => {
    const brandId = oid();
    const categoryId = oid();
    const admin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId });
    Category.findById.mockResolvedValue({ _id: categoryId, brandId });
    Product.findOne.mockResolvedValue({ slug: 'phone-x' });

    const res = await request(app)
      .post('/api/v1/products')
      .set(...asUser(admin))
      .send(validBody(categoryId));

    expect(res.status).toBe(409);
    expect(Product.findOne).toHaveBeenCalledWith({ brandId: brandId.toString(), slug: 'phone-x' });
  });

  it('allows a BRAND_EMPLOYEE with products.create', async () => {
    const brandId = oid();
    const categoryId = oid();
    const employee = makeFakeUser({ role: ROLES.BRAND_EMPLOYEE, brandId });
    Employee.findOne.mockResolvedValue({
      isActive: true,
      permissions: [PERMISSIONS.PRODUCTS_CREATE],
    });
    Category.findById.mockResolvedValue({ _id: categoryId, brandId });
    Product.findOne.mockResolvedValue(null);
    Product.create.mockImplementation(async (data) => data);

    const res = await request(app)
      .post('/api/v1/products')
      .set(...asUser(employee))
      .send(validBody(categoryId));

    expect(res.status).toBe(201);
  });

  it('denies a BRAND_EMPLOYEE without products.create', async () => {
    const employee = makeFakeUser({ role: ROLES.BRAND_EMPLOYEE, brandId: oid() });
    Employee.findOne.mockResolvedValue({ isActive: true, permissions: [] });

    const res = await request(app)
      .post('/api/v1/products')
      .set(...asUser(employee))
      .send(validBody(oid()));

    expect(res.status).toBe(403);
  });

  it('denies CUSTOMER with 403', async () => {
    const res = await request(app)
      .post('/api/v1/products')
      .set(...asUser(makeFakeUser({ role: ROLES.CUSTOMER })))
      .send(validBody(oid()));
    expect(res.status).toBe(403);
  });

  it('denies a brand user with a missing brandId with 403', async () => {
    const res = await request(app)
      .post('/api/v1/products')
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: undefined })))
      .send(validBody(oid()));
    expect(res.status).toBe(403);
    expect(Product.create).not.toHaveBeenCalled();
  });

  it('returns 400 (not 500) for SUPER_ADMIN, who has no brand context', async () => {
    const res = await request(app)
      .post('/api/v1/products')
      .set(...asUser(makeFakeUser({ role: ROLES.SUPER_ADMIN })))
      .send(validBody(oid()));
    expect(res.status).toBe(400);
    expect(Product.create).not.toHaveBeenCalled();
  });

  it('rejects validation errors with 400 (missing name, negative price, bad status)', async () => {
    const admin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: oid() });
    const categoryId = oid().toString();

    const missingName = await request(app)
      .post('/api/v1/products')
      .set(...asUser(admin))
      .send({ price: 5, categoryId });
    const negativePrice = await request(app)
      .post('/api/v1/products')
      .set(...asUser(admin))
      .send({ name: 'P', price: -1, categoryId });
    const badStatus = await request(app)
      .post('/api/v1/products')
      .set(...asUser(admin))
      .send({ name: 'P', price: 1, categoryId, status: 'BOGUS' });
    const stringPrice = await request(app)
      .post('/api/v1/products')
      .set(...asUser(admin))
      .send({ name: 'P', price: '12', categoryId });

    expect(missingName.status).toBe(400);
    expect(negativePrice.status).toBe(400);
    expect(badStatus.status).toBe(400);
    expect(stringPrice.status).toBe(400);
  });
});

describe('PATCH /api/v1/products/:id', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app)
      .patch(`/api/v1/products/${oid().toString()}`)
      .send({ name: 'X' });
    expect(res.status).toBe(401);
  });

  it('allows a BRAND_ADMIN to update their own product', async () => {
    const brandId = oid();
    const productId = oid();
    const admin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId });
    const save = jest.fn().mockResolvedValue(true);
    Product.findById.mockResolvedValue({ _id: productId, brandId, name: 'Old', save });

    const res = await request(app)
      .patch(`/api/v1/products/${productId.toString()}`)
      .set(...asUser(admin))
      .send({ name: 'New', price: 10 });

    expect(res.status).toBe(200);
    expect(save).toHaveBeenCalled();
  });

  it('denies Brand A updating a Brand B product with 403', async () => {
    const productId = oid();
    const admin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: oid() });
    const save = jest.fn();
    Product.findById.mockResolvedValue({ _id: productId, brandId: oid(), save });

    const res = await request(app)
      .patch(`/api/v1/products/${productId.toString()}`)
      .set(...asUser(admin))
      .send({ name: 'Hacked' });

    expect(res.status).toBe(403);
    expect(save).not.toHaveBeenCalled();
  });

  it('allows an authorized BRAND_EMPLOYEE in the same brand', async () => {
    const brandId = oid();
    const productId = oid();
    const employee = makeFakeUser({ role: ROLES.BRAND_EMPLOYEE, brandId });
    Employee.findOne.mockResolvedValue({
      isActive: true,
      permissions: [PERMISSIONS.PRODUCTS_UPDATE],
    });
    Product.findById.mockResolvedValue({
      _id: productId,
      brandId,
      save: jest.fn().mockResolvedValue(true),
    });

    const res = await request(app)
      .patch(`/api/v1/products/${productId.toString()}`)
      .set(...asUser(employee))
      .send({ price: 20 });

    expect(res.status).toBe(200);
  });

  it('denies a BRAND_EMPLOYEE without products.update', async () => {
    const employee = makeFakeUser({ role: ROLES.BRAND_EMPLOYEE, brandId: oid() });
    Employee.findOne.mockResolvedValue({ isActive: true, permissions: [] });

    const res = await request(app)
      .patch(`/api/v1/products/${oid().toString()}`)
      .set(...asUser(employee))
      .send({ price: 20 });

    expect(res.status).toBe(403);
  });

  it('denies CUSTOMER with 403', async () => {
    const res = await request(app)
      .patch(`/api/v1/products/${oid().toString()}`)
      .set(...asUser(makeFakeUser({ role: ROLES.CUSTOMER })))
      .send({ price: 1 });
    expect(res.status).toBe(403);
  });

  it('denies a brand user with a missing brandId with 403', async () => {
    const res = await request(app)
      .patch(`/api/v1/products/${oid().toString()}`)
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: undefined })))
      .send({ price: 1 });
    expect(res.status).toBe(403);
  });

  it('allows SUPER_ADMIN to update any brand product', async () => {
    const productId = oid();
    Product.findById.mockResolvedValue({
      _id: productId,
      brandId: oid(),
      save: jest.fn().mockResolvedValue(true),
    });

    const res = await request(app)
      .patch(`/api/v1/products/${productId.toString()}`)
      .set(...asUser(makeFakeUser({ role: ROLES.SUPER_ADMIN })))
      .send({ price: 5 });

    expect(res.status).toBe(200);
  });

  it('cannot change brandId (field is stripped, never applied)', async () => {
    const brandId = oid();
    const productId = oid();
    const admin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId });
    const doc = { _id: productId, brandId, name: 'Old', save: jest.fn().mockResolvedValue(true) };
    Product.findById.mockResolvedValue(doc);

    const res = await request(app)
      .patch(`/api/v1/products/${productId.toString()}`)
      .set(...asUser(admin))
      .send({ name: 'New', brandId: oid().toString() });

    expect(res.status).toBe(200);
    expect(doc.brandId).toBe(brandId);
    expect(doc.name).toBe('New');
  });

  it('allows changing to a same-brand category', async () => {
    const brandId = oid();
    const productId = oid();
    const newCategoryId = oid();
    const admin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId });
    const doc = { _id: productId, brandId, save: jest.fn().mockResolvedValue(true) };
    Product.findById.mockResolvedValue(doc);
    Category.findById.mockResolvedValue({ _id: newCategoryId, brandId });

    const res = await request(app)
      .patch(`/api/v1/products/${productId.toString()}`)
      .set(...asUser(admin))
      .send({ categoryId: newCategoryId.toString() });

    expect(res.status).toBe(200);
    expect(doc.categoryId).toBe(newCategoryId.toString());
  });

  it('denies changing to a cross-brand category with 400', async () => {
    const brandId = oid();
    const productId = oid();
    const admin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId });
    const save = jest.fn();
    Product.findById.mockResolvedValue({ _id: productId, brandId, save });
    Category.findById.mockResolvedValue({ _id: oid(), brandId: oid() });

    const res = await request(app)
      .patch(`/api/v1/products/${productId.toString()}`)
      .set(...asUser(admin))
      .send({ categoryId: oid().toString() });

    expect(res.status).toBe(400);
    expect(save).not.toHaveBeenCalled();
  });

  it('rejects a nonexistent new category with 400', async () => {
    const brandId = oid();
    const productId = oid();
    const admin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId });
    Product.findById.mockResolvedValue({ _id: productId, brandId, save: jest.fn() });
    Category.findById.mockResolvedValue(null);

    const res = await request(app)
      .patch(`/api/v1/products/${productId.toString()}`)
      .set(...asUser(admin))
      .send({ categoryId: oid().toString() });

    expect(res.status).toBe(400);
  });

  it('rejects an invalid categoryId format with 400', async () => {
    const brandId = oid();
    const productId = oid();
    const admin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId });
    Product.findById.mockResolvedValue({ _id: productId, brandId, save: jest.fn() });

    const res = await request(app)
      .patch(`/api/v1/products/${productId.toString()}`)
      .set(...asUser(admin))
      .send({ categoryId: 'bad' });

    expect(res.status).toBe(400);
  });

  it('rejects an invalid product id with 400 before any database lookup', async () => {
    const admin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: oid() });
    const res = await request(app)
      .patch('/api/v1/products/not-an-id')
      .set(...asUser(admin))
      .send({ price: 1 });
    expect(res.status).toBe(400);
    expect(Product.findById).not.toHaveBeenCalled();
  });

  it('returns 404 for a nonexistent product', async () => {
    const admin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: oid() });
    Product.findById.mockResolvedValue(null);

    const res = await request(app)
      .patch(`/api/v1/products/${oid().toString()}`)
      .set(...asUser(admin))
      .send({ price: 1 });

    expect(res.status).toBe(404);
  });

  it('rejects validation errors with 400 (empty body, negative price)', async () => {
    const brandId = oid();
    const productId = oid();
    const admin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId });
    Product.findById.mockResolvedValue({ _id: productId, brandId, save: jest.fn() });

    const empty = await request(app)
      .patch(`/api/v1/products/${productId.toString()}`)
      .set(...asUser(admin))
      .send({});
    const negative = await request(app)
      .patch(`/api/v1/products/${productId.toString()}`)
      .set(...asUser(admin))
      .send({ price: -5 });

    expect(empty.status).toBe(400);
    expect(negative.status).toBe(400);
  });
});

describe('DELETE /api/v1/products/:id', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app).delete(`/api/v1/products/${oid().toString()}`);
    expect(res.status).toBe(401);
  });

  it('archives (soft-deletes) an own product', async () => {
    const brandId = oid();
    const productId = oid();
    const admin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId });
    const save = jest.fn().mockResolvedValue(true);
    const doc = { _id: productId, brandId, status: 'ACTIVE', isActive: true, save };
    Product.findById.mockResolvedValue(doc);

    const res = await request(app)
      .delete(`/api/v1/products/${productId.toString()}`)
      .set(...asUser(admin));

    expect(res.status).toBe(200);
    expect(doc.status).toBe('ARCHIVED');
    expect(doc.isActive).toBe(false);
    expect(save).toHaveBeenCalled();
  });

  it('denies Brand A archiving a Brand B product with 403', async () => {
    const productId = oid();
    const admin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: oid() });
    const doc = { _id: productId, brandId: oid(), status: 'ACTIVE', save: jest.fn() };
    Product.findById.mockResolvedValue(doc);

    const res = await request(app)
      .delete(`/api/v1/products/${productId.toString()}`)
      .set(...asUser(admin));

    expect(res.status).toBe(403);
    expect(doc.status).toBe('ACTIVE');
  });

  it('denies CUSTOMER with 403', async () => {
    const res = await request(app)
      .delete(`/api/v1/products/${oid().toString()}`)
      .set(...asUser(makeFakeUser({ role: ROLES.CUSTOMER })));
    expect(res.status).toBe(403);
  });

  it('denies a BRAND_EMPLOYEE without products.delete', async () => {
    const employee = makeFakeUser({ role: ROLES.BRAND_EMPLOYEE, brandId: oid() });
    Employee.findOne.mockResolvedValue({
      isActive: true,
      permissions: [PERMISSIONS.PRODUCTS_UPDATE],
    });

    const res = await request(app)
      .delete(`/api/v1/products/${oid().toString()}`)
      .set(...asUser(employee));

    expect(res.status).toBe(403);
  });

  it('allows an authorized BRAND_EMPLOYEE (products.delete)', async () => {
    const brandId = oid();
    const productId = oid();
    const employee = makeFakeUser({ role: ROLES.BRAND_EMPLOYEE, brandId });
    Employee.findOne.mockResolvedValue({
      isActive: true,
      permissions: [PERMISSIONS.PRODUCTS_DELETE],
    });
    Product.findById.mockResolvedValue({
      _id: productId,
      brandId,
      save: jest.fn().mockResolvedValue(true),
    });

    const res = await request(app)
      .delete(`/api/v1/products/${productId.toString()}`)
      .set(...asUser(employee));

    expect(res.status).toBe(200);
  });

  it('denies a brand user with a missing brandId with 403', async () => {
    const res = await request(app)
      .delete(`/api/v1/products/${oid().toString()}`)
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: undefined })));
    expect(res.status).toBe(403);
  });

  it('allows SUPER_ADMIN to archive any brand product', async () => {
    const productId = oid();
    Product.findById.mockResolvedValue({
      _id: productId,
      brandId: oid(),
      save: jest.fn().mockResolvedValue(true),
    });

    const res = await request(app)
      .delete(`/api/v1/products/${productId.toString()}`)
      .set(...asUser(makeFakeUser({ role: ROLES.SUPER_ADMIN })));

    expect(res.status).toBe(200);
  });

  it('rejects an invalid product id with 400', async () => {
    const admin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: oid() });
    const res = await request(app).delete('/api/v1/products/bad-id').set(...asUser(admin));
    expect(res.status).toBe(400);
    expect(Product.findById).not.toHaveBeenCalled();
  });

  it('returns 404 for a nonexistent product', async () => {
    const admin = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: oid() });
    Product.findById.mockResolvedValue(null);

    const res = await request(app)
      .delete(`/api/v1/products/${oid().toString()}`)
      .set(...asUser(admin));

    expect(res.status).toBe(404);
  });
});