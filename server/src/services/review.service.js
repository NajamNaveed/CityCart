const mongoose = require('mongoose');

const Review = require('../models/review.model');
const Order = require('../models/order.model');
const Product = require('../models/product.model');
const Brand = require('../models/brand.model');
const User = require('../models/user.model');
const { notifyBrandOfNewReview } = require('./notification.service');

class ReviewError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const DEFAULT_LIMIT = 10;
const MAX_SUMMARY_PRODUCTS = 60;
const toObjectId = (value) => new mongoose.Types.ObjectId(value);

// "Sana Iqbal" -> "Sana I." : shoppers see a first name and an initial, never an email or a full name.
function shortName(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Customer';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

// [{ _id: rating, count }] -> { average, count, distribution: { 1..5 } }
function summarise(groups = []) {
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let count = 0;
  let total = 0;
  for (const group of groups) {
    distribution[group._id] = group.count;
    count += group.count;
    total += group._id * group.count;
  }
  return { average: count ? Math.round((total / count) * 10) / 10 : 0, count, distribution };
}

const paginate = (page, limit, total) => ({ page, limit, total, pages: Math.ceil(total / limit) });

async function nameMap(Model, ids, field = 'name') {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (unique.length === 0) return new Map();
  const docs = await Model.find({ _id: { $in: unique } }).select(field);
  return new Map(docs.map((d) => [String(d._id), d[field]]));
}

const plain = (doc) => (typeof doc.toObject === 'function' ? doc.toObject() : doc);

// A product's reviews are public only while the product itself is (same rule as the product page).
async function assertPublicProduct(productId) {
  const product = await Product.findOne({ _id: productId, status: 'ACTIVE', isActive: true });
  if (!product) throw new ReviewError(404, 'Product not found.');
  const brand = await Brand.findOne({ _id: product.brandId, status: 'ACTIVE' });
  if (!brand) throw new ReviewError(404, 'Product not found.');
}

async function listProductReviews(productId, { page = 1, limit = DEFAULT_LIMIT } = {}) {
  await assertPublicProduct(productId);
  const filter = { productId, isApproved: true };

  const [items, total, groups] = await Promise.all([
    Review.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Review.countDocuments(filter),
    Review.aggregate([
      { $match: { productId: toObjectId(productId), isApproved: true } },
      { $group: { _id: '$rating', count: { $sum: 1 } } },
    ]),
  ]);
  const names = await nameMap(User, items.map((r) => r.customerId));

  return {
    reviews: items.map((r) => ({
      _id: r._id,
      rating: r.rating,
      title: r.title,
      comment: r.comment,
      reviewerName: shortName(names.get(String(r.customerId))),
      verifiedPurchase: Boolean(r.orderId),
      createdAt: r.createdAt,
    })),
    summary: summarise(groups),
    pagination: paginate(page, limit, total),
  };
}

// { [productId]: { average, count } } for product cards. Products without reviews are simply absent.
async function ratingsFor(rawIds) {
  const ids = [...new Set(rawIds)].filter((id) => mongoose.Types.ObjectId.isValid(id)).slice(0, MAX_SUMMARY_PRODUCTS);
  if (ids.length === 0) return {};

  const groups = await Review.aggregate([
    { $match: { productId: { $in: ids.map(toObjectId) }, isApproved: true } },
    { $group: { _id: '$productId', count: { $sum: 1 }, total: { $sum: '$rating' } } },
  ]);
  return Object.fromEntries(
    groups.map((g) => [String(g._id), { average: Math.round((g.total / g.count) * 10) / 10, count: g.count }])
  );
}

async function createReview(customerId, { orderId, productId, rating, title, comment }) {
  // Only the customer's OWN order counts, and only once it was delivered.
  const order = await Order.findOne({ _id: orderId, customerId });
  if (!order) throw new ReviewError(404, 'Order not found.');
  if (order.orderStatus !== 'DELIVERED') {
    throw new ReviewError(409, 'You can review a product once your order has been delivered.', { code: 'ORDER_NOT_DELIVERED' });
  }
  if (!order.items.some((item) => String(item.productId) === String(productId))) {
    throw new ReviewError(400, 'That product is not part of this order.', { code: 'PRODUCT_NOT_IN_ORDER' });
  }

  try {
    // brandId comes from the order, never from the request. A verified purchase is shown straight away;
    // the super admin can hide a review that breaks the rules.
    const review = await Review.create({
      customerId,
      productId,
      brandId: order.brandId,
      orderId: order._id,
      rating,
      ...(title && { title }),
      ...(comment && { comment }),
      isApproved: true,
    });
    // Post-create and best-effort: a failed alert must not fail the review.
    await notifyBrandOfNewReview(review);
    return review;
  } catch (err) {
    if (err && err.code === 11000) {
      throw new ReviewError(409, 'You have already reviewed this product.', { code: 'ALREADY_REVIEWED' });
    }
    throw err;
  }
}

async function listMyReviews(customerId, { orderId } = {}) {
  return Review.find({ customerId, ...(orderId && { orderId }) }).sort({ createdAt: -1 }).limit(100);
}

async function updateMyReview(customerId, id, changes) {
  const review = await Review.findOneAndUpdate({ _id: id, customerId }, { $set: changes }, { new: true, runValidators: true });
  if (!review) throw new ReviewError(404, 'Review not found.');
  return review;
}

async function removeMyReview(customerId, id) {
  const review = await Review.findOneAndDelete({ _id: id, customerId });
  if (!review) throw new ReviewError(404, 'Review not found.');
}

// The brand dashboard: approved reviews of THIS brand's products only (brandId comes from the tenant).
async function listBrandReviews(brandId, { rating, productId, page = 1, limit = DEFAULT_LIMIT } = {}) {
  const filter = { brandId, isApproved: true, ...(rating && { rating }), ...(productId && { productId }) };

  const [items, total, groups] = await Promise.all([
    Review.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Review.countDocuments(filter),
    Review.aggregate([
      { $match: { brandId: toObjectId(String(brandId)), isApproved: true } },
      { $group: { _id: '$rating', count: { $sum: 1 } } },
    ]),
  ]);
  const [people, products] = await Promise.all([
    nameMap(User, items.map((r) => r.customerId)),
    nameMap(Product, items.map((r) => r.productId)),
  ]);

  return {
    reviews: items.map((r) => ({
      _id: r._id,
      rating: r.rating,
      title: r.title,
      comment: r.comment,
      reviewerName: shortName(people.get(String(r.customerId))),
      productId: r.productId,
      productName: products.get(String(r.productId)) || 'A product',
      createdAt: r.createdAt,
    })),
    summary: summarise(groups),
    pagination: paginate(page, limit, total),
  };
}

// Super admin: every review, visible or hidden, with who wrote it and for which brand and product.
async function listAdminReviews({ approved, brandId, rating, page = 1, limit = 20 } = {}) {
  const filter = {
    ...(approved && { isApproved: approved === 'true' }),
    ...(brandId && { brandId }),
    ...(rating && { rating }),
  };

  const [items, total] = await Promise.all([
    Review.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Review.countDocuments(filter),
  ]);
  const [people, brands, products] = await Promise.all([
    nameMap(User, items.map((r) => r.customerId)),
    nameMap(Brand, items.map((r) => r.brandId)),
    nameMap(Product, items.map((r) => r.productId)),
  ]);

  return {
    reviews: items.map((r) => ({
      ...plain(r),
      customerName: people.get(String(r.customerId)) || 'Unknown',
      brandName: brands.get(String(r.brandId)) || 'Unknown brand',
      productName: products.get(String(r.productId)) || 'Unknown product',
    })),
    pagination: paginate(page, limit, total),
  };
}

async function setReviewApproval(id, isApproved) {
  const review = await Review.findByIdAndUpdate(id, { $set: { isApproved } }, { new: true });
  if (!review) throw new ReviewError(404, 'Review not found.');
  return review;
}

module.exports = {
  ReviewError,
  shortName,
  summarise,
  listProductReviews,
  ratingsFor,
  createReview,
  listMyReviews,
  updateMyReview,
  removeMyReview,
  listBrandReviews,
  listAdminReviews,
  setReviewApproval,
};