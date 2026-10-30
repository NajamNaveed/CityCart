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
const { updateInventory } = require('../src/services/inventory.service');
const app = require('../src/app');
const { ROLES } = require('../src/config/roles');
const { PERMISSIONS } = require('../src/config/permissions');
const { getAuthCookie } = require('./helpers/testAuth');

const oid = () => new mongoose.Types.ObjectId();
const lawn = { _id: oid(), name: 'Lawn', slug: 'lawn' };

function asBrandAdmin() {
  const user = { _id: oid(), role: ROLES.BRAND_ADMIN, brandId: oid(), isActive: true };
  User.findById.mockResolvedValue(user);
  Category.findById.mockResolvedValue({ _id: lawn._id, brandId: user.brandId });
  return { user, headers: ['Cookie', getAuthCookie(user)] };
}

function asEmployee(permissions) {
  const user = { _id: oid(), role: ROLES.BRAND_EMPLOYEE, brandId: oid(), isActive: true };
  User.findById.mockResolvedValue(user);
  Employee.findOne.mockResolvedValue({ userId: user._id, brandId: user.brandId, isActive: true, permissions });
  Category.findById.mockResolvedValue({ _id: lawn._id, brandId: user.brandId });
  return { user, headers: ['Cookie', getAuthCookie(user)] };
}

const gulberg = { _id: oid(), name: 'Gulberg Shop' };
const dground = { _id: oid(), name: 'D Ground Shop' };

const HEADER = 'name,sku,category,price,compareAtPrice,status,quantity,lowStockThreshold,description,images,branches';

function post(headers, csv, query = '') {
  return request(app)
    .post(`/api/v1/products/import${query}`)
    .set(...headers)
    .set('Content-Type', 'text/csv')
    .send(csv);
}

beforeEach(() => {
  jest.resetAllMocks();
  Category.find.mockResolvedValue([lawn]);
  Branch.find.mockResolvedValue([gulberg, dground]);
  Product.find.mockResolvedValue([]);
  Inventory.find.mockResolvedValue([]);
  Product.findOne.mockResolvedValue(null);
  Product.create.mockImplementation(async (data) => ({ _id: oid(), ...data }));
  Branch.countDocuments.mockResolvedValue(1);
  updateInventory.mockResolvedValue({});
});

describe('GET /api/v1/products/mine/export', () => {
  it('exports the brand products as CSV with category, branch names and stock', async () => {
    const { user, headers } = asBrandAdmin();
    const product = {
      _id: oid(), brandId: user.brandId, name: '=Danger Suit', sku: 'S-1', categoryId: lawn._id, price: 4500, status: 'ACTIVE',
      description: 'Soft, "light"', images: ['https://x/a.jpg', 'https://x/b.jpg'], branchIds: [gulberg._id],
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
    expect(lines[1]).toBe(`'=Danger Suit,S-1,Lawn,4500,,ACTIVE,12,3,"Soft, ""light""",https://x/a.jpg|https://x/b.jpg,Gulberg Shop`);
  });

  it('is limited to brand staff with products.view', async () => {
    expect((await request(app).get('/api/v1/products/mine/export')).status).toBe(401);
    const { headers } = asEmployee([PERMISSIONS.ORDERS_VIEW]);
    expect((await request(app).get('/api/v1/products/mine/export').set(...headers)).status).toBe(403);
  });
});

describe('POST /api/v1/products/import', () => {
  it('creates valid rows as drafts, links branches, and sets stock', async () => {
    const { user, headers } = asBrandAdmin();
    Branch.countDocuments.mockResolvedValue(2); // both named branches belong to the brand
    const csv = `${HEADER}\nMehrunisa Lawn,ML-1,Lawn,4500,5200,,20,5,Soft lawn,https://x/a.jpg,Gulberg Shop|D Ground Shop\n`;

    const res = await post(headers, csv);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ created: 1, updated: 0, failed: 0, dryRun: false });
    expect(Product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: user.brandId.toString(),
        name: 'Mehrunisa Lawn',
        slug: 'mehrunisa-lawn',
        price: 4500,
        compareAtPrice: 5200,
        status: 'DRAFT', // no status column value: safe default
        categoryId: lawn._id.toString(),
        branchIds: [gulberg._id.toString(), dground._id.toString()],
      })
    );
    expect(updateInventory).toHaveBeenCalledWith(expect.anything(), { quantity: 20, lowStockThreshold: 5 });
  });

  it('reports bad rows with row numbers and still imports the good ones', async () => {
    const { headers } = asBrandAdmin();
    const csv = [
      HEADER,
      'Good Suit,,Lawn,1000,,ACTIVE,,,,,',
      'Bad Category,,Nope,1000,,,,,,,',
      'Bad Price,,Lawn,abc,,,,,,,',
      'Bad Branch,,Lawn,1000,,,,,,,Moon Shop',
      'Bad Status,,Lawn,1000,,archived,,,,,',
      'Good Suit,,Lawn,1000,,,,,,,',
    ].join('\n');

    const res = await post(headers, csv);

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(1);
    expect(res.body.failed).toBe(5);
    const byRow = Object.fromEntries(res.body.errors.map((e) => [e.row, e.messages.join(' ')]));
    expect(byRow[3]).toMatch(/Unknown category "Nope"/);
    expect(byRow[4]).toMatch(/price/i);
    expect(byRow[5]).toMatch(/Unknown branch "Moon Shop"/);
    expect(byRow[6]).toMatch(/Status must be one of/);
    expect(byRow[7]).toMatch(/Same product name as row 2/);
  });

  it('uses the global categories: rejects a parent with subcategories and an ambiguous name', async () => {
    const { headers } = asBrandAdmin();
    const grocery = { _id: oid(), name: 'Grocery', slug: 'grocery', parentId: null };
    const ghee = { _id: oid(), name: 'Ghee', slug: 'ghee', parentId: grocery._id };
    const otherParent = { _id: oid(), name: 'Bakery', slug: 'bakery', parentId: null };
    const otherOther = { _id: oid(), name: 'Other', slug: 'other', parentId: grocery._id };
    const bakeryOther = { _id: oid(), name: 'Other', slug: 'other', parentId: otherParent._id };
    Category.find.mockResolvedValue([grocery, ghee, otherParent, otherOther, bakeryOther]);
    const csv = [
      HEADER,
      'Dalda Ghee 1kg,,Ghee,1200,,,,,,,',
      'Loose Item,,Grocery,100,,,,,,,',
      'Mystery,,Other,100,,,,,,,',
    ].join('\n');

    const res = await post(headers, csv);

    expect(res.body.created).toBe(1);
    const byRow = Object.fromEntries(res.body.errors.map((e) => [e.row, e.messages.join(' ')]));
    expect(byRow[3]).toMatch(/has subcategories/);
    expect(byRow[4]).toMatch(/more than one parent/);
    expect(Category.find).toHaveBeenCalledWith({ isActive: true }); // no brand filter any more
  });

  it('updates an existing product matched by SKU instead of duplicating it', async () => {
    const { user, headers } = asBrandAdmin();
    const existing = { _id: oid(), brandId: user.brandId, sku: 'ML-1', slug: 'mehrunisa-lawn', save: jest.fn(async function s() { return this; }) };
    Product.find.mockResolvedValue([{ _id: existing._id, sku: 'ML-1', slug: 'mehrunisa-lawn' }]);
    Product.findById.mockResolvedValue(existing);

    const res = await post(headers, `${HEADER}\nMehrunisa Lawn,ML-1,Lawn,4800,,ACTIVE,,,,,\n`);

    expect(res.body).toMatchObject({ created: 0, updated: 1, unchanged: 0, failed: 0 });
    expect(Product.create).not.toHaveBeenCalled();
    expect(existing.price).toBe(4800);
    expect(existing.status).toBe('ACTIVE');
  });

  describe('importing an exported file back', () => {
    const stored = (brandId, extra = {}) => ({
      _id: oid(), brandId, name: 'Mehrunisa Lawn', slug: 'mehrunisa-lawn', sku: 'ML-1', categoryId: lawn._id, price: 4500,
      compareAtPrice: 5200, status: 'ACTIVE', isActive: true, description: 'Soft lawn', images: ['https://x/a.jpg'],
      branchIds: [gulberg._id], ...extra,
      save: jest.fn(async function s() { return this; }),
    });

    // Export asks for non-archived products with a chain; import reads them all as a promise.
    const shopHas = (list) =>
      Product.find.mockImplementation((filter) =>
        filter.status ? { sort: () => ({ limit: () => Promise.resolve(list.filter((p) => p.status !== 'ARCHIVED')) }) } : Promise.resolve(list)
      );

    it('reports the products as unchanged instead of failing or rewriting them', async () => {
      const { user, headers } = asBrandAdmin();
      const p = stored(user.brandId);
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

    it('imports an export as brand-new products when the shop no longer has them', async () => {
      const { user, headers } = asBrandAdmin();
      const p = stored(user.brandId);
      shopHas([p]);
      Inventory.find.mockResolvedValue([{ productId: p._id, quantity: 20, lowStockThreshold: 5 }]);
      const exported = await request(app).get('/api/v1/products/mine/export').set(...headers);

      shopHas([]); // e.g. a different, empty shop
      Branch.countDocuments.mockResolvedValue(1);
      const res = await post(headers, exported.text);

      expect(res.body).toMatchObject({ created: 1, updated: 0, unchanged: 0, failed: 0 });
      expect(Product.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Mehrunisa Lawn', status: 'ACTIVE', sku: 'ML-1' }));
    });

    it('updates only what changed, and notices a stock-only change', async () => {
      const { user, headers } = asBrandAdmin();
      const p = stored(user.brandId);
      shopHas([p]);
      Product.findById.mockResolvedValue(p);
      Inventory.find.mockResolvedValue([{ productId: p._id, quantity: 20, lowStockThreshold: 5 }]);

      const stockOnly = await post(headers, `${HEADER}\nMehrunisa Lawn,ML-1,Lawn,4500,5200,ACTIVE,35,5,Soft lawn,https://x/a.jpg,Gulberg Shop\n`);

      expect(stockOnly.body).toMatchObject({ updated: 1, unchanged: 0, failed: 0 });
      expect(updateInventory).toHaveBeenCalledWith(expect.anything(), { quantity: 35, lowStockThreshold: 5 });
    });

    it('brings back an archived product when its row says ACTIVE', async () => {
      const { user, headers } = asBrandAdmin();
      const archived = stored(user.brandId, { status: 'ARCHIVED', isActive: false });
      shopHas([archived]);
      Product.findById.mockResolvedValue(archived);

      const res = await post(headers, `${HEADER}\nMehrunisa Lawn,ML-1,Lawn,4500,5200,ACTIVE,,,Soft lawn,https://x/a.jpg,Gulberg Shop\n`);

      expect(res.body).toMatchObject({ updated: 1, failed: 0 });
      // status AND visibility are restored together, or shoppers still would not see it
      expect(archived).toMatchObject({ status: 'ACTIVE', isActive: true });
    });
  });

  it('checks the file without writing anything when dryRun=true', async () => {
    const { headers } = asBrandAdmin();
    const res = await post(headers, `${HEADER}\nA,,Lawn,1,,,5,1,,,\n`, '?dryRun=true');

    expect(res.body).toMatchObject({ dryRun: true, created: 1, failed: 0 });
    expect(Product.create).not.toHaveBeenCalled();
    expect(updateInventory).not.toHaveBeenCalled();
  });

  it('ignores stock columns for staff without inventory.manage', async () => {
    const { headers } = asEmployee([PERMISSIONS.PRODUCTS_CREATE, PERMISSIONS.PRODUCTS_UPDATE]);
    const res = await post(headers, `${HEADER}\nA,,Lawn,1,,,5,1,,,\n`);

    expect(res.body.created).toBe(1);
    expect(res.body.warnings.join(' ')).toMatch(/permission to manage stock/);
    expect(updateInventory).not.toHaveBeenCalled();
  });

  it('rejects missing columns, empty files, huge files and non-CSV bodies', async () => {
    const { headers } = asBrandAdmin();

    const noPrice = await post(headers, 'name,category\nA,Lawn\n');
    expect(noPrice.status).toBe(400);
    expect(noPrice.body.message).toMatch(/Missing required column\(s\): price/);

    expect((await post(headers, `${HEADER}\n`)).status).toBe(400);

    const many = `${HEADER}\n${Array.from({ length: 501 }, (_, i) => `P${i},,Lawn,1,,,,,,,`).join('\n')}`;
    expect((await post(headers, many)).status).toBe(400);

    // text/plain is what a cross-site form post would send: the body is never parsed.
    const plain = await request(app).post('/api/v1/products/import').set(...headers).set('Content-Type', 'text/plain').send(`${HEADER}\nA,,Lawn,1,,,,,,,`);
    expect(plain.status).toBe(400);
    expect(Product.create).not.toHaveBeenCalled();
  });

  it('needs both product create and update permissions', async () => {
    expect((await post(['Cookie', 'x=1'], `${HEADER}\n`)).status).toBe(401);
    const { headers } = asEmployee([PERMISSIONS.PRODUCTS_CREATE]);
    expect((await post(headers, `${HEADER}\nA,,Lawn,1,,,,,,,`)).status).toBe(403);
    expect(Product.create).not.toHaveBeenCalled();
  });
});

describe('branch catalogues on the product form API', () => {
  it('accepts branchIds that belong to the brand and stores them', async () => {
    const { headers } = asBrandAdmin();
    Branch.countDocuments.mockResolvedValue(2);

    const res = await request(app)
      .post('/api/v1/products')
      .set(...headers)
      .send({ name: 'Shawl', price: 1000, categoryId: lawn._id.toString(), branchIds: [gulberg._id.toString(), dground._id.toString(), gulberg._id.toString()] });

    expect(res.status).toBe(201);
    // duplicates are dropped before the ownership check and the save
    expect(Branch.countDocuments.mock.calls[0][0]._id.$in).toHaveLength(2);
    expect(Product.create.mock.calls[0][0].branchIds).toHaveLength(2);
  });

  it("rejects branchIds from another brand with 400", async () => {
    const { headers } = asBrandAdmin();
    Branch.countDocuments.mockResolvedValue(0);

    const res = await request(app)
      .post('/api/v1/products')
      .set(...headers)
      .send({ name: 'Shawl', price: 1000, categoryId: lawn._id.toString(), branchIds: [oid().toString()] });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/do not belong to your brand/);
    expect(Product.create).not.toHaveBeenCalled();
  });

  it('treats an empty list as "all branches" without a lookup', async () => {
    const { headers } = asBrandAdmin();

    const res = await request(app)
      .post('/api/v1/products')
      .set(...headers)
      .send({ name: 'Shawl', price: 1000, categoryId: lawn._id.toString(), branchIds: [] });

    expect(res.status).toBe(201);
    expect(Branch.countDocuments).not.toHaveBeenCalled();
    expect(Product.create.mock.calls[0][0].branchIds).toEqual([]);
  });

  it('rejects malformed ids', async () => {
    const { headers } = asBrandAdmin();
    const res = await request(app).post('/api/v1/products').set(...headers).send({ name: 'x', price: 1, categoryId: lawn._id.toString(), branchIds: ['nope'] });
    expect(res.status).toBe(400);
  });
});

describe('the shipped sample file (scripts/demo/sample-products-import.csv)', () => {
  it('imports cleanly against the demo Loom & Co. categories and branches', async () => {
    const { headers } = asBrandAdmin();
    const names = (list) => list.map((name) => ({ _id: oid(), name, slug: name.toLowerCase() }));
    Category.find.mockResolvedValue(names(['Lawn Collection', 'Winter Khaddar', "Men's Fabric", 'Dupattas & Shawls']));
    Branch.find.mockResolvedValue(names(['Loom & Co. Flagship', 'Loom & Co. D Ground', 'Loom & Co. Gulberg', 'Loom & Co. Madina Town']));
    const csv = fs.readFileSync(path.join(__dirname, '../scripts/demo/sample-products-import.csv'), 'utf8');

    const res = await post(headers, csv, '?dryRun=true');

    expect(res.status).toBe(200);
    expect(res.body.errors).toEqual([]);
    expect(res.body).toMatchObject({ total: 36, created: 36, failed: 0 });
  });
});
