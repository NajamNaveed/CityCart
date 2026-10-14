const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/user.model');
jest.mock('../src/models/brand.model');
jest.mock('../src/models/block.model');
jest.mock('../src/models/branch.model');
// Factory mock: product.validator.js (loaded via app) needs Product.STATUSES.
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
// Stock lookup is its own module; discover only needs the availability label.
jest.mock('../src/services/product.service', () => ({
  ...jest.requireActual('../src/services/product.service'),
  withAvailability: jest.fn(async (products) =>
    products.map((p) => ({ ...p, availability: 'IN_STOCK' }))
  ),
}));

const { withAvailability } = require('../src/services/product.service');
const Brand = require('../src/models/brand.model');
const Block = require('../src/models/block.model');
const Branch = require('../src/models/branch.model');
const Product = require('../src/models/product.model');
const app = require('../src/app');
const { MONGO_EARTH_RADIUS_KM } = require('../src/utils/geo');

const oid = () => new mongoose.Types.ObjectId();
const cityId = oid().toString();

// Point at (lat, lng) — GeoJSON is [lng, lat].
const point = (lat, lng) => ({ type: 'Point', coordinates: [lng, lat] });

function makeBrand(name) {
  return { _id: oid(), name, slug: name.toLowerCase().replace(/\s+/g, '-'), logo: undefined };
}

function makeBranch(brand, block, lat, lng, name = 'Shop') {
  return {
    _id: oid(),
    brandId: brand._id,
    blockId: block._id,
    name,
    address: 'Somewhere',
    phone: '',
    isActive: true,
    location: point(lat, lng),
  };
}

function makeBlock(name, lat, lng) {
  return { _id: oid(), cityId, name, isActive: true, center: point(lat, lng) };
}

function makeProduct(brand, name) {
  return { _id: oid(), brandId: brand._id, name, price: 100, images: ['a.jpg'] };
}

// Product.find is used twice: a bare .limit() for search hits, and
// .sort().limit() for the per-brand product fetch.
function mockProducts({ hits = [], fetched = [] } = {}) {
  Product.find.mockImplementation((filter) => {
    if (filter.name) {
      return { limit: jest.fn().mockResolvedValue(hits) };
    }
    return { sort: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue(fetched) }) };
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  // resetAllMocks also clears the factory's implementation, so set it again.
  withAvailability.mockImplementation(async (products) =>
    products.map((p) => ({ ...p, availability: 'IN_STOCK' }))
  );
});

describe('GET /api/v1/discover — validation', () => {
  const bad = async (qs) => (await request(app).get(`/api/v1/discover?${qs}`)).status;

  it('requires the fields each scope needs', async () => {
    expect(await bad('scope=block')).toBe(400); // no blockId
    expect(await bad('scope=radius&lat=31&lng=73')).toBe(400); // no radiusKm
    expect(await bad('scope=radius&radiusKm=5')).toBe(400); // nothing to measure from
    expect(await bad('scope=city')).toBe(400); // no cityId
    expect(await bad('')).toBe(400); // defaults to scope=city, still needs cityId
  });

  it('rejects bad coordinates, radius and ids', async () => {
    expect(await bad(`scope=city&cityId=${cityId}&lat=31`)).toBe(400); // lat without lng
    expect(await bad(`scope=radius&radiusKm=500&lat=31&lng=73`)).toBe(400); // radius too large
    expect(await bad(`scope=radius&radiusKm=0.1&lat=31&lng=73`)).toBe(400); // radius too small
    expect(await bad(`scope=radius&radiusKm=5&lat=95&lng=73`)).toBe(400);
    expect(await bad('scope=city&cityId=nope')).toBe(400);
    expect(await bad(`scope=city&cityId=${cityId}&limit=500`)).toBe(400);
    expect(Brand.find).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/discover — city scope', () => {
  it('groups branches by brand, nearest brand first, with products', async () => {
    const near = makeBrand('Near Co');
    const far = makeBrand('Far Co');
    const block = makeBlock('Gulberg', 31.4, 73.1);
    Brand.find.mockResolvedValue([far, near]);
    Branch.find.mockResolvedValue([
      makeBranch(far, block, 31.5, 73.2),
      makeBranch(near, block, 31.401, 73.101),
    ]);
    Block.find.mockResolvedValue([block]);
    mockProducts({ fetched: [makeProduct(near, 'Kurta'), makeProduct(far, 'Shawl')] });

    const res = await request(app).get(`/api/v1/discover?scope=city&cityId=${cityId}&lat=31.4&lng=73.1`);

    expect(res.status).toBe(200);
    expect(res.body.items.map((b) => b.name)).toEqual(['Near Co', 'Far Co']);
    expect(res.body.items[0].nearestKm).toBeLessThan(res.body.items[1].nearestKm);
    expect(res.body.items[0].branches[0].blockName).toBe('Gulberg');
    expect(res.body.items[0].products[0]).toMatchObject({ name: 'Kurta', availability: 'IN_STOCK' });
    expect(res.body.meta).toMatchObject({ scope: 'city', totalBranches: 2 });
    expect(res.body.pagination.total).toBe(2);
  });

  it('only considers ACTIVE brands and active branches', async () => {
    Brand.find.mockResolvedValue([]);

    const res = await request(app).get(`/api/v1/discover?scope=city&cityId=${cityId}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(Brand.find.mock.calls[0][0]).toEqual({ status: 'ACTIVE', cityId });
    expect(Branch.find).not.toHaveBeenCalled();
  });

  it('works without a position: no distances, alphabetical order', async () => {
    const b = makeBrand('Beta');
    const a = makeBrand('Alpha');
    const block = makeBlock('Gulberg', 31.4, 73.1);
    Brand.find.mockResolvedValue([b, a]);
    Branch.find.mockResolvedValue([makeBranch(b, block, 31.4, 73.1), makeBranch(a, block, 31.4, 73.1)]);
    Block.find.mockResolvedValue([block]);
    mockProducts();

    const res = await request(app).get(`/api/v1/discover?scope=city&cityId=${cityId}`);

    expect(res.body.items.map((x) => x.name)).toEqual(['Alpha', 'Beta']);
    expect(res.body.items[0].nearestKm).toBeNull();
    expect(res.body.meta.origin).toBeNull();
  });
});

describe('GET /api/v1/discover — block scope', () => {
  it('filters branches to the block and measures from the block centre by default', async () => {
    const brand = makeBrand('Local Co');
    const block = makeBlock('Gulberg', 31.4, 73.1);
    Block.findOne.mockResolvedValue(block);
    Brand.find.mockResolvedValue([brand]);
    Branch.find.mockResolvedValue([makeBranch(brand, block, 31.4, 73.1)]);
    Block.find.mockResolvedValue([block]);
    mockProducts();

    const res = await request(app).get(`/api/v1/discover?scope=block&blockId=${block._id}`);

    expect(res.status).toBe(200);
    expect(Branch.find.mock.calls[0][0]).toMatchObject({ isActive: true, blockId: block._id.toString() });
    expect(res.body.meta.block).toMatchObject({ name: 'Gulberg' });
    expect(res.body.meta.origin).toEqual({ lat: 31.4, lng: 73.1 });
    expect(res.body.items[0].nearestKm).toBe(0);
    // The block's city narrows the brand list.
    expect(Brand.find.mock.calls[0][0].cityId).toBe(String(block.cityId));
  });

  it('returns 404 for an unknown or inactive block', async () => {
    Block.findOne.mockResolvedValue(null);
    const res = await request(app).get(`/api/v1/discover?scope=block&blockId=${oid()}`);
    expect(res.status).toBe(404);
    expect(Branch.find).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/discover — radius scope', () => {
  it('queries branches within the radius using $centerSphere ([lng, lat], radians)', async () => {
    const brand = makeBrand('Ring Co');
    const block = makeBlock('Gulberg', 31.4, 73.1);
    Brand.find.mockResolvedValue([brand]);
    Branch.find.mockResolvedValue([makeBranch(brand, block, 31.42, 73.12)]);
    Block.find.mockResolvedValue([block]);
    mockProducts();

    const res = await request(app).get(
      `/api/v1/discover?scope=radius&radiusKm=5&lat=31.4&lng=73.1&cityId=${cityId}`
    );

    expect(res.status).toBe(200);
    const filter = Branch.find.mock.calls[0][0];
    expect(filter.location.$geoWithin.$centerSphere).toEqual([[73.1, 31.4], 5 / MONGO_EARTH_RADIUS_KM]);
    expect(res.body.meta).toMatchObject({ scope: 'radius', radiusKm: 5 });
    expect(res.body.items[0].nearestKm).toBeGreaterThan(0);
  });

  it('can measure from a block when no coordinates are given', async () => {
    const block = makeBlock('Gulberg', 31.4, 73.1);
    Block.findOne.mockResolvedValue(block);
    Brand.find.mockResolvedValue([makeBrand('X')]);
    Branch.find.mockResolvedValue([]);

    const res = await request(app).get(`/api/v1/discover?scope=radius&radiusKm=10&blockId=${block._id}`);

    expect(res.status).toBe(200);
    expect(Branch.find.mock.calls[0][0].location.$geoWithin.$centerSphere[0]).toEqual([73.1, 31.4]);
    expect(res.body.items).toEqual([]);
  });
});

describe('GET /api/v1/discover — search text', () => {
  it('matches a brand by name OR by one of its products, escaping the text', async () => {
    const byName = makeBrand('Khaadi Store');
    const byProduct = makeBrand('Other Co');
    const unrelated = makeBrand('Nope Ltd');
    const block = makeBlock('Gulberg', 31.4, 73.1);
    Brand.find.mockResolvedValue([byName, byProduct, unrelated]);
    mockProducts({
      hits: [{ brandId: byProduct._id }],
      fetched: [makeProduct(byProduct, 'Khaadi-style Kurta'), makeProduct(byName, 'Lawn')],
    });
    Branch.find.mockResolvedValue([makeBranch(byName, block, 31.4, 73.1), makeBranch(byProduct, block, 31.4, 73.1)]);
    Block.find.mockResolvedValue([block]);

    const res = await request(app).get(`/api/v1/discover?scope=city&cityId=${cityId}&q=khaadi`);

    expect(res.status).toBe(200);
    const branchBrandIds = Branch.find.mock.calls[0][0].brandId.$in.map(String).sort();
    expect(branchBrandIds).toEqual([String(byName._id), String(byProduct._id)].sort());
    const matchedBrand = res.body.items.find((b) => b.name === 'Other Co');
    expect(matchedBrand.products[0]).toMatchObject({ name: 'Khaadi-style Kurta', matched: true });
    // The product search ran with the text as a literal substring.
    expect(Product.find.mock.calls[0][0].name).toEqual({ $regex: 'khaadi', $options: 'i' });
  });

  it('escapes regex characters so input is never a pattern', async () => {
    Brand.find.mockResolvedValue([makeBrand('Safe')]);
    mockProducts({ hits: [] });

    const res = await request(app).get(`/api/v1/discover?scope=city&cityId=${cityId}&q=${encodeURIComponent('(a+)+$')}`);

    expect(res.status).toBe(200);
    expect(Product.find.mock.calls[0][0].name.$regex).toBe('\\(a\\+\\)\\+\\$');
    expect(res.body.items).toEqual([]);
    expect(Branch.find).not.toHaveBeenCalled(); // no candidate brands, no branch query
  });

  it('caps products per brand at 4, matches first', async () => {
    const brand = makeBrand('Many Co');
    const block = makeBlock('Gulberg', 31.4, 73.1);
    Brand.find.mockResolvedValue([brand]);
    Branch.find.mockResolvedValue([makeBranch(brand, block, 31.4, 73.1)]);
    Block.find.mockResolvedValue([block]);
    mockProducts({ fetched: Array.from({ length: 9 }, (_, i) => makeProduct(brand, `Item ${i}`)) });

    const res = await request(app).get(`/api/v1/discover?scope=city&cityId=${cityId}`);

    expect(res.body.items[0].products).toHaveLength(4);
  });
});

describe('GET /api/v1/discover — pagination', () => {
  it('paginates brand results', async () => {
    const brands = ['A', 'B', 'C'].map(makeBrand);
    const block = makeBlock('Gulberg', 31.4, 73.1);
    Brand.find.mockResolvedValue(brands);
    Branch.find.mockResolvedValue(brands.map((b) => makeBranch(b, block, 31.4, 73.1)));
    Block.find.mockResolvedValue([block]);
    mockProducts();

    const res = await request(app).get(`/api/v1/discover?scope=city&cityId=${cityId}&limit=2&page=2`);

    expect(res.body.items.map((b) => b.name)).toEqual(['C']);
    expect(res.body.pagination).toMatchObject({ page: 2, limit: 2, total: 3, pages: 2 });
  });
});
