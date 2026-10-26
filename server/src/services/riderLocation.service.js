const RiderLocation = require('../models/riderLocation.model');
const Delivery = require('../models/delivery.model');
const { OrderError } = require('./order.service');
const { ROLES } = require('../config/roles');

/**
 * Rider live location (docs/11 §30). The rule that shapes everything: a position exists only
 * while the rider has chosen to share it AND is out for delivery, it is only the LAST point
 * (no history, deleted by the database after two hours), and only the customer of that
 * delivery and that brand's staff can see it, and only while it is out for delivery.
 */
// A position older than this is not shown: the rider's phone has probably stopped reporting.
const FRESH_MS = 10 * 60 * 1000;

async function recordLocation({ brandId, riderId, latitude, longitude, accuracy }) {
  const active = await Delivery.exists({ brandId, riderId, status: 'OUT_FOR_DELIVERY' });
  if (!active) {
    throw new OrderError(409, 'You have no delivery out for delivery, so your location is not shared.', { code: 'NO_ACTIVE_DELIVERY' });
  }
  await RiderLocation.findOneAndUpdate(
    { riderId },
    { $set: { brandId, latitude, longitude, ...(accuracy !== undefined && { accuracy }), recordedAt: new Date() } },
    { upsert: true }
  );
}

// The rider stops sharing (or finished): forget the position at once.
async function clearLocation({ riderId }) {
  await RiderLocation.deleteOne({ riderId });
}

const scopeFor = (user, tenantBrandId) => (user.role === ROLES.CUSTOMER ? { customerId: user._id } : { brandId: tenantBrandId });

/**
 * Where is the rider of this delivery? { location: null } when it is not out for delivery, the
 * rider is not sharing, or the last point is stale. The delivery is looked up with the caller's
 * own scope first (their order, or their brand's delivery), so nobody can follow someone else's rider.
 */
async function getRiderLocation({ user, tenantBrandId, deliveryId }) {
  const delivery = await Delivery.findOne({ _id: deliveryId, ...scopeFor(user, tenantBrandId) });
  if (!delivery) throw new OrderError(404, 'Delivery not found.');
  if (delivery.status !== 'OUT_FOR_DELIVERY' || !delivery.riderId) return { location: null };

  const point = await RiderLocation.findOne({ riderId: delivery.riderId, brandId: delivery.brandId });
  if (!point || Date.now() - new Date(point.recordedAt).getTime() > FRESH_MS) return { location: null };
  return { location: { latitude: point.latitude, longitude: point.longitude, accuracy: point.accuracy, recordedAt: point.recordedAt } };
}

module.exports = { recordLocation, clearLocation, getRiderLocation, FRESH_MS };
