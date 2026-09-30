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
const { FEATURED_LIMIT } = require('../src/services/storefront.service');

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

  it('never exposes exact quantities on public products', async () => {
    const id = oid();
    const brandId = oid();
    Brand.find.mockResolvedValue([{ _id: brandId }]);
    Product.find.mockReturnValue({
      sort: () => ({ skip: () => ({ limit: () => Promise.resolve([{ _id: id, brandId }]) }) }),
    });
    Product.countDocuments.mockResolvedValue(1);
    Inventory.find.mockResolvedValue([inv(id, { availableQuantity: 2, lowStockThreshold: 5 })]);

    const res = await request(app).get('/api/v1/products');

    expect(res.body.products[0].availability).toBe('LOW_STOCK');
    expect(JSON.stringify(res.body)).not.toMatch(/availableQuantity|reservedQuantity/);
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
  it('returns the nested tree for an ACTIVE brand (not shadowed by /:id)', async () => {
    const brandId = oid();
    const parent = { _id: oid(), name: 'Shoes' };
    const child = { _id: oid(), name: 'Sneakers', parentId: parent._id };
    Brand.findOne.mockResolvedValue({ _id: brandId });
    Category.find.mockReturnValue({ sort: jest.fn().mockResolvedValue([parent, child]) });

    const res = await request(app).get(`/api/v1/categories/tree?brandId=${brandId}`);

    expect(res.status).toBe(200);
    expect(res.body.categories).toHaveLength(1);
    expect(res.body.categories[0].children[0].name).toBe('Sneakers');
    expect(Category.find).toHaveBeenCalledWith({ brandId: brandId.toString(), isActive: true });
  });

  it('400 without a valid brandId', async () => {
    expect((await request(app).get('/api/v1/categories/tree')).status).toBe(400);
    expect((await request(app).get('/api/v1/categories/tree?brandId=x')).status).toBe(400);
  });

  it('404 for a non-ACTIVE or unknown brand', async () => {
    Brand.findOne.mockResolvedValue(null);
    const res = await request(app).get(`/api/v1/categories/tree?brandId=${oid()}`);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/brands/:id/storefront', () => {
  function mockStorefront(brandId) {
    const productId = oid();
    Brand.findOne.mockResolvedValue({ _id: brandId, name: 'Nike' });
    Store.findOne.mockResolvedValue({ name: 'Nike Store' });
    Category.find.mockReturnValue({ sort: jest.fn().mockResolvedValue([{ _id: oid(), name: 'Shoes' }]) });
    const limit = jest.fn().mockResolvedValue([{ _id: productId, name: 'Air' }]);
    Product.find.mockReturnValue({ sort: () => ({ limit }) });
    Inventory.find.mockResolvedValue([inv(productId)]);
    return limit;
  }

  it('returns brand, store, category tree and featured products with availability', async () => {
    const brandId = oid();
    const limit = mockStorefront(brandId);

    const res = await request(app).get(`/api/v1/brands/${brandId}/storefront`);

    expect(res.status).toBe(200);
    expect(res.body.brand.name).toBe('Nike');
    expect(res.body.store.name).toBe('Nike Store');
    expect(res.body.categories[0].name).toBe('Shoes');
    expect(res.body.featuredProducts[0].availability).toBe('IN_STOCK');
    expect(limit).toHaveBeenCalledWith(FEATURED_LIMIT);
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
    expect(Category.find).toHaveBeenCalledWith({ brandId: brandId.toString(), isActive: true });
  });

  it('404 for a non-ACTIVE brand and 400 for an invalid id', async () => {
    Brand.findOne.mockResolvedValue(null);
    expect((await request(app).get(`/api/v1/brands/${oid()}/storefront`)).status).toBe(404);
    expect((await request(app).get('/api/v1/brands/nope/storefront')).status).toBe(400);
  });
});
