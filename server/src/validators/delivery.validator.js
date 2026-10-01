const { z } = require('zod');
const { DELIVERY_STATUSES } = require('../config/deliveryStatuses');
const { DELIVERY_SETTABLE_STATUSES } = require('../config/deliveryTransitions');

const listDeliveriesQuerySchema = z.object({
  status: z.enum(DELIVERY_STATUSES).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

// Only status (+ a reason for FAILED) can be sent. The order and payment
// status are NEVER settable here (docs/05 §22a) — they follow the delivery
// server-side.
const updateDeliveryStatusSchema = z
  .object({
    status: z.enum(DELIVERY_SETTABLE_STATUSES, {
      error: `status must be one of: ${DELIVERY_SETTABLE_STATUSES.join(', ')}`,
    }),
    failureReason: z.string().trim().min(1).max(300).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.status === 'FAILED' && !value.failureReason) {
      ctx.addIssue({ code: 'custom', path: ['failureReason'], message: 'failureReason is required when status is FAILED' });
    }
  });

const updateDeliverySchema = z
  .object({
    trackingReference: z.string().trim().min(1).max(100).optional(),
    assignedAgent: z.string().trim().min(1).max(100).optional(),
  })
  .refine((v) => v.trackingReference !== undefined || v.assignedAgent !== undefined, {
    message: 'Provide trackingReference and/or assignedAgent',
  });

module.exports = { listDeliveriesQuerySchema, updateDeliveryStatusSchema, updateDeliverySchema };
