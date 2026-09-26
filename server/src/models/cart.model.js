const mongoose = require('mongoose');

/**
 * Cart model — belongs to one customer, may contain items from multiple
 * brands.
 *
 * Source of truth: docs/04-database-design.md, §20 (Cart Model) and §21
 * (Cart Example).
 *
 * Cart items are embedded subdocuments (§32 — data that belongs tightly
 * to its parent and is normally read with it). Only productId, brandId,
 * and quantity are stored per item — price/availability must be resolved
 * server-side at read/checkout time, never trusted from the client (§20:
 * "The client must not be trusted to determine final prices.").
 */
const cartItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  brandId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Brand',
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
});

const cartSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    items: {
      type: [cartItemSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

const Cart = mongoose.model('Cart', cartSchema);

module.exports = Cart;