const mongoose = require('mongoose');
const { z } = require('zod');

const orderIdParamSchema = z.object({
  orderId: z.string().refine((v) => mongoose.Types.ObjectId.isValid(v), { message: 'Invalid orderId' }),
});

// Money with at most 2 decimal places (cents), strictly positive.
const refundAmount = z
  .number({ error: 'refundAmount must be a number' })
  .positive('refundAmount must be greater than 0')
  .max(100000000)
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, {
    message: 'refundAmount can have at most 2 decimal places',
  });

/**
 * docs/10 §19. Status can only be PAID (manual safety net after delivery),
 * REFUNDED (the whole remaining amount) or PARTIALLY_REFUNDED. Other
 * statuses are driven by the system (delivery -> PAID, cancel -> CANCELLED).
 */
const updatePaymentStatusSchema = z
  .object({
    status: z.enum(['PAID', 'REFUNDED', 'PARTIALLY_REFUNDED'], {
      error: 'status must be one of: PAID, REFUNDED, PARTIALLY_REFUNDED',
    }),
    refundAmount: refundAmount.optional(),
    refundReason: z.string().trim().min(1).max(300).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.status === 'PAID') return;
    if (!v.refundReason) {
      ctx.addIssue({ code: 'custom', path: ['refundReason'], message: 'refundReason is required for refunds' });
    }
    if (v.status === 'PARTIALLY_REFUNDED' && v.refundAmount === undefined) {
      ctx.addIssue({ code: 'custom', path: ['refundAmount'], message: 'refundAmount is required for a partial refund' });
    }
  });

module.exports = { orderIdParamSchema, updatePaymentStatusSchema };
