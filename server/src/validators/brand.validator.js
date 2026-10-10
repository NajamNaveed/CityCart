const mongoose = require('mongoose');
const { z } = require('zod');

const { BRAND_STATUSES } = require('../config/brandStatuses');

/**
 * Zod validation schemas for Brand endpoints, per
 * docs/05-api-specification.md §9 (Brand Endpoints) and
 * docs/04-database-design.md §9 (Brand Model).
 *
 * `slug` and `status` are never accepted on create — slug is derived
 * server-side (see services/brand.service.js), and status always starts
 * at the schema default (PENDING); it can only change through the
 * dedicated PATCH /brands/:id/status endpoint (updateBrandStatusSchema).
 */
const objectIdString = z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), {
  message: 'Invalid id.',
});

const timeString = z.union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), z.literal('')]);
const optionalText = (max) => z.union([z.string().trim().max(max), z.null()]);
const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const contactSchema = z
  .object({
    address: z
      .object({
        street: optionalText(200),
        area: optionalText(100),
        city: optionalText(100),
      })
      .partial()
      .passthrough(),
    supportPhone: optionalText(40),
    supportEmail: z.union([z.string().email(), z.literal(''), z.null()]),
    operatingHours: z
      .object({
        opensAt: timeString,
        closesAt: timeString,
        closedDays: z.union([z.array(z.enum(dayNames)), z.null()]),
      })
      .partial()
      .passthrough(),
  })
  .partial()
  .passthrough();
const brandSettingsSchema = z
  .object({
    deliveryFee: z.number().min(0).nullable(),
    estimatedDeliveryTime: optionalText(100),
    minimumOrderValue: z.number().min(0).nullable(),
    deliveryNote: optionalText(500),
  })
  .partial()
  .passthrough();

const createBrandSchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  description: z.string().trim().optional(),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  logo: z.string().trim().optional(),
  coverImage: z.string().trim().optional(),
  cityId: objectIdString,
  contact: contactSchema.optional(),
  settings: brandSettingsSchema.optional(),
});

// Profile-only fields. Deliberately excludes status (own endpoint below)
// and cityId (treated as a platform-level decision in this phase — see
// services/brand.service.js) for both SUPER_ADMIN and BRAND_ADMIN
// callers of PATCH /brands/:id, keeping one simple, predictable
// behavior for the single shared route rather than a per-role field
// matrix the docs don't specify.
const updateBrandSchema = z
  .object({
    name: z.string().trim().min(1, 'name is required'),
    slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    description: z.string().trim(),
    logo: z.string().trim(),
    coverImage: z.string().trim(),
    contact: contactSchema,
    settings: brandSettingsSchema,
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided.',
  });

// TERMINATED is permanent and has its own endpoint (POST /admin/brands/:id/terminate).
const SETTABLE_BRAND_STATUSES = BRAND_STATUSES.filter((s) => s !== 'TERMINATED');
const updateBrandStatusSchema = z.object({
  status: z.enum(SETTABLE_BRAND_STATUSES),
});

const listBrandsQuerySchema = z.object({
  cityId: objectIdString.optional(),
  search: z.string().trim().min(1).optional(),
});

module.exports = {
  createBrandSchema,
  updateBrandSchema,
  updateBrandStatusSchema,
  listBrandsQuerySchema,
};