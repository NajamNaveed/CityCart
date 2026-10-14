const { z } = require('zod');

const { objectId, numberFromQuery } = require('./block.validator');

const MIN_RADIUS_KM = 0.5;
const MAX_RADIUS_KM = 50;

const intFromQuery = (max) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/, 'Must be a whole number.')
    .transform(Number)
    .refine((n) => n >= 1 && n <= max, { message: `Must be between 1 and ${max}.` });

/**
 * Query for GET /api/v1/discover — "which brands (and their products) can I
 * find near me?".
 *
 *   scope=block   brands with a branch in `blockId`
 *   scope=radius  brands with a branch within `radiusKm` of the origin
 *   scope=city    every branch in `cityId` (nearest first when an origin is known)
 *
 * The origin is `lat`+`lng` (the shopper's position) or, failing that, the
 * centre of `blockId`.
 */
const discoverQuerySchema = z
  .object({
    q: z.string().trim().max(100).optional(),
    scope: z.enum(['block', 'radius', 'city']).default('city'),
    cityId: objectId.optional(),
    blockId: objectId.optional(),
    radiusKm: numberFromQuery
      .refine((n) => n >= MIN_RADIUS_KM && n <= MAX_RADIUS_KM, {
        message: `radiusKm must be between ${MIN_RADIUS_KM} and ${MAX_RADIUS_KM}.`,
      })
      .optional(),
    lat: numberFromQuery.refine((n) => n >= -90 && n <= 90, { message: 'lat out of range.' }).optional(),
    lng: numberFromQuery.refine((n) => n >= -180 && n <= 180, { message: 'lng out of range.' }).optional(),
    page: intFromQuery(1000).optional(),
    limit: intFromQuery(30).optional(),
  })
  .superRefine((data, ctx) => {
    const issue = (path, message) => ctx.addIssue({ code: 'custom', path: [path], message });

    if ((data.lat === undefined) !== (data.lng === undefined)) {
      issue('lat', 'lat and lng must be sent together.');
    }
    if (data.scope === 'block' && !data.blockId) {
      issue('blockId', 'blockId is required when scope is "block".');
    }
    if (data.scope === 'radius') {
      if (data.radiusKm === undefined) {
        issue('radiusKm', 'radiusKm is required when scope is "radius".');
      }
      if (data.lat === undefined && !data.blockId) {
        issue('lat', 'Send lat and lng, or a blockId to measure from.');
      }
    }
    if (data.scope === 'city' && !data.cityId) {
      issue('cityId', 'cityId is required when scope is "city".');
    }
  });

module.exports = { discoverQuerySchema, MIN_RADIUS_KM, MAX_RADIUS_KM };
