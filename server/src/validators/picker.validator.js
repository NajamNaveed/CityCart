const mongoose = require('mongoose');
const { z } = require('zod');
const { PICK_STATUSES } = require('../config/pickStatuses');

const objectId = z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), {
  message: 'Invalid id.',
});

const listQueueQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const pickLineSchema = z.object({
  pickStatus: z.enum(PICK_STATUSES, {
    error: `pickStatus must be one of: ${PICK_STATUSES.join(', ')}`,
  }),
  pickedQty: z.number().int().min(1).optional(),
});

const pickerAdjustmentSchema = z.object({
  note: z.string().trim().min(3).max(500),
  restockRemoved: z.boolean().optional(),
  substitutes: z
    .array(
      z.object({
        orderItemId: objectId,
        productId: objectId,
        quantity: z.number().int().min(1),
      })
    )
    .max(50)
    .optional(),
});

const orderItemParamsSchema = z.object({ id: objectId, itemId: objectId });

const productSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(80).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

module.exports = {
  listQueueQuerySchema,
  pickLineSchema,
  pickerAdjustmentSchema,
  orderItemParamsSchema,
  productSearchQuerySchema,
};
