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

// A listing is created from a catalogue item (docs/22). Its name, description,
// images and category come from that item, so they are not accepted here.
const createProductSchema = z.object({
  catalogProductId: objectIdString,
  price: z.number().min(0, 'price must be >= 0'),
  compareAtPrice: z.number().min(0).optional(),
  sku: z.string().trim().optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  branchIds: z.array(objectIdString).max(50).optional(),
  status: z.enum(Product.STATUSES).optional(),
  isActive: z.boolean().optional(),
});

const updateProductSchema = z
  .object({
    price: z.number().min(0, 'price must be >= 0'),
    compareAtPrice: z.number().min(0),
    sku: z.string().trim(),
    attributes: z.record(z.string(), z.unknown()),
    branchIds: z.array(objectIdString).max(50),
    status: z.enum(Product.STATUSES),
    isActive: z.boolean(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided.',
  });

/**
 * docs/05 §12 (List Products) documented the public list's query parameters;
 * that listing was removed with the Shop. The brand dashboard still validates
 * its own listing below.
 */

// Brand dashboard listing: every status is allowed (a brand sees its own drafts and archive).
const listMyProductsQuerySchema = z.object({
  status: z.enum(Product.STATUSES).optional(),
  search: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

module.exports = {
  createProductSchema,
  updateProductSchema,
  listMyProductsQuerySchema,
};