const { z } = require('zod');

const { objectId, numberFromQuery } = require('./block.validator');
const {
  BILLING_STATUSES,
  SELLER_TYPES,
  INVOICE_STATUSES,
  CLAIM_STATUSES,
  CLAIM_METHODS,
  HELP_STATUSES,
} = require('../config/billing');

const page = numberFromQuery
  .refine((n) => Number.isInteger(n) && n >= 1 && n <= 1000, { message: 'page must be between 1 and 1000.' })
  .optional();
const limit = numberFromQuery
  .refine((n) => Number.isInteger(n) && n >= 1 && n <= 50, { message: 'limit must be between 1 and 50.' })
  .optional();

const date = z
  .string()
  .trim()
  .min(1)
  .transform((value) => new Date(value))
  .refine((value) => !Number.isNaN(value.getTime()), { message: 'Use a valid date.' });

const receipt = z
  .object({
    publicId: z.string().trim().min(1).max(500),
    fingerprint: z.string().trim().max(200).optional(),
  })
  .strict();

const claimSchema = z
  .object({
    amountPaisa: z.number().int('Amount must be a whole number of paisa.').min(1, 'Enter the amount you paid.').max(1_000_000_000),
    method: z.enum(CLAIM_METHODS),
    reference: z.string().trim().min(3, 'Enter the bank or wallet reference.').max(120),
    receipt: receipt.optional(),
    comment: z.string().trim().max(500).optional(),
  })
  .strict();

const helpSchema = z
  .object({
    subject: z.string().trim().min(3, 'Add a short subject.').max(150),
    message: z.string().trim().min(5, 'Tell us what you need help with.').max(2000),
  })
  .strict();

const invoiceIdParamSchema = z.object({ id: objectId });
const claimIdParamSchema = z.object({ id: objectId });

const sellerInvoicesQuerySchema = z.object({
  status: z.enum(INVOICE_STATUSES).optional(),
  page,
  limit,
});

const sellerClaimsQuerySchema = z.object({
  status: z.enum(CLAIM_STATUSES).optional(),
  page,
  limit,
});

const adminInvoicesQuerySchema = z.object({
  status: z.enum(INVOICE_STATUSES).optional(),
  sellerType: z.enum(SELLER_TYPES).optional(),
  sellerId: objectId.optional(),
  periodKey: z
    .string()
    .trim()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'periodKey must be YYYY-MM.')
    .optional(),
  page,
  limit,
});

const adminClaimsQuerySchema = z.object({
  status: z.enum(CLAIM_STATUSES).optional(),
  sellerType: z.enum(SELLER_TYPES).optional(),
  page,
  limit,
});

const adminClaimDecisionSchema = z
  .object({
    decision: z.enum(['VERIFIED', 'REJECTED']),
    note: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((data) => data.decision !== 'REJECTED' || (data.note && data.note.length >= 3), {
    message: 'A rejection needs a reason.',
    path: ['note'],
  });

const adminSellerParamSchema = z.object({
  type: z.enum(SELLER_TYPES),
  id: objectId,
});

const adminSellersQuerySchema = z.object({
  billingStatus: z.enum(BILLING_STATUSES).optional(),
  type: z.enum(SELLER_TYPES).optional(),
  q: z.string().trim().max(100).optional(),
  page,
  limit,
});

const freezeOverrideSchema = z
  .object({
    status: z.enum(['ACTIVE', 'WARNING', 'RESTRICTED', 'FROZEN']),
    reason: z.string().trim().min(3, 'Tell the seller why.').max(500),
    until: date.optional(),
  })
  .strict();

const freezeClearSchema = z
  .object({ reason: z.string().trim().min(3, 'Tell the seller why.').max(500) })
  .strict();

const graceSchema = z
  .object({
    until: date,
    reason: z.string().trim().min(3, 'Tell the seller why.').max(500),
  })
  .strict();

const billingSettingsSchema = z
  .object({
    rateBps: z.number().int().min(0).max(10000).optional(),
    dueDays: z.number().int().min(0).max(90).optional(),
    restrictAfterDays: z.number().int().min(0).max(90).optional(),
    freezeAfterDays: z.number().int().min(0).max(180).optional(),
    minimumInvoicePaisa: z.number().int().min(0).max(1_000_000_000).optional(),
    bank: z
      .object({
        bankName: z.string().trim().max(120).optional(),
        accountTitle: z.string().trim().max(120).optional(),
        accountNumber: z.string().trim().max(60).optional(),
        iban: z.string().trim().max(40).optional(),
        instructions: z.string().trim().max(1000).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided.' })
  .refine(
    (data) =>
      data.restrictAfterDays === undefined ||
      data.freezeAfterDays === undefined ||
      data.freezeAfterDays >= data.restrictAfterDays,
    { message: 'freezeAfterDays cannot be earlier than restrictAfterDays.', path: ['freezeAfterDays'] }
  );

const resolveHelpSchema = z
  .object({ note: z.string().trim().min(3, 'Write a short answer.').max(1000) })
  .strict();

const adminHelpQuerySchema = z.object({
  status: z.enum(HELP_STATUSES).optional(),
  page,
  limit,
});

module.exports = {
  claimSchema,
  helpSchema,
  invoiceIdParamSchema,
  claimIdParamSchema,
  sellerInvoicesQuerySchema,
  sellerClaimsQuerySchema,
  adminInvoicesQuerySchema,
  adminClaimsQuerySchema,
  adminClaimDecisionSchema,
  adminSellerParamSchema,
  adminSellersQuerySchema,
  freezeOverrideSchema,
  freezeClearSchema,
  graceSchema,
  billingSettingsSchema,
  resolveHelpSchema,
  adminHelpQuerySchema,
};
