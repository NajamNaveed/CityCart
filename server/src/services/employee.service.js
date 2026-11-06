const User = require('../models/user.model');
const Employee = require('../models/employee.model');
const Brand = require('../models/brand.model');
const Order = require('../models/order.model');
const { hashPassword } = require('../utils/password');
const { runInTransaction } = require('../utils/transaction');
const { ROLES } = require('../config/roles');
const { ALL_PERMISSIONS } = require('../config/permissions');
const { notifyEmployeeCreated, notifyEmployeePermissionsChanged } = require('./notification.service');
const { anonymizeUser } = require('./accountAnonymization.service');
const { revokeUserDelivery } = require('./revocation.service');

const DEFAULT_LIMIT = 20;
// Orders the picker still has to finish: claiming one moves it to PROCESSING,
// and packing it moves it out of this set. Historical pickerId values remain on
// delivered orders and must not block a later removal.
const PICKER_OPEN_STATUSES = ['CONFIRMED', 'PROCESSING'];

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

// A picker holding unfinished work cannot be removed (docs/24 §3.7): the
// brand must reassign or unassign those orders first so nothing is stranded.
async function assertPickerHasNoOpenOrders({ brandId, userId, session }) {
  const openOrders = await Order.countDocuments({
    brandId,
    pickerId: userId,
    orderStatus: { $in: PICKER_OPEN_STATUSES },
  }).session(session);
  if (openOrders > 0) {
    throw new EmployeeError(
      409,
      `This picker still has ${openOrders} order${openOrders === 1 ? '' : 's'} to finish. Reassign or unassign ${openOrders === 1 ? 'it' : 'them'} first.`,
      { code: 'PICKER_HAS_OPEN_ORDERS', openOrders }
    );
  }
}

function serialize(employee, user) {
  return {
    _id: employee._id,
    brandId: employee.brandId,
    role: employee.role,
    jobTitle: employee.jobTitle,
    permissions: employee.permissions,
    isActive: employee.isActive,
    removedAt: employee.removedAt || null,
    createdAt: employee.createdAt,
    user: user
      ? { _id: user._id, name: user.name, email: user.email, phone: user.phone, role: user.role, isActive: user.isActive }
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
 * Creates the login (User, role BRAND_EMPLOYEE or PICKER, in the brand) and
 * the Employee record together, in one transaction. brandId comes from the
 * caller's tenant (never a brand admin's body); initial permissions obey the
 * same no-escalation rule as later changes.
 *
 * Only a brand admin (or the super admin) may create a picker, and a picker
 * never carries brand-team permissions — its access is the pick queue alone.
 */
async function createEmployee({ brandId, actorPermissions, actorRole, data }) {
  const role = data.role || ROLES.BRAND_EMPLOYEE;
  if (role === ROLES.PICKER && ![ROLES.BRAND_ADMIN, ROLES.SUPER_ADMIN].includes(actorRole)) {
    throw new EmployeeError(403, 'Only a brand owner can create a picker.', { code: 'PICKER_CREATE_FORBIDDEN' });
  }
  if (role === ROLES.PICKER && data.permissions && data.permissions.length > 0) {
    throw new EmployeeError(400, 'A picker does not have brand-team permissions.', {
      code: 'PICKER_NO_PERMISSIONS',
    });
  }
  const permissions = role === ROLES.PICKER ? [] : data.permissions || [];
  assertCanManage(actorPermissions, permissions);

  const brand = await Brand.findById(brandId);
  if (!brand) {
    throw new EmployeeError(404, 'Brand not found.');
  }
  if (brand.status === 'TERMINATED') {
    throw new EmployeeError(409, 'A terminated brand cannot add employees.', { code: 'BRAND_TERMINATED' });
  }
  // bcrypt is slow: do it before the transaction and only when a new
  // account is actually needed (a reused account keeps its own password).
  const passwordHash = await hashPassword(data.password);

  try {
    const created = await runInTransaction(async (session) => {
      const existing = await User.findOne({ email: data.email, accountType: 'BRAND' }).session(session);

      if (existing) {
        // Only a plain team member can join another brand (docs/24 §3.5).
        // Admins, pickers and riders stay single-brand until that policy is
        // approved; other account types never appear in this query.
        if (existing.role !== ROLES.BRAND_EMPLOYEE || role !== ROLES.BRAND_EMPLOYEE) {
          throw new EmployeeError(409, 'This email already belongs to a different kind of brand account.', {
            code: 'ACCOUNT_ROLE_CONFLICT',
          });
        }

        const previous = await Employee.findOne({ userId: existing._id, brandId }).session(session);
        if (previous && previous.isActive) {
          throw new EmployeeError(409, 'This person is already a member of your brand.', { code: 'ALREADY_MEMBER' });
        }

        let employee;
        if (previous) {
          // Re-adding after a removal reactivates the same membership and
          // resets its access (docs/24 §3.5-3.6).
          employee = await Employee.findOneAndUpdate(
            { _id: previous._id },
            {
              $set: {
                role,
                permissions,
                jobTitle: data.jobTitle,
                isActive: true,
                removedAt: null,
                removedBy: null,
                removalReason: null,
              },
            },
            { new: true, session }
          );
        } else {
          [employee] = await Employee.create(
            [{ userId: existing._id, brandId, role, permissions, jobTitle: data.jobTitle }],
            { session }
          );
        }

        // An account left inactive by an earlier removal becomes usable
        // again; its other memberships were never touched.
        const user = existing.isActive
          ? existing
          : await User.findOneAndUpdate(
              { _id: existing._id, role: ROLES.BRAND_EMPLOYEE },
              { $set: { isActive: true } },
              { new: true, session }
            );
        return serialize(employee, user);
      }

      const [user] = await User.create(
        [{ name: data.name, email: data.email, passwordHash, role, accountType: 'BRAND', brandId, phone: data.phone }],
        { session }
      );
      const [employee] = await Employee.create(
        [{ userId: user._id, brandId, role, permissions, jobTitle: data.jobTitle }],
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
 * Updates profile fields and/or activates/deactivates one membership.
 *
 * Deactivation applies to the Employee row only: the person may still work
 * for another brand, so the account itself stays active (docs/24 §3.6).
 * The profile fields live on the shared User, so those keep a role guard but
 * no brand guard (a membership's brand is not the account's owner). Acting on
 * yourself is refused (docs/02 §18).
 */
async function updateEmployee({ brandId, id, actorUserId, data }) {
  const result = await runInTransaction(async (session) => {
    const current = await Employee.findOne(scoped(brandId, id)).session(session);
    if (!current) {
      throw new EmployeeError(404, 'Employee not found.');
    }
    if (String(current.userId) === String(actorUserId)) {
      throw new EmployeeError(403, 'You cannot modify your own employee account.', { code: 'SELF_MODIFICATION' });
    }

    const employeeFields = {};
    if (data.jobTitle !== undefined) employeeFields.jobTitle = data.jobTitle;
    if (data.isActive !== undefined) {
      employeeFields.isActive = data.isActive;
      if (data.isActive) {
        // Re-activation clears the removal trail.
        employeeFields.removedAt = null;
        employeeFields.removedBy = null;
        employeeFields.removalReason = null;
      } else {
        employeeFields.removedAt = new Date();
        employeeFields.removedBy = actorUserId || null;
        employeeFields.removalReason = data.removalReason || null;
      }
    }
    // A picker is a single-brand account: removing the membership must stop
    // the login too, otherwise the removed picker could keep using the Staff
    // app. Unfinished picking blocks the removal first (docs/24 §3.7).
    if (data.isActive === false && current.role === ROLES.PICKER) {
      await assertPickerHasNoOpenOrders({ brandId: current.brandId, userId: current.userId, session });
    }

    const userFields = {};
    if (data.name !== undefined) userFields.name = data.name;
    if (data.phone !== undefined) userFields.phone = data.phone;
    if (data.isActive === true) userFields.isActive = true;
    if (data.isActive === false && current.role === ROLES.PICKER) userFields.isActive = false;

    const employee = await Employee.findOneAndUpdate(
      { _id: current._id, userId: { $ne: actorUserId } },
      { $set: employeeFields },
      { new: true, session }
    );
    if (!employee) {
      throw new EmployeeError(409, 'The employee was changed by another request. Please reload and retry.', {
        code: 'EMPLOYEE_CHANGED',
      });
    }

    const user = Object.keys(userFields).length
      ? await User.findOneAndUpdate(
          { _id: employee.userId, role: { $in: [ROLES.BRAND_EMPLOYEE, ROLES.PICKER] } },
          { $set: userFields },
          { new: true, session }
        )
      : await User.findById(employee.userId).session(session);

    // Deactivation means this person loses the brand. When no membership is
    // left at all, their phones must stop receiving that brand's work.
    const lastMembership =
      data.isActive === false &&
      (await Employee.countDocuments({ userId: current.userId, isActive: true }).session(session)) === 0;

    return { employee: serialize(employee, user), revokedLogin: lastMembership };
  });

  if (result.revokedLogin) {
    await revokeUserDelivery(result.employee.user._id, { notifications: false });
  }
  return result.employee;
}

/**
 * Removes one membership (docs/24 §3.6). The Employee row is deactivated,
 * never deleted, so the audit trail survives; other memberships keep the
 * account and the email in use.
 *
 * `purge` additionally anonymizes the User. It is only allowed when this was
 * the person's last active membership, because the anonymized account can no
 * longer sign in to any brand. The original email becomes free at once.
 */
async function removeEmployee({ brandId, id, actorUserId, removalReason = null, purge = false }) {
  const result = await runInTransaction(async (session) => {
    const employee = await Employee.findOne(scoped(brandId, id)).session(session);
    if (!employee) {
      throw new EmployeeError(404, 'Employee not found.');
    }
    if (String(employee.userId) === String(actorUserId)) {
      throw new EmployeeError(403, 'You cannot remove your own employee account.', { code: 'SELF_MODIFICATION' });
    }

    if (employee.isActive && employee.role === ROLES.PICKER) {
      await assertPickerHasNoOpenOrders({ brandId: employee.brandId, userId: employee.userId, session });
    }

    const updated = employee.isActive
      ? await Employee.findOneAndUpdate(
          { _id: employee._id },
          {
            $set: {
              isActive: false,
              removedAt: new Date(),
              removedBy: actorUserId || null,
              removalReason: removalReason || null,
            },
          },
          { new: true, session }
        )
      : employee;

    const otherActive = await Employee.countDocuments({ userId: employee.userId, isActive: true }).session(session);
    if (purge && otherActive > 0) {
      throw new EmployeeError(
        409,
        'This person still works for another brand. Remove those memberships before deleting the account.',
        { code: 'ACCOUNT_HAS_OTHER_MEMBERSHIPS' }
      );
    }

    // A picker has a single-brand account with no membership check in
    // authenticate, so the login itself has to stop.
    if (employee.role === ROLES.PICKER) {
      await User.findOneAndUpdate(
        { _id: employee.userId, role: ROLES.PICKER },
        { $set: { isActive: false } },
        { session }
      );
    }

    const user = purge
      ? await anonymizeUser({
          userId: employee.userId,
          role: { $in: [ROLES.BRAND_EMPLOYEE, ROLES.PICKER] },
          session,
        })
      : await User.findById(employee.userId).session(session);

    return {
      employee: serialize(updated, user),
      lastMembership: otherActive === 0,
      purged: purge,
    };
  });

  // Delivery state follows the account: a person with another active
  // membership keeps their phones, notifications and sockets.
  if (result.lastMembership) {
    await revokeUserDelivery(result.employee.user._id, { notifications: result.purged });
  }
  return result;
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
  const target = await User.findById(employee.userId);
  if (employee.role === ROLES.PICKER || (target && target.role === ROLES.PICKER)) {
    throw new EmployeeError(400, 'A picker does not have brand-team permissions.', {
      code: 'PICKER_NO_PERMISSIONS',
    });
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
  removeEmployee,
  setEmployeePermissions,
  actorPermissionsFor,
  EmployeeError,
};
