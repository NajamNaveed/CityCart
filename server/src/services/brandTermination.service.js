const Brand = require('../models/brand.model');
const User = require('../models/user.model');
const Employee = require('../models/employee.model');
const { ROLES } = require('../config/roles');
const { anonymizeUser } = require('./accountAnonymization.service');
const { revokeUserDelivery, clearRiderLocation } = require('./revocation.service');

const SINGLE_BRAND_ROLES = [ROLES.BRAND_ADMIN, ROLES.PICKER, ROLES.RIDER];

/**
 * Releases the identities tied to a terminated brand after its access window
 * has ended (docs/24 §3.7, docs/04 §36).
 *
 * A multi-brand employee only loses this brand's membership; the account and
 * email stay while another active membership exists. Everyone whose whole
 * account belonged to the terminated brand is anonymized, which frees the
 * email for a new owner. Nothing financial is deleted, and the User `_id`
 * survives so old orders and audit rows still resolve.
 *
 * Safe to run repeatedly: rows already anonymized are not touched again.
 */
async function releaseTerminatedBrandIdentities(brandId) {
  const now = new Date();
  const brand = await Brand.findById(brandId).select('_id status accessEndsAt');
  if (!brand || brand.status !== 'TERMINATED') return { anonymized: 0, membershipsRemoved: 0 };
  if (!brand.accessEndsAt || brand.accessEndsAt.getTime() > now.getTime()) {
    return { anonymized: 0, membershipsRemoved: 0 }; // access window has not ended
  }

  const activeMemberships = await Employee.find({ brandId, isActive: true }).select('userId');
  if (activeMemberships.length > 0) {
    await Employee.updateMany(
      { brandId, isActive: true },
      {
        $set: {
          isActive: false,
          removedAt: now,
          removedBy: null,
          removalReason: 'Brand terminated',
        },
      }
    );
  }

  const employeeUserIds = [...new Set(activeMemberships.map((m) => String(m.userId)))];
  const stillActive = employeeUserIds.length
    ? await Employee.find({ userId: { $in: employeeUserIds }, isActive: true }).select('userId')
    : [];
  const stillWorking = new Set(stillActive.map((m) => String(m.userId)));
  const employeeIdsToAnonymize = employeeUserIds.filter((id) => !stillWorking.has(id));

  // Anyone still employed by another brand keeps a normal account: the
  // terminated brand's read-only window must not follow them there.
  if (stillWorking.size > 0) {
    await User.updateMany(
      { _id: { $in: [...stillWorking] }, accessRestricted: true },
      { $set: { accessRestricted: false }, $unset: { accessExpiresAt: 1 } }
    );
  }

  const users = await User.find({
    deletedAt: null,
    $or: [
      { _id: { $in: employeeIdsToAnonymize } },
      { brandId, role: { $in: SINGLE_BRAND_ROLES } },
    ],
  }).select('_id role');

  let anonymized = 0;
  for (const user of users) {
    await anonymizeUser({ userId: user._id, role: user.role });
    await revokeUserDelivery(user._id);
    if (user.role === ROLES.RIDER) await clearRiderLocation(user._id);
    anonymized += 1;
  }

  return { anonymized, membershipsRemoved: activeMemberships.length };
}

// Brands whose grace period has ended and that still have identifiable staff.
async function dueBrandIds(limit = 50) {
  const brands = await Brand.find({
    status: 'TERMINATED',
    accessEndsAt: { $lte: new Date() },
  })
    .select('_id')
    .limit(limit);
  return brands.map((b) => b._id);
}

async function releaseDueTerminatedBrandIdentities() {
  let anonymized = 0;
  let membershipsRemoved = 0;
  for (const brandId of await dueBrandIds()) {
    const result = await releaseTerminatedBrandIdentities(brandId);
    anonymized += result.anonymized;
    membershipsRemoved += result.membershipsRemoved;
  }
  return { anonymized, membershipsRemoved };
}

module.exports = {
  releaseTerminatedBrandIdentities,
  releaseDueTerminatedBrandIdentities,
};
