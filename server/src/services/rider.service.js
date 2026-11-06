const User = require('../models/user.model');
const Brand = require('../models/brand.model');
const Delivery = require('../models/delivery.model');
const { hashPassword } = require('../utils/password');
const { ROLES } = require('../config/roles');
const { DELIVERY_FINAL_STATUSES } = require('../config/deliveryTransitions');
const { anonymizeUser } = require('./accountAnonymization.service');
const { revokeUserDelivery, clearRiderLocation } = require('./revocation.service');

const DEFAULT_LIMIT = 20;

class RiderError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

// A rider is a plain User (role RIDER) of one brand; there is no separate
// collection. Every query below is pinned to the caller's brand and the RIDER
// role, so another brand's rider (or any other account) is simply "not found".
const riderFilter = (brandId, id) => ({ _id: id, brandId, role: ROLES.RIDER });

function serialize(user) {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    isActive: user.isActive,
    createdAt: user.createdAt,
  };
}

async function listRiders({ brandId, isActive, page, limit } = {}) {
  const filter = { brandId, role: ROLES.RIDER };
  if (isActive !== undefined) filter.isActive = isActive;
  const pageNumber = page || 1;
  const limitNumber = limit || DEFAULT_LIMIT;

  const [riders, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber),
    User.countDocuments(filter),
  ]);
  return {
    items: riders.map(serialize),
    pagination: { page: pageNumber, limit: limitNumber, total, pages: Math.ceil(total / limitNumber) },
  };
}

async function createRider({ brandId, data }) {
  const brand = await Brand.findById(brandId);
  if (!brand) {
    throw new RiderError(404, 'Brand not found.');
  }
  if (brand.status === 'TERMINATED') {
    throw new RiderError(409, 'A terminated brand cannot add riders.', { code: 'BRAND_TERMINATED' });
  }

  // A removed rider can be added again with the same email (docs/24 §3.7):
  // the existing row is reactivated with the fresh profile and password. A
  // rider belongs to one brand only, so the same email in another brand (or
  // on another kind of account) is still a conflict.
  const existing = await User.findOne({ email: data.email, accountType: 'BRAND' });
  if (existing && (existing.role !== ROLES.RIDER || String(existing.brandId) !== String(brandId))) {
    throw new RiderError(409, 'Email is already registered.');
  }
  if (existing && existing.isActive) {
    throw new RiderError(409, 'This rider is already active.');
  }

  const passwordHash = await hashPassword(data.password);
  try {
    if (existing) {
      const user = await User.findOneAndUpdate(
        { _id: existing._id, role: ROLES.RIDER, brandId },
        { $set: { name: data.name, phone: data.phone, passwordHash, isActive: true, deletedAt: null } },
        { new: true }
      );
      return serialize(user);
    }
    const user = await User.create({
      name: data.name,
      email: data.email,
      passwordHash,
      role: ROLES.RIDER,
      accountType: 'BRAND',
      brandId,
      phone: data.phone,
    });
    return serialize(user);
  } catch (err) {
    if (err.code === 11000) {
      throw new RiderError(409, 'Email is already registered.');
    }
    throw err;
  }
}

// A rider who still has deliveries to make cannot be deactivated or removed:
// the brand moves those to someone else first.
async function assertNoOpenDeliveries(brandId, riderId) {
  const open = await Delivery.countDocuments({ brandId, riderId, status: { $nin: DELIVERY_FINAL_STATUSES } });
  if (open > 0) {
    throw new RiderError(
      409,
      `This rider still has ${open} open ${open === 1 ? 'delivery' : 'deliveries'}. Give ${open === 1 ? 'it' : 'them'} to another rider first.`,
      { code: 'RIDER_HAS_OPEN_DELIVERIES', openDeliveries: open }
    );
  }
}

// Profile fields and activation. A deactivated rider can no longer sign in
// (authenticate rejects inactive users) and stops receiving pushes.
async function updateRider({ brandId, id, data }) {
  if (data.isActive === false) {
    await assertNoOpenDeliveries(brandId, id);
  }

  const fields = {};
  if (data.name !== undefined) fields.name = data.name;
  if (data.phone !== undefined) fields.phone = data.phone;
  if (data.isActive !== undefined) fields.isActive = data.isActive;

  const user = await User.findOneAndUpdate(riderFilter(brandId, id), { $set: fields }, { new: true });
  if (!user) {
    throw new RiderError(404, 'Rider not found.');
  }
  if (data.isActive === false) {
    await revokeUserDelivery(id);
    await clearRiderLocation(id);
  }
  return serialize(user);
}

// Removes a rider (docs/24 §3.7). A plain removal deactivates the account, so
// the same email can be added again later; `purge` anonymizes it and frees the
// email at once. The delivery history is always kept.
async function removeRider({ brandId, id, purge = false }) {
  const rider = await User.findOne(riderFilter(brandId, id));
  if (!rider) {
    throw new RiderError(404, 'Rider not found.');
  }
  await assertNoOpenDeliveries(brandId, id);

  const user = purge
    ? await anonymizeUser({ userId: id, role: ROLES.RIDER })
    : await User.findOneAndUpdate(riderFilter(brandId, id), { $set: { isActive: false } }, { new: true });

  await revokeUserDelivery(id);
  await clearRiderLocation(id);
  return serialize(user);
}

// Riders cannot reset their own password (they have no email flow), so the brand
// does it. Bumping passwordVersion signs the rider out everywhere at once.
async function resetRiderPassword({ brandId, id, password }) {
  const passwordHash = await hashPassword(password);
  const user = await User.findOneAndUpdate(
    riderFilter(brandId, id),
    { $set: { passwordHash }, $inc: { passwordVersion: 1 } },
    { new: true }
  );
  if (!user) {
    throw new RiderError(404, 'Rider not found.');
  }
  return serialize(user);
}

module.exports = { listRiders, createRider, updateRider, removeRider, resetRiderPassword, RiderError };
