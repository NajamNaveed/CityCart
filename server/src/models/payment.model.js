const mongoose = require('mongoose');
const { COLLECTION_METHODS, COLLECTION_WALLETS, PROOF_VERIFICATIONS } = require('../config/paymentCollection');

/**
 * Payment model.
 *
 * Source of truth: docs/04-database-design.md, §26 (Payment Model) and
 * §27 (Payment Status).
 *
 * Payment status is tracked independently of order status (§27) — e.g.
 * an order can be DELIVERED while its payment is separately PAID.
 */
const PAYMENT_METHODS = ['COD', 'CARD', 'BANK_TRANSFER', 'WALLET', 'ONLINE_GATEWAY'];
const PAYMENT_STATUSES = ['PENDING', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELLED'];

const collectionSchema = new mongoose.Schema(
  {
    method: { type: String, enum: COLLECTION_METHODS, required: true },
    // WALLET only: which wallet the customer used.
    wallet: { type: String, enum: COLLECTION_WALLETS },
    // The transaction id or the card machine's approval code (never a card number).
    reference: { type: String, trim: true },
    // Cloudinary authenticated upload. The public id is the asset's full path and
    // is checked against the brand/delivery folder before it is accepted.
    proof: {
      publicId: { type: String, trim: true },
      fingerprint: { type: String, trim: true },
    },
    // Non-cash payments start "paid but unverified"; the brand checks the proof.
    verification: { type: String, enum: PROOF_VERIFICATIONS },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    verifiedAt: { type: Date },
    note: { type: String, trim: true },
    // Duplicate use is flagged, never blocked: the same reference or the same photo
    // (Cloudinary's etag) on another payment of this brand.
    duplicateReference: { type: Boolean, default: false },
    duplicateProof: { type: Boolean, default: false },
    // Set by the retention job once the photo has been deleted from Cloudinary.
    proofDeletedAt: { type: Date },
  },
  { _id: false }
);

const paymentSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      // Not documented as unique in §33 (unlike Delivery.orderId), so
      // left as a plain index rather than an invented uniqueness
      // constraint.
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    method: {
      type: String,
      enum: PAYMENT_METHODS,
      required: true,
    },
    status: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: 'PENDING',
      index: true,
    },
    currency: {
      type: String,
      default: 'PKR',
    },
    transactionReference: {
      type: String,
      trim: true,
    },
    provider: {
      type: String,
      trim: true,
    },
    // docs/10 §11: who confirmed collection (set when COD is marked PAID).
    confirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    paidAt: {
      type: Date,
    },
    // Online payments only: when the stock hold ends. An order still unpaid then is
    // cancelled and its stock released (docs/10 §29).
    expiresAt: {
      type: Date,
    },
    // Cash handling (docs/10 §11a, docs/20 §8). Set when cash is collected on
    // delivery: the brand, who physically received the cash (a rider or a team
    // member) and when. brandId is stored here (payments are otherwise scoped
    // through their order) so cash can be summed per brand without a join.
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Brand',
    },
    collectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    collectedAt: {
      type: Date,
    },
    // Set when the brand confirms the collector handed that cash over.
    settledAt: {
      type: Date,
    },
    settledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    // How the customer paid at the door, including the proof photo of a non-cash
    // payment (docs/21 §I).
    collection: {
      type: collectionSchema,
    },
    // Refunds (docs/10 §13): cumulative total + an audit entry per refund.
    refundedAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    refunds: {
      type: [
        new mongoose.Schema(
          {
            amount: { type: Number, required: true, min: 0 },
            reason: { type: String, required: true },
            by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            at: { type: Date, default: Date.now },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  {
    timestamps: true,
    // `collection` is a reserved *schema* key but a normal document path here
    // (docs/21 §I.6 names it); the warning is a false positive for nested data.
    suppressReservedKeysWarning: true,
  }
);

// Finding the payment a gateway notification is about, and the expiry sweep.
paymentSchema.index({ provider: 1, transactionReference: 1 });
paymentSchema.index({ method: 1, status: 1, expiresAt: 1 });

// Cash still held by a collector, per brand.
paymentSchema.index({ brandId: 1, collectedBy: 1, settledAt: 1 });

// The brand's verification queue: non-cash proofs waiting for (or given) a decision.
paymentSchema.index({ brandId: 1, 'collection.verification': 1, paidAt: 1 });
// Duplicate-reference / duplicate-photo checks when a proof is submitted.
paymentSchema.index({ brandId: 1, 'collection.reference': 1 });
paymentSchema.index({ 'collection.proof.fingerprint': 1 });

const Payment = mongoose.model('Payment', paymentSchema);

module.exports = Payment;