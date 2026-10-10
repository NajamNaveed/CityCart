const { z } = require('zod');

const optionalEmail = z.union([z.string().email(), z.literal('')]);

const platformSettingsSchema = z
  .object({
    platformName: z.string().trim().min(1).max(100),
    supportEmail: optionalEmail,
    supportPhone: z.string().trim().max(40),
    commissionRate: z.number().min(0).max(100).nullable(),
    codMaxOrderAmount: z.number().min(0).nullable(),
    brandOnboardingPolicy: z.enum(['MANUAL_APPROVAL', 'INSTANT_ACTIVATION']),
    orderCancellationGraceMinutes: z.number().int().min(0).nullable(),
    announcement: z
      .object({
        text: z.string().trim().max(500),
        enabled: z.boolean(),
      })
      .partial(),
    maintenanceMode: z.boolean(),
  })
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided.',
  });

module.exports = { platformSettingsSchema };