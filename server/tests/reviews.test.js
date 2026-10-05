const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/user.model');
jest.mock('../src/models/employee.model');
jest.mock('../src/models/review.model');
jest.mock('../src/models/order.model');
jest.mock('../src/models/product.model');
jest.mock('../src/models/brand.model');

const User = require('../src/models/user.model');
const Employee = require('../src/models/employee.model');
const Review = require('../src/models/review.model');
const Order = require('../src/models/order.model');
const Product = require('../src/models/product.model');
const Brand = require('../src/models/brand.model');
const app = require('../src/app');
const { ROLES } = require('../src/config/roles');
const { PERMISSIONS } = require('../src/config/permissions');
const { getAuthCookie } = require('./helpers/testAuth');
const { shortName, summarise } = require('../src/services/review.service');

const oid = () => new mongoose.Types.ObjectId();
const brandId = oid();

function asRole(role, permissions) {
  const user = { _id: oid(), role, isActive: true, ...(role.includes('BRAND') && { brandId }) };
  User.findById.mockResolvedValue(user);
  if (role === ROLES.BRAND_EMPLOYEE) {
    Employee.findOne.mockResolvedValue({ isActive: true, permissions: permissions || [] });
  }
  return { user, cookie: ['Cookie', getAuthCookie(user)] };
}

// Review.find(...).sort().skip().limit() chain
function mockFind(items) {
  const limit = jest.fn().mockResolvedValue(items);
  Review.find.mockReturnValue({ sort: () => ({ skip: () => ({ limit }) }) });
  return limit;
}
const mockNames = (docs) => User.find.mockReturnValue({ select: () => Promise.resolve(docs) });

beforeEach(() => {
  jest.resetAllMocks();
});

describe('review helpers', () => {
  it('shows a first name and an initial, never the full name', () => {
    expect(shortName('Sana Iqbal')).toBe('Sana I.');
    expect(shortName('  Ali   Raza Khan ')).toBe('Ali K.');
    expect(shortName('Madonna')).toBe('Madonna');
    expect(shortName('')).toBe('Customer');
    expect(shortName(undefined)).toBe('Customer');
  });

  it('summarises ratings into an average (one decimal), a count and a 1-5 distribution', () => {
    expect(summarise([{ _id: 5, count: 3 }, { _id: 4, count: 1 }, { _id: 1, count: 1 }])).toEqual({
      average: 4.0,
      count: 5,
      distribution: { 1: 1, 2: 0, 3: 0, 4: 1, 5: 3 },
    });
    expect(summarise([{ _id: 5, count: 2 }, { _id: 4, count: 1 }]).average).toBe(4.7);
    expect(summarise([])).toEqual({ average: 0, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
  });
});

describe('GET /api/v1/products/:id/reviews (public)', () => {
  const productId = oid();
  function publicProduct() {
    Product.findOne.mockResolvedValue({ _id: productId, brandId });
    Brand.findOne.mockResolvedValue({ _id: brandId });
  }

  it('returns approved reviews with short names, a summary and pagination, and leaks no ids or emails', async () => {
    publicProduct();
    const customerId = oid();
    const limit = mockFind([{ _id: oid(), customerId, orderId: oid(), rating: 5, title: 'Lovely', comment: 'Soft cloth.', createdAt: new Date('2026-09-01') }]);
    Review.countDocuments.mockResolvedValue(1);
    Review.aggregate.mockResolvedValue([{ _id: 5, count: 1 }]);
    mockNames([{ _id: customerId, name: 'Sana Iqbal' }]);

    const res = await request(app).get(`/api/v1/products/${productId}/reviews`);

    expect(res.status).toBe(200);
    expect(Review.find).toHaveBeenCalledWith({ productId: String(productId), isApproved: true });
    expect(limit).toHaveBeenCalledWith(10);
    expect(res.body.reviews[0]).toMatchObject({ rating: 5, title: 'Lovely', reviewerName: 'Sana I.', verifiedPurchase: true });
    expect(res.body.summary).toEqual({ average: 5, count: 1, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1 } });
    expect(res.body.pagination).toEqual({ page: 1, limit: 10, total: 1, pages: 1 });
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(String(customerId));
    expect(text).not.toContain('Iqbal');
  });

  it('is a 404 for a product that is not public, or whose brand is not active', async () => {
    Product.findOne.mockResolvedValue(null);
    expect((await request(app).get(`/api/v1/products/${productId}/reviews`)).status).toBe(404);

    Product.findOne.mockResolvedValue({ _id: productId, brandId });
    Brand.findOne.mockResolvedValue(null);
    expect((await request(app).get(`/api/v1/products/${productId}/reviews`)).status).toBe(404);
  });

  it('rejects a malformed id and a bad page size', async () => {
    expect((await request(app).get('/api/v1/products/not-an-id/reviews')).status).toBe(400);
    expect((await request(app).get(`/api/v1/products/${productId}/reviews?limit=500`)).status).toBe(400);
  });
});

describe('GET /api/v1/reviews/summary (public)', () => {
  it('gives average and count per product, and ignores bad ids', async () => {
    const a = oid();
    Review.aggregate.mockResolvedValue([{ _id: a, count: 3, total: 14 }]);

    const res = await request(app).get(`/api/v1/reviews/summary?productIds=${a},not-an-id`);

    expect(res.status).toBe(200);
    expect(res.body.ratings).toEqual({ [String(a)]: { average: 4.7, count: 3 } });
    const match = Review.aggregate.mock.calls[0][0][0].$match;
    expect(match.isApproved).toBe(true);
    expect(match.productId.$in).toHaveLength(1);
  });

  it('answers an empty map without touching the database when no id is valid, and 400 without the parameter', async () => {
    const res = await request(app).get('/api/v1/reviews/summary?productIds=nope');
    expect(res.body.ratings).toEqual({});
    expect(Review.aggregate).not.toHaveBeenCalled();
    expect((await request(app).get('/api/v1/reviews/summary')).status).toBe(400);
  });
});

describe('POST /api/v1/reviews', () => {
  const productId = oid();
  const orderId = oid();
  const body = { orderId: String(orderId), productId: String(productId), rating: 5, title: 'Great', comment: 'Really good cloth.' };
  const delivered = (customerId) => ({ _id: orderId, customerId, brandId, orderStatus: 'DELIVERED', items: [{ productId }] });

  it('posts a verified review: the brand comes from the order and it is shown straight away', async () => {
    const { user, cookie } = asRole(ROLES.CUSTOMER);
    Order.findOne.mockResolvedValue(delivered(user._id));
    Review.create.mockImplementation(async (doc) => ({ _id: oid(), ...doc }));

    const res = await request(app).post('/api/v1/reviews').set(...cookie).send({ ...body, brandId: String(oid()), isApproved: false });

    expect(res.status).toBe(201);
    expect(Order.findOne).toHaveBeenCalledWith({ _id: String(orderId), customerId: user._id });
    const saved = Review.create.mock.calls[0][0];
    expect(String(saved.brandId)).toBe(String(brandId)); // not the one the client sent
    expect(saved.isApproved).toBe(true);
    expect(saved.customerId).toBe(user._id);
    expect(saved).toMatchObject({ rating: 5, title: 'Great', comment: 'Really good cloth.' });
  });

  it('refuses an order that is not the customer\'s own (404)', async () => {
    const { cookie } = asRole(ROLES.CUSTOMER);
    Order.findOne.mockResolvedValue(null);
    expect((await request(app).post('/api/v1/reviews').set(...cookie).send(body)).status).toBe(404);
    expect(Review.create).not.toHaveBeenCalled();
  });

  it('refuses an order that has not been delivered yet', async () => {
    const { user, cookie } = asRole(ROLES.CUSTOMER);
    Order.findOne.mockResolvedValue({ ...delivered(user._id), orderStatus: 'SHIPPED' });
    const res = await request(app).post('/api/v1/reviews').set(...cookie).send(body);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ORDER_NOT_DELIVERED');
  });

  it('refuses a product that was not in the order', async () => {
    const { user, cookie } = asRole(ROLES.CUSTOMER);
    Order.findOne.mockResolvedValue({ ...delivered(user._id), items: [{ productId: oid() }] });
    const res = await request(app).post('/api/v1/reviews').set(...cookie).send(body);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PRODUCT_NOT_IN_ORDER');
  });

  it('turns the database\'s duplicate error into a clear 409', async () => {
    const { user, cookie } = asRole(ROLES.CUSTOMER);
    Order.findOne.mockResolvedValue(delivered(user._id));
    Review.create.mockRejectedValue(Object.assign(new Error('E11000 duplicate key'), { code: 11000 }));
    const res = await request(app).post('/api/v1/reviews').set(...cookie).send(body);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ALREADY_REVIEWED');
  });

  it('validates the rating and the text', async () => {
    const { cookie } = asRole(ROLES.CUSTOMER);
    for (const bad of [{ rating: 6 }, { rating: 0 }, { rating: 3.5 }, { rating: '5' }, { orderId: 'x' }, { comment: 'x'.repeat(2001) }, { title: 'x'.repeat(101) }]) {
      expect((await request(app).post('/api/v1/reviews').set(...cookie).send({ ...body, ...bad })).status).toBe(400);
    }
  });

  it('is for customers only', async () => {
    expect((await request(app).post('/api/v1/reviews').send(body)).status).toBe(401);
    for (const role of [ROLES.BRAND_ADMIN, ROLES.SUPER_ADMIN]) {
      expect((await request(app).post('/api/v1/reviews').set(...asRole(role).cookie).send(body)).status).toBe(403);
    }
  });
});

describe('a customer\'s own reviews', () => {
  it('lists only their own, optionally for one order', async () => {
    const { user, cookie } = asRole(ROLES.CUSTOMER);
    const orderId = oid();
    Review.find.mockReturnValue({ sort: () => ({ limit: () => Promise.resolve([{ _id: oid(), rating: 4 }]) }) });

    const res = await request(app).get(`/api/v1/reviews/mine?orderId=${orderId}`).set(...cookie);

    expect(res.status).toBe(200);
    expect(Review.find).toHaveBeenCalledWith({ customerId: user._id, orderId: String(orderId) });
    expect(res.body.reviews).toHaveLength(1);
  });

  it('edits only their own review and nothing else', async () => {
    const { user, cookie } = asRole(ROLES.CUSTOMER);
    const id = oid();
    Review.findOneAndUpdate.mockResolvedValue({ _id: id, rating: 3 });

    const res = await request(app).patch(`/api/v1/reviews/${id}`).set(...cookie).send({ rating: 3, isApproved: true, brandId: String(oid()) });

    expect(res.status).toBe(200);
    const [filter, update] = Review.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ _id: String(id), customerId: user._id });
    expect(update.$set).toEqual({ rating: 3 }); // unknown fields are dropped, so isApproved cannot be self-set
  });

  it('answers 404 for someone else\'s review, and 400 for an empty or invalid edit', async () => {
    const { cookie } = asRole(ROLES.CUSTOMER);
    const id = oid();
    Review.findOneAndUpdate.mockResolvedValue(null);
    expect((await request(app).patch(`/api/v1/reviews/${id}`).set(...cookie).send({ rating: 2 })).status).toBe(404);
    expect((await request(app).patch(`/api/v1/reviews/${id}`).set(...cookie).send({})).status).toBe(400);
    expect((await request(app).patch(`/api/v1/reviews/${id}`).set(...cookie).send({ rating: 9 })).status).toBe(400);
  });

  it('deletes only their own review', async () => {
    const { user, cookie } = asRole(ROLES.CUSTOMER);
    const id = oid();
    Review.findOneAndDelete.mockResolvedValue({ _id: id });
    expect((await request(app).delete(`/api/v1/reviews/${id}`).set(...cookie)).status).toBe(200);
    expect(Review.findOneAndDelete).toHaveBeenCalledWith({ _id: String(id), customerId: user._id });

    Review.findOneAndDelete.mockResolvedValue(null);
    expect((await request(app).delete(`/api/v1/reviews/${id}`).set(...cookie)).status).toBe(404);
  });
});

describe('GET /api/v1/reviews/brand (dashboard)', () => {
  function brandData() {
    const customerId = oid();
    const productId = oid();
    mockFind([{ _id: oid(), customerId, productId, rating: 4, title: 'Good', comment: 'Nice.', createdAt: new Date() }]);
    Review.countDocuments.mockResolvedValue(1);
    Review.aggregate.mockResolvedValue([{ _id: 4, count: 1 }]);
    User.find.mockReturnValue({ select: () => Promise.resolve([{ _id: customerId, name: 'Ali Raza' }]) });
    Product.find.mockReturnValue({ select: () => Promise.resolve([{ _id: productId, name: 'Linen Kurta' }]) });
  }

  it('shows a brand its OWN approved reviews with product names, ignoring a brandId in the request', async () => {
    const { cookie } = asRole(ROLES.BRAND_ADMIN);
    brandData();

    const res = await request(app).get(`/api/v1/reviews/brand?brandId=${oid()}&rating=4`).set(...cookie);

    expect(res.status).toBe(200);
    const filter = Review.find.mock.calls[0][0];
    expect(String(filter.brandId)).toBe(String(brandId));
    expect(filter.isApproved).toBe(true);
    expect(filter.rating).toBe(4);
    expect(res.body.reviews[0]).toMatchObject({ productName: 'Linen Kurta', reviewerName: 'Ali R.' });
    expect(res.body.summary.count).toBe(1);
  });

  it('needs products.view for team members', async () => {
    brandData();
    const allowed = asRole(ROLES.BRAND_EMPLOYEE, [PERMISSIONS.PRODUCTS_VIEW]);
    expect((await request(app).get('/api/v1/reviews/brand').set(...allowed.cookie)).status).toBe(200);

    const denied = asRole(ROLES.BRAND_EMPLOYEE, [PERMISSIONS.ORDERS_VIEW]);
    const res = await request(app).get('/api/v1/reviews/brand').set(...denied.cookie);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERMISSION_DENIED');
  });

  it('is closed to guests and customers, and to the super admin (no brand)', async () => {
    expect((await request(app).get('/api/v1/reviews/brand')).status).toBe(401);
    expect((await request(app).get('/api/v1/reviews/brand').set(...asRole(ROLES.CUSTOMER).cookie)).status).toBe(403);
    const admin = await request(app).get('/api/v1/reviews/brand').set(...asRole(ROLES.SUPER_ADMIN).cookie);
    expect(admin.status).toBe(403);
    expect(admin.body.code).toBe('NO_BRAND');
  });
});

describe('super admin moderation', () => {
  it('lists every review (hidden ones too) with names, and filters', async () => {
    const { cookie } = asRole(ROLES.SUPER_ADMIN);
    const customerId = oid();
    const otherBrand = oid();
    const productId = oid();
    mockFind([{ _id: oid(), customerId, brandId: otherBrand, productId, rating: 1, isApproved: false }]);
    Review.countDocuments.mockResolvedValue(1);
    User.find.mockReturnValue({ select: () => Promise.resolve([{ _id: customerId, name: 'Hina Malik' }]) });
    Brand.find.mockReturnValue({ select: () => Promise.resolve([{ _id: otherBrand, name: 'Quick Cart Deals' }]) });
    Product.find.mockReturnValue({ select: () => Promise.resolve([{ _id: productId, name: 'Lunch Box' }]) });

    const res = await request(app).get(`/api/v1/admin/reviews?approved=false&rating=1&brandId=${otherBrand}`).set(...cookie);

    expect(res.status).toBe(200);
    const filter = Review.find.mock.calls[0][0];
    expect(filter.isApproved).toBe(false);
    expect(filter.rating).toBe(1);
    expect(res.body.reviews[0]).toMatchObject({ customerName: 'Hina Malik', brandName: 'Quick Cart Deals', productName: 'Lunch Box', isApproved: false });
  });

  it('hides and shows a review, and answers 404 / 400 correctly', async () => {
    const { cookie } = asRole(ROLES.SUPER_ADMIN);
    const id = oid();
    Review.findByIdAndUpdate.mockResolvedValue({ _id: id, isApproved: false });

    const hidden = await request(app).patch(`/api/v1/admin/reviews/${id}`).set(...cookie).send({ isApproved: false });
    expect(hidden.status).toBe(200);
    expect(hidden.body.message).toBe('Review hidden');
    expect(Review.findByIdAndUpdate).toHaveBeenCalledWith(String(id), { $set: { isApproved: false } }, { new: true });

    Review.findByIdAndUpdate.mockResolvedValue(null);
    expect((await request(app).patch(`/api/v1/admin/reviews/${id}`).set(...cookie).send({ isApproved: true })).status).toBe(404);
    expect((await request(app).patch(`/api/v1/admin/reviews/${id}`).set(...cookie).send({ isApproved: 'yes' })).status).toBe(400);
  });

  it('is closed to everyone but the super admin', async () => {
    expect((await request(app).get('/api/v1/admin/reviews')).status).toBe(401);
    for (const role of [ROLES.CUSTOMER, ROLES.BRAND_ADMIN, ROLES.BRAND_EMPLOYEE]) {
      expect((await request(app).get('/api/v1/admin/reviews').set(...asRole(role).cookie)).status).toBe(403);
    }
    expect((await request(app).patch(`/api/v1/admin/reviews/${oid()}`).set(...asRole(ROLES.BRAND_ADMIN).cookie).send({ isApproved: false })).status).toBe(403);
  });
});