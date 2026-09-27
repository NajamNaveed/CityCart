const { z } = require('zod');

/**
 * Zod validation schemas for City endpoints, per
 * docs/05-api-specification.md §8 (City Endpoints) and
 * docs/04-database-design.md §8 (City Model).
 *
 * `slug` is never accepted from the client on create or update — it's
 * always derived server-side from `name` (see services/city.service.js)
 * and treated as immutable once set, avoiding dangling references if a
 * city is renamed.
 */
const createCitySchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  state: z.string().trim().optional(),
  country: z.string().trim().optional(),
  description: z.string().trim().optional(),
  image: z.string().trim().optional(),
});

const updateCitySchema = z
  .object({
    name: z.string().trim().min(1, 'name is required'),
    state: z.string().trim(),
    country: z.string().trim(),
    description: z.string().trim(),
    image: z.string().trim(),
    isActive: z.boolean(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided.',
  });

const listCitiesQuerySchema = z.object({
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
});

module.exports = { createCitySchema, updateCitySchema, listCitiesQuerySchema };