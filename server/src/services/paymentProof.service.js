const Delivery = require('../models/delivery.model');
const Order = require('../models/order.model');
const Payment = require('../models/payment.model');
const env = require('../config/env');
const { ROLES } = require('../config/roles');
const { OrderError } = require('./order.service');
const { notifyBrandOfRejectedProof } = require('./notification.service');
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
    submittedAt: payment.paidAt,
    verifiedAt: payment.collection.verifiedAt || null,
    note: payment.collection.note || null,
    duplicateReference: Boolean(payment.collection.duplicateReference),
    duplicateProof: Boolean(payment.collection.duplicateProof),
    proofAvailable: Boolean(payment.collection.proof && payment.collection.proof.publicId),
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
      .sort({ paidAt: 1 })
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
 * Verified or rejected, once. A rejection needs a reason (validator) and raises a
 * flag to the brand owner; nothing about the money changes automatically — what
 * happens next is the brand's decision (docs/21 §I.3).
 */
async function decideProof({ user, tenantBrandId, paymentId, verification, note }) {
  const scope = { _id: paymentId, ...scopeFor(user, tenantBrandId), ...HAS_PROOF };
  const now = new Date();
  const set = {
    'collection.verification': verification,
    'collection.verifiedBy': user._id,
    'collection.verifiedAt': now,
  };
  if (note !== undefined) set['collection.note'] = note;

  const updated = await Payment.findOneAndUpdate(
    { ...scope, 'collection.verification': 'SUBMITTED' },
    { $set: set },
    { new: true }
  );

  if (!updated) {
    const existing = await Payment.findOne(scope);
    if (!existing) {
      throw new OrderError(404, 'Payment not found.');
    }
    throw new OrderError(409, 'This payment proof has already been checked.', {
      code: 'PROOF_ALREADY_DECIDED',
      verification: existing.collection.verification,
    });
  }

  if (verification === 'REJECTED') {
    const order = await Order.findById(updated.orderId).select('orderNumber brandId');
    await notifyBrandOfRejectedProof({
      brandId: order ? order.brandId : updated.brandId,
      orderId: updated.orderId,
      orderNumber: order ? order.orderNumber : '',
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
  };
}

/**
 * Duplicate use of the same reference or the same photo (Cloudinary's etag) on
 * another payment of the brand. Only a flag for the person verifying; never a block.
 */
async function duplicateFlags({ brandId, paymentId, reference, fingerprint }, session) {
  const base = { _id: { $ne: paymentId }, brandId };
  const [sameReference, sameProof] = await Promise.all([
    reference ? Payment.findOne({ ...base, 'collection.reference': reference }).session(session) : null,
    fingerprint ? Payment.findOne({ ...base, 'collection.proof.fingerprint': fingerprint }).session(session) : null,
  ]);
  return { duplicateReference: Boolean(sameReference), duplicateProof: Boolean(sameProof) };
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
  const delivery = await Delivery.findOne({ _id: deliveryId, brandId, riderId });
  if (!delivery) {
    throw new OrderError(404, 'Delivery not found.');
  }
  if (delivery.status !== 'OUT_FOR_DELIVERY') {
    throw new OrderError(409, 'A payment photo can only be taken while the delivery is out for delivery.', {
      code: 'PROOF_NOT_ALLOWED',
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
    'collection.verification': { $in: ['VERIFIED', 'REJECTED'] },
    'collection.verifiedAt': { $lte: cutoff },
    ...HAS_PROOF,
  }).limit(limit);

  let deleted = 0;
  for (const payment of payments) {
    const publicId = payment.collection && payment.collection.proof && payment.collection.proof.publicId;
    if (!publicId) continue;
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
    deleted += 1;
  }
  return deleted;
}

module.exports = {
  listProofs,
  getProofLink,
  decideProof,
  duplicateFlags,
  proofBelongsToDelivery,
  createProofUpload,
  purgeVerifiedProofs,
};
