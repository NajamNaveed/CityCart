const mongoose = require('mongoose');
const { z } = require('zod');

/**
 * Zod validation schemas for Category endpoints, per
 * docs/05-api-specification.md §11 (Category Endpoints) and
 * docs/04-database-design.md §13 (Category Model).
 *
 * `brandId` and `slug` are deliberately never fields in these schemas —
 * brandId is always derived server-side from the authenticated user
 * (see services/category.service.js), and slug is derived from `name`
 * at creation time and treated as immutable afterward, matching the
 * City/Brand precedent (validators/city.validator.js,
 * validators/brand.validator.js).
 */
const objectIdString = z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), {
  message: 'Invalid id.',
});

const createCategorySchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  description: z.string().trim().optional(),
  image: z.string().trim().optional(),
  parentId: objectIdString.optional(),
});

const updateCategorySchema = z
  .object({
    name: z.string().trim().min(1, 'name is required'),
    description: z.string().trim(),
    image: z.string().trim(),
    // Nullable (not just optional) so a category can be explicitly
    // moved back to top-level by sending parentId: null.
    parentId: objectIdString.nullable(),
    isActive: z.boolean(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided.',
  });

/**
 * docs/05 §11 (List Categories) documents only `?brandId=`.
 * `isActive` is an additional explicit-override query param, mirroring
 * the same judgment call already made (and flagged) for Brand's
 * `?status=` in validators/brand.validator.js / services/brand.service.js
 * — the public list defaults to active-only, but an explicit override is
 * honored rather than requiring a separate admin-only endpoint.
 */
const listCategoriesQuerySchema = z.object({
  brandId: objectIdString.optional(),
  parentId: objectIdString.optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
});

module.exports = { createCategorySchema, updateCategorySchema, listCategoriesQuerySchema };