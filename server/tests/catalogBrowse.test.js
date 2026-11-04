const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/block.model');
jest.mock('../src/models/branch.model');
jest.mock('../src/models/brand.model');
jest.mock('../src/models/category.model');
jest.mock('../src/models/product.model', () => {
  const actual = jest.requireActual('../src/models/product.model');
  return { find: jest.fn(), findOne: jest.fn(), findById: jest.fn(), STATUSES: actual.STATUSES };
});
jest.mock('../src/models/catalogProduct.model', () => {
  const actual = jest.requireActual('../src/models/catalogProduct.model');
  return { find: jest.fn(), findOne: jest.fn(), findById: jest.fn(), STATUSES: actual.STATUSES, SCOPES: actual.SCOPES };
});
// Stock lookup is its own module; browsing only needs the availability label.
jest.mock('../src/services/product.service', () => ({
  ...jest.requireActual('../src/services/product.service'),
  withAvailability: jest.fn(async (products) => products.map((p) => ({ ...p, availability: p.stock || 'IN_STOCK' }))),
}));

const Block = require('../src/models/block.model');
const Branch = require('../src/models/branch.model');
const Brand = require('../src/models/brand.model');
const Category = require('../src/models/category.model');
const Product = require('../src/models/product.model');
const CatalogProduct = require('../src/models/catalogProduct.model');
const app = require('../src/app');

const oid = () => new mongoose.Types.ObjectId();
const cityId = oid();
const dGround = { _id: oid(), cityId, name: 'D Ground' };
const peoples = { _id: oid(), cityId, name: 'Peoples Colony' };

const brand = (name, over = {}) => ({ _id: oid(), name, slug: name.toLowerCase().replace(/\W+/g, '-'), logo: `${name}.png`, cityId, status: 'ACTIVE', ...over });
const branch = (b, lat, lng, over = {}) => ({ _id: oid(), brandId: b._id, blockIds: [dGround._id], location: { type: 'Point', coordinates: [lng, lat] }, ...over });
const item = (name, over = {}) => ({
  _id: oid(),
  name,
  slug: name.toLowerCase().replace(/\W+/g, '-'),
  manufacturer: 'Dalda',
  size: { value: 1, unit: 'kg' },
  images: [`${name}.jpg`],
  categoryId: oid(),
  ...over,
});
const listing = (b, catalog, price, over = {}) => ({
  _id: oid(),
  brandId: b._id,
  catalogProductId: catalog._id,
  name: catalog.name,
  price,
  ...over,
});

// A query result that can be awaited directly or ended with .limit(), like a Mongoose query.
const q = (value) => Object.assign(Promise.resolve(value), { limit: () => Promise.resolve(value) });

const ids = (...blocks) => blocks.map((b) => b._id).join(',');

/** One area: shops, their stores, the catalogue items and the listings in it. */
function givenArea({ blocks = [dGround], branches, brands, listings, catalog }) {
  Block.find.mockResolvedValue(blocks);
  Branch.find.mockResolvedValue(branches);
  Brand.find.mockResolvedValue(brands);
  Product.find.mockReturnValue(q(listings));
  CatalogProduct.find.mockImplementation(() => q(catalog));
}

beforeEach(() => {
  jest.resetAllMocks();
  const { withAvailability } = require('../src/services/product.service');
  withAvailability.mockImplementation(async (products) => products.map((p) => ({ ...p, availability: p.stock || 'IN_STOCK' })));
  Category.find.mockResolvedValue([]);
});

describe('GET /api/v1/catalog/browse (public)', () => {
  const nearMart = brand('Near Mart');
  const cheapMart = brand('Cheap Mart');
  const ghee = item('Dalda Ghee 1 kg');
  const oil = item('Cooking Oil 3 l', { manufacturer: 'Eva' });

  function ghee3() {
    givenArea({
      branches: [branch(nearMart, 31.405, 73.095), branch(cheapMart, 31.41, 73.1)],
      brands: [nearMart, cheapMart],
      listings: [listing(nearMart, ghee, 1250), listing(cheapMart, ghee, 1180), listing(nearMart, oil, 2100)],
      catalog: [ghee, oil],
    });
  }

  it('shows one card per real product, with every store that sells it as an offer, cheapest first', async () => {
    ghee3();

    const res = await request(app).get(`/api/v1/catalog/browse?blockIds=${ids(dGround)}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    const card = res.body.items.find((i) => i.name === 'Dalda Ghee 1 kg');
    expect(card).toMatchObject({ offerCount: 2, minPrice: 1180, maxPrice: 1250, manufacturer: 'Dalda', size: { value: 1, unit: 'kg' }, inStock: true });
    expect(card.offers.map((o) => [o.brandName, o.price])).toEqual([['Cheap Mart', 1180], ['Near Mart', 1250]]);
    expect(card.offers[0]).toMatchObject({ brandSlug: 'cheap-mart', availability: 'IN_STOCK', branchCount: 1, nearestKm: null });
    expect(res.body.meta.blocks).toEqual([{ _id: dGround._id.toString(), name: 'D Ground' }]);
  });

  it('is sorted by name unless asked otherwise, and can be sorted by price', async () => {
    ghee3();
    const byName = await request(app).get(`/api/v1/catalog/browse?blockIds=${ids(dGround)}`);
    expect(byName.body.items.map((i) => i.name)).toEqual(['Cooking Oil 3 l', 'Dalda Ghee 1 kg']);
    ghee3();
    const byPrice = await request(app).get(`/api/v1/catalog/browse?blockIds=${ids(dGround)}&sort=price`);
    expect(byPrice.body.items.map((i) => i.name)).toEqual(['Dalda Ghee 1 kg', 'Cooking Oil 3 l']);
  });

  it("asks only for active shops in the chosen blocks, of live stores, and active listings", async () => {
    givenArea({
      blocks: [dGround, peoples],
      branches: [branch(nearMart, 31.405, 73.095)],
      brands: [nearMart],
      listings: [listing(nearMart, ghee, 1250)],
      catalog: [ghee],
    });
    await request(app).get(`/api/v1/catalog/browse?blockIds=${ids(dGround, peoples)}`);

    expect(Block.find).toHaveBeenCalledWith({ _id: { $in: [dGround._id.toString(), peoples._id.toString()] }, isActive: true });
    expect(Branch.find.mock.calls[0][0]).toEqual({ isActive: true, blockIds: { $in: [dGround._id, peoples._id] } });
    expect(Brand.find.mock.calls[0][0]).toMatchObject({ cityId, status: 'ACTIVE' });
    expect(Product.find.mock.calls[0][0]).toMatchObject({ status: 'ACTIVE', isActive: true, catalogProductId: { $exists: true } });
  });

  it('leaves out stores that are not live', async () => {
    const closed = brand('Closed Mart', { status: 'SUSPENDED' });
    givenArea({
      branches: [branch(nearMart, 31.405, 73.095), branch(closed, 31.406, 73.096)],
      brands: [nearMart], // the database only returns live brands
      listings: [listing(nearMart, ghee, 1250), listing(closed, ghee, 900)],
      catalog: [ghee],
    });
    const res = await request(app).get(`/api/v1/catalog/browse?blockIds=${ids(dGround)}`);
    expect(res.body.items[0].offers.map((o) => o.brandName)).toEqual(['Near Mart']);
  });

  it('counts a listing only where it is carried: a listing with branchIds is sold at those shops only', async () => {
    const carried = branch(nearMart, 31.405, 73.095);
    const other = branch(nearMart, 31.41, 73.1);
    const elsewhere = oid(); // a shop of this store outside the area
    givenArea({
      branches: [carried, other],
      brands: [nearMart],
      listings: [
        listing(nearMart, ghee, 1250, { branchIds: [carried._id] }), // carried by one shop here
        listing(nearMart, oil, 2100, { branchIds: [elsewhere] }), // only carried outside the area
      ],
      catalog: [ghee, oil],
    });
    const res = await request(app).get(`/api/v1/catalog/browse?blockIds=${ids(dGround)}`);
    expect(res.body.items.map((i) => i.name)).toEqual(['Dalda Ghee 1 kg']);
    expect(res.body.items[0].offers[0].branchCount).toBe(1);
  });

  it('measures distances when the shopper sends a position, and can sort by nearest', async () => {
    ghee3();
    const res = await request(app).get(`/api/v1/catalog/browse?blockIds=${ids(dGround)}&lat=31.405&lng=73.095&sort=nearest`);
    expect(res.status).toBe(200);
    const card = res.body.items.find((i) => i.name === 'Dalda Ghee 1 kg');
    expect(card.offers.find((o) => o.brandName === 'Near Mart').nearestKm).toBe(0);
    expect(card.offers.find((o) => o.brandName === 'Cheap Mart').nearestKm).toBeGreaterThan(0.5);
    expect(card.nearestKm).toBe(0);
    expect(res.body.meta.origin).toEqual({ lat: 31.405, lng: 73.095 });
  });

  it('limits shops to a range around the shopper', async () => {
    ghee3();
    const res = await request(app).get(`/api/v1/catalog/browse?blockIds=${ids(dGround)}&lat=31.405&lng=73.095&radiusKm=2`);
    expect(res.status).toBe(200);
    const filter = Branch.find.mock.calls[0][0];
    expect(filter.location.$geoWithin.$centerSphere[0]).toEqual([73.095, 31.405]);
    expect(filter.location.$geoWithin.$centerSphere[1]).toBeCloseTo(2 / 6378.1, 6);
    expect(res.body.meta.radiusKm).toBe(2);
  });

  it('searches the catalogue by name, maker and barcode, with the text escaped', async () => {
    ghee3();
    CatalogProduct.find.mockReturnValue(q([ghee]));
    Product.find.mockReturnValue(q([listing(nearMart, ghee, 1250)]));
    const res = await request(app).get(`/api/v1/catalog/browse?blockIds=${ids(dGround)}&q=${encodeURIComponent('dalda (1kg)')}`);

    const search = CatalogProduct.find.mock.calls[0][0];
    expect(search.status).toBe('ACTIVE');
    expect(search.$or[0].name.$regex).toBe('dalda \\(1kg\\)');
    expect(search.$or[2]).toEqual({ barcode: 'dalda (1kg)' });
    expect(Product.find.mock.calls[0][0].catalogProductId).toEqual({ $in: [ghee._id] });
    expect(res.body.items).toHaveLength(1);
  });

  it('returns nothing without touching listings when the search matches no catalogue product', async () => {
    ghee3();
    CatalogProduct.find.mockReturnValue(q([]));
    const res = await request(app).get(`/api/v1/catalog/browse?blockIds=${ids(dGround)}&q=zzz`);
    expect(res.body.items).toEqual([]);
    expect(Product.find).not.toHaveBeenCalled();
  });

  it('includes the subcategories when browsing a top-level category', async () => {
    ghee3();
    const top = oid();
    const child = oid();
    Category.find.mockResolvedValue([{ _id: child }]);
    await request(app).get(`/api/v1/catalog/browse?blockIds=${ids(dGround)}&categoryId=${top}`);
    expect(Category.find).toHaveBeenCalledWith({ parentId: top.toString(), isActive: true });
    expect(Product.find.mock.calls[0][0].categoryId).toEqual({ $in: [top.toString(), child] });
  });

  it('marks a product out of stock when every offer is', async () => {
    givenArea({
      branches: [branch(nearMart, 31.405, 73.095)],
      brands: [nearMart],
      listings: [listing(nearMart, ghee, 1250, { stock: 'OUT_OF_STOCK' })],
      catalog: [ghee],
    });
    const res = await request(app).get(`/api/v1/catalog/browse?blockIds=${ids(dGround)}`);
    expect(res.body.items[0]).toMatchObject({ inStock: false });
    expect(res.body.items[0].offers[0].availability).toBe('OUT_OF_STOCK');
  });

  it('paginates the cards', async () => {
    const items = Array.from({ length: 5 }, (_, i) => item(`Item ${i}`));
    givenArea({
      branches: [branch(nearMart, 31.405, 73.095)],
      brands: [nearMart],
      listings: items.map((it, i) => listing(nearMart, it, 100 + i)),
      catalog: items,
    });
    const res = await request(app).get(`/api/v1/catalog/browse?blockIds=${ids(dGround)}&limit=2&page=2`);
    expect(res.body.items.map((i) => i.name)).toEqual(['Item 2', 'Item 3']);
    expect(res.body.pagination).toEqual({ page: 2, limit: 2, total: 5, pages: 3 });
  });

  it('is empty, not an error, when no live store has a shop in the area', async () => {
    givenArea({ branches: [], brands: [], listings: [], catalog: [] });
    const res = await request(app).get(`/api/v1/catalog/browse?blockIds=${ids(dGround)}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(Product.find).not.toHaveBeenCalled();
  });

  it('404 for blocks that do not exist or are switched off, 400 for blocks of two cities', async () => {
    Block.find.mockResolvedValue([]);
    expect((await request(app).get(`/api/v1/catalog/browse?blockIds=${oid()}`)).status).toBe(404);
    Block.find.mockResolvedValue([dGround, { _id: oid(), cityId: oid(), name: 'Elsewhere' }]);
    const res = await request(app).get(`/api/v1/catalog/browse?blockIds=${oid()},${oid()}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/one city/);
  });

  it('validates the query (400)', async () => {
    const get = (qs) => request(app).get(`/api/v1/catalog/browse${qs}`);
    expect((await get('')).status).toBe(400); // blockIds is required
    expect((await get('?blockIds=nope')).status).toBe(400);
    expect((await get(`?blockIds=${dGround._id}&radiusKm=2`)).status).toBe(400); // range needs a position
    expect((await get(`?blockIds=${dGround._id}&sort=nearest`)).status).toBe(400);
    expect((await get(`?blockIds=${dGround._id}&lat=31.4`)).status).toBe(400); // half a position
    expect((await get(`?blockIds=${dGround._id}&sort=cheapest`)).status).toBe(400);
    expect((await get(`?blockIds=${dGround._id}&limit=500`)).status).toBe(400);
    expect(Block.find).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/catalog/browse/:id (all offers of one product)', () => {
  const near = brand('Near Mart');
  const cheap = brand('Cheap Mart');
  const ghee = item('Dalda Ghee 1 kg');

  it('lists every offer in the area for one catalogue product, cheapest first', async () => {
    givenArea({
      branches: [branch(near, 31.405, 73.095), branch(cheap, 31.41, 73.1)],
      brands: [near, cheap],
      listings: [listing(near, ghee, 1250), listing(cheap, ghee, 1180)],
      catalog: [ghee],
    });

    const res = await request(app).get(`/api/v1/catalog/browse/${ghee._id}?blockIds=${ids(dGround)}`);

    expect(res.status).toBe(200);
    expect(res.body.item).toMatchObject({ name: 'Dalda Ghee 1 kg', offerCount: 2, minPrice: 1180 });
    expect(res.body.item.offers.map((o) => o.brandName)).toEqual(['Cheap Mart', 'Near Mart']);
    expect(Product.find.mock.calls[0][0]).toMatchObject({ catalogProductId: ghee._id.toString(), status: 'ACTIVE', isActive: true });
  });

  it('404 when nobody sells it in the area', async () => {
    givenArea({ branches: [branch(near, 31.405, 73.095)], brands: [near], listings: [], catalog: [] });
    const res = await request(app).get(`/api/v1/catalog/browse/${ghee._id}?blockIds=${ids(dGround)}`);
    expect(res.status).toBe(404);
  });

  it('400 for a bad id or area', async () => {
    expect((await request(app).get(`/api/v1/catalog/browse/nope?blockIds=${ids(dGround)}`)).status).toBe(400);
    expect((await request(app).get(`/api/v1/catalog/browse/${ghee._id}`)).status).toBe(400);
  });
});
