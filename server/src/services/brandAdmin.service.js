const Brand = require('../models/brand.model');
const Store = require('../models/store.model');
const User = require('../models/user.model');
const Order = require('../models/order.model');
const Payment = require('../models/payment.model');
const Delivery = require('../models/delivery.model');
const { runInTransaction } = require('../utils/transaction');
const { restockStock } = require('./inventory.service');
const { BrandError } = require('./brand.service');
const { ROLES } = require('../config/roles');
const env = require('../config/env');
const { DELIVERY_FINAL_STATUSES } = require('../config/deliveryTransitions');
const { notifyBrandTerminated } = require('./notification.service');

const DEFAULT_LIMIT = 20;
// Orders that have not left the brand yet: safe to cancel on termination.
const PRE_SHIPMENT = ['PENDING', 'CONFIRMED', 'PROCESSING', 'READY_FOR_SHIPMENT'];
const IN_TRANSIT = ['SHIPPED', 'OUT_FOR_DELIVERY'];

// Platform-wide view for the super admin: ALL statuses, unlike the public list.
async function listAdminBrands({ status, search, page, limit } = {}) {
  const filter = {};
  if (status) filter.status = status;
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.name = { $regex: escaped, $options: 'i' };
  }
  const pageNumber = page || 1;
  const limitNumber = limit || DEFAULT_LIMIT;
  const [items, total] = await Promise.all([
    Brand.find(filter).sort({ createdAt: -1 }).skip((pageNumber - 1) * limitNumber).limit(limitNumber),
    Brand.countDocuments(filter),
  ]);
  return {
    items,
    pagination: { page: pageNumber, limit: limitNumber, total, pages: Math.ceil(total / limitNumber) },
  };
}

async function getAdminBrand(id) {
  const brand = await Brand.findById(id);
  if (!brand) {
    throw new BrandError(404, 'Brand not found.');
  }
  const [store, owners] = await Promise.all([
    Store.findOne({ brandId: brand._id }),
    User.find({ brandId: brand._id, role: ROLES.BRAND_ADMIN }),
  ]);
  return {
    brand,
    store,
    owners: owners.map((u) => ({ _id: u._id, name: u.name, email: u.email, phone: u.phone, isActive: u.isActive })),
  };
}

// One order: reject, restock, cancel payment and delivery — all or nothing.
async function rejectOrderForTermination({ orderId, brandId, adminId }) {
  return runInTransaction(async (session) => {
    const order = await Order.findOneAndUpdate(
      { _id: orderId, brandId, orderStatus: { $in: PRE_SHIPMENT } },
      {
        $set: { orderStatus: 'REJECTED', paymentStatus: 'CANCELLED' },
        $push: { statusHistory: { status: 'REJECTED', by: adminId, at: new Date() } },
      },
      { new: true, session }
    );
    if (!order) {
      return false; // already handled by an earlier (or concurrent) run
    }
    const sorted = [...order.items].sort((a, b) => String(a.productId).localeCompare(String(b.productId)));
    for (const item of sorted) {
      await restockStock(item.productId, item.quantity, { session });
    }
    await Payment.updateMany({ orderId: order._id, status: 'PENDING' }, { $set: { status: 'CANCELLED' } }, { session });
    await Delivery.updateOne(
      { orderId: order._id, status: { $nin: DELIVERY_FINAL_STATUSES } },
      { $set: { status: 'CANCELLED' } },
      { session }
    );
    return true;
  });
}

/**
 * Super admin terminates a brand (policy violation etc.). Two phases:
 *
 *  1. ONE atomic transaction takes the brand offline immediately: status
 *     TERMINATED (with reason/who/when), store deactivated, and every brand
 *     login (admin + employees) put on a time limit: read-only until
 *     accessEndsAt (default 24h, configurable), then locked out. The
 *     brand is no longer ACTIVE, so it disappears from the public site and
 *     nobody can add its products to a cart or check them out.
 *  2. Orders that have not shipped are cleaned up one by one, each in its
 *     own transaction: REJECTED, stock restored, payment and delivery
 *     cancelled. Orders already on the road (SHIPPED / OUT_FOR_DELIVERY)
 *     are left untouched and reported, for the platform to resolve.
 *
 * Idempotent: running it again on an already-terminated brand just retries
 * any order cleanup that failed, so a crash midway never leaves orphans.
 */
async function terminateBrand({ brandId, reason, adminId, graceHours }) {
  const hours = graceHours === undefined ? env.terminationGraceHours : graceHours;
  const accessEndsAt = new Date(Date.now() + hours * 60 * 60 * 1000);
  // True only when THIS call performed the TERMINATED transition — the
  // idempotent re-run path must not re-announce the termination.
  let transitioned = false;

  const brand = await runInTransaction(async (session) => {
    const updated = await Brand.findOneAndUpdate(
      { _id: brandId, status: { $ne: 'TERMINATED' } },
      {
        $set: {
          status: 'TERMINATED',
          terminationReason: reason,
          terminatedAt: new Date(),
          terminatedBy: adminId,
          accessEndsAt,
        },
      },
      { new: true, session }
    );
    if (!updated) {
      const existing = await Brand.findById(brandId).session(session);
      if (!existing) {
        throw new BrandError(404, 'Brand not found.');
      }
      return existing; // already terminated: only retry the cleanup below
    }
    transitioned = true;
    await Store.updateMany({ brandId }, { $set: { isActive: false } }, { session });
    // Staff are NOT deactivated: until accessEndsAt they keep a read-only
    // account (they can still finish in-transit deliveries); after it,
    // authenticate rejects every request. graceHours 0 = immediate cut-off.
    await User.updateMany(
      { brandId, role: { $in: [ROLES.BRAND_ADMIN, ROLES.BRAND_EMPLOYEE] } },
      { $set: { accessExpiresAt: accessEndsAt, accessRestricted: true } },
      { session }
    );
    return updated;
  });

  const pending = await Order.find({ brandId, orderStatus: { $in: PRE_SHIPMENT } }).select('_id');
  let rejectedOrders = 0;
  const failedOrders = [];
  for (const { _id } of pending) {
    try {
      if (await rejectOrderForTermination({ orderId: _id, brandId, adminId })) {
        rejectedOrders += 1;
      }
    } catch (err) {
      failedOrders.push({ orderId: _id, error: err.message });
    }
  }
  const inTransitOrders = await Order.countDocuments({ brandId, orderStatus: { $in: IN_TRANSIT } });

  if (transitioned) {
    await notifyBrandTerminated({ brandId, brandName: brand.name, reason });
  }

  return { brand, rejectedOrders, failedOrders, inTransitOrders };
}

module.exports = { listAdminBrands, getAdminBrand, terminateBrand, PRE_SHIPMENT };
