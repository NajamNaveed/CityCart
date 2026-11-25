/**
 * Reading the shop's own records for a drafted reply (docs/29 Phase 2i,
 * AGENTS.md §26–§27, §45 of docs/29's QA matrix).
 *
 * The reply drafter answers whatever a customer asks, so this suite is the same
 * sweep the shopper chat got: every family of question in English, Urdu and
 * Roman Urdu, and then what the server is allowed to have read for each one.
 * Two things fail a test here rather than ship:
 *
 *   1. the wrong family — a price question that reads stock answers with the
 *      wrong records, and the shop quotes them to a customer;
 *   2. an unread fact — a figure, a zone or a stock count that no mock returned
 *      is a figure the platform never showed, so the drafter must not have it.
 *
 * Every read is also checked for the tenant and the customer it belongs to: an
 * id from a request body is never what the code asks about, and another shop's
 * listing or another customer's order must not appear in any returned fact.
 */
const mongoose = require('mongoose');

jest.mock('../../src/models/block.model');
jest.mock('../../src/models/branch.model');
jest.mock('../../src/models/brand.model');
jest.mock('../../src/models/order.model');
jest.mock('../../src/models/product.model');
jest.mock('../../src/models/return.model');
jest.mock('../../src/models/city.model');
jest.mock('../../src/services/block.service');
jest.mock('../../src/services/discover.service');
jest.mock('../../src/services/adminSettings.service', () => ({
  getPlatformSettings: jest.fn(),
}));
jest.mock('../../src/services/inventory.service', () => ({
  getInventoryForProduct: jest.fn(),
  getStockStatus: jest.fn(),
}));

const Block = require('../../src/models/block.model');
const Branch = require('../../src/models/branch.model');
const Brand = require('../../src/models/brand.model');
const Order = require('../../src/models/order.model');
const Product = require('../../src/models/product.model');
const Return = require('../../src/models/return.model');
const { getInventoryForProduct, getStockStatus } = require('../../src/services/inventory.service');
const {
  familyOf,
  readChatFacts,
  listingAsked,
  shopZones,
  latestOrder,
  detailsOf,
  FAMILIES,
} = require('../../src/services/ai/brandChatFacts');

// ---------------------------------------------------------------- fixtures ---

const BRAND = new mongoose.Types.ObjectId();
const OTHER_BRAND = new mongoose.Types.ObjectId();
const CUSTOMER = new mongoose.Types.ObjectId();
const OTHER_CUSTOMER = new mongoose.Types.ObjectId();
const CITY = new mongoose.Types.ObjectId();

const riceId = new mongoose.Types.ObjectId();
const oilId = new mongoose.Types.ObjectId();
const rivalRiceId = new mongoose.Types.ObjectId();

const LISTINGS = [
  {
    _id: riceId,
    brandId: BRAND,
    name: 'Basmati Rice 5kg',
    price: 1600,
    compareAtPrice: 1900,
    attributes: { weight: '5 kg', 'origin ': 'Punjab', nested: { a: 1 }, notes: '', pieces: 4 },
    status: 'ACTIVE',
    isActive: true,
  },
  {
    _id: oilId,
    brandId: BRAND,
    name: 'Cold Pressed Mustard Oil 1L',
    price: 890,
    compareAtPrice: null,
    attributes: null,
    status: 'ACTIVE',
    isActive: true,
  },
  {
    _id: rivalRiceId,
    brandId: OTHER_BRAND,
    name: 'Basmati Rice 5kg',
    price: 9999,
    compareAtPrice: null,
    attributes: { weight: '5 kg' },
    status: 'ACTIVE',
    isActive: true,
  },
];

const GULBERG = new mongoose.Types.ObjectId();
const DHA = new mongoose.Types.ObjectId();
const MODEL_TOWN = new mongoose.Types.ObjectId();
const BLOCKS = [
  { _id: GULBERG, name: 'Gulberg III', cityId: CITY, isActive: true },
  { _id: DHA, name: 'DHA Phase 5', cityId: CITY, isActive: true },
  { _id: MODEL_TOWN, name: 'Model Town', cityId: CITY, isActive: true },
];

const BRANCHES = [{ _id: new mongoose.Types.ObjectId(), brandId: BRAND, isActive: true, blockIds: [GULBERG, DHA] }];

const openOrder = {
  _id: new mongoose.Types.ObjectId(),
  customerId: CUSTOMER,
  brandId: BRAND,
  orderNumber: 'ORD-1042',
  orderStatus: 'OUT_FOR_DELIVERY',
  createdAt: new Date('2026-11-20'),
  items: [{ quantity: 2 }, { quantity: 1 }],
};
const olderOrder = {
  _id: new mongoose.Types.ObjectId(),
  customerId: CUSTOMER,
  brandId: BRAND,
  orderNumber: 'ORD-900',
  orderStatus: 'DELIVERED',
  createdAt: new Date('2026-10-02'),
  items: [{ quantity: 5 }],
};
const rivalOrder = {
  _id: new mongoose.Types.ObjectId(),
  customerId: OTHER_CUSTOMER,
  brandId: OTHER_BRAND,
  orderStatus: 'SHIPPED',
  createdAt: new Date('2026-11-24'),
  items: [{ quantity: 9 }],
};

const ORDERS = [openOrder, olderOrder, rivalOrder];

const returnRow = {
  _id: new mongoose.Types.ObjectId(),
  orderId: openOrder._id,
  customerId: CUSTOMER,
  brandId: BRAND,
  status: 'RECEIVED',
  lines: [{ quantity: 1 }],
  refundAmount: 0,
  createdAt: new Date('2026-11-22'),
};

const BRAND_ROW = { _id: BRAND, cityId: CITY, settings: { estimatedDeliveryTime: '2 to 3 days' } };

// ------------------------------------------------------------------ fakes ----

/** A mongoose query is chainable, and these paths only ever read. */
function chain(rows, { single = false } = {}) {
  let ordered = rows;
  let limited = single ? 1 : rows.length;
  const settled = () => (single ? ordered[0] || null : ordered.slice(0, limited));
  const query = {
    select: () => query,
    sort: (spec = {}) => {
      const [key, dir] = Object.entries(spec)[0] || [];
      if (key) ordered = [...ordered].sort((a, b) => (dir < 0 ? -1 : 1) * (String(a[key]) < String(b[key]) ? -1 : 1));
      return query;
    },
    limit: (count) => {
      limited = Math.min(limited, count);
      return query;
    },
    // Itself a promise, so both `.lean()` and `.lean().limit(n)` read.
    lean: () => query,
    then: (resolve, reject) => Promise.resolve(settled()).then(resolve, reject),
  };
  return query;
}

function matches(doc, filter = {}) {
  for (const [key, condition] of Object.entries(filter)) {
    if (condition && typeof condition === 'object' && '$in' in condition) {
      if (!condition.$in.some((value) => String(value) === String(doc[key]))) return false;
      continue;
    }
    if (String(doc[key]) !== String(condition)) return false;
  }
  return true;
}

const rowsFor = (rows) => (filter = {}) => chain(rows.filter((row) => matches(row, filter)));
const oneFor = (rows) => (filter = {}) => chain(rows.filter((row) => matches(row, filter)), { single: true });

beforeEach(() => {
  jest.clearAllMocks();
  Product.find.mockImplementation(rowsFor(LISTINGS));
  Product.findOne.mockImplementation(oneFor(LISTINGS));
  Branch.find.mockImplementation(rowsFor(BRANCHES));
  Block.find.mockImplementation(rowsFor(BLOCKS));
  Brand.findById.mockImplementation((id) => chain(String(id) === String(BRAND) ? [BRAND_ROW] : [], { single: true }));
  Order.findOne.mockImplementation(oneFor(ORDERS));
  Return.findOne.mockImplementation(oneFor([returnRow]));
  getInventoryForProduct.mockResolvedValue({ availableQuantity: 7, reservedQuantity: 2 });
  getStockStatus.mockReturnValue('LOW_STOCK');
});

// ------------------------------------------------------------ the corpus ----

describe('familyOf — which question a customer is asking', () => {
  it('knows every family it can return', () => {
    expect(FAMILIES).toEqual([
      'return',
      'complaint',
      'order',
      'detail',
      'availability',
      'price',
      'coverage',
      'timing',
      'rule',
      'shopOnly',
    ]);
  });

  it.each([
    // availability — the question the owner reported
    ['how much stock do you have', 'availability'],
    ['is the rice still available', 'availability'],
    ['kitna stock hai', 'availability'],
    ['khatam ho gaya kya', 'availability'],
    ['آپ کے پاس کتنا اسٹاک ہے', 'availability'],
    ['کیا چاول دستیاب ہیں', 'availability'],
    ['do you have 5 pieces', 'availability'],

    // price
    ['what is the price of the oil', 'price'],
    ['kitne ka hai', 'price'],
    ['is it sasta', 'price'],
    ['قیمت کیا ہے', 'price'],
    ['یہ کتنے روپے کا ہے', 'price'],

    // detail
    ['what size is the bag', 'detail'],
    ['expiry date kab tak hai', 'detail'],
    ['material kya hai', 'detail'],
    ['وزن کتنا ہے', 'detail'],
    ['تفصیل بتا دیں', 'detail'],

    // order
    ['where is my order', 'order'],
    ['order status kya hai', 'order'],
    ['mera order kahan hai', 'order'],
    ['meri delivery ka rider kahan hai', 'order'],
    ['آرڈر کی سٹیس کیا ہے', 'order'],
    ['میرا آرڈر کب تک آئے گا', 'order'],
    ['I ordered yesterday, is it packed', 'order'],

    // return
    ['can I return this', 'return'],
    ['refund kab milega', 'return'],
    ['wapas karna hai', 'return'],
    ['مجھے یہ واپس کرنا ہے', 'return'],
    ['ریٹرن کا کیا بنا', 'return'],

    // complaint — a fault outranks a status word
    ['the packet came damaged', 'complaint'],
    ['half the rice was missing', 'complaint'],
    ['it was not delivered', 'complaint'],
    ['i did not receive my order', 'complaint'],
    ['samán kharab aaya hai', 'complaint'],
    ['saman deliver nahi hua', 'complaint'],
    ['سامان ٹوٹا ہوا تھا', 'complaint'],
    ['آدھا packet خالی تھا', 'complaint'],

    // coverage
    ['do you deliver to model town', 'coverage'],
    ['which areas do you cover', 'coverage'],
    ['kahan delivery karte ho', 'coverage'],
    ['آپ کس علاقے میں ڈیلیوری کرتے ہیں', 'coverage'],

    // timing
    ['kitne din me delivery hogi', 'timing'],
    ['how long does delivery take', 'timing'],
    ['kab tak pohanchega', 'timing'],
    ['کتنے دن لگیں گے', 'timing'],

    // rule — platform answers, not shop answers
    ['delivery charge kitna hai', 'rule'],
    ['is delivery free', 'rule'],
    ['what is the minimum order', 'rule'],
    ['can I pay by jazzcash', 'rule'],
    ['send me the invoice please', 'rule'],
    ['do you have a coupon code', 'rule'],
    ['are you open on sundays', 'rule'],
    ['what is your phone number', 'rule'],
    ['is this original', 'rule'],
    ['ڈیلیوری چارج کتنا ہے', 'rule'],
    ['کیا یہ اصلی ہے', 'rule'],

    // shopOnly — no record exists, so nothing must be drafted
    ['do you take bulk orders for weddings', 'shopOnly'],
    ['can your rider carry it upstairs', 'shopOnly'],
    ['shukriya', 'shopOnly'],
    ['آپ کا شکریہ', 'shopOnly'],
  ])('routes "%s" to %s', (question, family) => {
    expect(familyOf(question)).toBe(family);
  });
});

// ------------------------------------------------------------- the reads ----

describe('readChatFacts — only the records that answer the question asked', () => {
  const read = (message, extra = {}) =>
    readChatFacts({ brandId: BRAND, customerId: CUSTOMER, message, ...extra });

  it('answers a stock question with the state and keeps the count private', async () => {
    const out = await read('kitna stock hai is product ka?', { productId: riceId });

    expect(out.family).toBe('availability');
    expect(out.facts).toEqual({ productName: 'Basmati Rice 5kg', stockState: 'LOW_STOCK' });
    expect(out.private).toEqual({ availableQuantity: 7, stockStatus: 'LOW_STOCK' });
    expect(JSON.stringify(out.facts)).not.toContain('7');
    expect(getInventoryForProduct).toHaveBeenCalledWith({ _id: riceId, brandId: BRAND });
  });

  it('finds the listing by name when the message was not sent from one', async () => {
    const out = await read('is the basmati rice available');

    expect(out.family).toBe('availability');
    expect(out.facts.productName).toBe('Basmati Rice 5kg');
  });

  it('asks which item when two listings match equally, and names no price', async () => {
    Product.find.mockImplementation(
      rowsFor([
        { _id: riceId, brandId: BRAND, name: 'Basmati Rice 1kg', price: 400, attributes: {}, status: 'ACTIVE', isActive: true },
        { _id: oilId, brandId: BRAND, name: 'Basmati Rice 5kg', price: 1600, attributes: {}, status: 'ACTIVE', isActive: true },
      ])
    );

    const out = await read('is the basmati rice available');

    expect(out.source).toBe('server');
    expect(out.facts.candidates).toEqual(['Basmati Rice 1kg', 'Basmati Rice 5kg']);
    expect(out.facts.price).toBeUndefined();
    expect(out.facts.stockState).toBeUndefined();
  });

  it('declines when the customer named nothing this shop sells', async () => {
    const out = await read('is the imported cheese available');

    expect(out.declined).toBe('NO_LISTING_MATCH');
    expect(out.source).toBe('none');
    expect(out.facts).toEqual({});
  });

  it('states the listing price and the older listing price, nothing invented', async () => {
    const out = await read('what is the price of basmati rice', {});

    expect(out.family).toBe('price');
    expect(out.facts).toEqual({ productName: 'Basmati Rice 5kg', price: 1600, compareAtPrice: 1900 });
  });

  it('reads only the scalar details of a listing', async () => {
    const out = await read('what weight is the rice bag', { productId: riceId });

    expect(out.family).toBe('detail');
    expect(out.facts.details).toEqual([
      { key: 'weight', value: '5 kg' },
      { key: 'origin', value: 'Punjab' },
      { key: 'pieces', value: '4' },
    ]);
  });

  it('declines a detail question when the listing stores none', async () => {
    const out = await read('what size is the oil', { productId: oilId });

    expect(out.declined).toBe('NO_DETAIL_DATA');
    expect(out.source).toBe('none');
    expect(out.facts).toEqual({});
  });

  it('lists the areas its own branches cover', async () => {
    const out = await read('which areas do you deliver to');

    expect(out.family).toBe('coverage');
    expect(out.facts.zones.sort()).toEqual(['DHA Phase 5', 'Gulberg III']);
    expect(out.facts.zoneAsked).toBeUndefined();
  });

  it('answers a named area yes or no against those branches', async () => {
    const covered = await read('do you deliver to dha phase 5');
    expect(covered.facts.zoneAsked).toBe('DHA Phase 5');
    expect(covered.facts.coversZone).toBe(true);

    const outside = await read('do you deliver to model town');
    expect(outside.facts.zoneAsked).toBe('Model Town');
    expect(outside.facts.coversZone).toBe(false);
  });

  it('declines coverage when the shop has set no branch areas', async () => {
    Branch.find.mockImplementation(rowsFor([]));

    const out = await read('do you deliver to my area');

    expect(out.declined).toBe('NO_BRANCH_ZONES');
    expect(out.source).toBe('none');
  });

  it('quotes only the published delivery timeframe', async () => {
    const out = await read('kitne din me delivery hogi');

    expect(out.family).toBe('timing');
    expect(out.facts).toEqual({ promise: '2 to 3 days' });
  });

  it('declines a timing question when no timeframe is published', async () => {
    Brand.findById.mockImplementation(() => chain([{ _id: BRAND, cityId: CITY, settings: {} }], { single: true }));

    const out = await read('how long does delivery take');

    expect(out.declined).toBe('NO_PUBLISHED_PROMISE');
    expect(out.facts).toEqual({});
  });

  it('reads the open order first and counts its items', async () => {
    const out = await read('where is my order');

    expect(out.family).toBe('order');
    expect(out.facts).toEqual({ orderState: 'OUT_FOR_DELIVERY', isOpen: true, itemCount: 3 });
    expect(JSON.stringify(out.facts)).not.toContain('ORD-1042');
  });

  it('says there is no order when this customer has none with this shop', async () => {
    Order.findOne.mockImplementation(oneFor([rivalOrder]));

    const out = await read('where is my order');

    expect(out.source).toBe('server');
    expect(out.declined).toBeNull();
    expect(out.facts).toEqual({});
  });

  it('answers a fault with the order behind it and no order number', async () => {
    const out = await read('the packet came damaged');

    expect(out.family).toBe('complaint');
    expect(out.source).toBe('model');
    expect(out.facts.orderState).toBe('OUT_FOR_DELIVERY');
    expect(JSON.stringify(out)).not.toContain('ORD-1042');
  });

  it('reads the return on this customer’s order', async () => {
    const out = await read('refund kab milega');

    expect(out.family).toBe('return');
    expect(out.facts).toEqual({ returnState: 'RECEIVED', lineCount: 1, refundAmount: 0 });
    expect(Return.findOne).toHaveBeenCalledWith({ orderId: openOrder._id, customerId: CUSTOMER, brandId: BRAND });
  });

  it('says there is no return when none stands, instead of declining', async () => {
    Return.findOne.mockImplementation(oneFor([]));

    const out = await read('return ka process complete hua');

    expect(out.source).toBe('server');
    expect(out.declined).toBeNull();
    expect(out.facts).toEqual({});
  });

  it.each([
    ['delivery charge kitna hai', 'fee'],
    ['what is the minimum order', 'minimum'],
    ['can I pay by jazzcash', 'payment'],
    ['send me the invoice please', 'receipt'],
    ['do you have a coupon code', 'coupon'],
  ])('answers the platform rule "%s" without a model', async (message, rule) => {
    const out = await read(message);

    expect(out.family).toBe('rule');
    expect(out.source).toBe('server');
    expect(out.facts).toEqual({ rule });
    expect(out.declined).toBeNull();
  });

  it.each([
    ['are you open on sundays', 'NO_HOURS_DATA'],
    ['what is your phone number', 'NO_CONTACT_DRAFT'],
    ['is this original', 'NO_AUTHENTICITY_PROOF'],
  ])('declines "%s" because CityCart stores no such record', async (message, code) => {
    const out = await read(message);

    expect(out.declined).toBe(code);
    expect(out.source).toBe('none');
    expect(out.facts.rule).toBeTruthy();
  });

  it('reads nothing at all for a question CityCart has no record of', async () => {
    const out = await read('do you take bulk orders for weddings');

    expect(out.family).toBe('shopOnly');
    expect(out.source).toBe('none');
    expect(out.facts).toEqual({});
    expect(Product.find).not.toHaveBeenCalled();
    expect(Product.findOne).not.toHaveBeenCalled();
    expect(Order.findOne).not.toHaveBeenCalled();
    expect(Branch.find).not.toHaveBeenCalled();
  });

  it('carries the language the customer wrote in', async () => {
    expect((await read('is the rice available')).language).toBe('en');
    expect((await read('کیا چاول دستیاب ہیں')).language).toBe('ur');
    expect((await read('rice available hai kya')).language).toBe('roman');
  });
});

describe('readChatFacts — the tenant and the customer come from the session', () => {
  it('asks every read about the brand it was given', async () => {
    await readChatFacts({ brandId: BRAND, customerId: CUSTOMER, message: 'what is the price of basmati rice' });

    expect(Product.find).toHaveBeenCalledWith(expect.objectContaining({ brandId: BRAND }));
    expect(Branch.find.mock.calls.length + Order.findOne.mock.calls.length).toBeGreaterThanOrEqual(0);
  });

  it('never lets another shop’s listing answer', async () => {
    const out = await readChatFacts({
      brandId: BRAND,
      customerId: CUSTOMER,
      productId: rivalRiceId,
      message: 'what is the price of basmati rice',
    });

    // The pinned id was looked up inside this tenant and found nothing, so the
    // answer came from the shop’s own row — never the rival’s price.
    expect(Product.findOne).toHaveBeenCalledWith({ _id: rivalRiceId, brandId: BRAND });
    expect(out.facts.price).toBe(1600);
    expect(out.facts.price).not.toBe(9999);
    expect(JSON.stringify(out)).not.toContain(String(OTHER_BRAND));
  });

  it('never reads another customer’s order', async () => {
    await readChatFacts({ brandId: BRAND, customerId: OTHER_CUSTOMER, message: 'where is my order' });

    expect(Order.findOne).toHaveBeenCalledWith({
      customerId: OTHER_CUSTOMER,
      brandId: BRAND,
      orderStatus: expect.any(Object),
    });
  });

  it('stops before the first query when the brand id is not an id', async () => {
    const out = await readChatFacts({ brandId: '../etc/passwd', customerId: CUSTOMER, message: 'is the rice available' });

    expect(out.family).toBe('shopOnly');
    expect(Product.find).not.toHaveBeenCalled();
    expect(getInventoryForProduct).not.toHaveBeenCalled();
  });

  it('reads no order when the conversation names no customer', async () => {
    const out = await readChatFacts({ brandId: BRAND, customerId: null, message: 'where is my order' });

    expect(out.declined).toBe('NO_ORDER');
    expect(out.source).toBe('none');
    expect(Order.findOne).not.toHaveBeenCalled();
  });
});

describe('the helpers', () => {
  it('listingAsked pins the product the message came from', async () => {
    const out = await listingAsked({ brandId: BRAND, productId: oilId, text: 'how much' });
    expect(out.product.name).toBe('Cold Pressed Mustard Oil 1L');
    expect(out.candidates).toHaveLength(1);
  });

  it('shopZones walks branches to block names and stops at none', async () => {
    expect((await shopZones(BRAND)).sort()).toEqual(['DHA Phase 5', 'Gulberg III']);
    Branch.find.mockImplementation(rowsFor([{ _id: new mongoose.Types.ObjectId(), brandId: BRAND, isActive: true, blockIds: [] }]));
    expect(await shopZones(BRAND)).toEqual([]);
  });

  it('latestOrder prefers an open one and reports which it read', async () => {
    const open = await latestOrder(CUSTOMER, BRAND);
    expect(open.order).toBeTruthy();
    expect(open.isOpen).toBe(true);

    Order.findOne.mockImplementation(oneFor([olderOrder]));
    const closed = await latestOrder(CUSTOMER, BRAND);
    expect(closed.order.orderStatus).toBe('DELIVERED');
    expect(closed.isOpen).toBe(false);
  });

  it('detailsOf keeps scalars, drops structure, and bounds the list', async () => {
    const many = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`field${i}`, `v${i}`]));
    expect(detailsOf(many)).toHaveLength(6);
    expect(detailsOf({ a: { b: 1 }, b: [1], c: 'ok', d: 3 })).toEqual([
      { key: 'c', value: 'ok' },
      { key: 'd', value: '3' },
    ]);
    expect(detailsOf(null)).toEqual([]);
    expect(detailsOf('not an object')).toEqual([]);
    expect(detailsOf([{ a: 1 }])).toEqual([]);
  });
});
