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
  'SYSTEM_NOTIFICATION',
];

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      // Not documented as a required index in doc04 §33 (Notification
      // isn't listed there), but added per AGENTS.md §13 ("add indexes
      // where justified") since notifications are always looked up by
      // recipient (§29 — "should only be visible to their intended
      // recipient").
      index: true,
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
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;