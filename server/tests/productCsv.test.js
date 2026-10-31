const fs = require('fs');
const path = require('path');
const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/user.model');
jest.mock('../src/models/employee.model');
jest.mock('../src/models/category.model');
jest.mock('../src/models/brand.model');
jest.mock('../src/models/branch.model');
jest.mock('../src/models/inventory.model');
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
jest.mock('../src/services/inventory.service', () => ({
  ...jest.requireActual('../src/services/inventory.service'),
  updateInventory: jest.fn(),
}));

const User = require('../src/models/user.model');
const Employee = require('../src/models/employee.model');
const Category = require('../src/models/category.model');
const Branch = require('../src/models/branch.model');
const Inventory = require('../src/models/inventory.model');
const Product = require('../src/models/product.model');
const CatalogProduct = require('../src/models/catalogProduct.model');
const { updateInventory } = require('../src/services/inventory.service');
const { slugify } = require('../src/utils/slugify');
const app = require('../src/app');
const { ROLES } = require('../src/config/roles');
const { PERMISSIONS } = require('../src/config/permissions');
const { getAuthCookie } = require('./helpers/testAuth');

const oid = () => new mongoose.Types.ObjectId();
const lawnId = oid();

// ---- the shared catalogue, as the importer sees it -------------------------
let catalog; // id -> catalogue item

function catalogItem(name, over = {}) {
  const item = {
    _id: oid(),
    name,
    slug: slugify(name),
    categoryId: lawnId,
    description: `${name} description`,
    images: ['https://x/a.jpg'],
    status: 'ACTIVE',
    scope: 'GLOBAL',
    ...over,
  };
  catalog.set(String(item._id), item);
  return item;
}

function asBrandAdmin() {
  const user = { _id: oid(), role: ROLES.BRAND_ADMIN, brandId: oid(), isActive: true };
  User.findById.mockResolvedValue(user);
  return { user, headers: ['Cookie', getAuthCookie(user)] };
}

function asEmployee(permissions) {
  const user = { _id: oid(), role: ROLES.BRAND_EMPLOYEE, brandId: oid(), isActive: true };
  User.findById.mockResolvedValue(user);
  Employee.findOne.mockResolvedValue({ userId: user._id, brandId: user.brandId, isActive: true, permissions });
  return { user, headers: ['Cookie', getAuthCookie(user)] };
}

const gulberg = { _id: oid(), name: 'Gulberg Shop' };
const dground = { _id: oid(), name: 'D Ground Shop' };

const HEADER = 'name,barcode,sku,price,compareAtPrice,status,quantity,lowStockThreshold,branches';

function post(headers, csv, query = '') {
  return request(app)
    .post(`/api/v1/products/import${query}`)
    .set(...headers)
    .set('Content-Type', 'text/csv')
    .send(csv);
}

beforeEach(() => {
  jest.resetAllMocks();
  catalog = new Map();
  CatalogProduct.find.mockImplementation(async () => [...catalog.values()]);
  CatalogProduct.findById.mockImplementation(async (id) => catalog.get(String(id)) || null);
  Category.findById.mockResolvedValue({ _id: lawnId, isActive: true });
  Category.countDocuments.mockResolvedValue(0);
  Branch.find.mockResolvedValue([gulberg, dground]);
  Product.find.mockResolvedValue([]);
  Inventory.find.mockResolvedValue([]);
  Product.findOne.mockResolvedValue(null);
  Product.create.mockImplementation(async (data) => ({ _id: oid(), ...data }));
  Branch.countDocuments.mockResolvedValue(1);
  updateInventory.mockResolvedValue({});
});

describe('GET /api/v1/products/mine/export', () => {
  it("exports the brand's listings as CSV with the item's barcode, branch names and stock", async () => {
    const { user, headers } = asBrandAdmin();
    const item = catalogItem('=Danger Suit', { barcode: '8964000123456' });
    const product = {
      _id: oid(), brandId: user.brandId, catalogProductId: item._id, name: '=Danger Suit', sku: 'S-1', price: 4500,
      status: 'ACTIVE', branchIds: [gulberg._id],
    };
    Product.find.mockReturnValue({ sort: () => ({ limit: () => Promise.resolve([product]) }) });
    Inventory.find.mockResolvedValue([{ productId: product._id, quantity: 12, lowStockThreshold: 3 }]);

    const res = await request(app).get('/api/v1/products/mine/export').set(...headers);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    const lines = res.text.replace(/^\uFEFF/, '').split('\r\n');
    // archived (removed) products are not exported, so the file can always be imported back
    expect(Product.find).toHaveBeenCalledWith({ brandId: user.brandId.toString(), status: { $ne: 'ARCHIVED' } });
    expect(lines[0]).toBe(HEADER);
    expect(lines[1]).toBe("'=Danger Suit,8964000123456,S-1,4500,,ACTIVE,12,3,Gulberg Shop");
  });

  it('is limited to brand staff with products.view', async () => {
    expect((await request(app).get('/api/v1/products/mine/export')).status).toBe(401);
    const { headers } = asEmployee([PERMISSIONS.ORDERS_VIEW]);
    expect((await request(app).get('/api/v1/products/mine/export').set(...headers)).status).toBe(403);
  });
});

describe('POST /api/v1/products/import', () => {
  it('lists catalogue items as drafts, links branches, and sets stock', async () => {
    const { user, headers } = asBrandAdmin();
    const item = catalogItem('Mehrunisa Lawn');
    Branch.countDocuments.mockResolvedValue(2); // both named branches belong to the brand
    const csv = `${HEADER}\nMehrunisa Lawn,,ML-1,4500,5200,,20,5,Gulberg Shop|D Ground Shop\n`;

    const res = await post(headers, csv);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ created: 1, updated: 0, failed: 0, dryRun: false });
    expect(Product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: user.brandId.toString(),
        catalogProductId: item._id,
        name: 'Mehrunisa Lawn', // copied from the catalogue
        slug: 'mehrunisa-lawn',
        price: 4500,
        compareAtPrice: 5200,
        status: 'DRAFT', // no status column value: safe default
        categoryId: lawnId,
        branchIds: [gulberg._id.toString(), dground._id.toString()],
      })
    );
    expect(updateInventory).toHaveBeenCalledWith(expect.anything(), { quantity: 20, lowStockThreshold: 5 });
  });

  it('finds the catalogue item by barcode even when the name differs', async () => {
    const { headers } = asBrandAdmin();
    const item = catalogItem('Dalda Ghee 1 kg', { barcode: '8964000999999' });

    const res = await post(headers, `${HEADER}\nGhee (my label),8964000999999,,1200,,,,,\n`);

    expect(res.body).toMatchObject({ created: 1, failed: 0 });
    expect(Product.create).toHaveBeenCalledWith(expect.objectContaining({ catalogProductId: item._id, name: 'Dalda Ghee 1 kg' }));
  });

  it("prefers the store's own private item over a global one with the same name", async () => {
    const { user, headers } = asBrandAdmin();
    catalogItem('Cake');
    const own = catalogItem('Cake', { scope: 'PRIVATE', brandId: user.brandId });

    const res = await post(headers, `${HEADER}\nCake,,,300,,,,,\n`);

    expect(res.body.created).toBe(1);
    expect(Product.create).toHaveBeenCalledWith(expect.objectContaining({ catalogProductId: own._id }));
  });

  it('asks the catalogue for active global items and only this store\'s private ones', async () => {
    const { user, headers } = asBrandAdmin();
    catalogItem('A');
    await post(headers, `${HEADER}\nA,,,1,,,,,\n`, '?dryRun=true');
    const filter = CatalogProduct.find.mock.calls[0][0];
    expect(filter.status).toBe('ACTIVE');
    expect(filter.$and[0].$or).toEqual([{ scope: 'GLOBAL' }, { scope: 'PRIVATE', brandId: user.brandId.toString() }]);
  });

  it('reports bad rows with row numbers and still imports the good ones', async () => {
    const { headers } = asBrandAdmin();
    ['Good Suit', 'Bad Price', 'Bad Branch', 'Bad Status'].forEach((n) => catalogItem(n));
    const csv = [
      HEADER,
      'Good Suit,,,1000,,ACTIVE,,,',
      'Not In Catalogue,,,1000,,,,,',
      'Bad Price,,,abc,,,,,',
      'Bad Branch,,,1000,,,,,Moon Shop',
      'Bad Status,,,1000,,archived,,,',
      'Good Suit,,,1000,,,,,',
    ].join('\n');

    const res = await post(headers, csv);

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(1);
    expect(res.body.failed).toBe(5);
    const byRow = Object.fromEntries(res.body.errors.map((e) => [e.row, e.messages.join(' ')]));
    expect(byRow[3]).toMatch(/"Not In Catalogue" is not in the CityCart catalogue/);
    expect(byRow[4]).toMatch(/price/i);
    expect(byRow[5]).toMatch(/Unknown branch "Moon Shop"/);
    expect(byRow[6]).toMatch(/Status must be one of/);
    expect(byRow[7]).toMatch(/Same product as row 2/);
  });

  it('tells the store when an old file still has category, description or images columns', async () => {
    const { headers } = asBrandAdmin();
    catalogItem('Old Style');

    const res = await post(headers, 'name,sku,category,price,description,images\nOld Style,,Lawn,100,Soft,https://x/a.jpg\n');

    expect(res.body).toMatchObject({ created: 1, failed: 0 });
    expect(res.body.ignoredColumns).toEqual(['category', 'description', 'images']);
    // those values belong to the catalogue, so they are never written
    const created = Product.create.mock.calls[0][0];
    expect(created.description).toBe('Old Style description');
    expect(created.images).toEqual(['https://x/a.jpg']);
  });

  it('updates an existing listing matched by SKU instead of duplicating it', async () => {
    const { user, headers } = asBrandAdmin();
    const item = catalogItem('Mehrunisa Lawn');
    const existing = {
      _id: oid(), brandId: user.brandId, sku: 'ML-1', slug: 'mehrunisa-lawn', catalogProductId: item._id, name: 'Mehrunisa Lawn',
      save: jest.fn(async function s() { return this; }),
    };
    Product.find.mockResolvedValue([{ _id: existing._id, sku: 'ML-1', slug: 'mehrunisa-lawn', catalogProductId: item._id }]);
    Product.findById.mockResolvedValue(existing);

    const res = await post(headers, `${HEADER}\nMehrunisa Lawn,,ML-1,4800,,ACTIVE,,,\n`);

    expect(res.body).toMatchObject({ created: 0, updated: 1, unchanged: 0, failed: 0 });
    expect(Product.create).not.toHaveBeenCalled();
    expect(existing.price).toBe(4800);
    expect(existing.status).toBe('ACTIVE');
    expect(existing.catalogProductId).toBe(item._id); // the item a listing points at never changes
  });

  it('refuses a SKU that already belongs to a listing of a different item', async () => {
    const { user, headers } = asBrandAdmin();
    catalogItem('Item A');
    const other = catalogItem('Item B');
    Product.find.mockResolvedValue([{ _id: oid(), brandId: user.brandId, sku: 'X-1', slug: 'item-b', catalogProductId: other._id }]);

    const res = await post(headers, `${HEADER}\nItem A,,X-1,100,,,,,\n`);

    expect(res.body).toMatchObject({ created: 0, updated: 0, failed: 1 });
    expect(res.body.errors[0].messages.join(' ')).toMatch(/already belongs to another product/);
    expect(Product.create).not.toHaveBeenCalled();
  });

  describe('importing an exported file back', () => {
    const stored = (brandId, item, extra = {}) => ({
      _id: oid(), brandId, catalogProductId: item._id, name: item.name, slug: item.slug, sku: 'ML-1', categoryId: lawnId, price: 4500,
      compareAtPrice: 5200, status: 'ACTIVE', isActive: true, branchIds: [gulberg._id], ...extra,
      save: jest.fn(async function s() { return this; }),
    });

    // Export asks for non-archived products with a chain; import reads them all as a promise.
    const shopHas = (list) =>
      Product.find.mockImplementation((filter) =>
        filter.status ? { sort: () => ({ limit: () => Promise.resolve(list.filter((p) => p.status !== 'ARCHIVED')) }) } : Promise.resolve(list)
      );

    it('reports the products as unchanged instead of failing or rewriting them', async () => {
      const { user, headers } = asBrandAdmin();
      const p = stored(user.brandId, catalogItem('Mehrunisa Lawn'));
      shopHas([p]);
      Inventory.find.mockResolvedValue([{ productId: p._id, quantity: 20, lowStockThreshold: 5 }]);

      const exported = await request(app).get('/api/v1/products/mine/export').set(...headers);
      const res = await post(headers, exported.text);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ total: 1, created: 0, updated: 0, unchanged: 1, failed: 0 });
      expect(p.save).not.toHaveBeenCalled();
      expect(Product.create).not.toHaveBeenCalled();
      expect(updateInventory).not.toHaveBeenCalled();
    });

    it('imports an export as new listings when the shop no longer has them', async () => {
      const { user, headers } = asBrandAdmin();
      const p = stored(user.brandId, catalogItem('Mehrunisa Lawn'));
      shopHas([p]);
      Inventory.find.mockResolvedValue([{ productId: p._id, quantity: 20, lowStockThreshold: 5 }]);
      const exported = await request(app).get('/api/v1/products/mine/export').set(...headers);

      shopHas([]); // e.g. a different, empty shop
      const res = await post(headers, exported.text);

      expect(res.body).toMatchObject({ created: 1, updated: 0, unchanged: 0, failed: 0 });
      expect(Product.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Mehrunisa Lawn', status: 'ACTIVE', sku: 'ML-1' }));
    });

    it('updates only what changed, and notices a stock-only change', async () => {
      const { user, headers } = asBrandAdmin();
      const p = stored(user.brandId, catalogItem('Mehrunisa Lawn'));
      shopHas([p]);
      Product.findById.mockResolvedValue(p);
      Inventory.find.mockResolvedValue([{ productId: p._id, quantity: 20, lowStockThreshold: 5 }]);

      const stockOnly = await post(headers, `${HEADER}\nMehrunisa Lawn,,ML-1,4500,5200,ACTIVE,35,5,Gulberg Shop\n`);

      expect(stockOnly.body).toMatchObject({ updated: 1, unchanged: 0, failed: 0 });
      expect(updateInventory).toHaveBeenCalledWith(expect.anything(), { quantity: 35, lowStockThreshold: 5 });
    });

    it('brings back an archived listing when its row says ACTIVE', async () => {
      const { user, headers } = asBrandAdmin();
      const archived = stored(user.brandId, catalogItem('Mehrunisa Lawn'), { status: 'ARCHIVED', isActive: false });
      shopHas([archived]);
      Product.findById.mockResolvedValue(archived);

      const res = await post(headers, `${HEADER}\nMehrunisa Lawn,,ML-1,4500,5200,ACTIVE,,,Gulberg Shop\n`);

      expect(res.body).toMatchObject({ updated: 1, failed: 0 });
      // status AND visibility are restored together, or shoppers still would not see it
      expect(archived).toMatchObject({ status: 'ACTIVE', isActive: true });
    });
  });

  it('checks the file without writing anything when dryRun=true', async () => {
    const { headers } = asBrandAdmin();
    catalogItem('A');
    const res = await post(headers, `${HEADER}\nA,,,1,,,5,1,\n`, '?dryRun=true');

    expect(res.body).toMatchObject({ dryRun: true, created: 1, failed: 0 });
    expect(Product.create).not.toHaveBeenCalled();
    expect(updateInventory).not.toHaveBeenCalled();
  });

  it('ignores stock columns for staff without inventory.manage', async () => {
    const { headers } = asEmployee([PERMISSIONS.PRODUCTS_CREATE, PERMISSIONS.PRODUCTS_UPDATE]);
    catalogItem('A');
    const res = await post(headers, `${HEADER}\nA,,,1,,,5,1,\n`);

    expect(res.body.created).toBe(1);
    expect(res.body.warnings.join(' ')).toMatch(/permission to manage stock/);
    expect(updateInventory).not.toHaveBeenCalled();
  });

  it('rejects missing columns, empty files, huge files and non-CSV bodies', async () => {
    const { headers } = asBrandAdmin();

    const noPrice = await post(headers, 'name,barcode\nA,123456\n');
    expect(noPrice.status).toBe(400);
    expect(noPrice.body.message).toMatch(/Missing required column\(s\): price/);

    expect((await post(headers, `${HEADER}\n`)).status).toBe(400);

    const many = `${HEADER}\n${Array.from({ length: 501 }, (_, i) => `P${i},,,1,,,,,`).join('\n')}`;
    expect((await post(headers, many)).status).toBe(400);

    // text/plain is what a cross-site form post would send: the body is never parsed.
    const plain = await request(app).post('/api/v1/products/import').set(...headers).set('Content-Type', 'text/plain').send(`${HEADER}\nA,,,1,,,,,`);
    expect(plain.status).toBe(400);
    expect(Product.create).not.toHaveBeenCalled();
  });

  it('needs both product create and update permissions', async () => {
    expect((await post(['Cookie', 'x=1'], `${HEADER}\n`)).status).toBe(401);
    const { headers } = asEmployee([PERMISSIONS.PRODUCTS_CREATE]);
    catalogItem('A');
    expect((await post(headers, `${HEADER}\nA,,,1,,,,,`)).status).toBe(403);
    expect(Product.create).not.toHaveBeenCalled();
  });
});

describe('branch catalogues on the product form API', () => {
  const body = (item, extra) => ({ catalogProductId: String(item._id), price: 1000, ...extra });

  it('accepts branchIds that belong to the brand and stores them', async () => {
    const { headers } = asBrandAdmin();
    const item = catalogItem('Shawl');
    Branch.countDocuments.mockResolvedValue(2);

    const res = await request(app)
      .post('/api/v1/products')
      .set(...headers)
      .send(body(item, { branchIds: [gulberg._id.toString(), dground._id.toString(), gulberg._id.toString()] }));

    expect(res.status).toBe(201);
    // duplicates are dropped before the ownership check and the save
    expect(Branch.countDocuments.mock.calls[0][0]._id.$in).toHaveLength(2);
    expect(Product.create.mock.calls[0][0].branchIds).toHaveLength(2);
  });

  it('rejects branchIds from another brand with 400', async () => {
    const { headers } = asBrandAdmin();
    const item = catalogItem('Shawl');
    Branch.countDocuments.mockResolvedValue(0);

    const res = await request(app)
      .post('/api/v1/products')
      .set(...headers)
      .send(body(item, { branchIds: [oid().toString()] }));

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/do not belong to your brand/);
    expect(Product.create).not.toHaveBeenCalled();
  });

  it('treats an empty list as "all branches" without a lookup', async () => {
    const { headers } = asBrandAdmin();
    const item = catalogItem('Shawl');

    const res = await request(app)
      .post('/api/v1/products')
      .set(...headers)
      .send(body(item, { branchIds: [] }));

    expect(res.status).toBe(201);
    expect(Branch.countDocuments).not.toHaveBeenCalled();
    expect(Product.create.mock.calls[0][0].branchIds).toEqual([]);
  });

  it('rejects malformed ids', async () => {
    const { headers } = asBrandAdmin();
    const item = catalogItem('Shawl');
    const res = await request(app).post('/api/v1/products').set(...headers).send(body(item, { branchIds: ['nope'] }));
    expect(res.status).toBe(400);
  });
});

describe('the shipped sample file (scripts/demo/sample-products-import.csv)', () => {
  it('imports cleanly against the demo catalogue and the Loom & Co. branches', async () => {
    const { headers } = asBrandAdmin();
    // The seed puts exactly these items in the catalogue (scripts/demo/sample-catalog.json).
    const items = JSON.parse(fs.readFileSync(path.join(__dirname, '../scripts/demo/sample-catalog.json'), 'utf8'));
    items.forEach((row) => catalogItem(row.name));
    const names = (list) => list.map((name) => ({ _id: oid(), name }));
    Branch.find.mockResolvedValue(names(['Loom & Co. Flagship', 'Loom & Co. D Ground', 'Loom & Co. Gulberg', 'Loom & Co. Madina Town']));
    const csv = fs.readFileSync(path.join(__dirname, '../scripts/demo/sample-products-import.csv'), 'utf8');

    const res = await post(headers, csv, '?dryRun=true');

    expect(res.status).toBe(200);
    expect(res.body.errors).toEqual([]);
    expect(res.body).toMatchObject({ total: 36, created: 36, failed: 0 });
  });
});
