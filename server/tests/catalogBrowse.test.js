const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/block.model');
jest.mock('../src/models/branch.model');
jest.mock('../src/models/brand.model');
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
const Product = require('../src/models/product.model');
const CatalogProduct = require('../src/models/catalogProduct.model');
const app = require('../src/app');

const oid = () => new mongoose.Types.ObjectId();
const cityId = oid();
const dGround = { _id: oid(), cityId, name: 'D Ground' };

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
});

describe('GET /api/v1/catalog/browse (public list removed)', () => {
  it('no longer browses the catalogue as a list', async () => {
    // Without the public route this falls through to the private '/:id' route,
    // which refuses an anonymous request. Nothing is listed.
    const res = await request(app).get('/api/v1/catalog/browse');
    expect(res.status).toBe(401);
    expect(res.body).not.toHaveProperty('items');
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
