const mongoose = require('mongoose');
const { z } = require('zod');

/**
 * Cart validation (docs/05 §14, docs/07 §23). Only productId and quantity
 * are ever accepted from the client — price, brandId, subtotal and
 * discounts are never fields here (docs/07 §23: "The backend must not
 * trust price, discount, subtotal, brandId").
 */
const MAX_ITEM_QUANTITY = 99;

const objectIdString = z.string().refine((v) => mongoose.Types.ObjectId.isValid(v), {
  message: 'Invalid id.',
});

const quantity = z
  .number({ error: 'quantity must be a number' })
  .int('quantity must be a whole number')
  .min(1, 'quantity must be at least 1')
  .max(MAX_ITEM_QUANTITY, `quantity cannot exceed ${MAX_ITEM_QUANTITY}`);

const addItemSchema = z.object({ productId: objectIdString, quantity });
const updateItemSchema = z.object({ quantity });
const productIdParamSchema = z.object({ productId: objectIdString });

module.exports = { addItemSchema, updateItemSchema, productIdParamSchema, MAX_ITEM_QUANTITY };
