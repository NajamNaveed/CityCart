const mongoose = require('mongoose');
const { z } = require('zod');

const { MANUAL_ADJUSTMENT_REASONS } = require('../config/inventoryReasons');

/**
 * Zod validation schemas for Inventory endpoints, per
 * docs/05-api-specification.md §13 (Inventory Endpoints) and
 * docs/09-inventory-management.md §5-7, §18.
 *
 * `brandId` is deliberately never a field in the body schemas — the brand
 * for every inventory operation comes from the (ownership-verified)
 * product, never from the client. It only appears in the LIST query
 * schema, where the controller honors it for SUPER_ADMIN alone.
 *
 * MAX_STOCK_QUANTITY is a defensive sanity cap on a single request's
 * quantity, NOT a documented business rule (the docs only mention a
 * per-purchase limit at checkout, §13). It exists so an absurd value
 * can't be written into a counter. Flagged in the Phase 8 report.
 */
const MAX_STOCK_QUANTITY = 1_000_000_000;

const objectIdString = z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), {
  message: 'Invalid id.',
});

const quantityField = z.number().int().min(0).max(MAX_STOCK_QUANTITY);

const productIdParamSchema = z.object({
  productId: objectIdString,
});

/**
 * PATCH /inventory/:productId — docs/05 §13 (example body: {"quantity": 50}).
 * `quantity` is "Set stock" (docs/09 §5). lowStockThreshold and
 * trackInventory are the other documented inventory fields (docs/04 §18).
 * availableQuantity and reservedQuantity are derived/system-managed and
 * are not accepted from the client.
 */
const updateInventorySchema = z
  .object({
    quantity: quantityField,
    lowStockThreshold: quantityField,
    trackInventory: z.boolean(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided.',
  });

/**
 * POST /inventory/:productId/adjust — docs/09 §5 ("Add stock / Remove stock
 * / Adjust stock") and §6-7. `change` is a signed, non-zero integer:
 * positive adds stock, negative removes it.
 */
const adjustInventorySchema = z.object({
  change: z
    .number()
    .int()
    .min(-MAX_STOCK_QUANTITY)
    .max(MAX_STOCK_QUANTITY)
    .refine((value) => value !== 0, { message: 'change must not be zero.' }),
  reason: z.enum(MANUAL_ADJUSTMENT_REASONS).optional(),
});

const STOCK_STATUS_FILTERS = ['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'];

const listInventoryQuerySchema = z.object({
  brandId: objectIdString.optional(),
  stockStatus: z.enum(STOCK_STATUS_FILTERS).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

module.exports = {
  productIdParamSchema,
  updateInventorySchema,
  adjustInventorySchema,
  listInventoryQuerySchema,
  MAX_STOCK_QUANTITY,
  STOCK_STATUS_FILTERS,
};