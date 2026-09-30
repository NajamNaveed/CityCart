const mongoose = require('mongoose');
const { z } = require('zod');

const Product = require('../models/product.model');

/**
 * Zod validation schemas for Product endpoints, per
 * docs/05-api-specification.md §12 (Product Endpoints) and
 * docs/04-database-design.md §14-17 (Product Model, Ownership, Pricing,
 * Attributes).
 *
 * `brandId` and `slug` are deliberately never fields in these schemas —
 * brandId is always derived server-side from the authenticated user
 * (see services/product.service.js), and slug is derived from `name` at
 * creation time and treated as immutable afterward (same precedent as
 * Category/Brand/City).
 *
 * `categoryId` IS accepted from the client (the client picks which
 * category a product belongs to — docs/05 §12), but the service layer
 * independently re-verifies it belongs to the same brand before trusting
 * it (services/product.service.js#assertCategoryBelongsToBrand) — this
 * schema only checks it's a syntactically valid ObjectId.
 */
const objectIdString = z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), {
  message: 'Invalid id.',
});

const createProductSchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  description: z.string().trim().optional(),
  images: z.array(z.string().trim()).optional(),
  price: z.number().min(0, 'price must be >= 0'),
  compareAtPrice: z.number().min(0).optional(),
  sku: z.string().trim().optional(),
  categoryId: objectIdString,
  attributes: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(Product.STATUSES).optional(),
  isActive: z.boolean().optional(),
});

const updateProductSchema = z
  .object({
    name: z.string().trim().min(1, 'name is required'),
    description: z.string().trim(),
    images: z.array(z.string().trim()),
    price: z.number().min(0, 'price must be >= 0'),
    compareAtPrice: z.number().min(0),
    sku: z.string().trim(),
    categoryId: objectIdString,
    attributes: z.record(z.string(), z.unknown()),
    status: z.enum(Product.STATUSES),
    isActive: z.boolean(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided.',
  });

/**
 * docs/05 §12 (List Products) documents cityId, brandId, categoryId,
 * search, minPrice, maxPrice, status, page, limit, sort. docs/05 §24
 * (Query Parameters) requires validating allowed sort fields "to
 * prevent arbitrary or expensive queries" — enforced here via a fixed
 * enum rather than accepting any field name.
 */
const listProductsQuerySchema = z.object({
  cityId: objectIdString.optional(),
  brandId: objectIdString.optional(),
  categoryId: objectIdString.optional(),
  search: z.string().trim().min(1).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sort: z.enum(['createdAt', 'price', 'name']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

module.exports = { createProductSchema, updateProductSchema, listProductsQuerySchema };