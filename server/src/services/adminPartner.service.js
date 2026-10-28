const User = require('../models/user.model');
const AdminPartner = require('../models/adminPartner.model');
const { hashPassword } = require('../utils/password');
const { runInTransaction } = require('../utils/transaction');
const { ROLES } = require('../config/roles');
const { recordAdminAction } = require('./adminAction.service');

const DEFAULT_LIMIT = 20;
// docs/21 §G.5 decision 1 ("Up to 5 partners"): active partner records only,
// so deactivating one frees a seat.
const MAX_ACTIVE_PARTNERS = 5;

class AdminPartnerError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function serialize(partner, user) {
  return {
    _id: partner._id,
    permissions: partner.permissions,
    readOnly: partner.readOnly,
    isActive: partner.isActive,
    createdBy: partner.createdBy,
    createdAt: partner.createdAt,
    user: user
      ? {
          _id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          isActive: user.isActive,
          mustChangePassword: Boolean(user.mustChangePassword),
        }
      : { _id: partner.userId },
  };
}

async function listPartners({ page, limit } = {}) {
  const pageNumber = page || 1;
  const limitNumber = limit || DEFAULT_LIMIT;

  const [partners, total] = await Promise.all([
    AdminPartner.find({})
      .sort({ createdAt: -1 })
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber),
    AdminPartner.countDocuments({}),
  ]);
  const users = partners.length ? await User.find({ _id: { $in: partners.map((p) => p.userId) } }) : [];
  const userById = new Map(users.map((u) => [String(u._id), u]));

  return {
    items: partners.map((p) => serialize(p, userById.get(String(p.userId)))),
    pagination: { page: pageNumber, limit: limitNumber, total, pages: Math.ceil(total / limitNumber) },
  };
}

async function getPartner(id) {
  const partner = await AdminPartner.findById(id);
  if (!partner) {
    throw new AdminPartnerError(404, 'Partner not found.');
  }
  return serialize(partner, await User.findById(partner.userId));
}

/**
 * Creates the login (User, role ADMIN_PARTNER, PLATFORM_ADMIN account type)
 * and the AdminPartner record together. The partner starts with
 * mustChangePassword so the temporary password cannot be kept.
 */
async function createPartner({ actor, data }) {
  const passwordHash = await hashPassword(data.password); // slow: outside the transaction

  try {
    const created = await runInTransaction(async (session) => {
      const activeCount = await AdminPartner.countDocuments({ isActive: true }).session(session);
      if (activeCount >= MAX_ACTIVE_PARTNERS) {
        throw new AdminPartnerError(409, `The platform can have at most ${MAX_ACTIVE_PARTNERS} active partners.`, {
          code: 'PARTNER_LIMIT_REACHED',
        });
      }
      if (await User.findOne({ email: data.email, accountType: 'PLATFORM_ADMIN' }).session(session)) {
        throw new AdminPartnerError(409, 'Email is already registered.');
      }
      const [user] = await User.create(
        [
          {
            name: data.name,
            email: data.email,
            passwordHash,
            phone: data.phone,
            role: ROLES.ADMIN_PARTNER,
            accountType: 'PLATFORM_ADMIN',
            mustChangePassword: true,
          },
        ],
        { session }
      );
      const [partner] = await AdminPartner.create(
        [
          {
            userId: user._id,
            permissions: data.permissions || [],
            readOnly: Boolean(data.readOnly),
            createdBy: actor._id,
          },
        ],
        { session }
      );
      return serialize(partner, user);
    });

    await recordAdminAction({
      actor,
      action: 'admin.partner.create',
      target: { type: 'AdminPartner', id: created._id, label: created.user.email },
      details: `Added ${created.user.name} as a ${created.readOnly ? 'read-only' : 'full'} partner.`,
    });
    return created;
  } catch (err) {
    if (err.code === 11000) {
      throw new AdminPartnerError(409, 'Email is already registered.');
    }
    throw err;
  }
}

function actionForChange(partner, data) {
  // `isActive` omitted means a plain edit (permissions, read-only, profile).
  if (data.isActive === undefined || data.isActive === partner.isActive) return 'admin.partner.update';
  return data.isActive ? 'admin.partner.activate' : 'admin.partner.deactivate';
}

/**
 * Updates permissions, the read-only flag, profile fields and/or activation.
 * Activation is kept on BOTH records so a deactivated partner cannot
 * authenticate at all (middleware/authenticate.js re-loads the User on every
 * request), and the User update is guarded by role so it can never touch the
 * super admin or anyone else.
 */
async function updatePartner({ actor, id, data }) {
  const updated = await runInTransaction(async (session) => {
    const partner = await AdminPartner.findById(id).session(session);
    if (!partner) {
      throw new AdminPartnerError(404, 'Partner not found.');
    }

    const partnerFields = {};
    if (data.permissions !== undefined) partnerFields.permissions = data.permissions;
    if (data.readOnly !== undefined) partnerFields.readOnly = data.readOnly;
    if (data.isActive !== undefined) partnerFields.isActive = data.isActive;

    const userFields = {};
    if (data.name !== undefined) userFields.name = data.name;
    if (data.phone !== undefined) userFields.phone = data.phone;
    if (data.isActive !== undefined) userFields.isActive = data.isActive;

    const savedPartner =
      Object.keys(partnerFields).length > 0
        ? await AdminPartner.findByIdAndUpdate(id, { $set: partnerFields }, { new: true, session })
        : partner;
    const user =
      Object.keys(userFields).length > 0
        ? await User.findOneAndUpdate(
            { _id: partner.userId, role: ROLES.ADMIN_PARTNER },
            { $set: userFields },
            { new: true, session }
          )
        : await User.findById(partner.userId).session(session);
    if (!user) {
      throw new AdminPartnerError(404, 'Partner account not found.');
    }
    return { savedPartner, user, previous: partner };
  });

  await recordAdminAction({
    actor,
    action: actionForChange(updated.previous, data),
    target: { type: 'AdminPartner', id: updated.savedPartner._id, label: updated.user.email },
    details: updated.user.name,
  });
  return serialize(updated.savedPartner, updated.user);
}

/**
 * Sets a new temporary password and bumps passwordVersion, which signs the
 * partner out everywhere at once; the flag forces a change at next sign-in.
 */
async function resetPartnerPassword({ actor, id, password }) {
  const partner = await AdminPartner.findById(id);
  if (!partner) {
    throw new AdminPartnerError(404, 'Partner not found.');
  }
  const passwordHash = await hashPassword(password);
  const user = await User.findOneAndUpdate(
    { _id: partner.userId, role: ROLES.ADMIN_PARTNER },
    { $set: { passwordHash, mustChangePassword: true }, $inc: { passwordVersion: 1 } },
    { new: true }
  );
  if (!user) {
    throw new AdminPartnerError(404, 'Partner account not found.');
  }

  await recordAdminAction({
    actor,
    action: 'admin.partner.reset_password',
    target: { type: 'AdminPartner', id: partner._id, label: user.email },
    details: user.name,
  });
  return serialize(partner, user);
}

module.exports = {
  listPartners,
  getPartner,
  createPartner,
  updatePartner,
  resetPartnerPassword,
  AdminPartnerError,
  MAX_ACTIVE_PARTNERS,
};
