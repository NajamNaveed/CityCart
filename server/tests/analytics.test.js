const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/user.model');
jest.mock('../src/models/employee.model');
jest.mock('../src/models/brand.model');
jest.mock('../src/models/delivery.model');
jest.mock('../src/models/inventory.model');
jest.mock('../src/models/order.model');
jest.mock('../src/models/platformSettings.model');
jest.mock('../src/models/product.model');

const User = require('../src/models/user.model');
const Employee = require('../src/models/employee.model');
const Brand = require('../src/models/brand.model');
const Delivery = require('../src/models/delivery.model');
const Inventory = require('../src/models/inventory.model');
const Order = require('../src/models/order.model');
const PlatformSettings = require('../src/models/platformSettings.model');
const Product = require('../src/models/product.model');
const app = require('../src/app');
const { ROLES } = require('../src/config/roles');
const { getAuthCookie } = require('./helpers/testAuth');

function makeUser(role, extra = {}) {
  return { _id: new mongoose.Types.ObjectId(), role, isActive: true, ...extra };
}

function asUser(user) {
  User.findById.mockResolvedValue(user);
  return ['Cookie', getAuthCookie(user)];
}

beforeEach(() => jest.clearAllMocks());

describe('Brand analytics', () => {
  it('scopes aggregations to the authenticated brand and returns aggregated data', async () => {
    const brandId = new mongoose.Types.ObjectId();
    const admin = makeUser(ROLES.BRAND_ADMIN, { brandId });
    Order.aggregate.mockResolvedValueOnce([
      {
        summary: [{ orders: 2, deliveredOrders: 1, cancelledOrders: 0, pendingOrders: 1, revenue: 1250 }],
        statuses: [{ _id: 'PENDING', count: 1 }, { _id: 'DELIVERED', count: 1 }],
        salesTrend: [{ date: '2026-10-01', orders: 1, revenue: 1250 }],
        topProducts: [{ productName: 'Tea', unitsSold: 2, revenue: 1250 }],
        productsSold: [{ units: 2 }],
        customers: [{ customers: 1, repeatCustomers: 0 }],
      },
    ]);
    Inventory.aggregate.mockResolvedValueOnce([{ counts: [{ _id: 'LOW_STOCK', count: 1 }], alerts: [] }]);
    Delivery.aggregate.mockResolvedValueOnce([{ _id: 'PENDING', count: 1 }]);

    const res = await request(app).get('/api/v1/brand/analytics?from=2026-10-01&to=2026-10-07').set(...asUser(admin));

    expect(res.status).toBe(200);
    expect(res.body.analytics.summary).toMatchObject({ orders: 2, revenue: 1250, averageOrderValue: 1250, lowStockProducts: 1 });
    expect(res.body.analytics.topProducts[0].productName).toBe('Tea');
    const match = Order.aggregate.mock.calls[0][0][0].$match;
    expect(match.brandId).toEqual(brandId);
    expect(match.createdAt.$gte.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(match.createdAt.$lt.toISOString()).toBe('2026-10-08T00:00:00.000Z');
    expect(Inventory.aggregate.mock.calls[0][0][0].$match.brandId).toEqual(brandId);
    expect(Delivery.aggregate.mock.calls[0][0][0].$match.brandId).toEqual(brandId);
  });

  it('requires analytics.view from brand employees', async () => {
    const employeeUser = makeUser(ROLES.BRAND_EMPLOYEE, { brandId: new mongoose.Types.ObjectId() });
    User.findById.mockResolvedValue(employeeUser);
    Employee.findOne.mockResolvedValue({ isActive: true, permissions: [] });

    const res = await request(app).get('/api/v1/analytics/brand').set(...asUser(employeeUser));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERMISSION_DENIED');
    expect(Order.aggregate).not.toHaveBeenCalled();
  });

  it('allows a permitted employee but rejects client-supplied tenant filters', async () => {
    const brandId = new mongoose.Types.ObjectId();
    const employeeUser = makeUser(ROLES.BRAND_EMPLOYEE, { brandId });
    User.findById.mockResolvedValue(employeeUser);
    Employee.findOne.mockResolvedValue({ isActive: true, permissions: ['analytics.view'] });
    Order.aggregate.mockResolvedValueOnce([{}]);
    Inventory.aggregate.mockResolvedValueOnce([{}]);
    Delivery.aggregate.mockResolvedValueOnce([]);

    const allowed = await request(app).get('/api/v1/analytics/brand').set(...asUser(employeeUser));
    expect(allowed.status).toBe(200);
    expect(Order.aggregate.mock.calls[0][0][0].$match.brandId).toEqual(brandId);

    const spoofed = await request(app)
      .get(`/api/v1/analytics/brand?brandId=${new mongoose.Types.ObjectId()}`)
      .set(...asUser(employeeUser));
    expect(spoofed.status).toBe(400);
    expect(Order.aggregate).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid or reversed date ranges', async () => {
    const admin = makeUser(ROLES.BRAND_ADMIN, { brandId: new mongoose.Types.ObjectId() });
    const cookie = asUser(admin);
    const invalid = await request(app).get('/api/v1/brand/analytics?from=not-a-date').set(...cookie);
    const reversed = await request(app).get('/api/v1/brand/analytics?from=2026-10-08&to=2026-10-01').set(...cookie);

    expect(invalid.status).toBe(400);
    expect(reversed.status).toBe(400);
    expect(Order.aggregate).not.toHaveBeenCalled();
  });
});

describe('Platform analytics', () => {
  it('is restricted to super admins and computes platform commission as an estimate', async () => {
    const customer = makeUser(ROLES.CUSTOMER);
    const denied = await request(app).get('/api/v1/admin/analytics').set(...asUser(customer));
    expect(denied.status).toBe(403);

    const admin = makeUser(ROLES.SUPER_ADMIN);
    Brand.countDocuments.mockResolvedValueOnce(5).mockResolvedValueOnce(4);
    User.countDocuments.mockResolvedValue(100);
    Product.countDocuments.mockResolvedValue(30);
    PlatformSettings.findOne.mockResolvedValue({ commissionRate: 10 });
    Order.aggregate.mockResolvedValueOnce([
      {
        summary: [{ orders: 20, deliveredOrders: 12, cancelledOrders: 2, gmv: 25000 }],
        statuses: [{ _id: 'DELIVERED', count: 12 }],
        growthTrend: [{ date: '2026-10-01', orders: 3, gmv: 5000 }],
        ordersByCity: [{ city: 'Lahore', orders: 8, gmv: 18000 }],
        topBrands: [{ brandName: 'Market One', orders: 4, gmv: 12000 }],
      },
    ]);
    Brand.aggregate.mockResolvedValue([{ _id: '2026-10-02', count: 1 }]);
    User.aggregate.mockResolvedValue([{ _id: '2026-10-01', count: 2 }]);

    const res = await request(app).get('/api/v1/admin/analytics?from=2026-10-01&to=2026-10-07').set(...asUser(admin));

    expect(res.status).toBe(200);
    expect(res.body.analytics.summary).toMatchObject({ brands: 5, activeBrands: 4, customers: 100, products: 30, gmv: 25000, estimatedCommission: 2500 });
    expect(res.body.analytics.growthTrend[0]).toMatchObject({ date: '2026-10-01', newBrands: 0, newCustomers: 2 });
    expect(res.body.analytics.growthTrend[1]).toMatchObject({ date: '2026-10-02', orders: 0, newBrands: 1 });
    expect(res.body.analytics.ordersByCity[0].city).toBe('Lahore');
  });
});