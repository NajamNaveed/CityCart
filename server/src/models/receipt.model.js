const mongoose = require('mongoose');
const { COLLECTION_METHODS, COLLECTION_WALLETS } = require('../config/paymentCollection');

/**
 * Receipt model (docs/10 §28, docs/04 §26a).
 *
 * One receipt per paid payment, issued automatically when a payment becomes PAID
 * and never edited afterwards (a refund does not change it). Everything on it is
 * a snapshot, so later changes to a product, a brand name or an address can never
 * alter a receipt that was already issued.
 */
const PAYMENT_METHODS = ['COD', 'CARD', 'BANK_TRANSFER', 'WALLET', 'ONLINE_GATEWAY'];

const receiptItemSchema = new mongoose.Schema(
  {
    productName: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    totalPrice: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const receiptSchema = new mongoose.Schema(
  {
    receiptNumber: { type: String, required: true, unique: true },
    // Unique: a payment can have only one receipt, which also makes issuing idempotent.
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', required: true, unique: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    orderNumber: { type: String, required: true },
    brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true },
    brandName: { type: String, required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    billedTo: { type: String },
    method: { type: String, enum: PAYMENT_METHODS, required: true },
    // How a COD order was actually paid at the door (docs/21 §I.5), snapshotted when
    // the receipt is issued. The verification state is read live from the payment.
    collectionMethod: { type: String, enum: COLLECTION_METHODS },
    collectionWallet: { type: String, enum: COLLECTION_WALLETS },
    collectionReference: { type: String },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'PKR' },
    items: { type: [receiptItemSchema], default: [] },
    subtotal: { type: Number, required: true, min: 0 },
    deliveryFee: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    tax: { type: Number, default: 0, min: 0 },
    transactionReference: { type: String },
    provider: { type: String },
    // Who took the cash (COD) at the door, as a snapshot name for the brand's records.
    collectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    collectedByName: { type: String },
    issuedAt: { type: Date, default: Date.now },
  },
  // Receipts are never updated, so there is no updatedAt.
  { timestamps: { createdAt: true, updatedAt: false } }
);

receiptSchema.index({ customerId: 1, issuedAt: -1 });
receiptSchema.index({ brandId: 1, issuedAt: -1 });

module.exports = mongoose.model('Receipt', receiptSchema);
