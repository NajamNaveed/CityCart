const mongoose = require('mongoose');
const { z } = require('zod');

const { objectId, numberFromQuery } = require('./block.validator');
const { blockIdList, MIN_RADIUS_KM, MAX_RADIUS_KM } = require('./discover.validator');

const objectIdString = z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), {
  message: 'Invalid id.',
});

const intFromQuery = (max) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/, 'Must be a whole number.')
    .transform(Number)
    .refine((n) => n >= 1 && n <= max, { message: `Must be between 1 and ${max}.` });

const title = z.string().trim().min(2, 'title must be at least 2 characters').max(120);
const description = z.string().trim().max(2000, 'description is too long');
const imageUrl = z.string().trim().min(1).max(500);
const images = z.array(imageUrl).max(8, 'At most 8 images are allowed');
const price = z
  .number()
  .int('startingAtPrice must be a whole number of paisa')
  .min(0, 'startingAtPrice cannot be negative')
  .max(1_000_000_000, 'startingAtPrice is too large');
const durationMinutes = z
  .number()
  .int('durationMinutes must be a whole number')
  .min(15, 'durationMinutes must be at least 15')
  .max(1440, 'durationMinutes cannot exceed 24 hours');
// A plain object only: arrays and null are rejected. Values are stored as-is.
const attributes = z.record(z.string().trim().min(1).max(60), z.union([z.string(), z.number(), z.boolean()]));

const createOfferingSchema = z.object({
  title,
  description: description.optional(),
  images: images.optional(),
  startingAtPrice: price,
  durationMinutes,
  attributes: attributes.optional(),
  isActive: z.boolean().optional(),
});

const updateOfferingSchema = z
  .object({
    title,
    description,
    images,
    startingAtPrice: price,
    durationMinutes,
    attributes,
    isActive: z.boolean(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided.',
  });

const offeringIdParamSchema = z.object({ id: objectId });

const providerSlugParamSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .regex(/^[a-z0-9-]+$/, 'Invalid provider link.'),
});

/**
 * Discovery mirrors the shopper's existing area logic (docs/05 §23, docs/24 §4.3):
 * block, several blocks, a radius around the shopper, or the whole city.
 */
const discoverServicesQuerySchema = z
  .object({
    q: z.string().trim().max(100).optional(),
    scope: z.enum(['block', 'area', 'radius', 'city']).default('city'),
    cityId: objectId.optional(),
    blockId: objectId.optional(),
    blockIds: blockIdList.optional(),
    categoryId: objectId.optional(),
    radiusKm: numberFromQuery
      .refine((n) => n >= MIN_RADIUS_KM && n <= MAX_RADIUS_KM, {
        message: `radiusKm must be between ${MIN_RADIUS_KM} and ${MAX_RADIUS_KM}.`,
      })
      .optional(),
    lat: numberFromQuery.refine((n) => n >= -90 && n <= 90, { message: 'lat out of range.' }).optional(),
    lng: numberFromQuery.refine((n) => n >= -180 && n <= 180, { message: 'lng out of range.' }).optional(),
    sort: z.enum(['rank', 'rating', 'price']).default('rank'),
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
    if (data.scope === 'area') {
      if (!data.blockIds) issue('blockIds', 'blockIds is required when scope is "area".');
      if (data.radiusKm !== undefined && data.lat === undefined) {
        issue('lat', 'Send lat and lng to measure the radius from.');
      }
    }
    if (data.scope === 'radius') {
      if (data.radiusKm === undefined) issue('radiusKm', 'radiusKm is required when scope is "radius".');
      if (data.lat === undefined) issue('lat', 'Send lat and lng to measure the radius from.');
    }
    if (data.scope === 'city' && !data.cityId) {
      issue('cityId', 'cityId is required when scope is "city".');
    }
  });

module.exports = {
  createOfferingSchema,
  updateOfferingSchema,
  offeringIdParamSchema,
  providerSlugParamSchema,
  discoverServicesQuerySchema,
  objectIdString,
};
