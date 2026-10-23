const mongoose = require('mongoose');
const Payment = require('../models/payment.model');
const Order = require('../models/order.model');
const User = require('../models/user.model');
const { runInTransaction } = require('../utils/transaction');
const { OrderError } = require('./order.service');

/**
 * Cash on delivery is money in someone's pocket until it is handed over
 * (docs/10 §11a, docs/20 §8). A payment records who collected the cash
 * (collectedBy) when the delivery is completed, and the brand marks it settled
 * once that person has handed the cash over. Everything is scoped to the brand.
 */
const MAX_LIST = 200;

const outstandingFilter = (brandId) => ({
  brandId,
  collectedBy: { $exists: true },
  settledAt: { $exists: false },
});

/**
 * Without a collector: how much each person holds right now.
 * With collectorId: that person's unsettled payments, oldest first, so the brand
 * can tick off exactly what was handed over.
 */
async function cashOutstanding({ brandId, collectorId }) {
  if (!collectorId) {
    const groups = await Payment.aggregate([
      { $match: { ...outstandingFilter(new mongoose.Types.ObjectId(brandId)) } },
      { $group: { _id: '$collectedBy', count: { $sum: 1 }, total: { $sum: '$amount' }, oldest: { $min: '$collectedAt' } } },
      { $sort: { oldest: 1 } },
    ]);
    const users = groups.length ? await User.find({ _id: { $in: groups.map((g) => g._id) }, brandId }).select('name role') : [];
    const byId = new Map(users.map((u) => [String(u._id), u]));
    return {
      collectors: groups.map((g) => ({
        collectorId: g._id,
        name: byId.get(String(g._id)) ? byId.get(String(g._id)).name : 'Unknown',
        role: byId.get(String(g._id)) ? byId.get(String(g._id)).role : undefined,
        count: g.count,
        total: g.total,
        oldest: g.oldest,
      })),
    };
  }

  const payments = await Payment.find({ ...outstandingFilter(brandId), collectedBy: collectorId })
    .sort({ collectedAt: 1 })
    .limit(MAX_LIST);
  const orders = payments.length ? await Order.find({ _id: { $in: payments.map((p) => p.orderId) } }).select('orderNumber') : [];
  const numberByOrder = new Map(orders.map((o) => [String(o._id), o.orderNumber]));
  return {
    payments: payments.map((p) => ({
      paymentId: p._id,
      orderNumber: numberByOrder.get(String(p.orderId)) || null,
      amount: p.amount,
      collectedAt: p.collectedAt,
    })),
    total: payments.reduce((sum, p) => sum + p.amount, 0),
  };
}

/**
 * Marks the listed payments of one collector as handed over. All or nothing: if
 * any listed payment is not (or no longer) an unsettled payment of this brand
 * collected by that person, nothing is settled and the brand is asked to reload.
 */
async function settleCash({ brandId, collectorId, paymentIds, userId }) {
  const unique = [...new Set(paymentIds.map(String))];
  const filter = { ...outstandingFilter(brandId), _id: { $in: unique }, collectedBy: collectorId };

  return runInTransaction(async (session) => {
    const eligible = await Payment.find(filter).session(session);
    if (eligible.length !== unique.length) {
      throw new OrderError(409, 'The cash changed since you loaded it. Reload and count again.', {
        code: 'CASH_CHANGED',
      });
    }
    const result = await Payment.updateMany(filter, { $set: { settledAt: new Date(), settledBy: userId } }, { session });
    if (result.modifiedCount !== unique.length) {
      throw new OrderError(409, 'The cash changed since you loaded it. Reload and count again.', {
        code: 'CASH_CHANGED',
      });
    }
    return { settled: unique.length, total: eligible.reduce((sum, p) => sum + p.amount, 0) };
  });
}

module.exports = { cashOutstanding, settleCash };
