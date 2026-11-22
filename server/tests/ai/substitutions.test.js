process.env.AI_ENABLED = 'true';
process.env.AI_PROVIDER_ORDER = 'gemini';
process.env.GEMINI_API_KEY = 'test-gemini-key';

const request = require('supertest');
const mongoose = require('mongoose');

// Data-table mocks, not behaviour: the real agent builds the queries, so a read
// that drops the brand, the category or the in-stock filter fails an assertion.
jest.mock('../../src/models/user.model', () => ({
  ...jest.requireActual('../../src/models/user.model'),
  findById: jest.fn(),
}));
jest.mock('../../src/models/aiUsage.model', () => ({
  create: jest.fn(),
  countDocuments: jest.fn(),
}));
jest.mock('../../src/models/order.model', () => ({
  ...jest.requireActual('../../src/models/order.model'),
  findOne: jest.fn(),
  find: jest.fn(),
  updateOne: jest.fn(),
  updateMany: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));
jest.mock('../../src/models/product.model', () => ({
  ...jest.requireActual('../../src/models/product.model'),
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  insertMany: jest.fn(),
  updateOne: jest.fn(),
  updateMany: jest.fn(),
  findOneAndUpdate: jest.fn(),
  deleteOne: jest.fn(),
  findByIdAndDelete: jest.fn(),
}));
jest.mock('../../src/models/inventory.model', () => ({
  ...jest.requireActual('../../src/models/inventory.model'),
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  insertMany: jest.fn(),
  updateOne: jest.fn(),
  updateMany: jest.fn(),
  findOneAndUpdate: jest.fn(),
  deleteOne: jest.fn(),
  findByIdAndDelete: jest.fn(),
}));

const User = require('../../src/models/user.model');
const AiUsage = require('../../src/models/aiUsage.model');
const Order = require('../../src/models/order.model');
const Product = require('../../src/models/product.model');
const Inventory = require('../../src/models/inventory.model');
const app = require('../../src/app');
const env = require('../../src/config/env');
const { ROLES } = require('../../src/config/roles');
const { getAuthCookie } = require('../helpers/testAuth');
const {
  rankSubstitutes,
  filterPicks,
  cleanReason,
  cleanNote,
  nameOverlap,
  priceBand,
  MAX_PRICE_GAP,
} = require('../../src/services/ai/substitutions.rules');

const originalFetch = global.fetch;
const originalDailyLimit = env.ai.dailyLimit;

const brandA = new mongoose.Types.ObjectId();
const brandB = new mongoose.Types.ObjectId();
const categoryBread = new mongoose.Types.ObjectId();
const categoryFlour = new mongoose.Types.ObjectId();

const orderId = new mongoose.Types.ObjectId();
const itemId = new mongoose.Types.ObjectId();
const breadId = new mongoose.Types.ObjectId();
const wholemealId = new mongoose.Types.ObjectId();
const garlicId = new mongoose.Types.ObjectId();
const milkBreadId = new mongoose.Types.ObjectId();
const sourdoughId = new mongoose.Types.ObjectId();
const flourId = new mongoose.Types.ObjectId();
const rivalId = new mongoose.Types.ObjectId();
const otherPickerId = new mongoose.Types.ObjectId();

const picker = { _id: new mongoose.Types.ObjectId(), name: 'Shelf Worker', role: ROLES.PICKER, isActive: true, brandId: brandA };
const brandAdmin = { _id: new mongoose.Types.ObjectId(), name: 'Shop Owner', role: ROLES.BRAND_ADMIN, isActive: true, brandId: brandA };
const customer = { _id: new mongoose.Types.ObjectId(), name: 'Shopper', role: ROLES.CUSTOMER, isActive: true };
const users = [picker, brandAdmin, customer];

function asUser(user) {
  User.findById.mockImplementation(async (id) =>
    users.find((person) => String(person._id) === String(id)) || null
  );
  return ['Cookie', getAuthCookie(user)];
}

function product(id, brandId, categoryId, name, price, extra = {}) {
  return {
    _id: id,
    brandId,
    categoryId,
    name,
    price,
    sku: `SKU-${String(name).replace(/\W+/g, '-').toUpperCase()}`,
    images: [`${String(name).replace(/\W+/g, '-').toLowerCase()}.jpg`],
    status: 'ACTIVE',
    isActive: true,
    ...extra,
  };
}

let products;
let stocks;
let order;

function stock(productId, quantity, reservedQuantity = 0, trackInventory = true) {
  return {
    _id: new mongoose.Types.ObjectId(),
    brandId: brandA,
    productId,
    quantity,
    reservedQuantity,
    trackInventory,
  };
}

function resetWorld() {
  products = new Map([
    [String(breadId), product(breadId, brandA, categoryBread, 'White Bread', 120)],
    [String(wholemealId), product(wholemealId, brandA, categoryBread, 'Wholemeal Bread', 130)],
    [String(garlicId), product(garlicId, brandA, categoryBread, 'Garlic Bread', 170)],
    [String(milkBreadId), product(milkBreadId, brandA, categoryBread, 'Milk Bread', 115)],
    [String(sourdoughId), product(sourdoughId, brandA, categoryBread, 'Artisan Sourdough Loaf', 900)],
    [String(flourId), product(flourId, brandA, categoryFlour, 'Whole Wheat Flour 5 kg', 500)],
    [String(rivalId), product(rivalId, brandB, categoryBread, 'Rival White Bread', 120)],
  ]);

  stocks = new Map([
    [String(breadId), stock(breadId, 4)],
    [String(wholemealId), stock(wholemealId, 20, 6)],
    [String(garlicId), stock(garlicId, 5)],
    [String(milkBreadId), stock(milkBreadId, 2, 2)],
    [String(sourdoughId), stock(sourdoughId, 9)],
    [String(flourId), stock(flourId, 30)],
    [String(rivalId), stock(rivalId, 99)],
  ]);

  order = {
    _id: orderId,
    brandId: brandA,
    orderStatus: 'PROCESSING',
    pickerId: picker._id,
    packedAt: null,
    items: [
      {
        _id: itemId,
        productId: breadId,
        productName: 'White Bread',
        quantity: 3,
        unitPrice: 120,
        totalPrice: 360,
        pickStatus: 'SHORT',
        pickedQty: 1,
      },
    ],
  };
}

function matchesValue(value, condition) {
  // An ObjectId is an object too, but it is a value, not a query operator.
  const isOperator = condition && typeof condition === 'object' && !Array.isArray(condition) && !condition._bsontype;
  if (isOperator) {
    if ('$in' in condition) return condition.$in.some((entry) => String(entry) === String(value));
    if ('$ne' in condition) return String(value) !== String(condition.$ne);
    return false;
  }
  return String(value) === String(condition);
}

function matchesDoc(doc, filter = {}) {
  return Object.entries(filter).every(([key, condition]) => matchesValue(doc[key], condition));
}

function keepFields(row, fields) {
  if (!fields) return row;
  const keep = new Set(String(fields).split(' ').concat('_id'));
  return Object.fromEntries(Object.entries(row).filter(([key]) => keep.has(key)));
}

function docQuery(row) {
  let fields = null;
  const picked = () => (row ? keepFields(row, fields) : null);
  const query = {
    select: (value) => {
      fields = value;
      return query;
    },
    limit: () => query,
    lean: async () => picked(),
    then: (resolve, reject) => Promise.resolve(picked()).then(resolve, reject),
  };
  return query;
}

function listQuery(rows, filter) {
  let fields = null;
  const picked = () => rows.filter((row) => matchesDoc(row, filter)).map((row) => keepFields(row, fields));
  const query = {
    select: (value) => {
      fields = value;
      return query;
    },
    limit: () => query,
    lean: async () => picked(),
    then: (resolve, reject) => Promise.resolve(picked()).then(resolve, reject),
  };
  return query;
}

function geminiResponse(text) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text }] } }],
      usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 60 },
    }),
  };
}

function modelSays(value) {
  return geminiResponse(JSON.stringify(value));
}

function prompts() {
  return global.fetch.mock.calls.map((call) => {
    const body = JSON.parse(call[1].body);
    const system = ((body.systemInstruction || {}).parts || []).map((part) => part.text).join('');
    const user = (body.contents || []).map((entry) => (entry.parts || []).map((part) => part.text).join('')).join('\n');
    return { system, user };
  });
}

function ask(body = {}, user = picker) {
  return request(app)
    .post('/api/v1/ai/substitutions')
    .set(...asUser(user))
    .send(body);
}

function idsOf(result) {
  return result.suggestions.map((suggestion) => suggestion.productId);
}

const PICKS = {
  picks: [
    { productId: String(wholemealId), why: 'The same everyday loaf in the same size.' },
    { productId: String(garlicId), why: 'A bread from the same aisle if the shopper wants a change.' },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  env.ai.enabled = true;
  env.ai.dailyLimit = originalDailyLimit;
  AiUsage.countDocuments.mockResolvedValue(0);
  AiUsage.create.mockResolvedValue({});
  resetWorld();

  Order.findOne.mockImplementation((filter) => docQuery(matchesDoc(order, filter) ? order : null));
  Product.findOne.mockImplementation((filter) => {
    const found = [...products.values()].find((row) => matchesDoc(row, filter));
    return docQuery(found || null);
  });
  Product.find.mockImplementation((filter) => listQuery([...products.values()], filter));
  Inventory.find.mockImplementation((filter) => listQuery([...stocks.values()], filter));

  global.fetch = jest.fn().mockResolvedValue(modelSays(PICKS));
});

afterEach(() => {
  global.fetch = originalFetch;
});

afterAll(() => {
  env.ai.enabled = false;
  env.ai.dailyLimit = originalDailyLimit;
});

// ---------------------------------------------------------------------------
// The rules: what may be suggested at all.
// ---------------------------------------------------------------------------
describe('substitution ranking', () => {
  const original = { productId: breadId, name: 'White Bread', price: 120 };
  const rows = [
    { productId: wholemealId, name: 'Wholemeal Bread', price: 130, availableQuantity: 14 },
    { productId: garlicId, name: 'Garlic Bread', price: 170, availableQuantity: 5 },
    { productId: milkBreadId, name: 'Milk Bread', price: 115, availableQuantity: 0 },
    { productId: sourdoughId, name: 'Artisan Sourdough Loaf', price: 900, availableQuantity: 9 },
    { productId: breadId, name: 'White Bread', price: 120, availableQuantity: 4 },
  ];

  it('keeps same-kind items, drops the out-of-stock one, the original and a far price', () => {
    const ranked = rankSubstitutes(original, rows, 3);
    expect(idsOf({ suggestions: ranked })).toEqual([String(wholemealId), String(garlicId)]);
  });

  it('prefers the closer name and price, and says why without an amount', () => {
    const ranked = rankSubstitutes(original, rows, 3);
    expect(ranked[0].name).toBe('Wholemeal Bread');
    for (const row of ranked) {
      expect(row.why).toMatch(/available/);
      expect(row.why).not.toMatch(/(?:\brs\.?\b|\bpkr\b|\brupees?\b|₨|\d{3,})/i);
      expect(row).not.toHaveProperty('price');
    }
  });

  it('measures name likeness and price bands in words', () => {
    expect(nameOverlap('White Bread', 'Wholemeal Bread')).toBeGreaterThan(0);
    expect(nameOverlap('White Bread', 'Basmati Rice 5 kg')).toBe(0);
    expect(priceBand(120, 130)).toBe('similar');
    expect(priceBand(120, 170)).toBe('higher');
    expect(priceBand(120, 120 * (1 + MAX_PRICE_GAP) + 1)).toBe('far');
  });

  it('drops a pick the model invented or repeated, and keeps the server order', () => {
    const ranked = rankSubstitutes(original, rows, 3);
    const picks = filterPicks(
      {
        picks: [
          { productId: String(garlicId), why: 'Second choice.' },
          { productId: String(rivalId), why: 'A shop that is not this one.' },
          { productId: String(garlicId), why: 'Second choice again.' },
          { productId: String(wholemealId), why: 'First choice.' },
        ],
      },
      ranked
    );
    expect(picks.map((pick) => pick.productId)).toEqual([String(wholemealId), String(garlicId)]);
  });

  it('never lets a model reason carry money or a link', () => {
    const fallback = 'Same category · 5 available';
    expect(cleanReason('Rs 500 cheaper', fallback)).toBe(fallback);
    expect(cleanReason('₨ 1,200 only', fallback)).toBe(fallback);
    expect(cleanReason('See www.example.com for more', fallback)).toBe(fallback);
    expect(cleanReason('The same kind of loaf.', fallback)).toBe('The same kind of loaf.');
    expect(cleanNote('Rs 300 off')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The route: who may ask, and which order.
// ---------------------------------------------------------------------------
describe('POST /api/v1/ai/substitutions', () => {
  it('requires a signed-in user', async () => {
    const res = await request(app).post('/api/v1/ai/substitutions').send({ orderId: String(orderId), itemId: String(itemId) });
    expect(res.status).toBe(401);
  });

  it('refuses a brand owner and a customer: only a picker works the shelf', async () => {
    for (const user of [brandAdmin, customer]) {
      const res = await ask({ orderId: String(orderId), itemId: String(itemId) }, user);
      expect(res.status).toBe(403);
    }
    expect(global.fetch).not.toHaveBeenCalled();
    expect(Product.find).not.toHaveBeenCalled();
  });

  it('validates both ids before touching the database', async () => {
    const res = await ask({ orderId: 'nope', itemId: String(itemId) });
    expect(res.status).toBe(400);
    expect(Order.findOne).not.toHaveBeenCalled();
  });

  it('answers 404 for an order claimed by another picker', async () => {
    order.pickerId = otherPickerId;
    const res = await ask({ orderId: String(orderId), itemId: String(itemId) });
    expect(res.status).toBe(404);
    expect(Product.findOne).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('answers 404 for another brand’s order and never reads its catalogue', async () => {
    order.brandId = brandB;
    const res = await ask({ orderId: String(orderId), itemId: String(itemId) });
    expect(res.status).toBe(404);
    expect(Product.findOne).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('answers 404 for an item that is not on this order', async () => {
    const res = await ask({ orderId: String(orderId), itemId: String(new mongoose.Types.ObjectId()) });
    expect(res.status).toBe(404);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('refuses an order that has left picking', async () => {
    order.packedAt = new Date();
    const res = await ask({ orderId: String(orderId), itemId: String(itemId) });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NOT_PICKING');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('refuses a line already marked picked', async () => {
    order.items[0].pickStatus = 'PICKED';
    order.items[0].pickedQty = 3;
    const res = await ask({ orderId: String(orderId), itemId: String(itemId) });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('LINE_ALREADY_PICKED');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// The answer: same shop, same category, in stock, no money.
// ---------------------------------------------------------------------------
describe('the suggestions a picker receives', () => {
  it('reads only this shop’s active, same-category, in-stock listings', async () => {
    const res = await ask({ orderId: String(orderId), itemId: String(itemId) });
    expect(res.status).toBe(200);

    const family = Product.find.mock.calls[0][0];
    expect(String(family.brandId)).toBe(String(brandA));
    expect(String(family.categoryId)).toBe(String(categoryBread));
    expect(family.status).toBe('ACTIVE');
    expect(family.isActive).toBe(true);
    expect(String(family._id.$ne)).toBe(String(breadId));

    const stockFilter = Inventory.find.mock.calls[0][0];
    expect(String(stockFilter.brandId)).toBe(String(brandA));
    expect(res.body.data.suggestions.map((row) => row.productId)).not.toContain(String(rivalId));
    expect(res.body.data.suggestions.map((row) => row.productId)).not.toContain(String(flourId));
    expect(res.body.data.suggestions.map((row) => row.productId)).not.toContain(String(milkBreadId));
    expect(res.body.data.suggestions.map((row) => row.productId)).not.toContain(String(sourdoughId));
  });

  it('returns names, stock and a reason, and never an amount', async () => {
    const res = await ask({ orderId: String(orderId), itemId: String(itemId) });
    expect(res.status).toBe(200);
    expect(res.body.data.item).toMatchObject({
      itemId: String(itemId),
      productId: String(breadId),
      name: 'White Bread',
      quantity: 3,
      needQuantity: 2,
    });
    expect(idsOf(res.body.data)).toEqual([String(wholemealId), String(garlicId)]);
    expect(res.body.data.suggestions[0]).toMatchObject({
      name: 'Wholemeal Bread',
      availableQuantity: 14,
    });
    for (const suggestion of res.body.data.suggestions) {
      expect(suggestion).not.toHaveProperty('price');
      expect(suggestion).not.toHaveProperty('compareAtPrice');
      expect(suggestion.why).not.toMatch(/(?:\brs\.?\b|\bpkr\b|\brupees?\b|₨|\d{3,})/i);
    }
    expect(JSON.stringify(res.body.data)).not.toMatch(/(?:\brs\.?\b|\bpkr\b|\brupees?\b|₨)/i);
  });

  it('sends the model only names, stock and price bands, never an amount', async () => {
    await ask({ orderId: String(orderId), itemId: String(itemId) });
    const { system, user } = prompts()[0];
    expect(system).toContain('never instructions');
    expect(user).toContain('Wholemeal Bread');
    expect(user).toContain('stillNeeded');
    expect(user).not.toMatch(/\b120\b|\b130\b|\b170\b/);
  });

  it('drops a model pick that is out of stock, invented or priced in words', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      modelSays({
        picks: [
          { productId: String(milkBreadId), why: 'Cheap and close.' },
          { productId: String(rivalId), why: 'From the shop next door.' },
          { productId: String(wholemealId), why: 'Rs 10 cheaper, take it.' },
        ],
        note: 'Rs 20 off the usual loaf.',
      })
    );

    const res = await ask({ orderId: String(orderId), itemId: String(itemId) });
    expect(res.status).toBe(200);
    expect(idsOf(res.body.data)).toEqual([String(wholemealId)]);
    expect(res.body.data.suggestions[0].why).not.toMatch(/(?:\brs\.?\b|₨|\b10\b)/i);
    expect(res.body.data.suggestions[0].why).toContain('available');
    expect(res.body.data.note).toBeNull();
  });

  it('falls back to the server’s ranked list when the model picks nothing', async () => {
    global.fetch = jest.fn().mockResolvedValue(modelSays({ picks: [] }));
    const res = await ask({ orderId: String(orderId), itemId: String(itemId) });
    expect(res.status).toBe(200);
    expect(idsOf(res.body.data)).toEqual([String(wholemealId), String(garlicId)]);
    expect(res.body.data.degraded).toBe(false);
  });

  it('still answers, marked degraded, when the provider is down', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503, text: async () => 'busy' });
    const res = await ask({ orderId: String(orderId), itemId: String(itemId) });
    expect(res.status).toBe(200);
    expect(res.body.data.degraded).toBe(true);
    expect(idsOf(res.body.data)).toEqual([String(wholemealId), String(garlicId)]);
  });

  it('answers an empty list when nothing in the category is on the shelf', async () => {
    stocks.clear();
    const res = await ask({ orderId: String(orderId), itemId: String(itemId) });
    expect(res.status).toBe(200);
    expect(res.body.data.suggestions).toEqual([]);
    expect(res.body.data.note).toMatch(/Nothing else in this category/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('answers an empty list when the ordered item has left the catalogue', async () => {
    products.delete(String(breadId));
    const res = await ask({ orderId: String(orderId), itemId: String(itemId) });
    expect(res.status).toBe(200);
    expect(res.body.data.suggestions).toEqual([]);
    expect(res.body.data.note).toMatch(/no longer in this shop's catalogue/);
    expect(Product.find).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('never writes to an order, a product or a stock row', async () => {
    await ask({ orderId: String(orderId), itemId: String(itemId) });
    for (const model of [Order, Product, Inventory]) {
      expect(model.updateOne).not.toHaveBeenCalled();
      expect(model.updateMany).not.toHaveBeenCalled();
      expect(model.findOneAndUpdate).not.toHaveBeenCalled();
    }
    expect(Product.create).not.toHaveBeenCalled();
    expect(Inventory.create).not.toHaveBeenCalled();
  });

  it('answers 503 when the AI kill switch is off', async () => {
    env.ai.enabled = false;
    const res = await ask({ orderId: String(orderId), itemId: String(itemId) });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('AI_UNAVAILABLE');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('answers 429 once the picker’s daily allowance is spent', async () => {
    AiUsage.countDocuments.mockResolvedValue(env.ai.dailyLimit);
    const res = await ask({ orderId: String(orderId), itemId: String(itemId) });
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('AI_DAILY_LIMIT');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
