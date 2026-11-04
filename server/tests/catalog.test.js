const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/user.model');
jest.mock('../src/models/employee.model');
jest.mock('../src/models/category.model');
jest.mock('../src/models/adminPartner.model');
// Factory mocks keep the STATUSES / SCOPES lists the validators read.
jest.mock('../src/models/product.model', () => {
  const actual = jest.requireActual('../src/models/product.model');
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    countDocuments: jest.fn(),
    distinct: jest.fn(),
    updateMany: jest.fn(),
    STATUSES: actual.STATUSES,
  };
});
jest.mock('../src/models/catalogProduct.model', () => {
  const actual = jest.requireActual('../src/models/catalogProduct.model');
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    countDocuments: jest.fn(),
    STATUSES: actual.STATUSES,
    SCOPES: actual.SCOPES,
  };
});

const User = require('../src/models/user.model');
const Employee = require('../src/models/employee.model');
const Category = require('../src/models/category.model');
const AdminPartner = require('../src/models/adminPartner.model');
const Product = require('../src/models/product.model');
const CatalogProduct = require('../src/models/catalogProduct.model');
const app = require('../src/app');
const { ROLES } = require('../src/config/roles');
const { PERMISSIONS } = require('../src/config/permissions');
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
const brandAdmin = (brandId = oid()) => makeFakeUser({ role: ROLES.BRAND_ADMIN, brandId });
function asPartner(permissions, over = {}) {
  const user = makeFakeUser({ role: ROLES.ADMIN_PARTNER });
  AdminPartner.findOne.mockResolvedValue({ _id: oid(), userId: user._id, permissions, readOnly: false, isActive: true, ...over });
  return asUser(user);
}

/** A catalogue document with a working save(). */
function fakeItem(over = {}) {
  const doc = {
    _id: oid(),
    name: 'Dalda Ghee 1 kg',
    slug: 'dalda-ghee-1-kg',
    categoryId: oid(),
    description: 'Cooking ghee',
    images: [],
    scope: 'GLOBAL',
    status: 'ACTIVE',
    ...over,
  };
  doc.save = jest.fn().mockImplementation(async () => doc);
  return doc;
}

/** Makes the category check pass. */
function usableCategory() {
  Category.findById.mockResolvedValue({ _id: oid(), isActive: true });
  Category.countDocuments.mockResolvedValue(0);
}

/** Chainable stand-in for CatalogProduct.find().sort().skip().limit(). */
function mockCatalogFind(items) {
  const limit = jest.fn().mockResolvedValue(items);
  const skip = jest.fn().mockReturnValue({ limit });
  const sort = jest.fn().mockReturnValue({ skip });
  CatalogProduct.find.mockReturnValue({ sort });
  return { sort, skip, limit };
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe('GET /api/v1/catalog (what a store can pick from)', () => {
  it('lists active global items and the store\'s own private ones, with pagination', async () => {
    const brandId = oid();
    const chain = mockCatalogFind([fakeItem()]);
    CatalogProduct.countDocuments.mockResolvedValue(45);

    const res = await request(app).get('/api/v1/catalog?page=2&limit=10').set(...asUser(brandAdmin(brandId)));

    expect(res.status).toBe(200);
    expect(res.body.pagination).toEqual({ page: 2, limit: 10, total: 45, pages: 5 });
    expect(CatalogProduct.find).toHaveBeenCalledWith({
      status: 'ACTIVE',
      $or: [{ scope: 'GLOBAL' }, { scope: 'PRIVATE', brandId: brandId.toString() }],
    });
    expect(chain.skip).toHaveBeenCalledWith(10);
    expect(chain.limit).toHaveBeenCalledWith(10);
  });

  it('searches name, manufacturer and barcode, escaping the text', async () => {
    mockCatalogFind([]);
    CatalogProduct.countDocuments.mockResolvedValue(0);
    const categoryId = oid().toString();

    const res = await request(app).get(`/api/v1/catalog?q=${encodeURIComponent('ghee (1kg)')}&categoryId=${categoryId}`).set(...asUser(brandAdmin()));

    expect(res.status).toBe(200);
    const filter = CatalogProduct.find.mock.calls[0][0];
    expect(filter.categoryId).toBe(categoryId);
    const [{ $or }] = filter.$and;
    expect($or[0].name.$regex).toBe('ghee \\(1kg\\)'); // metacharacters are escaped
    expect($or[2]).toEqual({ barcode: 'ghee (1kg)' });
  });

  it('rejects bad query values with 400', async () => {
    const res = await request(app).get('/api/v1/catalog?categoryId=nope').set(...asUser(brandAdmin()));
    expect(res.status).toBe(400);
    expect(CatalogProduct.find).not.toHaveBeenCalled();
  });

  it('needs brand staff with products.view', async () => {
    expect((await request(app).get('/api/v1/catalog')).status).toBe(401);
    expect((await request(app).get('/api/v1/catalog').set(...asUser(makeFakeUser()))).status).toBe(403);
    const employee = makeFakeUser({ role: ROLES.BRAND_EMPLOYEE, brandId: oid() });
    Employee.findOne.mockResolvedValue({ isActive: true, permissions: [] });
    expect((await request(app).get('/api/v1/catalog').set(...asUser(employee))).status).toBe(403);
    expect((await request(app).get('/api/v1/catalog').set(...asUser(superAdmin()))).status).toBe(403); // no brand
  });
});

describe('GET /api/v1/catalog/mine and /:id', () => {
  it("lists the store's own requests and private items in every status but archived", async () => {
    const brandId = oid();
    mockCatalogFind([fakeItem({ status: 'PENDING' })]);
    CatalogProduct.countDocuments.mockResolvedValue(1);

    const res = await request(app).get('/api/v1/catalog/mine').set(...asUser(brandAdmin(brandId)));

    expect(res.status).toBe(200);
    expect(CatalogProduct.find).toHaveBeenCalledWith({ brandId: brandId.toString(), status: { $ne: 'ARCHIVED' } });
  });

  it('shows an active global item and the store\'s own pending item', async () => {
    const brandId = oid();
    const global = fakeItem();
    const own = fakeItem({ status: 'PENDING', brandId: brandId.toString() });
    const cookie = asUser(brandAdmin(brandId));

    CatalogProduct.findById.mockResolvedValue(global);
    expect((await request(app).get(`/api/v1/catalog/${global._id}`).set(...cookie)).status).toBe(200);
    CatalogProduct.findById.mockResolvedValue(own);
    expect((await request(app).get(`/api/v1/catalog/${own._id}`).set(...cookie)).status).toBe(200);
  });

  it("hides another store's private or pending item (404), and a missing one", async () => {
    const cookie = asUser(brandAdmin());
    for (const item of [fakeItem({ scope: 'PRIVATE', brandId: oid().toString() }), fakeItem({ status: 'PENDING', brandId: oid().toString() }), null]) {
      CatalogProduct.findById.mockResolvedValue(item);
      expect((await request(app).get(`/api/v1/catalog/${oid()}`).set(...cookie)).status).toBe(404);
    }
    expect((await request(app).get('/api/v1/catalog/not-an-id').set(...cookie)).status).toBe(400);
  });
});

describe('POST /api/v1/catalog/requests (a store asks for a new item)', () => {
  const body = { name: 'Rooh Afza 800 ml', categoryId: oid().toString(), manufacturer: 'Hamdard' };

  beforeEach(() => {
    usableCategory();
    CatalogProduct.findOne.mockResolvedValue(null);
    CatalogProduct.create.mockImplementation(async (doc) => ({ _id: oid(), ...doc }));
  });

  it('creates a PENDING global request for the authenticated store', async () => {
    const brandId = oid();
    const admin = brandAdmin(brandId);

    const res = await request(app).post('/api/v1/catalog/requests').set(...asUser(admin)).send(body);

    expect(res.status).toBe(201);
    expect(CatalogProduct.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Rooh Afza 800 ml',
        slug: 'rooh-afza-800-ml',
        scope: 'GLOBAL',
        status: 'PENDING',
        brandId: brandId.toString(),
        createdBy: admin._id,
      })
    );
  });

  it('creates a private item that is usable straight away', async () => {
    const res = await request(app).post('/api/v1/catalog/requests').set(...asUser(brandAdmin())).send({ ...body, private: true });
    expect(res.status).toBe(201);
    expect(CatalogProduct.create).toHaveBeenCalledWith(expect.objectContaining({ scope: 'PRIVATE', status: 'ACTIVE' }));
    expect(CatalogProduct.create.mock.calls[0][0].private).toBeUndefined();
  });

  it('ignores a client-supplied brandId, status and scope', async () => {
    const brandId = oid();
    const res = await request(app)
      .post('/api/v1/catalog/requests')
      .set(...asUser(brandAdmin(brandId)))
      .send({ ...body, brandId: oid().toString(), status: 'ACTIVE', scope: 'GLOBAL' });
    expect(res.status).toBe(201);
    const created = CatalogProduct.create.mock.calls[0][0];
    expect(created.brandId).toBe(brandId.toString());
    expect(created.status).toBe('PENDING');
  });

  it('refuses a barcode that is already in the catalogue (409)', async () => {
    CatalogProduct.findOne.mockResolvedValueOnce({ _id: oid() });
    const res = await request(app).post('/api/v1/catalog/requests').set(...asUser(brandAdmin())).send({ ...body, barcode: '8964000123456' });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/barcode/);
    expect(CatalogProduct.create).not.toHaveBeenCalled();
  });

  it('refuses a name that is already a live global item (409)', async () => {
    CatalogProduct.findOne.mockResolvedValue({ _id: oid() });
    const res = await request(app).post('/api/v1/catalog/requests').set(...asUser(brandAdmin())).send(body);
    expect(res.status).toBe(409);
    expect(CatalogProduct.findOne).toHaveBeenCalledWith({ slug: 'rooh-afza-800-ml', scope: 'GLOBAL', status: { $in: ['ACTIVE', 'PENDING'] } });
  });

  it("checks a private item's name against the store's own items only", async () => {
    const brandId = oid();
    CatalogProduct.findOne.mockResolvedValue(null);
    await request(app).post('/api/v1/catalog/requests').set(...asUser(brandAdmin(brandId))).send({ ...body, private: true });
    expect(CatalogProduct.findOne).toHaveBeenCalledWith({
      slug: 'rooh-afza-800-ml',
      scope: 'PRIVATE',
      brandId: brandId.toString(),
      status: { $ne: 'ARCHIVED' },
    });
  });

  it('rejects an unusable category (400)', async () => {
    Category.findById.mockResolvedValue(null);
    const res = await request(app).post('/api/v1/catalog/requests').set(...asUser(brandAdmin())).send(body);
    expect(res.status).toBe(400);
    expect(CatalogProduct.create).not.toHaveBeenCalled();
  });

  it('validates the body (400)', async () => {
    const cookie = asUser(brandAdmin());
    const send = (b) => request(app).post('/api/v1/catalog/requests').set(...cookie).send(b);
    expect((await send({ categoryId: body.categoryId })).status).toBe(400); // no name
    expect((await send({ name: 'X' })).status).toBe(400); // no category
    expect((await send({ ...body, barcode: 'ab' })).status).toBe(400);
    expect((await send({ ...body, images: ['not-a-link'] })).status).toBe(400);
    expect((await send({ ...body, size: { value: -1, unit: 'kg' } })).status).toBe(400);
    expect(CatalogProduct.create).not.toHaveBeenCalled();
  });

  it('needs products.create, and a brand', async () => {
    expect((await request(app).post('/api/v1/catalog/requests').send(body)).status).toBe(401);
    const employee = makeFakeUser({ role: ROLES.BRAND_EMPLOYEE, brandId: oid() });
    Employee.findOne.mockResolvedValue({ isActive: true, permissions: [PERMISSIONS.PRODUCTS_VIEW] });
    expect((await request(app).post('/api/v1/catalog/requests').set(...asUser(employee)).send(body)).status).toBe(403);
    Employee.findOne.mockResolvedValue({ isActive: true, permissions: [PERMISSIONS.PRODUCTS_CREATE] });
    expect((await request(app).post('/api/v1/catalog/requests').set(...asUser(employee)).send(body)).status).toBe(201);
    expect((await request(app).post('/api/v1/catalog/requests').set(...asUser(superAdmin())).send(body)).status).toBe(400);
  });
});

describe('/api/v1/admin/catalog access', () => {
  it('lets the super admin and a partner with admin.catalog in, and keeps everyone else out', async () => {
    mockCatalogFind([]);
    CatalogProduct.countDocuments.mockResolvedValue(0);
    expect((await request(app).get('/api/v1/admin/catalog')).status).toBe(401);
    expect((await request(app).get('/api/v1/admin/catalog').set(...asUser(superAdmin()))).status).toBe(200);
    expect((await request(app).get('/api/v1/admin/catalog').set(...asPartner([ADMIN_PERMISSIONS.CATALOG]))).status).toBe(200);
    expect((await request(app).get('/api/v1/admin/catalog').set(...asPartner([ADMIN_PERMISSIONS.LOCATIONS]))).status).toBe(403);
    expect((await request(app).get('/api/v1/admin/catalog').set(...asUser(brandAdmin()))).status).toBe(403);
    expect((await request(app).get('/api/v1/admin/catalog').set(...asUser(makeFakeUser()))).status).toBe(403);
  });

  it('denies a read-only partner any write', async () => {
    const res = await request(app)
      .post('/api/v1/admin/catalog')
      .set(...asPartner([ADMIN_PERMISSIONS.CATALOG], { readOnly: true }))
      .send({ name: 'X', categoryId: oid().toString() });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/admin/catalog', () => {
  it('lists everything and filters by status, scope and search', async () => {
    mockCatalogFind([fakeItem({ status: 'PENDING' })]);
    CatalogProduct.countDocuments.mockResolvedValue(1);

    const res = await request(app).get('/api/v1/admin/catalog?status=PENDING&scope=GLOBAL&q=ghee').set(...asUser(superAdmin()));

    expect(res.status).toBe(200);
    const filter = CatalogProduct.find.mock.calls[0][0];
    expect(filter).toMatchObject({ status: 'PENDING', scope: 'GLOBAL' });
    expect(filter.$and).toHaveLength(1);
    expect((await request(app).get('/api/v1/admin/catalog?status=BOGUS').set(...asUser(superAdmin()))).status).toBe(400);
  });
});

describe('POST /api/v1/admin/catalog', () => {
  beforeEach(() => {
    usableCategory();
    CatalogProduct.findOne.mockResolvedValue(null);
    CatalogProduct.create.mockImplementation(async (doc) => ({ _id: oid(), ...doc }));
  });
  const body = { name: 'Dalda Ghee 1 kg', categoryId: oid().toString(), manufacturer: 'Dalda', size: { value: 1, unit: 'kg' }, barcode: '8964000123456' };

  it('creates a global, active item', async () => {
    const admin = superAdmin();
    const res = await request(app).post('/api/v1/admin/catalog').set(...asUser(admin)).send(body);
    expect(res.status).toBe(201);
    expect(CatalogProduct.create).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'dalda-ghee-1-kg', scope: 'GLOBAL', status: 'ACTIVE', createdBy: admin._id, barcode: '8964000123456' })
    );
  });

  it('refuses a duplicate barcode or name (409), and maps a database race to 409', async () => {
    const cookie = asUser(superAdmin());
    CatalogProduct.findOne.mockResolvedValueOnce({ _id: oid() });
    expect((await request(app).post('/api/v1/admin/catalog').set(...cookie).send(body)).status).toBe(409);
    CatalogProduct.findOne.mockResolvedValue({ _id: oid() });
    expect((await request(app).post('/api/v1/admin/catalog').set(...cookie).send({ ...body, barcode: undefined })).status).toBe(409);
    CatalogProduct.findOne.mockResolvedValue(null);
    CatalogProduct.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));
    expect((await request(app).post('/api/v1/admin/catalog').set(...cookie).send(body)).status).toBe(409);
  });

  it('rejects an unusable category (400) and an empty name (400)', async () => {
    const cookie = asUser(superAdmin());
    Category.countDocuments.mockResolvedValue(3);
    const parent = await request(app).post('/api/v1/admin/catalog').set(...cookie).send(body);
    expect(parent.status).toBe(400);
    expect(parent.body.message).toMatch(/subcategory/i);
    expect((await request(app).post('/api/v1/admin/catalog').set(...cookie).send({ ...body, name: ' ' })).status).toBe(400);
  });
});

describe('PATCH /api/v1/admin/catalog/:id', () => {
  beforeEach(() => {
    usableCategory();
    CatalogProduct.findOne.mockResolvedValue(null);
  });

  it('updates the item and refreshes every store listing that uses it', async () => {
    const item = fakeItem();
    CatalogProduct.findById.mockResolvedValue(item);

    const res = await request(app)
      .patch(`/api/v1/admin/catalog/${item._id}`)
      .set(...asUser(superAdmin()))
      .send({ name: 'Dalda Banaspati Ghee 1 kg', description: 'New text', images: ['https://x/a.jpg'] });

    expect(res.status).toBe(200);
    expect(item.save).toHaveBeenCalled();
    expect(item.slug).toBe('dalda-banaspati-ghee-1-kg');
    expect(Product.updateMany).toHaveBeenCalledWith(
      { catalogProductId: item._id },
      { $set: { name: 'Dalda Banaspati Ghee 1 kg', description: 'New text', images: ['https://x/a.jpg'], categoryId: item.categoryId } }
    );
  });

  it('checks a new category, and refuses a name that another live item already has (409)', async () => {
    const item = fakeItem();
    CatalogProduct.findById.mockResolvedValue(item);
    const cookie = asUser(superAdmin());

    Category.findById.mockResolvedValue(null);
    expect((await request(app).patch(`/api/v1/admin/catalog/${item._id}`).set(...cookie).send({ categoryId: oid().toString() })).status).toBe(400);

    usableCategory();
    CatalogProduct.findOne.mockResolvedValue({ _id: oid() });
    expect((await request(app).patch(`/api/v1/admin/catalog/${item._id}`).set(...cookie).send({ name: 'Taken' })).status).toBe(409);
    expect(item.save).not.toHaveBeenCalled();
  });

  it('answers 404, 400 for a bad id, and 400 for an empty body', async () => {
    const cookie = asUser(superAdmin());
    CatalogProduct.findById.mockResolvedValue(null);
    expect((await request(app).patch(`/api/v1/admin/catalog/${oid()}`).set(...cookie).send({ name: 'X' })).status).toBe(404);
    expect((await request(app).patch('/api/v1/admin/catalog/nope').set(...cookie).send({ name: 'X' })).status).toBe(400);
    expect((await request(app).patch(`/api/v1/admin/catalog/${oid()}`).set(...cookie).send({})).status).toBe(400);
  });
});

describe('approve and reject', () => {
  it('approves a pending request and records who did it', async () => {
    const admin = superAdmin();
    const item = fakeItem({ status: 'PENDING', brandId: oid() });
    CatalogProduct.findById.mockResolvedValue(item);
    CatalogProduct.findOne.mockResolvedValue(null);
    usableCategory();

    const res = await request(app).post(`/api/v1/admin/catalog/${item._id}/approve`).set(...asUser(admin));

    expect(res.status).toBe(200);
    expect(item.status).toBe('ACTIVE');
    expect(item.reviewedBy).toBe(admin._id);
    expect(item.reviewedAt).toBeInstanceOf(Date);
  });

  it('only approves or rejects a pending request (409), and not if a live twin appeared meanwhile', async () => {
    const cookie = asUser(superAdmin());
    const active = fakeItem();
    CatalogProduct.findById.mockResolvedValue(active);
    expect((await request(app).post(`/api/v1/admin/catalog/${active._id}/approve`).set(...cookie)).status).toBe(409);
    expect((await request(app).post(`/api/v1/admin/catalog/${active._id}/reject`).set(...cookie).send({ note: 'No' })).status).toBe(409);

    const pending = fakeItem({ status: 'PENDING' });
    CatalogProduct.findById.mockResolvedValue(pending);
    usableCategory();
    CatalogProduct.findOne.mockResolvedValue({ _id: oid() });
    expect((await request(app).post(`/api/v1/admin/catalog/${pending._id}/approve`).set(...cookie)).status).toBe(409);
    expect(pending.status).toBe('PENDING');
  });

  it('rejects with a note the store can read, and needs the note', async () => {
    const admin = superAdmin();
    const item = fakeItem({ status: 'PENDING' });
    CatalogProduct.findById.mockResolvedValue(item);
    const cookie = asUser(admin);

    expect((await request(app).post(`/api/v1/admin/catalog/${item._id}/reject`).set(...cookie).send({})).status).toBe(400);
    const res = await request(app).post(`/api/v1/admin/catalog/${item._id}/reject`).set(...cookie).send({ note: 'Duplicate of another item.' });

    expect(res.status).toBe(200);
    expect(item).toMatchObject({ status: 'REJECTED', reviewNote: 'Duplicate of another item.', reviewedBy: admin._id });
  });
});

describe('POST /api/v1/admin/catalog/:id/merge', () => {
  it('moves every listing onto the item it duplicates and archives the duplicate', async () => {
    const from = fakeItem({ name: 'Dalda Ghee 1kg' });
    const into = fakeItem();
    CatalogProduct.findById.mockImplementation(async (id) => (String(id) === String(from._id) ? from : into));
    Product.distinct.mockResolvedValue([oid()]);
    Product.countDocuments.mockResolvedValue(0);

    const res = await request(app)
      .post(`/api/v1/admin/catalog/${from._id}/merge`)
      .set(...asUser(superAdmin()))
      .send({ intoId: into._id.toString() });

    expect(res.status).toBe(200);
    expect(Product.updateMany).toHaveBeenCalledWith(
      { catalogProductId: from._id },
      { $set: { catalogProductId: into._id, name: into.name, description: into.description, images: [], categoryId: into.categoryId } }
    );
    expect(from).toMatchObject({ status: 'ARCHIVED', mergedIntoId: into._id });
  });

  it('refuses while one store lists both items (409), merging into itself (400), or into an unusable item', async () => {
    const cookie = asUser(superAdmin());
    const from = fakeItem();
    const into = fakeItem();
    CatalogProduct.findById.mockImplementation(async (id) => (String(id) === String(from._id) ? from : into));
    Product.distinct.mockResolvedValue([oid()]);
    Product.countDocuments.mockResolvedValue(2);
    const clash = await request(app).post(`/api/v1/admin/catalog/${from._id}/merge`).set(...cookie).send({ intoId: into._id.toString() });
    expect(clash.status).toBe(409);
    expect(clash.body.message).toMatch(/2 store/);

    const self = await request(app).post(`/api/v1/admin/catalog/${from._id}/merge`).set(...cookie).send({ intoId: from._id.toString() });
    expect(self.status).toBe(400);

    into.status = 'PENDING';
    Product.countDocuments.mockResolvedValue(0);
    expect((await request(app).post(`/api/v1/admin/catalog/${from._id}/merge`).set(...cookie).send({ intoId: into._id.toString() })).status).toBe(400);
    expect(Product.updateMany).not.toHaveBeenCalled();
    expect(from.save).not.toHaveBeenCalled();
  });

  it('answers 404 when either item is missing, and 400 for a bad body', async () => {
    const cookie = asUser(superAdmin());
    const from = fakeItem();
    CatalogProduct.findById.mockImplementation(async (id) => (String(id) === String(from._id) ? from : null));
    expect((await request(app).post(`/api/v1/admin/catalog/${from._id}/merge`).set(...cookie).send({ intoId: oid().toString() })).status).toBe(404);
    expect((await request(app).post(`/api/v1/admin/catalog/${from._id}/merge`).set(...cookie).send({})).status).toBe(400);
  });
});

describe('DELETE /api/v1/admin/catalog/:id', () => {
  it('archives an item that no store lists', async () => {
    const item = fakeItem();
    CatalogProduct.findById.mockResolvedValue(item);
    Product.countDocuments.mockResolvedValue(0);
    const res = await request(app).delete(`/api/v1/admin/catalog/${item._id}`).set(...asUser(superAdmin()));
    expect(res.status).toBe(200);
    expect(item.status).toBe('ARCHIVED');
  });

  it('refuses while stores still list it (409)', async () => {
    const item = fakeItem();
    CatalogProduct.findById.mockResolvedValue(item);
    Product.countDocuments.mockResolvedValue(3);
    const res = await request(app).delete(`/api/v1/admin/catalog/${item._id}`).set(...asUser(superAdmin()));
    expect(res.status).toBe(409);
    expect(item.save).not.toHaveBeenCalled();
  });
});
