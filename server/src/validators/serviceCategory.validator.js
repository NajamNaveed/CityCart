const mongoose = require('mongoose');
const { z } = require('zod');

const objectId = z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), {
  message: 'Invalid id.',
});

const name = z.string().trim().min(2, 'name must be at least 2 characters').max(100);
const image = z.string().trim().max(500);

const createServiceCategorySchema = z.object({
  name,
  parentId: objectId.optional(),
  order: z.number().int().min(0).max(9999).optional(),
  image: image.optional(),
  isActive: z.boolean().optional(),
});

const updateServiceCategorySchema = z
  .object({
    name,
    parentId: objectId.nullable(),
    order: z.number().int().min(0).max(9999),
    image: image.nullable(),
    isActive: z.boolean(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided.',
  });

const serviceCategoryIdParamSchema = z.object({ id: objectId });

module.exports = {
  createServiceCategorySchema,
  updateServiceCategorySchema,
  serviceCategoryIdParamSchema,
};
