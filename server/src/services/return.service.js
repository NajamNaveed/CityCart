const Return = require('../models/return.model');
const Order = require('../models/order.model');
const Delivery = require('../models/delivery.model');
const InventoryMovement = require('../models/inventoryMovement.model');
const { OrderError } = require('./order.service');
const { runInTransaction } = require('../utils/transaction');
const { restockStock } = require('./inventory.service');
const { RETURN_REASONS, STORE_FAULT_REASONS } = require('../config/returns');
const { ROLES } = require('../config/roles');
const {
  UploadError,
  createReturnPhotoSignature,
  createProofDownloadUrl,
  returnPhotoFolder,
} = require('./upload.service');

const roundMoney = (value) => Math.round(Number(value || 0) * 100) / 100;
const isWhole = (value) => Number.isInteger(value) && value >= 0;

/**
 * Turns the rider's per-line answer into the order's final figures (docs/22 §F).
 * Pure on purpose: every money and quantity rule is tested here without a database.
 *
 * `lines` is one entry per order item:
 *   { itemId, acceptedQty, rejectedQty, reason?, photo? }
 * Omitting `lines` means "everything accepted" (the pre-Phase-6 behaviour).
 *
 * Money rules agreed with the owner:
 *  - the customer pays only for accepted units;
 *  - the delivery fee is refunded only when EVERY line is rejected and at least
 *    one rejection is the store's fault (DAMAGED, WRONG_ITEM, MISSING).
 */
function buildCompletion(order, lines) {
  const items = order.items || [];
  const originalTotal = roundMoney(order.total);
  const deliveryFee = roundMoney(order.deliveryFee);

  if (lines === undefined || lines === null) {
    return {
      fulfilment: 'FULL',
      acceptedSubtotal: roundMoney(order.subtotal),
      returnedSubtotal: 0,
      feeRefunded: false,
      netTotal: originalTotal,
      returnLines: [],
    };
  }

  if (!Array.isArray(lines) || lines.length === 0) {
    throw new OrderError(400, 'Send one line for every item in the order.', { code: 'INVALID_RETURN_LINES' });
  }
  if (lines.length !== items.length) {
    throw new OrderError(400, 'Every item in the order must appear exactly once.', { code: 'INVALID_RETURN_LINES' });
  }

  const byId = new Map(items.map((item) => [String(item._id), item]));
  const seen = new Set();
  const returnLines = [];
  let acceptedSubtotal = 0;
  let returnedSubtotal = 0;
  let hasStoreFault = false;

  for (const line of lines) {
    const item = byId.get(String(line.itemId));
    if (!item) {
      throw new OrderError(400, 'A line does not belong to this order.', { code: 'INVALID_RETURN_LINES' });
    }
    if (seen.has(String(item._id))) {
      throw new OrderError(400, 'Every item in the order must appear exactly once.', { code: 'INVALID_RETURN_LINES' });
    }
    seen.add(String(item._id));

    const accepted = line.acceptedQty;
    const rejected = line.rejectedQty;
    if (!isWhole(accepted) || !isWhole(rejected)) {
      throw new OrderError(400, 'Accepted and rejected quantities must be whole numbers of zero or more.', {
        code: 'INVALID_RETURN_LINES',
      });
    }
    if (accepted + rejected !== item.quantity) {
      throw new OrderError(400, `Accepted and rejected quantities must add up to ${item.quantity} for ${item.productName}.`, {
        code: 'INVALID_RETURN_QUANTITY',
      });
    }

    acceptedSubtotal += accepted * item.unitPrice;
    if (rejected > 0) {
      if (!RETURN_REASONS.includes(line.reason)) {
        throw new OrderError(400, 'A rejected line needs one of the return reasons.', { code: 'INVALID_RETURN_REASON' });
      }
      if (STORE_FAULT_REASONS.includes(line.reason)) hasStoreFault = true;
      returnedSubtotal += rejected * item.unitPrice;
      returnLines.push({
        orderItemId: item._id,
        productId: item.productId,
        productName: item.productName,
        quantity: rejected,
        unitPrice: item.unitPrice,
        reason: line.reason,
        ...(line.photo && { photo: line.photo }),
      });
    }
  }

  acceptedSubtotal = roundMoney(acceptedSubtotal);
  returnedSubtotal = roundMoney(returnedSubtotal);
  const everythingRejected = returnedSubtotal > 0 && acceptedSubtotal === 0;
  const feeRefunded = everythingRejected && hasStoreFault;
  const netTotal = Math.max(0, roundMoney(originalTotal - returnedSubtotal - (feeRefunded ? deliveryFee : 0)));

  return {
    fulfilment: returnedSubtotal === 0 ? 'FULL' : acceptedSubtotal === 0 ? 'NONE' : 'PARTIAL',
    acceptedSubtotal,
    returnedSubtotal,
    feeRefunded,
    netTotal,
    returnLines,
  };
}

/**
 * The brand's returned-goods inbox (docs/22 §F). Brand-scoped; platform admins are
 * unscoped, like the other brand screens. The customer never uses this list: the
 * order detail shows their own return in a customer-safe shape.
 */
function scopeFor(user, tenantBrandId) {
  if (user.role === ROLES.SUPER_ADMIN || user.role === ROLES.ADMIN_PARTNER) return {};
  return { brandId: tenantBrandId };
}

const DEFAULT_LIMIT = 20;

function toReturnView(ret, orderNumber) {
  const r = typeof ret.toObject === 'function' ? ret.toObject() : ret;
  return {
    _id: r._id,
    orderId: r.orderId,
    orderNumber: orderNumber || null,
    deliveryId: r.deliveryId,
    status: r.status,
    source: r.source,
    lines: r.lines.map((line) => ({
      orderItemId: line.orderItemId,
      productId: line.productId,
      productName: line.productName,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      reason: line.reason,
      restock: Boolean(line.restock),
      restockedAt: line.restockedAt || null,
      hasPhoto: Boolean(line.photo && line.photo.publicId),
    })),
    returnedSubtotal: r.returnedSubtotal,
    feeRefunded: Boolean(r.feeRefunded),
    refundAmount: r.refundAmount,
    currency: r.currency || 'PKR',
    receivedAt: r.receivedAt || null,
    createdAt: r.createdAt,
  };
}

async function listReturns(user, tenantBrandId, { status, page, limit } = {}) {
  const pageNumber = page || 1;
  const limitNumber = limit || DEFAULT_LIMIT;
  const filter = { ...scopeFor(user, tenantBrandId), ...(status && { status }) };

  const [items, total] = await Promise.all([
    Return.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber),
    Return.countDocuments(filter),
  ]);
  const orders = items.length ? await Order.find({ _id: { $in: items.map((r) => r.orderId) } }).select('orderNumber') : [];
  const numberByOrder = new Map(orders.map((o) => [String(o._id), o.orderNumber]));

  return {
    items: items.map((r) => toReturnView(r, numberByOrder.get(String(r.orderId)))),
    pagination: { page: pageNumber, limit: limitNumber, total, pages: Math.ceil(total / limitNumber) },
  };
}

async function getReturn(user, tenantBrandId, returnId) {
  const ret = await Return.findOne({ _id: returnId, ...scopeFor(user, tenantBrandId) });
  if (!ret) {
    throw new OrderError(404, 'Return not found.');
  }
  const order = await Order.findById(ret.orderId).select('orderNumber');
  return toReturnView(ret, order ? order.orderNumber : null);
}

/**
 * Totals for the returned-goods screen (docs/22 §F). Same scope as the list:
 * a brand sees only its own returns; platform admins see the whole platform.
 */
async function returnsSummary(user, tenantBrandId) {
  const items = await Return.find(scopeFor(user, tenantBrandId)).select('status returnedSubtotal refundAmount');
  const summary = {
    IN_TRANSIT: { count: 0, returnedSubtotal: 0 },
    RECEIVED: { count: 0, returnedSubtotal: 0 },
    returnedSubtotal: 0,
    refundAmount: 0,
  };
  for (const item of items) {
    const bucket = summary[item.status];
    if (bucket) {
      bucket.count += 1;
      bucket.returnedSubtotal = roundMoney(bucket.returnedSubtotal + item.returnedSubtotal);
    }
    summary.returnedSubtotal = roundMoney(summary.returnedSubtotal + item.returnedSubtotal);
    summary.refundAmount = roundMoney(summary.refundAmount + (item.refundAmount || 0));
  }
  return summary;
}

// The photo path must be inside THIS brand's and THIS delivery's return folder,
// which only someone who asked for that delivery's signature could have uploaded to.
function returnPhotoBelongsToDelivery({ brandId, deliveryId, publicId }) {
  if (typeof publicId !== 'string') return false;
  const folder = returnPhotoFolder(brandId, deliveryId);
  return publicId.startsWith(`${folder}/`) && publicId.length > folder.length + 1 && !publicId.includes('..');
}

const asOrderError = (err) => {
  if (err instanceof UploadError) {
    return new OrderError(err.status, err.message, { code: 'RETURN_PHOTO_NOT_CONFIGURED' });
  }
  return err;
};

// Step one of a door return: a signed upload into the delivery's private folder.
// The rider may only do this while the delivery is out for delivery.
async function createReturnPhotoUpload({ brandId, riderId, deliveryId }) {
  const delivery = await Delivery.findOne({ _id: deliveryId, brandId, riderId });
  if (!delivery) {
    throw new OrderError(404, 'Delivery not found.');
  }
  if (delivery.status !== 'OUT_FOR_DELIVERY') {
    throw new OrderError(409, 'A return photo can only be taken while the delivery is out for delivery.', {
      code: 'RETURN_PHOTO_NOT_ALLOWED',
    });
  }
  try {
    return createReturnPhotoSignature(brandId, deliveryId);
  } catch (err) {
    throw asOrderError(err);
  }
}

// A short-lived link to one refused item's photo; brand-scoped, and the photo
// path never leaves the server. A platform admin may view it for a brand.
async function getReturnPhotoLink(user, tenantBrandId, returnId, lineIndex) {
  const ret = await Return.findOne({ _id: returnId, ...scopeFor(user, tenantBrandId) });
  if (!ret) {
    throw new OrderError(404, 'Return not found.');
  }
  const line = ret.lines[lineIndex];
  if (!line) {
    throw new OrderError(404, 'That return line does not exist.', { code: 'RETURN_LINE_NOT_FOUND' });
  }
  if (!line.photo || !line.photo.publicId) {
    throw new OrderError(404, 'There is no photo for this line.', { code: 'RETURN_PHOTO_NOT_FOUND' });
  }
  try {
    return createProofDownloadUrl(line.photo.publicId);
  } catch (err) {
    throw asOrderError(err);
  }
}

/**
 * The store takes the goods in and decides per line: restock (sellable) or write
 * off (default). One atomic IN_TRANSIT -> RECEIVED update wins, so a retry or a
 * concurrent request can never restock the same units twice. Restock and its
 * inventory movement commit in the same transaction as the status change.
 *
 * `decisions` maps a return line index (as sent by the client) to a boolean.
 * A line without a decision keeps its safe default (write off).
 */
async function receiveReturn({ user, tenantBrandId, returnId, decisions = [] }) {
  const decided = new Map();
  for (const entry of decisions) {
    if (decided.has(entry.index)) {
      throw new OrderError(400, 'A return line was sent twice.', { code: 'INVALID_RETURN_DECISIONS' });
    }
    decided.set(entry.index, Boolean(entry.restock));
  }

  const result = await runInTransaction(async (session) => {
    const ret = await Return.findOne({ _id: returnId, ...scopeFor(user, tenantBrandId) }).session(session);
    if (!ret) {
      throw new OrderError(404, 'Return not found.');
    }
    if (decided.size) {
      for (const index of decided.keys()) {
        if (!Number.isInteger(index) || index < 0 || index >= ret.lines.length) {
          throw new OrderError(400, 'A return line does not exist.', { code: 'INVALID_RETURN_DECISIONS' });
        }
      }
    }

    const now = new Date();
    const lines = ret.lines.map((line, index) => ({
      ...(typeof line.toObject === 'function' ? line.toObject() : line),
      restock: decided.has(index) ? decided.get(index) : Boolean(line.restock),
      restockedAt: decided.has(index) && decided.get(index) ? now : line.restockedAt || null,
    }));

    const updated = await Return.findOneAndUpdate(
      { _id: ret._id, status: 'IN_TRANSIT' },
      { $set: { status: 'RECEIVED', receivedAt: now, receivedBy: user._id, lines } },
      { new: true, session }
    );
    if (!updated) {
      throw new OrderError(409, 'This return has already been received.', { code: 'RETURN_ALREADY_RECEIVED' });
    }

    for (const line of lines) {
      if (!line.restock) continue;
      await restockStock(line.productId, line.quantity, { session });
      await InventoryMovement.create(
        [
          {
            productId: line.productId,
            brandId: updated.brandId,
            orderId: updated.orderId,
            reason: 'RETURN_RESTOCKED',
            quantityChange: line.quantity,
            by: user._id,
          },
        ],
        { session }
      );
    }
    return updated;
  });

  const order = await Order.findById(result.orderId).select('orderNumber');
  return toReturnView(result, order ? order.orderNumber : null);
}

module.exports = {
  buildCompletion,
  listReturns,
  getReturn,
  returnsSummary,
  receiveReturn,
  returnPhotoBelongsToDelivery,
  createReturnPhotoUpload,
  getReturnPhotoLink,
  toReturnView,
};
