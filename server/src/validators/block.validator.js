const mongoose = require('mongoose');
const { z } = require('zod');

/**
 * Zod schemas for Block endpoints. `slug` and `cityId` (after creation) are
 * never accepted for update — the slug is derived from `name` once, and a
 * block never moves between cities (branches reference it).
 */
const objectId = z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), {
  message: 'Invalid id.',
});

const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);

const createBlockSchema = z.object({
  cityId: objectId,
  name: z.string().trim().min(1, 'name is required').max(80),
  latitude,
  longitude,
});

const updateBlockSchema = z
  .object({
    name: z.string().trim().min(1, 'name is required').max(80),
    latitude,
    longitude,
    isActive: z.boolean(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided.',
  })
  .refine((data) => (data.latitude === undefined) === (data.longitude === undefined), {
    message: 'latitude and longitude must be sent together.',
    path: ['latitude'],
  });

const listBlocksQuerySchema = z.object({
  cityId: objectId.optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
});

const numberFromQuery = z
  .string()
  .trim()
  .min(1)
  .transform(Number)
  .refine((n) => Number.isFinite(n), { message: 'Must be a number.' });

const resolveQuerySchema = z.object({
  lat: numberFromQuery.refine((n) => n >= -90 && n <= 90, { message: 'lat out of range.' }),
  lng: numberFromQuery.refine((n) => n >= -180 && n <= 180, { message: 'lng out of range.' }),
});

module.exports = {
  createBlockSchema,
  updateBlockSchema,
  listBlocksQuerySchema,
  resolveQuerySchema,
  objectId,
  latitude,
  longitude,
  numberFromQuery,
};
