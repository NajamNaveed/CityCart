const { z } = require('zod');

const { objectId, latitude, longitude } = require('./block.validator');

/**
 * Zod schemas for Branch endpoints. `brandId` is never accepted from the
 * client — it always comes from the authenticated tenant (AGENTS.md §9).
 * latitude/longitude are optional but travel together; without them the
 * branch pin defaults to its block's centre.
 */
const pinPair = (data) => (data.latitude === undefined) === (data.longitude === undefined);
const pinMessage = { message: 'latitude and longitude must be sent together.', path: ['latitude'] };

const createBranchSchema = z
  .object({
    name: z.string().trim().min(1, 'name is required').max(80),
    blockId: objectId,
    address: z.string().trim().max(200).optional(),
    phone: z.string().trim().max(30).optional(),
    latitude: latitude.optional(),
    longitude: longitude.optional(),
  })
  .refine(pinPair, pinMessage);

const updateBranchSchema = z
  .object({
    name: z.string().trim().min(1, 'name is required').max(80),
    blockId: objectId,
    address: z.string().trim().max(200),
    phone: z.string().trim().max(30),
    latitude,
    longitude,
    isActive: z.boolean(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided.',
  })
  .refine(pinPair, pinMessage);

module.exports = { createBranchSchema, updateBranchSchema };
