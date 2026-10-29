const mongoose = require('mongoose');
const { z } = require('zod');
const { DELIVERY_STATUSES } = require('../config/deliveryStatuses');
const { DELIVERY_SETTABLE_STATUSES, RIDER_SETTABLE_STATUSES } = require('../config/deliveryTransitions');
const { COLLECTION_METHODS, COLLECTION_WALLETS } = require('../config/paymentCollection');
const { CODE_PATTERN, CODE_LENGTH } = require('../utils/deliveryCode');

const objectId = z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), { message: 'Invalid id' });

const listDeliveriesQuerySchema = z.object({
  status: z.enum(DELIVERY_STATUSES).optional(),
  riderId: objectId.optional(),
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

// riderId null takes the rider off the delivery.
const assignRiderSchema = z.object({ riderId: objectId.nullable() });

// --- Rider endpoints (docs/20) ---
const riderListQuerySchema = z.object({
  scope: z.enum(['active', 'history']).optional().default('active'),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

// A rider can move a delivery along, or record a failed attempt. DELIVERED is not
// on this list: it needs the customer's code (completeDeliverySchema).
const riderStatusSchema = z
  .object({
    status: z.enum(RIDER_SETTABLE_STATUSES, {
      error: `status must be one of: ${RIDER_SETTABLE_STATUSES.join(', ')}`,
    }),
    failureReason: z.string().trim().min(1).max(300).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.status === 'FAILED' && !value.failureReason) {
      ctx.addIssue({ code: 'custom', path: ['failureReason'], message: 'failureReason is required when status is FAILED' });
    }
  });

/**
 * How the customer paid at the door (docs/21 §I.2). Cash carries no proof; every
 * non-cash method needs the reference and the private photo. A card number is
 * never accepted: the reference is the transaction id or the approval code.
 */
const collectionSchema = z
  .object({
    method: z.enum(COLLECTION_METHODS, { error: `method must be one of: ${COLLECTION_METHODS.join(', ')}` }),
    wallet: z.enum(COLLECTION_WALLETS, { error: `wallet must be one of: ${COLLECTION_WALLETS.join(', ')}` }).optional(),
    reference: z.string().trim().min(3).max(100).optional(),
    proof: z
      .object({
        publicId: z.string().trim().min(1).max(300),
        fingerprint: z.string().trim().min(1).max(200),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.method === 'WALLET') {
      if (!value.wallet) {
        ctx.addIssue({ code: 'custom', path: ['wallet'], message: 'wallet is required when method is WALLET' });
      }
    } else if (value.wallet !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['wallet'], message: 'wallet is only used when method is WALLET' });
    }

    if (value.method === 'CASH') {
      if (value.reference !== undefined) {
        ctx.addIssue({ code: 'custom', path: ['reference'], message: 'A cash payment has no reference' });
      }
      if (value.proof !== undefined) {
        ctx.addIssue({ code: 'custom', path: ['proof'], message: 'A cash payment has no photo' });
      }
      return;
    }

    if (!value.reference) {
      ctx.addIssue({ code: 'custom', path: ['reference'], message: 'reference is required for a non-cash payment' });
    }
    if (!value.proof) {
      ctx.addIssue({ code: 'custom', path: ['proof'], message: 'a photo is required for a non-cash payment' });
    }
  });

const completeDeliverySchema = z.object({
  code: z.string().trim().regex(CODE_PATTERN, `code must be ${CODE_LENGTH} digits`),
  collection: collectionSchema.optional(),
});

// A rider's position (docs/11 §30). Numbers only, in range; accuracy is the phone's estimate in metres.
const riderLocationSchema = z.object({
  latitude: z.number({ error: 'latitude must be a number' }).min(-90).max(90),
  longitude: z.number({ error: 'longitude must be a number' }).min(-180).max(180),
  accuracy: z.number().min(0).max(100000).optional(),
});

module.exports = {
  riderLocationSchema,
  listDeliveriesQuerySchema,
  updateDeliveryStatusSchema,
  updateDeliverySchema,
  assignRiderSchema,
  riderListQuerySchema,
  riderStatusSchema,
  completeDeliverySchema,
  collectionSchema,
};
