const mongoose = require('mongoose');
const { z } = require('zod');
const CatalogProduct = require('../models/catalogProduct.model');

const objectIdString = z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), {
  message: 'Invalid id.',
});

const barcode = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9-]{6,20}$/, 'barcode must be 6 to 20 letters, digits or dashes');

const size = z.object({
  value: z.number().positive('size must be greater than 0'),
  unit: z.string().trim().min(1).max(20),
});

const fields = {
  name: z.string().trim().min(1, 'name is required').max(160),
  manufacturer: z.string().trim().max(120),
  categoryId: objectIdString,
  description: z.string().trim().max(4000),
  images: z.array(z.string().trim().url('every image must be a full link')).max(8),
  size,
  barcode,
};

// Platform admins create GLOBAL, ACTIVE items.
const createCatalogSchema = z.object({
  name: fields.name,
  categoryId: fields.categoryId,
  manufacturer: fields.manufacturer.optional(),
  description: fields.description.optional(),
  images: fields.images.optional(),
  size: fields.size.optional(),
  barcode: fields.barcode.optional(),
});

// A store asks for a new item. `private: true` makes it visible to that store only
// and needs no approval; otherwise it waits for a platform admin.
const requestCatalogSchema = createCatalogSchema.extend({
  private: z.boolean().optional(),
});

const updateCatalogSchema = z
  .object({
    name: fields.name,
    categoryId: fields.categoryId,
    manufacturer: fields.manufacturer,
    description: fields.description,
    images: fields.images,
    size: fields.size,
    barcode: fields.barcode,
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided.',
  });

const rejectCatalogSchema = z.object({ note: z.string().trim().min(1, 'note is required').max(500) });
const mergeCatalogSchema = z.object({ intoId: objectIdString });

const listCatalogQuerySchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  categoryId: objectIdString.optional(),
  status: z.enum(CatalogProduct.STATUSES).optional(),
  scope: z.enum(CatalogProduct.SCOPES).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

module.exports = {
  createCatalogSchema,
  requestCatalogSchema,
  updateCatalogSchema,
  rejectCatalogSchema,
  mergeCatalogSchema,
  listCatalogQuerySchema,
};
