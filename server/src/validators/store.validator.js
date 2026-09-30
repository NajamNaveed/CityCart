const { z } = require('zod');
const mongoose = require('mongoose');

/**
 * Zod validation schema for Store update, per
 * docs/05-api-specification.md §10 (Store Endpoints) and
 * docs/04-database-design.md §11 (Store Model).
 *
 * brandId is deliberately never a field in this schema — "Do not allow a
 * brand user to change brandId" (Phase 6 spec). isActive IS included:
 * unlike Brand.status, Store has no separate dedicated
 * status-change endpoint in the docs, so the store's own
 * owner/authorized employee (via store.update) can toggle their
 * storefront's visibility themselves. This is a judgment call, noted in
 * the Phase 6 report.
 */
const updateStoreSchema = z
  .object({
    name: z.string().trim().min(1, 'name is required'),
    description: z.string().trim(),
    address: z.record(z.string(), z.unknown()),
    contact: z.record(z.string(), z.unknown()),
    businessHours: z.record(z.string(), z.unknown()),
    logo: z.string().trim(),
    banner: z.string().trim(),
    isActive: z.boolean(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided.',
  });

const createStoreSchema = z.object({
  brandId: z
    .string()
    .refine((v) => mongoose.Types.ObjectId.isValid(v), { message: 'Invalid brandId' })
    .optional(),
  name: z.string().trim().min(1, 'name is required'),
  description: z.string().trim().optional(),
  address: z.record(z.string(), z.unknown()).optional(),
  contact: z.record(z.string(), z.unknown()).optional(),
  businessHours: z.record(z.string(), z.unknown()).optional(),
  logo: z.string().trim().optional(),
  banner: z.string().trim().optional(),
});

module.exports = { updateStoreSchema, createStoreSchema };