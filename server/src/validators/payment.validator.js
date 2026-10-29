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

// Super admin's review list of what the gateway told us (docs/10 §29).
const PaymentEvent = require('../models/paymentEvent.model');
const listPaymentEventsQuerySchema = z.object({
  outcome: z.enum(PaymentEvent.OUTCOMES).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const mockCheckoutParamsSchema = z.object({
  reference: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/),
});
const mockCheckoutChoiceSchema = z.object({
  reference: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/),
  choice: z.enum(['pay', 'fail']),
});

// --- Payment proofs taken at the door (docs/21 §I) ---
const proofQueueQuerySchema = z.object({
  status: z.enum(['SUBMITTED', 'VERIFIED', 'REJECTED']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const proofDecisionSchema = z
  .object({
    verification: z.enum(['VERIFIED', 'REJECTED'], { error: 'verification must be VERIFIED or REJECTED' }),
    note: z.string().trim().min(1).max(300).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.verification === 'REJECTED' && !value.note) {
      ctx.addIssue({ code: 'custom', path: ['note'], message: 'note is required when rejecting a proof' });
    }
  });

module.exports = {
  orderIdParamSchema,
  updatePaymentStatusSchema,
  listPaymentEventsQuerySchema,
  mockCheckoutParamsSchema,
  mockCheckoutChoiceSchema,
  proofQueueQuerySchema,
  proofDecisionSchema,
};
