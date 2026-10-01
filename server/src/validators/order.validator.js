const { z } = require('zod');
const { ORDER_STATUSES } = require('../config/orderStatuses');
const { BRAND_SETTABLE_STATUSES } = require('../config/orderTransitions');

/**
 * Checkout / order validation (docs/05 §15-16). The client sends ONLY the
 * delivery address and payment method — never items, prices, brand or
 * totals; those come from the server-side cart and database (docs/08 §5).
 */
const text = (max) => z.string().trim().min(1).max(max);

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
  additionalInstructions: z.string().trim().max(500).optional(),
});

// COD is the only method implemented in the MVP (docs/08 §25).
const createOrderSchema = z.object({
  shippingAddress: shippingAddressSchema,
  paymentMethod: z.literal('COD', { error: 'Only COD is supported' }),
});

const listOrdersQuerySchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const updateOrderStatusSchema = z.object({
  status: z.enum(BRAND_SETTABLE_STATUSES, {
    error: `status must be one of: ${BRAND_SETTABLE_STATUSES.join(', ')}`,
  }),
});

module.exports = { createOrderSchema, listOrdersQuerySchema, updateOrderStatusSchema };
