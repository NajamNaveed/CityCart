const { z } = require('zod');
const { ORDER_STATUSES } = require('../config/orderStatuses');
const { BRAND_SETTABLE_STATUSES } = require('../config/orderTransitions');
const mongoose = require('mongoose');

/**
 * Checkout / order validation (docs/05 §15-16). The client sends ONLY the
 * delivery address and payment method — never items, prices, brand or
 * totals; those come from the server-side cart and database (docs/08 §5).
 */
const text = (max) => z.string().trim().min(1).max(max);

// Delivery notes are required on every order — the courier needs them — and
// are counted in WORDS, not characters (the checkout UI shows the same
// counter; keep the two limits in sync).
const MAX_NOTE_WORDS = 200;
const countWords = (value) => value.trim().split(/\s+/).filter(Boolean).length;

const shippingAddressSchema = z.object({
  fullName: text(100),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9][0-9\s-]{6,19}$/, 'Invalid phone number'),
  addressLine: text(300),
  city: text(100),
  state: text(100).optional(),
  postalCode: text(20).optional(),
  country: text(100).optional(),
  additionalInstructions: z
    .string()
    .trim()
    .max(2000, 'Delivery notes are too long.')
    .refine((value) => countWords(value) >= 1, { message: 'Delivery notes are required.' })
    .refine((value) => countWords(value) <= MAX_NOTE_WORDS, {
      message: `Delivery notes must be at most ${MAX_NOTE_WORDS} words.`,
    }),
});

// COD always; ONLINE_GATEWAY only while a payment provider is switched on (checked at checkout).
const createOrderSchema = z.object({
  shippingAddress: shippingAddressSchema,
  paymentMethod: z.enum(['COD', 'ONLINE_GATEWAY'], { error: 'paymentMethod must be COD or ONLINE_GATEWAY' }),
});

const listOrdersQuerySchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

// Super admin: every order on the platform, optionally narrowed to one brand or order number.
const adminListOrdersQuerySchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  brandId: z.string().refine((v) => mongoose.Types.ObjectId.isValid(v), { message: 'Invalid id.' }).optional(),
  search: z.string().trim().min(1).max(40).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const updateOrderStatusSchema = z.object({
  status: z.enum(BRAND_SETTABLE_STATUSES, {
    error: `status must be one of: ${BRAND_SETTABLE_STATUSES.join(', ')}`,
  }),
});

// Order adjustments (docs/21 §H). The client picks the order line, how many
// units the brand can supply, and optionally a same-brand substitute; prices
// and brand ownership are resolved server-side.
const objectId = z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), {
  message: 'Invalid id.',
});

const adjustmentLineSchema = z.object({
  orderItemId: objectId,
  supplyQuantity: z.number().int().min(0),
  substitute: z
    .object({
      productId: objectId,
      quantity: z.number().int().min(1),
    })
    .nullable()
    .optional(),
});

const proposeAdjustmentSchema = z.object({
  note: text(500),
  restockRemoved: z.boolean().optional(),
  lines: z.array(adjustmentLineSchema).min(1).max(50),
});

const respondAdjustmentSchema = z.object({
  action: z.enum(['ACCEPT', 'REMOVE', 'CANCEL_ORDER'], {
    error: 'action must be one of: ACCEPT, REMOVE, CANCEL_ORDER',
  }),
});

const adjustmentParamsSchema = z.object({
  id: objectId,
  adjustmentId: objectId,
});

module.exports = {
  createOrderSchema,
  listOrdersQuerySchema,
  adminListOrdersQuerySchema,
  updateOrderStatusSchema,
  proposeAdjustmentSchema,
  respondAdjustmentSchema,
  adjustmentParamsSchema,
  MAX_NOTE_WORDS,
};