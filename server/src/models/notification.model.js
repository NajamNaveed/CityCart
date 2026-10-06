const mongoose = require('mongoose');

/**
 * Notification model.
 *
 * Source of truth: docs/04-database-design.md, §29 (Notification Model).
 * Type list from docs/12-notification-system.md §4 (Notification Types).
 *
 * Unlike every other model in this pass, §29's field list has no
 * `updatedAt` — only `createdAt`. Notifications are effectively
 * append-only (only `isRead` ever changes), so timestamps are configured
 * accordingly here instead of using the default `{ timestamps: true }`.
 */
const NOTIFICATION_TYPES = [
  'ORDER_CREATED',
  'ORDER_CONFIRMED',
  'ORDER_REJECTED',
  'ORDER_PROCESSING',
  'ORDER_SHIPPED',
  'ORDER_OUT_FOR_DELIVERY',
  'ORDER_DELIVERED',
  'ORDER_CANCELLED',
  'LOW_STOCK',
  'OUT_OF_STOCK',
  'PAYMENT_RECEIVED',
  'PAYMENT_FAILED',
  'REFUND_ISSUED',
  'EMPLOYEE_CREATED',
  'EMPLOYEE_PERMISSION_CHANGED',
  'NEW_REVIEW',
  'SYSTEM_NOTIFICATION',
];
// NEW_REVIEW is the one type added beyond doc12 §4's initial list: §6 lists
// "New review received" as a brand notification example, and §4 explicitly
// allows "additional types may be added later". doc04 §29 was updated to match.

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      // Lookups are always by recipient (§29 — "should only be visible to
      // their intended recipient"); indexed via the compound indexes below
      // (whose { userId } prefix covers the single-field case), so a
      // standalone index would be redundant.
    },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    // doc12 §9/§10: set when the recipient opens the notification. Not in
    // doc04 §29's field list; §10 says "The database may use isRead, readAt".
    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Inbox queries are always "one user's notifications": the unread badge
// counts { userId, isRead: false } and the list sorts { userId, createdAt }.
// Both compound indexes serve those; their userId prefix covers any
// userId-only lookup.
notificationSchema.index({ userId: 1, isRead: 1 });
notificationSchema.index({ userId: 1, createdAt: -1 });

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;