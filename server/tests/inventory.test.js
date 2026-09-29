const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/user.model');
jest.mock('../src/models/employee.model');
jest.mock('../src/models/inventory.model');
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
const Inventory = require('../src/models/inventory.model');
const Product = require('../src/models/product.model');
const app = require('../src/app');
const { ROLES } = require('../src/config/roles');
const { PERMISSIONS } = require('../src/config/permissions');
const { getAuthCookie } = require('./helpers/testAuth');

function oid() {
  return new mongoose.Types.ObjectId();
}

function makeFakeUser(overrides = {}) {
  return {
    _id: oid(),
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

// Realistic fixtures: only fields the real models define.
function makeProduct(brandId, overrides = {}) {
  return {
    _id: oid(),
    brandId,
    categoryId: oid(),
    name: 'Phone X',
    slug: 'phone-x',
    price: 999,
    isActive: true,
    status: 'ACTIVE',
    ...overrides,
  };
}

function makeInventory(product, overrides = {}) {
  return {
    _id: oid(),
    brandId: product.brandId,
    productId: product._id,
    quantity: 20,
    reservedQuantity: 3,
    availableQuantity: 17,
    lowStockThreshold: 5,
    trackInventory: true,
    ...overrides,
  };
}

function employeeWith(permissions) {
  Employee.findOne.mockResolvedValue({ isActive: true, permissions });
}

// Chainable stand-in for Inventory.find().sort().skip().limit()
function mockInventoryFind(items) {
  const limit = jest.fn().mockResolvedValue(items);
  const skip = jest.fn().mockReturnValue({ limit });
  const sort = jest.fn().mockReturnValue({ skip });
  Inventory.find.mockReturnValue({ sort });
  return { sort, skip, limit };
}

beforeEach(() => {
  jest.resetAllMocks();
});

// ---------------------------------------------------------------------
describe('GET /api/v1/inventory', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app).get('/api/v1/inventory');
    expect(res.status).toBe(401);
  });

  it('denies CUSTOMER with 403', async () => {
    const res = await request(app)
      .get('/api/v1/inventory')
      .set(...asUser(makeFakeUser({ role: ROLES.CUSTOMER })));
    expect(res.status).toBe(403);
    expect(Inventory.find).not.toHaveBeenCalled();
  });

  it('returns only the BRAND_ADMIN’s own brand inventory, with pagination and stockStatus', async () => {
    const brandId = oid();
    const product = makeProduct(brandId);
    const chain = mockInventoryFind([
      makeInventory(product),
      makeInventory(makeProduct(brandId), { availableQuantity: 0, quantity: 3, reservedQuantity: 3 }),
    ]);
    Inventory.countDocuments.mockResolvedValue(45);

    const res = await request(app)
      .get('/api/v1/inventory')
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId })));

    expect(res.status).toBe(200);
    expect(res.body.inventories).toHaveLength(2);
    expect(res.body.inventories[0].stockStatus).toBe('IN_STOCK');
    expect(res.body.inventories[1].stockStatus).toBe('OUT_OF_STOCK');
    expect(res.body.pagination).toEqual({ page: 1, limit: 20, total: 45, pages: 3 });
    expect(Inventory.find).toHaveBeenCalledWith({ brandId: brandId.toString() });
    expect(chain.skip).toHaveBeenCalledWith(0);
    expect(chain.limit).toHaveBeenCalledWith(20);
  });

  it('ignores a client-supplied ?brandId= for brand users (cannot read another brand)', async () => {
    const brandId = oid();
    const otherBrandId = oid();
    mockInventoryFind([]);
    Inventory.countDocuments.mockResolvedValue(0);

    const res = await request(app)
      .get(`/api/v1/inventory?brandId=${otherBrandId.toString()}`)
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId })));

    expect(res.status).toBe(200);
    expect(Inventory.find).toHaveBeenCalledWith({ brandId: brandId.toString() });
    expect(Inventory.countDocuments).toHaveBeenCalledWith({ brandId: brandId.toString() });
  });

  it('allows a BRAND_EMPLOYEE with inventory.view', async () => {
    const brandId = oid();
    employeeWith([PERMISSIONS.INVENTORY_VIEW]);
    mockInventoryFind([]);
    Inventory.countDocuments.mockResolvedValue(0);

    const res = await request(app)
      .get('/api/v1/inventory')
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_EMPLOYEE, brandId })));

    expect(res.status).toBe(200);
    expect(Inventory.find).toHaveBeenCalledWith({ brandId: brandId.toString() });
  });

  it('denies a BRAND_EMPLOYEE without inventory.view (even with inventory.manage only)', async () => {
    employeeWith([PERMISSIONS.INVENTORY_MANAGE]);

    const res = await request(app)
      .get('/api/v1/inventory')
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_EMPLOYEE, brandId: oid() })));

    expect(res.status).toBe(403);
    expect(Inventory.find).not.toHaveBeenCalled();
  });

  it('denies a BRAND_EMPLOYEE whose employee record is inactive', async () => {
    Employee.findOne.mockResolvedValue({ isActive: false, permissions: [PERMISSIONS.INVENTORY_VIEW] });

    const res = await request(app)
      .get('/api/v1/inventory')
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_EMPLOYEE, brandId: oid() })));

    expect(res.status).toBe(403);
  });

  it('denies a brand user with missing brand context with 403', async () => {
    const res = await request(app)
      .get('/api/v1/inventory')
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: undefined })));
    expect(res.status).toBe(403);
    expect(Inventory.find).not.toHaveBeenCalled();
  });

  it('gives SUPER_ADMIN the platform-wide list (no brand filter)', async () => {
    mockInventoryFind([]);
    Inventory.countDocuments.mockResolvedValue(0);

    const res = await request(app)
      .get('/api/v1/inventory')
      .set(...asUser(makeFakeUser({ role: ROLES.SUPER_ADMIN })));

    expect(res.status).toBe(200);
    expect(Inventory.find).toHaveBeenCalledWith({});
  });

  it('lets SUPER_ADMIN narrow the list with ?brandId=', async () => {
    const brandId = oid().toString();
    mockInventoryFind([]);
    Inventory.countDocuments.mockResolvedValue(0);

    const res = await request(app)
      .get(`/api/v1/inventory?brandId=${brandId}`)
      .set(...asUser(makeFakeUser({ role: ROLES.SUPER_ADMIN })));

    expect(res.status).toBe(200);
    expect(Inventory.find).toHaveBeenCalledWith({ brandId });
  });

  it('applies stockStatus, page and limit', async () => {
    const brandId = oid();
    const chain = mockInventoryFind([]);
    Inventory.countDocuments.mockResolvedValue(0);

    const res = await request(app)
      .get('/api/v1/inventory?stockStatus=OUT_OF_STOCK&page=3&limit=10')
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId })));

    expect(res.status).toBe(200);
    // availableQuantity is a computed virtual, not a stored field (Phase 8
    // review correction), so the stock-status filter is expressed entirely
    // via $expr over quantity/reservedQuantity — never a raw
    // availableQuantity field in the Mongo query.
    expect(Inventory.find).toHaveBeenCalledWith({
      trackInventory: true,
      $expr: { $lte: [{ $subtract: ['$quantity', '$reservedQuantity'] }, 0] },
      brandId: brandId.toString(),
    });
    expect(chain.skip).toHaveBeenCalledWith(20);
    expect(chain.limit).toHaveBeenCalledWith(10);
  });

  it('builds the LOW_STOCK filter from quantity minus reservedQuantity vs lowStockThreshold', async () => {
    const brandId = oid();
    mockInventoryFind([]);
    Inventory.countDocuments.mockResolvedValue(0);

    await request(app)
      .get('/api/v1/inventory?stockStatus=LOW_STOCK')
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId })));

    const AVAILABLE = { $subtract: ['$quantity', '$reservedQuantity'] };
    expect(Inventory.find).toHaveBeenCalledWith({
      trackInventory: true,
      $expr: { $and: [{ $gt: [AVAILABLE, 0] }, { $lte: [AVAILABLE, '$lowStockThreshold'] }] },
      brandId: brandId.toString(),
    });
  });

  it.each([
    ['an invalid stockStatus', 'stockStatus=BOGUS'],
    ['a non-integer page', 'page=abc'],
    ['page 0', 'page=0'],
    ['an oversized limit', 'limit=1000'],
    ['an invalid brandId', 'brandId=nope'],
  ])('rejects %s with 400', async (_label, query) => {
    const res = await request(app)
      .get(`/api/v1/inventory?${query}`)
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: oid() })));
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------
describe('GET /api/v1/inventory/:productId', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app).get(`/api/v1/inventory/${oid().toString()}`);
    expect(res.status).toBe(401);
  });

  it('denies CUSTOMER with 403', async () => {
    const res = await request(app)
      .get(`/api/v1/inventory/${oid().toString()}`)
      .set(...asUser(makeFakeUser({ role: ROLES.CUSTOMER })));
    expect(res.status).toBe(403);
    expect(Product.findById).not.toHaveBeenCalled();
  });

  it('returns same-brand inventory to a BRAND_ADMIN with a derived stockStatus', async () => {
    const brandId = oid();
    const product = makeProduct(brandId);
    Product.findById.mockResolvedValue(product);
    Inventory.findOne.mockResolvedValue(makeInventory(product, { availableQuantity: 4, quantity: 7 }));

    const res = await request(app)
      .get(`/api/v1/inventory/${product._id.toString()}`)
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId })));

    expect(res.status).toBe(200);
    expect(res.body.inventory.quantity).toBe(7);
    expect(res.body.inventory.stockStatus).toBe('LOW_STOCK');
    expect(Inventory.findOne).toHaveBeenCalledWith({
      productId: product._id,
      brandId: product.brandId,
    });
  });

  it('returns a zero-stock default WITHOUT writing when the product has no inventory yet', async () => {
    const brandId = oid();
    const product = makeProduct(brandId);
    Product.findById.mockResolvedValue(product);
    Inventory.findOne.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/v1/inventory/${product._id.toString()}`)
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId })));

    expect(res.status).toBe(200);
    expect(res.body.inventory.quantity).toBe(0);
    expect(res.body.inventory.availableQuantity).toBe(0);
    expect(res.body.inventory.stockStatus).toBe('OUT_OF_STOCK');
    expect(Inventory.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('allows a BRAND_EMPLOYEE with inventory.view', async () => {
    const brandId = oid();
    const product = makeProduct(brandId);
    employeeWith([PERMISSIONS.INVENTORY_VIEW]);
    Product.findById.mockResolvedValue(product);
    Inventory.findOne.mockResolvedValue(makeInventory(product));

    const res = await request(app)
      .get(`/api/v1/inventory/${product._id.toString()}`)
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_EMPLOYEE, brandId })));

    expect(res.status).toBe(200);
  });

  it('denies a BRAND_EMPLOYEE without inventory.view', async () => {
    employeeWith([PERMISSIONS.PRODUCTS_VIEW]);

    const res = await request(app)
      .get(`/api/v1/inventory/${oid().toString()}`)
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_EMPLOYEE, brandId: oid() })));

    expect(res.status).toBe(403);
    expect(Product.findById).not.toHaveBeenCalled();
  });

  it('denies a brand user with missing brand context with 403', async () => {
    const res = await request(app)
      .get(`/api/v1/inventory/${oid().toString()}`)
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: undefined })));
    expect(res.status).toBe(403);
    expect(Product.findById).not.toHaveBeenCalled();
  });

  it('denies Brand A reading Brand B inventory with 403 (and never reads the inventory)', async () => {
    const product = makeProduct(oid()); // Brand B's product
    Product.findById.mockResolvedValue(product);

    const res = await request(app)
      .get(`/api/v1/inventory/${product._id.toString()}`)
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: oid() })));

    expect(res.status).toBe(403);
    expect(Inventory.findOne).not.toHaveBeenCalled();
  });

  it('denies a Brand A employee (with permission) reading Brand B inventory', async () => {
    const product = makeProduct(oid());
    employeeWith([PERMISSIONS.INVENTORY_VIEW]);
    Product.findById.mockResolvedValue(product);

    const res = await request(app)
      .get(`/api/v1/inventory/${product._id.toString()}`)
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_EMPLOYEE, brandId: oid() })));

    expect(res.status).toBe(403);
  });

  it('allows SUPER_ADMIN to read any brand’s inventory', async () => {
    const product = makeProduct(oid());
    Product.findById.mockResolvedValue(product);
    Inventory.findOne.mockResolvedValue(makeInventory(product));

    const res = await request(app)
      .get(`/api/v1/inventory/${product._id.toString()}`)
      .set(...asUser(makeFakeUser({ role: ROLES.SUPER_ADMIN })));

    expect(res.status).toBe(200);
  });

  it('rejects an invalid productId with 400 before any database lookup', async () => {
    const res = await request(app)
      .get('/api/v1/inventory/not-an-id')
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: oid() })));
    expect(res.status).toBe(400);
    expect(Product.findById).not.toHaveBeenCalled();
  });

  it('returns 404 for a nonexistent product', async () => {
    Product.findById.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/v1/inventory/${oid().toString()}`)
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: oid() })));

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------
describe('PATCH /api/v1/inventory/:productId (set stock)', () => {
  // ensureInventory's upsert is the first findOneAndUpdate call; the actual
  // change is the second.
  function mockSet({ before, after }) {
    Inventory.findOneAndUpdate.mockResolvedValueOnce(before).mockResolvedValueOnce(after);
  }

  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app)
      .patch(`/api/v1/inventory/${oid().toString()}`)
      .send({ quantity: 5 });
    expect(res.status).toBe(401);
  });

  it('denies CUSTOMER with 403', async () => {
    const res = await request(app)
      .patch(`/api/v1/inventory/${oid().toString()}`)
      .set(...asUser(makeFakeUser({ role: ROLES.CUSTOMER })))
      .send({ quantity: 5 });
    expect(res.status).toBe(403);
    expect(Inventory.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('lets a BRAND_ADMIN set stock for their own product with a conditional atomic update', async () => {
    const brandId = oid();
    const product = makeProduct(brandId);
    const before = makeInventory(product, { quantity: 20, reservedQuantity: 3, availableQuantity: 17 });
    const after = makeInventory(product, { quantity: 50, reservedQuantity: 3, availableQuantity: 47 });
    Product.findById.mockResolvedValue(product);
    mockSet({ before, after });

    const res = await request(app)
      .patch(`/api/v1/inventory/${product._id.toString()}`)
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId })))
      .send({ quantity: 50 });

    expect(res.status).toBe(200);
    expect(res.body.inventory.quantity).toBe(50);
    expect(res.body.inventory.availableQuantity).toBe(47);

    // The write is ONE conditional update whose filter carries the guards.
    const [filter, update, options] = Inventory.findOneAndUpdate.mock.calls[1];
    expect(filter).toEqual({
      productId: product._id,
      brandId: product.brandId,
      quantity: 20,
      reservedQuantity: { $lte: 50 },
    });
    // availableQuantity is a virtual — only quantity is ever $inc'd.
    expect(update).toEqual({ $inc: { quantity: 30 } });
    expect(options).toEqual({ new: true });
  });

  it('initializes a missing record via an upsert keyed on the product’s own brand', async () => {
    const brandId = oid();
    const product = makeProduct(brandId);
    const zero = makeInventory(product, { quantity: 0, reservedQuantity: 0, availableQuantity: 0 });
    Product.findById.mockResolvedValue(product);
    mockSet({ before: zero, after: makeInventory(product, { quantity: 12, availableQuantity: 12, reservedQuantity: 0 }) });

    await request(app)
      .patch(`/api/v1/inventory/${product._id.toString()}`)
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId })))
      .send({ quantity: 12 });

    const [scope, update, options] = Inventory.findOneAndUpdate.mock.calls[0];
    expect(scope).toEqual({ productId: product._id, brandId: product.brandId });
    // availableQuantity is never inserted — it isn't a document field.
    expect(update.$setOnInsert).toEqual(
      expect.objectContaining({ quantity: 0, reservedQuantity: 0 })
    );
    expect(update.$setOnInsert).not.toHaveProperty('availableQuantity');
    expect(options).toEqual({ upsert: true, new: true });
  });

  it('allows a BRAND_EMPLOYEE with inventory.manage', async () => {
    const brandId = oid();
    const product = makeProduct(brandId);
    employeeWith([PERMISSIONS.INVENTORY_MANAGE]);
    Product.findById.mockResolvedValue(product);
    mockSet({ before: makeInventory(product), after: makeInventory(product, { quantity: 30, availableQuantity: 27 }) });

    const res = await request(app)
      .patch(`/api/v1/inventory/${product._id.toString()}`)
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_EMPLOYEE, brandId })))
      .send({ quantity: 30 });

    expect(res.status).toBe(200);
  });

  it('denies a BRAND_EMPLOYEE who only has inventory.view', async () => {
    employeeWith([PERMISSIONS.INVENTORY_VIEW]);

    const res = await request(app)
      .patch(`/api/v1/inventory/${oid().toString()}`)
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_EMPLOYEE, brandId: oid() })))
      .send({ quantity: 30 });

    expect(res.status).toBe(403);
    expect(Inventory.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('denies a brand user with missing brand context with 403', async () => {
    const res = await request(app)
      .patch(`/api/v1/inventory/${oid().toString()}`)
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: undefined })))
      .send({ quantity: 30 });
    expect(res.status).toBe(403);
    expect(Inventory.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('denies Brand A modifying Brand B inventory with 403 and performs NO write', async () => {
    const product = makeProduct(oid()); // Brand B
    Product.findById.mockResolvedValue(product);

    const res = await request(app)
      .patch(`/api/v1/inventory/${product._id.toString()}`)
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: oid() })))
      .send({ quantity: 999 });

    expect(res.status).toBe(403);
    expect(Inventory.findOneAndUpdate).not.toHaveBeenCalled();
    expect(Inventory.findOne).not.toHaveBeenCalled();
  });

  it('denies a Brand A employee (with inventory.manage) modifying Brand B inventory', async () => {
    const product = makeProduct(oid());
    employeeWith([PERMISSIONS.INVENTORY_MANAGE]);
    Product.findById.mockResolvedValue(product);

    const res = await request(app)
      .patch(`/api/v1/inventory/${product._id.toString()}`)
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_EMPLOYEE, brandId: oid() })))
      .send({ quantity: 999 });

    expect(res.status).toBe(403);
    expect(Inventory.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('ignores a client-supplied brandId — the write is scoped to the product’s (verified) brand', async () => {
    const brandId = oid();
    const attackerBrandId = oid().toString();
    const product = makeProduct(brandId);
    Product.findById.mockResolvedValue(product);
    mockSet({ before: makeInventory(product), after: makeInventory(product, { quantity: 30, availableQuantity: 27 }) });

    const res = await request(app)
      .patch(`/api/v1/inventory/${product._id.toString()}`)
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId })))
      .send({ quantity: 30, brandId: attackerBrandId });

    expect(res.status).toBe(200);
    Inventory.findOneAndUpdate.mock.calls.forEach(([filter]) => {
      expect(filter.brandId).toBe(product.brandId);
      expect(String(filter.brandId)).not.toBe(attackerBrandId);
    });
  });

  it('ignores client attempts to set reservedQuantity / availableQuantity', async () => {
    const brandId = oid();
    const product = makeProduct(brandId);
    Product.findById.mockResolvedValue(product);
    mockSet({ before: makeInventory(product), after: makeInventory(product, { quantity: 30, availableQuantity: 27 }) });

    const res = await request(app)
      .patch(`/api/v1/inventory/${product._id.toString()}`)
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId })))
      .send({ quantity: 30, reservedQuantity: 0, availableQuantity: 9999 });

    expect(res.status).toBe(200);
    const [, update] = Inventory.findOneAndUpdate.mock.calls[1];
    expect(JSON.stringify(update)).not.toContain('9999');
    expect(update.$set).toBeUndefined();
  });

  it('rejects setting stock below the reserved quantity with 409 and writes nothing', async () => {
    const brandId = oid();
    const product = makeProduct(brandId);
    Product.findById.mockResolvedValue(product);
    Inventory.findOneAndUpdate.mockResolvedValueOnce(
      makeInventory(product, { quantity: 20, reservedQuantity: 5, availableQuantity: 15 })
    );

    const res = await request(app)
      .patch(`/api/v1/inventory/${product._id.toString()}`)
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId })))
      .send({ quantity: 4 });

    expect(res.status).toBe(409);
    expect(Inventory.findOneAndUpdate).toHaveBeenCalledTimes(1); // only the ensure-upsert
  });

  it('returns 409 when concurrent changes keep beating the compare-and-swap', async () => {
    const brandId = oid();
    const product = makeProduct(brandId);
    Product.findById.mockResolvedValue(product);
    const current = makeInventory(product);
    Inventory.findOneAndUpdate
      .mockResolvedValueOnce(current) // ensure
      .mockResolvedValue(null); // every CAS attempt loses
    Inventory.findOne.mockResolvedValue(current);

    const res = await request(app)
      .patch(`/api/v1/inventory/${product._id.toString()}`)
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId })))
      .send({ quantity: 50 });

    expect(res.status).toBe(409);
  });

  it('updates lowStockThreshold and trackInventory alone with a scoped $set', async () => {
    const brandId = oid();
    const product = makeProduct(brandId);
    Product.findById.mockResolvedValue(product);
    mockSet({
      before: makeInventory(product),
      after: makeInventory(product, { lowStockThreshold: 8, trackInventory: false }),
    });

    const res = await request(app)
      .patch(`/api/v1/inventory/${product._id.toString()}`)
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId })))
      .send({ lowStockThreshold: 8, trackInventory: false });

    expect(res.status).toBe(200);
    expect(res.body.inventory.stockStatus).toBe('NOT_TRACKED');
    const [filter, update] = Inventory.findOneAndUpdate.mock.calls[1];
    expect(filter).toEqual({ productId: product._id, brandId: product.brandId });
    expect(update).toEqual({ $set: { lowStockThreshold: 8, trackInventory: false } });
  });

  it('allows SUPER_ADMIN to set any brand’s stock (brand taken from the product)', async () => {
    const product = makeProduct(oid());
    Product.findById.mockResolvedValue(product);
    mockSet({ before: makeInventory(product), after: makeInventory(product, { quantity: 30, availableQuantity: 27 }) });

    const res = await request(app)
      .patch(`/api/v1/inventory/${product._id.toString()}`)
      .set(...asUser(makeFakeUser({ role: ROLES.SUPER_ADMIN })))
      .send({ quantity: 30 });

    expect(res.status).toBe(200);
    const [filter] = Inventory.findOneAndUpdate.mock.calls[1];
    expect(filter.brandId).toBe(product.brandId);
  });

  it('rejects an invalid productId with 400 before any database lookup', async () => {
    const res = await request(app)
      .patch('/api/v1/inventory/not-an-id')
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: oid() })))
      .send({ quantity: 5 });
    expect(res.status).toBe(400);
    expect(Product.findById).not.toHaveBeenCalled();
  });

  it('returns 404 for a nonexistent product', async () => {
    Product.findById.mockResolvedValue(null);

    const res = await request(app)
      .patch(`/api/v1/inventory/${oid().toString()}`)
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: oid() })))
      .send({ quantity: 5 });

    expect(res.status).toBe(404);
    expect(Inventory.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it.each([
    ['a negative quantity', { quantity: -1 }],
    ['a fractional quantity', { quantity: 2.5 }],
    ['a string quantity', { quantity: '10' }],
    ['a null quantity', { quantity: null }],
    ['an absurdly large quantity', { quantity: 1e12 }],
    ['a negative lowStockThreshold', { lowStockThreshold: -3 }],
    ['a fractional lowStockThreshold', { lowStockThreshold: 1.5 }],
    ['a non-boolean trackInventory', { trackInventory: 'yes' }],
    ['an empty body', {}],
    ['only unknown fields', { reservedQuantity: 5 }],
  ])('rejects %s with 400 and writes nothing', async (_label, body) => {
    const brandId = oid();
    const product = makeProduct(brandId);
    Product.findById.mockResolvedValue(product);

    const res = await request(app)
      .patch(`/api/v1/inventory/${product._id.toString()}`)
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId })))
      .send(body);

    expect(res.status).toBe(400);
    expect(Inventory.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('accepts a quantity of 0', async () => {
    const brandId = oid();
    const product = makeProduct(brandId);
    Product.findById.mockResolvedValue(product);
    mockSet({
      before: makeInventory(product, { quantity: 5, reservedQuantity: 0, availableQuantity: 5 }),
      after: makeInventory(product, { quantity: 0, reservedQuantity: 0, availableQuantity: 0 }),
    });

    const res = await request(app)
      .patch(`/api/v1/inventory/${product._id.toString()}`)
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId })))
      .send({ quantity: 0 });

    expect(res.status).toBe(200);
    expect(res.body.inventory.stockStatus).toBe('OUT_OF_STOCK');
  });
});

// ---------------------------------------------------------------------
describe('POST /api/v1/inventory/:productId/adjust', () => {
  function mockAdjust({ ensured, updated }) {
    Inventory.findOneAndUpdate.mockResolvedValueOnce(ensured).mockResolvedValueOnce(updated);
  }

  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app)
      .post(`/api/v1/inventory/${oid().toString()}/adjust`)
      .send({ change: 5 });
    expect(res.status).toBe(401);
  });

  it('denies CUSTOMER with 403', async () => {
    const res = await request(app)
      .post(`/api/v1/inventory/${oid().toString()}/adjust`)
      .set(...asUser(makeFakeUser({ role: ROLES.CUSTOMER })))
      .send({ change: 5 });
    expect(res.status).toBe(403);
    expect(Inventory.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('adds stock and returns a traceable adjustment record', async () => {
    const brandId = oid();
    const user = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId });
    const product = makeProduct(brandId);
    Product.findById.mockResolvedValue(product);
    mockAdjust({
      ensured: makeInventory(product, { quantity: 50, availableQuantity: 47 }),
      updated: makeInventory(product, { quantity: 70, availableQuantity: 67 }),
    });

    const res = await request(app)
      .post(`/api/v1/inventory/${product._id.toString()}/adjust`)
      .set(...asUser(user))
      .send({ change: 20, reason: 'STOCK_RECEIVED' });

    expect(res.status).toBe(200);
    expect(res.body.inventory.quantity).toBe(70);
    expect(res.body.adjustment).toEqual(
      expect.objectContaining({
        productId: product._id.toString(),
        brandId: product.brandId.toString(),
        previousQuantity: 50,
        change: 20,
        newQuantity: 70,
        reason: 'STOCK_RECEIVED',
        userId: user._id.toString(),
      })
    );
    expect(typeof res.body.adjustment.timestamp).toBe('string');

    const [filter, update] = Inventory.findOneAndUpdate.mock.calls[1];
    expect(filter).toEqual({ productId: product._id, brandId: product.brandId });
    expect(update).toEqual({ $inc: { quantity: 20 } });
  });

  it('removes stock with the availableQuantity guard in the atomic filter', async () => {
    const brandId = oid();
    const product = makeProduct(brandId);
    Product.findById.mockResolvedValue(product);
    mockAdjust({
      ensured: makeInventory(product),
      updated: makeInventory(product, { quantity: 15, availableQuantity: 12 }),
    });

    const res = await request(app)
      .post(`/api/v1/inventory/${product._id.toString()}/adjust`)
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId })))
      .send({ change: -5, reason: 'DAMAGED' });

    expect(res.status).toBe(200);
    const [filter, update] = Inventory.findOneAndUpdate.mock.calls[1];
    // The removal guard is $expr-based (quantity - reservedQuantity >= 5),
    // not a raw availableQuantity field — see models/inventory.model.js.
    expect(filter).toEqual({
      productId: product._id,
      brandId: product.brandId,
      $expr: { $gte: [{ $subtract: ['$quantity', '$reservedQuantity'] }, 5] },
    });
    expect(update).toEqual({ $inc: { quantity: -5 } });
  });

  it('rejects removing more than the available stock with 409 (stock cannot become negative)', async () => {
    const brandId = oid();
    const product = makeProduct(brandId);
    Product.findById.mockResolvedValue(product);
    // The guarded atomic update matched nothing -> null.
    mockAdjust({ ensured: makeInventory(product), updated: null });

    const res = await request(app)
      .post(`/api/v1/inventory/${product._id.toString()}/adjust`)
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId })))
      .send({ change: -500 });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('defaults the reason to MANUAL_ADJUSTMENT', async () => {
    const brandId = oid();
    const product = makeProduct(brandId);
    Product.findById.mockResolvedValue(product);
    mockAdjust({
      ensured: makeInventory(product),
      updated: makeInventory(product, { quantity: 21, availableQuantity: 18 }),
    });

    const res = await request(app)
      .post(`/api/v1/inventory/${product._id.toString()}/adjust`)
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId })))
      .send({ change: 1 });

    expect(res.body.adjustment.reason).toBe('MANUAL_ADJUSTMENT');
  });

  it('records the authenticated user, never a client-supplied userId', async () => {
    const brandId = oid();
    const user = makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId });
    const product = makeProduct(brandId);
    Product.findById.mockResolvedValue(product);
    mockAdjust({
      ensured: makeInventory(product),
      updated: makeInventory(product, { quantity: 21, availableQuantity: 18 }),
    });

    const res = await request(app)
      .post(`/api/v1/inventory/${product._id.toString()}/adjust`)
      .set(...asUser(user))
      .send({ change: 1, userId: oid().toString() });

    expect(res.body.adjustment.userId).toBe(user._id.toString());
  });

  it('allows a BRAND_EMPLOYEE with inventory.manage', async () => {
    const brandId = oid();
    const product = makeProduct(brandId);
    employeeWith([PERMISSIONS.INVENTORY_MANAGE]);
    Product.findById.mockResolvedValue(product);
    mockAdjust({
      ensured: makeInventory(product),
      updated: makeInventory(product, { quantity: 25, availableQuantity: 22 }),
    });

    const res = await request(app)
      .post(`/api/v1/inventory/${product._id.toString()}/adjust`)
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_EMPLOYEE, brandId })))
      .send({ change: 5 });

    expect(res.status).toBe(200);
  });

  it('denies a BRAND_EMPLOYEE who only has inventory.view', async () => {
    employeeWith([PERMISSIONS.INVENTORY_VIEW]);

    const res = await request(app)
      .post(`/api/v1/inventory/${oid().toString()}/adjust`)
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_EMPLOYEE, brandId: oid() })))
      .send({ change: 5 });

    expect(res.status).toBe(403);
    expect(Inventory.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('denies a brand user with missing brand context with 403', async () => {
    const res = await request(app)
      .post(`/api/v1/inventory/${oid().toString()}/adjust`)
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: undefined })))
      .send({ change: 5 });
    expect(res.status).toBe(403);
  });

  it('denies Brand A adjusting Brand B stock with 403 and performs NO write', async () => {
    const product = makeProduct(oid()); // Brand B
    Product.findById.mockResolvedValue(product);

    const res = await request(app)
      .post(`/api/v1/inventory/${product._id.toString()}/adjust`)
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: oid() })))
      .send({ change: 100 });

    expect(res.status).toBe(403);
    expect(Inventory.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('ignores a client-supplied brandId in the body', async () => {
    const brandId = oid();
    const attackerBrandId = oid().toString();
    const product = makeProduct(brandId);
    Product.findById.mockResolvedValue(product);
    mockAdjust({
      ensured: makeInventory(product),
      updated: makeInventory(product, { quantity: 21, availableQuantity: 18 }),
    });

    const res = await request(app)
      .post(`/api/v1/inventory/${product._id.toString()}/adjust`)
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId })))
      .send({ change: 1, brandId: attackerBrandId });

    expect(res.status).toBe(200);
    Inventory.findOneAndUpdate.mock.calls.forEach(([filter]) => {
      expect(filter.brandId).toBe(product.brandId);
    });
  });

  it('allows SUPER_ADMIN to adjust any brand’s stock', async () => {
    const product = makeProduct(oid());
    Product.findById.mockResolvedValue(product);
    mockAdjust({
      ensured: makeInventory(product),
      updated: makeInventory(product, { quantity: 21, availableQuantity: 18 }),
    });

    const res = await request(app)
      .post(`/api/v1/inventory/${product._id.toString()}/adjust`)
      .set(...asUser(makeFakeUser({ role: ROLES.SUPER_ADMIN })))
      .send({ change: 1 });

    expect(res.status).toBe(200);
  });

  it('rejects an invalid productId with 400 before any database lookup', async () => {
    const res = await request(app)
      .post('/api/v1/inventory/not-an-id/adjust')
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: oid() })))
      .send({ change: 5 });
    expect(res.status).toBe(400);
    expect(Product.findById).not.toHaveBeenCalled();
  });

  it('returns 404 for a nonexistent product', async () => {
    Product.findById.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/v1/inventory/${oid().toString()}/adjust`)
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId: oid() })))
      .send({ change: 5 });

    expect(res.status).toBe(404);
  });

  it.each([
    ['a zero change', { change: 0 }],
    ['a fractional change', { change: 1.5 }],
    ['a string change', { change: '5' }],
    ['a null change', { change: null }],
    ['a missing change', {}],
    ['an absurdly large change', { change: 1e12 }],
    ['an absurdly negative change', { change: -1e12 }],
    ['an unknown reason', { change: 5, reason: 'BECAUSE' }],
    ['a system-only reason (ORDER_DEDUCTION)', { change: -5, reason: 'ORDER_DEDUCTION' }],
    ['a system-only reason (ORDER_CANCELLATION)', { change: 5, reason: 'ORDER_CANCELLATION' }],
  ])('rejects %s with 400 and writes nothing', async (_label, body) => {
    const brandId = oid();
    const product = makeProduct(brandId);
    Product.findById.mockResolvedValue(product);

    const res = await request(app)
      .post(`/api/v1/inventory/${product._id.toString()}/adjust`)
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId })))
      .send(body);

    expect(res.status).toBe(400);
    expect(Inventory.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it.each(['STOCK_RECEIVED', 'MANUAL_ADJUSTMENT', 'DAMAGED', 'LOST', 'RETURNED', 'CORRECTION'])(
    'accepts the documented manual reason %s',
    async (reason) => {
      const brandId = oid();
      const product = makeProduct(brandId);
      Product.findById.mockResolvedValue(product);
      mockAdjust({
        ensured: makeInventory(product),
        updated: makeInventory(product, { quantity: 21, availableQuantity: 18 }),
      });

      const res = await request(app)
        .post(`/api/v1/inventory/${product._id.toString()}/adjust`)
        .set(...asUser(makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId })))
        .send({ change: 1, reason });

      expect(res.status).toBe(200);
      expect(res.body.adjustment.reason).toBe(reason);
    }
  );
});

// ---------------------------------------------------------------------
describe('inventory routes never expose reserve/release over HTTP', () => {
  it.each(['reserve', 'release'])('has no /%s endpoint (internal service function only)', async (op) => {
    const brandId = oid();
    const res = await request(app)
      .post(`/api/v1/inventory/${oid().toString()}/${op}`)
      .set(...asUser(makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId })))
      .send({ quantity: 1 });
    expect(res.status).toBe(404);
  });
});