const mongoose = require('mongoose');
const { z } = require('zod');

const objectId = z.string().refine((v) => mongoose.Types.ObjectId.isValid(v), { message: 'Invalid id' });

const outstandingQuerySchema = z.object({
  collectorId: objectId.optional(),
});

// The payments the brand counted and received. Listing them explicitly means a
// payment collected a moment later is never settled by accident.
const settleCashSchema = z.object({
  collectorId: objectId,
  paymentIds: z.array(objectId).min(1).max(200),
});

module.exports = { outstandingQuerySchema, settleCashSchema };
