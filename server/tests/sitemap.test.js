const request = require('supertest');

jest.mock('../src/models/brand.model');
jest.mock('../src/models/product.model');
jest.mock('../src/models/serviceProvider.model');

const Brand = require('../src/models/brand.model');
const Product = require('../src/models/product.model');
const ServiceProvider = require('../src/models/serviceProvider.model');
const app = require('../src/app');

beforeEach(() => {
  jest.clearAllMocks();
  Brand.find.mockResolvedValue([
    {
      _id: '64b000000000000000000001',
      updatedAt: new Date('2026-10-02T10:00:00.000Z'),
    },
  ]);
  Product.find.mockResolvedValue([
    {
      _id: '64b000000000000000000002',
      updatedAt: new Date('2026-10-03T10:00:00.000Z'),
    },
  ]);
  ServiceProvider.find.mockResolvedValue([
    {
      slug: 'salma-clean',
      updatedAt: new Date('2026-10-04T10:00:00.000Z'),
    },
  ]);
});

describe('GET /sitemap.xml', () => {
  it('lists the public pages and the live store, product and provider URLs', async () => {
    const res = await request(app).get('/sitemap.xml');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/xml/);
    expect(res.text).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(res.text).toContain('http://localhost:5173/nearby');
    expect(res.text).toContain('http://localhost:5173/services');
    expect(res.text).toContain('http://localhost:5173/help');
    expect(res.text).toContain('http://localhost:5173/store/64b000000000000000000001');
    expect(res.text).toContain('http://localhost:5173/product/64b000000000000000000002');
    expect(res.text).toContain('http://localhost:5173/services/salma-clean');
    expect(res.text).toContain('<lastmod>2026-10-03</lastmod>');
  });

  it('only asks the database for publicly visible records', async () => {
    await request(app).get('/sitemap.xml');

    expect(Brand.find).toHaveBeenCalledWith({ status: 'ACTIVE' }, expect.any(String));
    expect(Product.find).toHaveBeenCalledWith(
      {
        brandId: { $in: ['64b000000000000000000001'] },
        status: 'ACTIVE',
        isActive: true,
      },
      expect.any(String)
    );
    expect(ServiceProvider.find).toHaveBeenCalledWith(
      { status: 'ACTIVE', verification: 'VERIFIED', billingStatus: { $ne: 'FROZEN' } },
      expect.any(String)
    );
  });

  it('skips product queries when no brand is active', async () => {
    Brand.find.mockResolvedValue([]);

    const res = await request(app).get('/sitemap.xml');

    expect(res.status).toBe(200);
    expect(Product.find).not.toHaveBeenCalled();
    expect(res.text).not.toContain('/product/');
  });
});

describe('GET /robots.txt', () => {
  it('allows the shop, keeps private areas out and points at the sitemap', async () => {
    const res = await request(app).get('/robots.txt');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toContain('User-agent: *');
    expect(res.text).toContain('Allow: /');
    expect(res.text).toContain('Disallow: /orders');
    expect(res.text).toContain('Disallow: /brand');
    expect(res.text).toContain('Disallow: /admin');
    expect(res.text).toContain('Sitemap: http://localhost:5173/sitemap.xml');
  });
});
