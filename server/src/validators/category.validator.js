const mongoose = require('mongoose');
const { z } = require('zod');

/**
 * Zod validation schemas for the global Category endpoints (docs/05 §11).
 *
 * `slug` is never a field: it is derived from `name` at creation time and is
 * immutable afterwards, like City and Brand.
 */
const objectIdString = z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), {
  message: 'Invalid id.',
});

const createCategorySchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  description: z.string().trim().optional(),
  image: z.string().trim().optional(),
  parentId: objectIdString.optional(),
  order: z.number().int().min(0).max(9999).optional(),
});

const updateCategorySchema = z
  .object({
    name: z.string().trim().min(1, 'name is required'),
    description: z.string().trim(),
    image: z.string().trim(),
    // Nullable so a subcategory can be moved back to top level.
    parentId: objectIdString.nullable(),
    order: z.number().int().min(0).max(9999),
    isActive: z.boolean(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided.',
  });

const listCategoriesQuerySchema = z.object({
  parentId: objectIdString.optional(),
});

module.exports = { createCategorySchema, updateCategorySchema, listCategoriesQuerySchema };
