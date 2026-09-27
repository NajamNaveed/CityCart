process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-production';

const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');

// Employee is mocked so these tests never require a live MongoDB
// connection, consistent with the Phase 3 auth test strategy
// (tests/auth.test.js).
jest.mock('../src/models/employee.model');

const Employee = require('../src/models/employee.model');
const requireRole = require('../src/middleware/requireRole');
const requirePermission = require('../src/middleware/requirePermission');
const { ROLES } = require('../src/config/roles');
const { PERMISSIONS } = require('../src/config/permissions');
const { PRIVILEGED_USER_FIELDS, stripPrivilegedFields } = require('../src/utils/privilegedFields');

function makeFakeUser(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    role: ROLES.CUSTOMER,
    brandId: undefined,
    isActive: true,
    ...overrides,
  };
}

/**
 * Builds a tiny isolated Express app for testing requireRole/
 * requirePermission directly, without going through the real
 * `authenticate` middleware/JWT/cookies (those are already covered by
 * tests/auth.test.js). `user` is injected straight onto req.user, the
 * same shape `authenticate` attaches in production.
 */
function buildTestApp(user, middleware) {
  const app = express();
  app.use((req, res, next) => {
    req.user = user;
    next();
  });
  app.get('/protected', middleware, (req, res) => {
    res.status(200).json({ success: true });
  });
  return app;
}

function buildUnauthenticatedTestApp(middleware) {
  const app = express();
  // No req.user assigned at all — simulates a request that reached this
  // middleware without going through `authenticate` first.
  app.get('/protected', middleware, (req, res) => {
    res.status(200).json({ success: true });
  });
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('requireRole', () => {
  it('rejects an unauthenticated request (no req.user) with 401', async () => {
    const app = buildUnauthenticatedTestApp(requireRole(ROLES.SUPER_ADMIN));
    const res = await request(app).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('allows a user whose role is in the allowed list', async () => {
    const app = buildTestApp(
      makeFakeUser({ role: ROLES.SUPER_ADMIN }),
      requireRole(ROLES.SUPER_ADMIN)
    );
    const res = await request(app).get('/protected');
    expect(res.status).toBe(200);
  });

  it('denies a user whose role is not in the allowed list, with 403', async () => {
    const app = buildTestApp(
      makeFakeUser({ role: ROLES.CUSTOMER }),
      requireRole(ROLES.SUPER_ADMIN, ROLES.BRAND_ADMIN)
    );
    const res = await request(app).get('/protected');
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });
});

describe('requirePermission', () => {
  it('rejects an unauthenticated request (no req.user) with 401', async () => {
    const app = buildUnauthenticatedTestApp(requirePermission(PERMISSIONS.PRODUCTS_VIEW));
    const res = await request(app).get('/protected');
    expect(res.status).toBe(401);
  });

  it('allows a BRAND_EMPLOYEE with the required permission', async () => {
    Employee.findOne.mockResolvedValue({
      isActive: true,
      permissions: [PERMISSIONS.PRODUCTS_VIEW, PERMISSIONS.ORDERS_VIEW],
    });
    const app = buildTestApp(
      makeFakeUser({ role: ROLES.BRAND_EMPLOYEE }),
      requirePermission(PERMISSIONS.PRODUCTS_VIEW)
    );

    const res = await request(app).get('/protected');
    expect(res.status).toBe(200);
  });

  it('denies a BRAND_EMPLOYEE missing the required permission', async () => {
    Employee.findOne.mockResolvedValue({
      isActive: true,
      permissions: [PERMISSIONS.PRODUCTS_VIEW],
    });
    const app = buildTestApp(
      makeFakeUser({ role: ROLES.BRAND_EMPLOYEE }),
      requirePermission(PERMISSIONS.PRODUCTS_DELETE)
    );

    const res = await request(app).get('/protected');
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('denies a BRAND_EMPLOYEE with no Employee record at all', async () => {
    Employee.findOne.mockResolvedValue(null);
    const app = buildTestApp(
      makeFakeUser({ role: ROLES.BRAND_EMPLOYEE }),
      requirePermission(PERMISSIONS.PRODUCTS_VIEW)
    );

    const res = await request(app).get('/protected');
    expect(res.status).toBe(403);
  });

  it('denies a BRAND_EMPLOYEE whose Employee record is inactive, even with a matching permission', async () => {
    Employee.findOne.mockResolvedValue({
      isActive: false,
      permissions: [PERMISSIONS.PRODUCTS_VIEW],
    });
    const app = buildTestApp(
      makeFakeUser({ role: ROLES.BRAND_EMPLOYEE }),
      requirePermission(PERMISSIONS.PRODUCTS_VIEW)
    );

    const res = await request(app).get('/protected');
    expect(res.status).toBe(403);
  });

  it('never allows a CUSTOMER to use an employee/admin permission', async () => {
    const app = buildTestApp(
      makeFakeUser({ role: ROLES.CUSTOMER }),
      requirePermission(PERMISSIONS.PRODUCTS_VIEW)
    );

    const res = await request(app).get('/protected');
    expect(res.status).toBe(403);
    // A customer should never even trigger an Employee lookup.
    expect(Employee.findOne).not.toHaveBeenCalled();
  });

  it('always allows BRAND_ADMIN regardless of any permission list (full access per §11)', async () => {
    const app = buildTestApp(
      makeFakeUser({ role: ROLES.BRAND_ADMIN }),
      requirePermission(PERMISSIONS.EMPLOYEES_DELETE)
    );

    const res = await request(app).get('/protected');
    expect(res.status).toBe(200);
    // Brand Admins are never checked against the Employee collection —
    // they aren't granted permissions individually (§8, §9).
    expect(Employee.findOne).not.toHaveBeenCalled();
  });

  it('always allows SUPER_ADMIN regardless of any permission list (platform-wide per §7)', async () => {
    const app = buildTestApp(
      makeFakeUser({ role: ROLES.SUPER_ADMIN }),
      requirePermission(PERMISSIONS.EMPLOYEES_MANAGE_PERMISSIONS)
    );

    const res = await request(app).get('/protected');
    expect(res.status).toBe(200);
    expect(Employee.findOne).not.toHaveBeenCalled();
  });
});

describe('privilege-escalation protection (role/brandId/permissions/isActive)', () => {
  it('strips role, brandId, permissions, and isActive from a spoofed update payload', () => {
    const maliciousPayload = {
      name: 'New Name',
      role: 'SUPER_ADMIN',
      brandId: new mongoose.Types.ObjectId().toString(),
      permissions: ['employees.manage_permissions'],
      isActive: false,
      phone: '+15551234567',
    };

    const safe = stripPrivilegedFields(maliciousPayload);

    for (const field of PRIVILEGED_USER_FIELDS) {
      expect(safe).not.toHaveProperty(field);
    }
    // Legitimate fields survive untouched.
    expect(safe).toEqual({ name: 'New Name', phone: '+15551234567' });
  });

  it('does not mutate the original payload', () => {
    const original = { name: 'A', role: 'SUPER_ADMIN' };
    stripPrivilegedFields(original);
    expect(original).toEqual({ name: 'A', role: 'SUPER_ADMIN' });
  });

  it('an employee cannot grant themselves extra permissions via stripped input', () => {
    // Simulates an employee submitting a request body that tries to add
    // employees.manage_permissions to their own permission set (§18 —
    // "An employee must not be able to assign permissions to
    // themselves"). Once permissions is stripped, nothing in the
    // sanitized payload can reach Employee.permissions.
    const employeeSelfEscalationAttempt = {
      jobTitle: 'Cashier',
      permissions: [PERMISSIONS.EMPLOYEES_MANAGE_PERMISSIONS],
    };

    const safe = stripPrivilegedFields(employeeSelfEscalationAttempt);
    expect(safe).toEqual({ jobTitle: 'Cashier' });
  });
});