const User = require('../models/user.model');
const Employee = require('../models/employee.model');
const Brand = require('../models/brand.model');
const { hashPassword } = require('../utils/password');
const { runInTransaction } = require('../utils/transaction');
const { ROLES } = require('../config/roles');
const { ALL_PERMISSIONS } = require('../config/permissions');
const { notifyEmployeeCreated, notifyEmployeePermissionsChanged } = require('./notification.service');

const DEFAULT_LIMIT = 20;

class EmployeeError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

// brandId === null means platform-wide (SUPER_ADMIN); brand users always
// arrive with their own tenant brandId from requireTenant.
const scoped = (brandId, id) => ({ _id: id, ...(brandId && { brandId }) });

/**
 * What the acting user is allowed to grant/revoke (docs/02 §18):
 * SUPER_ADMIN and BRAND_ADMIN hold everything for their scope; an employee
 * can only manage permissions they hold themselves.
 */
function actorPermissionsFor(user, employeeRecord) {
  if (user.role === ROLES.SUPER_ADMIN || user.role === ROLES.BRAND_ADMIN) {
    return ALL_PERMISSIONS;
  }
  return employeeRecord ? employeeRecord.permissions : [];
}

function assertCanManage(actorPermissions, permissions) {
  const forbidden = permissions.filter((p) => !actorPermissions.includes(p));
  if (forbidden.length > 0) {
    throw new EmployeeError(403, 'You cannot assign or revoke permissions you do not hold.', {
      code: 'PERMISSION_ESCALATION',
      permissions: forbidden,
    });
  }
}

function serialize(employee, user) {
  return {
    _id: employee._id,
    brandId: employee.brandId,
    jobTitle: employee.jobTitle,
    permissions: employee.permissions,
    isActive: employee.isActive,
    createdAt: employee.createdAt,
    user: user
      ? { _id: user._id, name: user.name, email: user.email, phone: user.phone, isActive: user.isActive }
      : { _id: employee.userId },
  };
}

async function listEmployees({ brandId, isActive, page, limit } = {}) {
  const filter = brandId ? { brandId } : {};
  if (isActive !== undefined) filter.isActive = isActive;
  const pageNumber = page || 1;
  const limitNumber = limit || DEFAULT_LIMIT;

  const [employees, total] = await Promise.all([
    Employee.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber),
    Employee.countDocuments(filter),
  ]);
  const users = employees.length ? await User.find({ _id: { $in: employees.map((e) => e.userId) } }) : [];
  const userById = new Map(users.map((u) => [String(u._id), u]));

  return {
    items: employees.map((e) => serialize(e, userById.get(String(e.userId)))),
    pagination: { page: pageNumber, limit: limitNumber, total, pages: Math.ceil(total / limitNumber) },
  };
}

// Another brand's employee is a 404 (not 403) so ids can't be probed.
async function getEmployee({ brandId, id }) {
  const employee = await Employee.findOne(scoped(brandId, id));
  if (!employee) {
    throw new EmployeeError(404, 'Employee not found.');
  }
  return serialize(employee, await User.findById(employee.userId));
}

/**
 * Creates the login (User, role BRAND_EMPLOYEE, in the brand) and the
 * Employee record together, in one transaction. brandId comes from the
 * caller's tenant (never a brand admin's body); initial permissions obey the
 * same no-escalation rule as later changes.
 */
async function createEmployee({ brandId, actorPermissions, data }) {
  const permissions = data.permissions || [];
  assertCanManage(actorPermissions, permissions);

  const brand = await Brand.findById(brandId);
  if (!brand) {
    throw new EmployeeError(404, 'Brand not found.');
  }
  if (brand.status === 'TERMINATED') {
    throw new EmployeeError(409, 'A terminated brand cannot add employees.', { code: 'BRAND_TERMINATED' });
  }
  const passwordHash = await hashPassword(data.password); // slow: outside the transaction

  try {
    const created = await runInTransaction(async (session) => {
      if (await User.findOne({ email: data.email }).session(session)) {
        throw new EmployeeError(409, 'Email is already registered.');
      }
      const [user] = await User.create(
        [{ name: data.name, email: data.email, passwordHash, role: ROLES.BRAND_EMPLOYEE, brandId, phone: data.phone }],
        { session }
      );
      const [employee] = await Employee.create(
        [{ userId: user._id, brandId, permissions, jobTitle: data.jobTitle }],
        { session }
      );
      return serialize(employee, user);
    });
    // The new login learns about their account once it truly exists
    // (post-commit); failures are swallowed inside the notification service.
    await notifyEmployeeCreated({
      userId: created.user._id,
      brandId,
      brandName: brand.name,
      jobTitle: created.jobTitle,
    });
    return created;
  } catch (err) {
    if (err.code === 11000) {
      throw new EmployeeError(409, 'Email is already registered.');
    }
    throw err;
  }
}

/**
 * Updates profile fields and/or activates/deactivates. Activation is kept on
 * BOTH the Employee and the User so a deactivated employee can no longer
 * authenticate at all. Acting on yourself is refused (docs/02 §18), and the
 * User update is guarded by role + brand so it can never touch an admin.
 */
async function updateEmployee({ brandId, id, actorUserId, data }) {
  return runInTransaction(async (session) => {
    const employeeFields = {};
    if (data.jobTitle !== undefined) employeeFields.jobTitle = data.jobTitle;
    if (data.isActive !== undefined) employeeFields.isActive = data.isActive;
    const userFields = {};
    if (data.name !== undefined) userFields.name = data.name;
    if (data.phone !== undefined) userFields.phone = data.phone;
    if (data.isActive !== undefined) userFields.isActive = data.isActive;

    const employee = await Employee.findOneAndUpdate(
      { ...scoped(brandId, id), userId: { $ne: actorUserId } },
      { $set: employeeFields },
      { new: true, session }
    );
    if (!employee) {
      const existing = await Employee.findOne(scoped(brandId, id)).session(session);
      if (!existing) {
        throw new EmployeeError(404, 'Employee not found.');
      }
      throw new EmployeeError(403, 'You cannot modify your own employee account.', { code: 'SELF_MODIFICATION' });
    }

    const user = await User.findOneAndUpdate(
      { _id: employee.userId, role: ROLES.BRAND_EMPLOYEE, brandId: employee.brandId },
      { $set: userFields },
      { new: true, session }
    );
    return serialize(employee, user);
  });
}

/**
 * Replaces an employee's permission set (docs/05 §19, docs/02 §18):
 *  - never on yourself;
 *  - every permission being ADDED or REMOVED must be one the actor holds
 *    (so nobody can grant beyond their own authority);
 *  - optimistic: applies only if the stored set is still what was validated;
 *  - the change is logged (who/when/added/removed).
 */
async function setEmployeePermissions({ brandId, id, actorUserId, actorPermissions, permissions }) {
  const employee = await Employee.findOne(scoped(brandId, id));
  if (!employee) {
    throw new EmployeeError(404, 'Employee not found.');
  }
  if (String(employee.userId) === String(actorUserId)) {
    throw new EmployeeError(403, 'You cannot change your own permissions.', { code: 'SELF_MODIFICATION' });
  }

  const current = employee.permissions;
  const added = permissions.filter((p) => !current.includes(p));
  const removed = current.filter((p) => !permissions.includes(p));
  assertCanManage(actorPermissions, [...added, ...removed]);

  const updated = await Employee.findOneAndUpdate(
    { _id: employee._id, permissions: current },
    {
      $set: { permissions },
      $push: { permissionHistory: { $each: [{ by: actorUserId, at: new Date(), added, removed }], $slice: -50 } },
    },
    { new: true }
  );
  if (!updated) {
    throw new EmployeeError(409, 'The employee was changed by another request. Please reload and retry.', {
      code: 'EMPLOYEE_CHANGED',
    });
  }
  await notifyEmployeePermissionsChanged({ userId: updated.userId, brandId, added, removed });
  return serialize(updated, await User.findById(updated.userId));
}

module.exports = {
  listEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  setEmployeePermissions,
  actorPermissionsFor,
  EmployeeError,
};
