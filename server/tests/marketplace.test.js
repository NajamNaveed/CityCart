const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/user.model');
jest.mock('../src/models/employee.model');
jest.mock('../src/models/brand.model');
jest.mock('../src/models/store.model');
jest.mock('../src/models/category.model');
jest.mock('../src/models/inventory.model');
// Factory mock: product.validator.js needs the real STATUSES array.
jest.mock('../src/models/product.model', () => {
  const actual = jest.requireActual('../src/models/product.model');
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    countDocuments: jest.fn(),
    distinct: jest.fn(),
    STATUSES: actual.STATUSES,
  };
});

const Brand = require('../src/models/brand.model');
const Store = require('../src/models/store.model');
const Category = require('../src/models/category.model');
const Product = require('../src/models/product.model');
const Inventory = require('../src/models/inventory.model');
const app = require('../src/app');
const { buildCategoryTree } = require('../src/services/category.service');
const { getPublicAvailability } = require('../src/services/inventory.service');
const { FEATURED_LIMIT, SHELF_LIMIT } = require('../src/services/storefront.service');

const oid = () => new mongoose.Types.ObjectId();
const inv = (productId, o = {}) => ({
  productId,
  availableQuantity: 10,
  lowStockThreshold: 0,
  trackInventory: true,
  ...o,
});

beforeEach(() => jest.resetAllMocks());

describe('getPublicAvailability', () => {
  it.each([
    ['no record', null, 'OUT_OF_STOCK'],
    ['zero available', inv(1, { availableQuantity: 0 }), 'OUT_OF_STOCK'],
    ['at/below threshold', inv(1, { availableQuantity: 3, lowStockThreshold: 3 }), 'LOW_STOCK'],
    ['plenty', inv(1, { availableQuantity: 4, lowStockThreshold: 3 }), 'IN_STOCK'],
    ['untracked', inv(1, { availableQuantity: 0, trackInventory: false }), 'IN_STOCK'],
  ])('%s -> %s', (_name, record, expected) => {
    expect(getPublicAvailability(record)).toBe(expected);
  });
});

describe('buildCategoryTree', () => {
  it('nests children under parents', () => {
    const a = { _id: 'a', name: 'A' };
    const b = { _id: 'b', name: 'B', parentId: 'a' };
    const c = { _id: 'c', name: 'C', parentId: 'b' };
    const tree = buildCategoryTree([a, b, c]);
    expect(tree).toHaveLength(1);
    expect(tree[0].children[0].children[0].name).toBe('C');
  });

  it('drops children whose parent is missing (e.g. inactive)', () => {
    expect(buildCategoryTree([{ _id: 'b', parentId: 'gone' }])).toEqual([]);
  });

  it('survives a parentId cycle without looping', () => {
    const tree = buildCategoryTree([
      { _id: 'a', parentId: 'b' },
      { _id: 'b', parentId: 'a' },
    ]);
    expect(tree).toEqual([]);
  });
});

describe('GET /api/v1/categories/tree', () => {
  it('returns the nested global tree (not shadowed by /:id)', async () => {
    const parent = { _id: oid(), name: 'Shoes' };
    const child = { _id: oid(), name: 'Sneakers', parentId: parent._id };
    Category.find.mockReturnValue({ sort: jest.fn().mockResolvedValue([parent, child]) });

    const res = await request(app).get('/api/v1/categories/tree');

    expect(res.status).toBe(200);
    expect(res.body.categories).toHaveLength(1);
    expect(res.body.categories[0].children[0].name).toBe('Sneakers');
    expect(Category.find).toHaveBeenCalledWith({ isActive: true });
  });
});

describe('GET /api/v1/brands/:id/storefront', () => {
  function mockStorefront(brandId, { products = [{ _id: oid(), name: 'Air', categoryId: oid() }], categories = [] } = {}) {
    Brand.findOne.mockResolvedValue({ _id: brandId, name: 'Nike' });
    Store.findOne.mockResolvedValue({ name: 'Nike Store' });
    Product.distinct.mockResolvedValue([...new Set(products.map((p) => String(p.categoryId)))]);
    Category.find.mockReturnValue({ sort: jest.fn().mockResolvedValue(categories) });
    const sort = jest.fn().mockResolvedValue(products);
    const select = jest.fn().mockReturnValue({ sort });
    Product.find.mockReturnValue({ select });
    Inventory.find.mockResolvedValue(products.map((p) => inv(p._id)));
    return { select, sort };
  }

  const category = (o = {}) => ({ _id: oid(), name: 'Shoes', order: 0, ...o });
  const product = (categoryId, o = {}) => ({ _id: oid(), name: 'Item', categoryId, ...o });

  it('returns brand, store, category tree, featured products and shelves with availability', async () => {
    const brandId = oid();
    const shoes = category({ name: 'Shoes' });
    const air = product(shoes._id, { name: 'Air' });
    const { select, sort } = mockStorefront(brandId, { products: [air], categories: [shoes] });

    const res = await request(app).get(`/api/v1/brands/${brandId}/storefront`);

    expect(res.status).toBe(200);
    expect(res.body.brand.name).toBe('Nike');
    expect(res.body.store.name).toBe('Nike Store');
    expect(res.body.categories[0].name).toBe('Shoes');
    expect(res.body.featuredProducts[0].availability).toBe('IN_STOCK');
    expect(res.body.shelves).toEqual([
      expect.objectContaining({ name: 'Shoes', count: 1 }),
    ]);
    expect(res.body.shelves[0].products[0]).toMatchObject({ name: 'Air', availability: 'IN_STOCK' });
    // Only public card fields are selected, newest first, no DB-side featured cap.
    expect(select).toHaveBeenCalledWith('name slug categoryId images price compareAtPrice');
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
  });

  it('keeps featured at FEATURED_LIMIT but shelves count every product', async () => {
    const brandId = oid();
    const shoes = category();
    const products = Array.from({ length: FEATURED_LIMIT + 4 }, () => product(shoes._id));
    mockStorefront(brandId, { products, categories: [shoes] });

    const res = await request(app).get(`/api/v1/brands/${brandId}/storefront`);

    expect(res.body.featuredProducts).toHaveLength(FEATURED_LIMIT);
    expect(res.body.shelves[0].count).toBe(FEATURED_LIMIT + 4);
  });

  it('groups by category, orders shelves by category order and caps each row at SHELF_LIMIT', async () => {
    const brandId = oid();
    const dairy = category({ name: 'Milk', order: 2 });
    const bakery = category({ name: 'Bakery', order: 1 });
    const products = [
      ...Array.from({ length: 3 }, () => product(dairy._id)),
      ...Array.from({ length: SHELF_LIMIT + 5 }, () => product(bakery._id)),
    ];
    mockStorefront(brandId, { products, categories: [bakery, dairy] });

    const res = await request(app).get(`/api/v1/brands/${brandId}/storefront`);

    expect(res.body.shelves.map((s) => s.name)).toEqual(['Bakery', 'Milk']);
    expect(res.body.shelves[0]).toMatchObject({ count: SHELF_LIMIT + 5 });
    expect(res.body.shelves[0].products).toHaveLength(SHELF_LIMIT);
    expect(res.body.shelves[1].products).toHaveLength(3);
  });

  it('collects products with no active category into one final shelf', async () => {
    const brandId = oid();
    const shoes = category();
    const active = product(shoes._id);
    const orphans = [product(oid()), product(oid())];
    mockStorefront(brandId, { products: [active, ...orphans], categories: [shoes] });

    const res = await request(app).get(`/api/v1/brands/${brandId}/storefront`);

    expect(res.body.shelves.map((s) => s.name)).toEqual(['Shoes', 'More from this store']);
    expect(res.body.shelves[1]).toMatchObject({ categoryId: null, count: 2 });
  });

  it('never exposes private brand fields on the storefront', async () => {
    const brandId = oid();
    Brand.findOne.mockResolvedValue({
      _id: brandId,
      name: 'Nike',
      slug: 'nike',
      billingStatus: 'FROZEN',
      terminationReason: 'policy',
      settings: { deliveryFee: 1 },
    });
    Store.findOne.mockResolvedValue(null);
    Product.distinct.mockResolvedValue([]);
    Category.find.mockReturnValue({ sort: jest.fn().mockResolvedValue([]) });
    Product.find.mockReturnValue({ select: () => ({ sort: jest.fn().mockResolvedValue([]) }) });

    const res = await request(app).get(`/api/v1/brands/${brandId}/storefront`);

    expect(res.body.brand).toEqual({ _id: String(brandId), name: 'Nike', slug: 'nike' });
    expect(res.body.shelves).toEqual([]);
  });

  it('only ever queries this brand and ACTIVE data', async () => {
    const brandId = oid();
    mockStorefront(brandId);

    await request(app).get(`/api/v1/brands/${brandId}/storefront`);

    expect(Brand.findOne).toHaveBeenCalledWith({ _id: brandId.toString(), status: 'ACTIVE' });
    expect(Product.find).toHaveBeenCalledWith({
      brandId: brandId.toString(),
      status: 'ACTIVE',
      isActive: true,
    });
    // Only the categories this brand actually sells in (plus parents), never the whole tree.
    expect(Product.distinct).toHaveBeenCalledWith('categoryId', {
      brandId: brandId.toString(),
      status: 'ACTIVE',
      isActive: true,
    });
  });

  it('404 for a non-ACTIVE brand and 400 for an invalid id', async () => {
    Brand.findOne.mockResolvedValue(null);
    expect((await request(app).get(`/api/v1/brands/${oid()}/storefront`)).status).toBe(404);
    expect((await request(app).get('/api/v1/brands/nope/storefront')).status).toBe(400);
  });
});
