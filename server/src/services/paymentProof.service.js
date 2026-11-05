const Delivery = require('../models/delivery.model');
const Order = require('../models/order.model');
const Payment = require('../models/payment.model');
const env = require('../config/env');
const { ROLES } = require('../config/roles');
const { runInTransaction } = require('../utils/transaction');
const { OrderError } = require('./order.service');
const { applyDeliveryStatus, dispatchDeliveryEvents } = require('./delivery.service');
const { notifyBrandOfRejectedProof, notifyRiderOfRejectedProof } = require('./notification.service');
const {
  UploadError,
  createPaymentProofSignature,
  createProofDownloadUrl,
  destroyPrivateAsset,
  isConfigured,
  paymentProofFolder,
} = require('./upload.service');

const DEFAULT_LIMIT = 20;

// Only payments with a photo belong on this screen.
const HAS_PROOF = { 'collection.proof.publicId': { $exists: true, $ne: '' } };

// A brand user only ever reaches its own payments; platform admins are unscoped.
function scopeFor(user, tenantBrandId) {
  if (user.role === ROLES.SUPER_ADMIN || user.role === ROLES.ADMIN_PARTNER) return {};
  return { brandId: tenantBrandId };
}

const asOrderError = (err) => {
  if (err instanceof UploadError) {
    return new OrderError(err.status, err.message, { code: 'PROOF_NOT_CONFIGURED' });
  }
  return err;
};

// One shape for the queue and for the detail screen; the photo's publicId and
// fingerprint never leave the server.
function proofItem(payment, orderNumber) {
  return {
    paymentId: payment._id,
    orderNumber: orderNumber || null,
    amount: payment.amount,
    currency: payment.currency || 'PKR',
    method: payment.collection.method,
    wallet: payment.collection.wallet || null,
    reference: payment.collection.reference,
    verification: payment.collection.verification,
    // Older payments only have paidAt; new submissions record when they were sent.
    submittedAt: payment.collection.submittedAt || payment.paidAt || null,
    verifiedAt: payment.collection.verifiedAt || null,
    note: payment.collection.note || null,
    duplicateReference: Boolean(payment.collection.duplicateReference),
    duplicateProof: Boolean(payment.collection.duplicateProof),
    proofAvailable: Boolean(payment.collection.proof && payment.collection.proof.publicId),
    // The delivery is still out until this decision: verification completes it.
    deliveryPending: payment.status === 'PENDING',
  };
}

/**
 * The records person's "Payments to verify" queue (docs/21 §I.3): non-cash
 * payments whose proof has not been checked yet, oldest first. Every query is
 * pinned to the caller's brand; a platform admin sees all brands.
 */
async function listProofs(user, tenantBrandId, { status = 'SUBMITTED', page, limit } = {}) {
  const pageNumber = page || 1;
  const limitNumber = limit || DEFAULT_LIMIT;
  const filter = { ...scopeFor(user, tenantBrandId), ...HAS_PROOF, 'collection.verification': status };

  const [items, total] = await Promise.all([
    Payment.find(filter)
      // Oldest first; a submission without one (legacy) counts as the oldest.
      .sort({ 'collection.submittedAt': 1, paidAt: 1 })
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber),
    Payment.countDocuments(filter),
  ]);

  const orders = items.length
    ? await Order.find({ _id: { $in: items.map((p) => p.orderId) } }).select('orderNumber')
    : [];
  const numberByOrder = new Map(orders.map((o) => [String(o._id), o.orderNumber]));

  return {
    items: items.map((p) => proofItem(p, numberByOrder.get(String(p.orderId)))),
    pagination: { page: pageNumber, limit: limitNumber, total, pages: Math.ceil(total / limitNumber) },
  };
}

// A short-lived link to one private photo, only after the caller is authorized for
// the payment's brand (their own brand, or a platform admin). The same details as
// a queue row come back too, so the detail screen works from a fresh link.
async function getProofLink(user, tenantBrandId, paymentId) {
  const payment = await Payment.findOne({ _id: paymentId, ...scopeFor(user, tenantBrandId) });
  if (!payment) {
    throw new OrderError(404, 'Payment not found.');
  }
  const publicId = payment.collection && payment.collection.proof && payment.collection.proof.publicId;
  if (!publicId) {
    throw new OrderError(404, 'There is no photo for this payment.', { code: 'PROOF_NOT_FOUND' });
  }
  try {
    const link = createProofDownloadUrl(publicId);
    const order = await Order.findById(payment.orderId).select('orderNumber');
    return { ...proofItem(payment, order ? order.orderNumber : null), ...link };
  } catch (err) {
    throw asOrderError(err);
  }
}

/**
 * Verified or rejected, once (docs/10 §31):
 *  - VERIFIED on a payment that is still PENDING completes the held delivery in
 *    the same transaction, so the payment flips to PAID, the order is delivered
 *    and its door return is created exactly once.
 *  - REJECTED leaves the money and the delivery untouched and tells the rider to
 *    collect again; it also raises a flag to the brand owner (docs/21 §I.3).
 */
async function decideProof({ user, tenantBrandId, paymentId, verification, note }) {
  const scope = { _id: paymentId, ...scopeFor(user, tenantBrandId), ...HAS_PROOF };
  const now = new Date();
  let outcome = null;

  const updated = await runInTransaction(async (session) => {
    const decision = {
      'collection.verification': verification,
      'collection.verifiedBy': user._id,
      'collection.verifiedAt': now,
    };
    if (note !== undefined) decision['collection.note'] = note;

    const saved = await Payment.findOneAndUpdate(
      { ...scope, 'collection.verification': 'SUBMITTED' },
      { $set: decision },
      { new: true, session }
    );

    if (!saved) {
      const existing = await Payment.findOne(scope);
      if (!existing) {
        throw new OrderError(404, 'Payment not found.');
      }
      throw new OrderError(409, 'This payment proof has already been checked.', {
        code: 'PROOF_ALREADY_DECIDED',
        verification: existing.collection.verification,
      });
    }

    const order = await Order.findById(saved.orderId).session(session);
    outcome = { order, delivery: null, events: [] };

    if (verification === 'REJECTED') {
      // Still unpaid and still out for delivery: the rider collects again.
      if (order) {
        await Delivery.updateOne(
          { orderId: order._id, 'pendingCompletion.paymentId': saved._id },
          { $set: { 'pendingCompletion.rejectedAt': now } },
          { session }
        );
      }
      return saved;
    }

    // A payment already PAID belongs to the older flow (or a seed/demo row):
    // only its check is recorded.
    if (saved.status !== 'PENDING' || !order) return saved;

    const deliveryQuery = Delivery.findOne({ orderId: order._id, brandId: order.brandId });
    const delivery =
      deliveryQuery && typeof deliveryQuery.select === 'function'
        ? await deliveryQuery.select('+pendingCompletion').session(session)
        : await deliveryQuery;
    if (!delivery || !delivery.pendingCompletion) {
      return saved;
    }
    if (String(delivery.pendingCompletion.paymentId) !== String(saved._id)) {
      return saved;
    }

    const result = await applyDeliveryStatus({
      brandId: order.brandId,
      deliveryId: delivery._id,
      status: 'DELIVERED',
      userId: user._id,
      collection: saved.collection,
      lines: delivery.pendingCompletion.lines,
      session,
      verifiedPayment: { verifiedBy: user._id, verifiedAt: now },
    });
    outcome = { order, delivery: delivery._id, events: result.events };
    return saved;
  });

  if (outcome && outcome.events.length > 0) {
    await dispatchDeliveryEvents(outcome.events);
  }

  if (verification === 'REJECTED') {
    const order = outcome.order;
    let delivery = null;
    if (order) {
      const deliveryQuery = Delivery.findOne({ orderId: order._id });
      delivery =
        deliveryQuery && typeof deliveryQuery.select === 'function'
          ? await deliveryQuery.select('riderId')
          : await deliveryQuery;
    }
    await notifyBrandOfRejectedProof({
      brandId: order ? order.brandId : updated.brandId,
      orderId: updated.orderId,
      orderNumber: order ? order.orderNumber : '',
      paymentId: updated._id,
      amount: updated.amount,
      note,
    });
    await notifyRiderOfRejectedProof({
      userId: delivery ? delivery.riderId : null,
      brandId: order ? order.brandId : updated.brandId,
      orderNumber: order ? order.orderNumber : '',
      deliveryId: delivery ? delivery._id : null,
      paymentId: updated._id,
      amount: updated.amount,
      note,
    });
  }

  return {
    paymentId: updated._id,
    verification: updated.collection.verification,
    verifiedAt: updated.collection.verifiedAt,
    note: updated.collection.note || null,
    deliveryCompleted: Boolean(outcome && outcome.delivery),
  };
}

// The photo path must be inside THIS brand's and THIS delivery's folder, which
// only the rider who asked for that delivery's signature could have uploaded to.
function proofBelongsToDelivery({ brandId, deliveryId, publicId }) {
  if (typeof publicId !== 'string') return false;
  const folder = paymentProofFolder(brandId, deliveryId);
  return publicId.startsWith(`${folder}/`) && publicId.length > folder.length + 1 && !publicId.includes('..');
}

// Step one of the rider's non-cash flow: a signed upload into the private folder.
async function createProofUpload({ brandId, riderId, deliveryId }) {
  const query = Delivery.findOne({ _id: deliveryId, brandId, riderId });
  const delivery = query && typeof query.select === 'function' ? await query.select('+pendingCompletion') : await query;
  if (!delivery) {
    throw new OrderError(404, 'Delivery not found.');
  }
  if (delivery.status !== 'OUT_FOR_DELIVERY') {
    throw new OrderError(409, 'A payment photo can only be taken while the delivery is out for delivery.', {
      code: 'PROOF_NOT_ALLOWED',
    });
  }
  // While the brand is checking a payment, a new proof has no place to go.
  if (delivery.pendingCompletion && !delivery.pendingCompletion.rejectedAt) {
    throw new OrderError(409, 'This delivery is waiting for its payment to be verified.', {
      code: 'PAYMENT_VERIFICATION_PENDING',
    });
  }
  try {
    return createPaymentProofSignature(brandId, deliveryId);
  } catch (err) {
    throw asOrderError(err);
  }
}

/**
 * Deletes proof photos the brand has already checked, `retentionDays` after the
 * decision (docs/21 §I.4). Runs from the server timer; repeating it is harmless.
 * A Cloudinary failure leaves the record alone so the next run tries again.
 */
async function purgeVerifiedProofs({
  now = new Date(),
  config = env.cloudinary,
  retentionDays = env.paymentProof.retentionDays,
  destroy = destroyPrivateAsset,
  limit = 100,
} = {}) {
  if (!isConfigured(config)) return 0;

  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const payments = await Payment.find({
    $or: [
      {
        'collection.verification': { $in: ['VERIFIED', 'REJECTED'] },
        'collection.verifiedAt': { $lte: cutoff },
        ...HAS_PROOF,
      },
      // Attempts the rider replaced after a refusal keep their own decision date.
      {
        collectionHistory: {
          $elemMatch: {
            verification: { $in: ['VERIFIED', 'REJECTED'] },
            verifiedAt: { $lte: cutoff },
            'proof.publicId': { $exists: true, $ne: '' },
          },
        },
      },
    ],
  })
    .select('+collectionHistory')
    .limit(limit);

  let deleted = 0;
  for (const payment of payments) {
    const current = payment.collection && payment.collection.proof && payment.collection.proof.publicId;
    // Only a photo whose own decision is past the cutoff may go: a row can match
    // through an old archived attempt while its live attempt is still new.
    const currentDue =
      current &&
      ['VERIFIED', 'REJECTED'].includes(payment.collection.verification) &&
      payment.collection.verifiedAt &&
      new Date(payment.collection.verifiedAt) <= cutoff;
    const archived = (payment.collectionHistory || [])
      .filter(
        (entry) =>
          entry.proof &&
          entry.proof.publicId &&
          ['VERIFIED', 'REJECTED'].includes(entry.verification) &&
          entry.verifiedAt &&
          new Date(entry.verifiedAt) <= cutoff
      )
      .map((entry) => entry.proof.publicId);
    const publicIds = [...new Set([...(currentDue ? [current] : []), ...archived])];

    for (const publicId of publicIds) {
      let removed = false;
      try {
        removed = await destroy(publicId, { config });
      } catch (err) {
        console.error(`[payments] could not delete a proof photo: ${err.message}`);
      }
      if (!removed) continue;
      await Payment.updateOne(
        { _id: payment._id, 'collection.proof.publicId': publicId },
        { $unset: { 'collection.proof': '' }, $set: { 'collection.proofDeletedAt': now } }
      );
      // A superseded attempt (a refused proof the rider replaced) is purged too,
      // so audit history never keeps the photo longer than the live one.
      await Payment.updateOne(
        { _id: payment._id, 'collectionHistory.proof.publicId': publicId },
        {
          $unset: { 'collectionHistory.$[entry].proof': '' },
          $set: { 'collectionHistory.$[entry].proofDeletedAt': now },
        },
        { arrayFilters: [{ 'entry.proof.publicId': publicId }] }
      );
      deleted += 1;
    }
  }
  return deleted;
}

module.exports = {
  listProofs,
  getProofLink,
  decideProof,
  proofBelongsToDelivery,
  createProofUpload,
  purgeVerifiedProofs,
};
