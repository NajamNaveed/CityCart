const mongoose = require('mongoose');
const { z } = require('zod');
const { blockIdList, MIN_RADIUS_KM, MAX_RADIUS_KM } = require('./discover.validator');

const objectId = z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), { message: 'Invalid id.' });

/**
 * Query for browsing the shared catalogue inside a shopping area. The area is one
 * or more blocks (several where zones overlap); `radiusKm` narrows it around the
 * shopper's position and needs `lat` and `lng`.
 */
const browseQuerySchema = z
  .object({
    blockIds: blockIdList,
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    radiusKm: z.coerce.number().min(MIN_RADIUS_KM).max(MAX_RADIUS_KM).optional(),
    q: z.string().trim().min(1).max(100).optional(),
    categoryId: objectId.optional(),
    sort: z.enum(['name', 'price', 'nearest']).default('name'),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  })
  .superRefine((data, ctx) => {
    if ((data.lat === undefined) !== (data.lng === undefined)) {
      ctx.addIssue({ code: 'custom', path: ['lat'], message: 'lat and lng must be sent together.' });
    }
    if (data.radiusKm !== undefined && data.lat === undefined) {
      ctx.addIssue({ code: 'custom', path: ['lat'], message: 'Send lat and lng to measure the range from.' });
    }
    if (data.sort === 'nearest' && data.lat === undefined) {
      ctx.addIssue({ code: 'custom', path: ['sort'], message: 'Sorting by distance needs lat and lng.' });
    }
  });

module.exports = { browseQuerySchema };
