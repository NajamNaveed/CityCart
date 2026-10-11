const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/user.model');
jest.mock('../src/models/employee.model');
jest.mock('../src/models/inventory.model', () => require('./helpers/fakeInventoryStore').createFakeInventoryModel());
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
jest.mock('../src/services/notification.service');

const User = require('../src/models/user.model');
const Employee = require('../src/models/employee.model');
const Inventory = require('../src/models/inventory.model');
const Product = require('../src/models/product.model');
const app = require('../src/app');
const { ROLES } = require('../src/config/roles');
const { PERMISSIONS } = require('../src/config/permissions');
const { getAuthCookie } = require('./helpers/testAuth');

function oid() {
  return new mongoose.Types.ObjectId();
}

function user(role, brandId) {
  return { _id: oid(), role, brandId, isActive: true };
}

function asUser(currentUser) {
  User.findById.mockResolvedValue(currentUser);
  return ['Cookie', getAuthCookie(currentUser)];
}

function product(brandId) {
  return { _id: oid(), brandId, name: 'Sample product' };
}

beforeEach(() => {
  jest.clearAllMocks();
  Inventory.__reset();
  User.find.mockReturnValue({ select: jest.fn().mockResolvedValue([]) });
  Employee.find.mockReturnValue({ select: jest.fn().mockResolvedValue([]) });
});

describe('PATCH /api/v1/inventory/batch', () => {
  it('updates multiple stock rows using the authenticated brand scope', async () => {
    const brandId = oid();
    const currentUser = user(ROLES.BRAND_ADMIN, brandId);
    const first = product(brandId);
    const second = product(brandId);
    Product.find.mockResolvedValue([first, second]);
    Inventory.__seed({ brandId, productId: first._id, quantity: 4, reservedQuantity: 0, lowStockThreshold: 1, trackInventory: true });
    Inventory.__seed({ brandId, productId: second._id, quantity: 8, reservedQuantity: 2, lowStockThreshold: 3, trackInventory: true });

    const res = await request(app)
      .patch('/api/v1/inventory/batch')
      .set(...asUser(currentUser))
      .send({ updates: [
        { productId: first._id.toString(), quantity: 12, lowStockThreshold: 4 },
        { productId: second._id.toString(), quantity: 10 },
      ] });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ updatedCount: 2, failedCount: 0 });
    expect(Inventory.__get(first._id)).toMatchObject({ quantity: 12, lowStockThreshold: 4 });
    expect(Inventory.__get(second._id)).toMatchObject({ quantity: 10, reservedQuantity: 2 });
    expect(Product.find).toHaveBeenCalledWith({ _id: { $in: [first._id.toString(), second._id.toString()] }, brandId: brandId.toString() });
  });

  it('rejects a product outside the authenticated brand before making any stock changes', async () => {
    const brandId = oid();
    const otherBrandId = oid();
    const currentUser = user(ROLES.BRAND_ADMIN, brandId);
    const otherProduct = product(otherBrandId);
    Product.find.mockResolvedValue([]);

    const res = await request(app)
      .patch('/api/v1/inventory/batch')
      .set(...asUser(currentUser))
      .send({ updates: [{ productId: otherProduct._id.toString(), quantity: 5 }] });

    expect(res.status).toBe(404);
    expect(Inventory.__count()).toBe(0);
    expect(Product.find).toHaveBeenCalledWith({ _id: { $in: [otherProduct._id.toString()] }, brandId: brandId.toString() });
  });

  it('requires inventory.manage from brand employees', async () => {
    const brandId = oid();
    const employeeUser = user(ROLES.BRAND_EMPLOYEE, brandId);
    User.findById.mockResolvedValue(employeeUser);
    Employee.findOne.mockResolvedValue({ isActive: true, permissions: [PERMISSIONS.INVENTORY_VIEW] });

    const res = await request(app)
      .patch('/api/v1/inventory/batch')
      .set(...asUser(employeeUser))
      .send({ updates: [{ productId: oid().toString(), quantity: 5 }] });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERMISSION_DENIED');
    expect(Product.find).not.toHaveBeenCalled();
  });

  it('rejects duplicate products and client-supplied ownership fields', async () => {
    const currentUser = user(ROLES.BRAND_ADMIN, oid());
    const productId = oid().toString();
    const cookie = asUser(currentUser);
    const duplicate = await request(app)
      .patch('/api/v1/inventory/batch')
      .set(...cookie)
      .send({ updates: [{ productId, quantity: 2 }, { productId, quantity: 4 }] });
    const spoofed = await request(app)
      .patch('/api/v1/inventory/batch')
      .set(...cookie)
      .send({ brandId: oid().toString(), updates: [{ productId: oid().toString(), quantity: 2 }] });

    expect(duplicate.status).toBe(400);
    expect(spoofed.status).toBe(400);
    expect(Product.find).not.toHaveBeenCalled();
  });
});