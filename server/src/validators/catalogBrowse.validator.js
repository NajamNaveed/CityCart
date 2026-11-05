const { z } = require('zod');
const { blockIdList, MIN_RADIUS_KM, MAX_RADIUS_KM } = require('./discover.validator');

/**
 * Query for the offers of one catalogue product inside a shopping area. The area is
 * one or more blocks (several where zones overlap); `radiusKm` narrows it around the
 * shopper's position and needs `lat` and `lng`.
 */
const browseQuerySchema = z
  .object({
    blockIds: blockIdList,
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    radiusKm: z.coerce.number().min(MIN_RADIUS_KM).max(MAX_RADIUS_KM).optional(),
  })
  .superRefine((data, ctx) => {
    if ((data.lat === undefined) !== (data.lng === undefined)) {
      ctx.addIssue({ code: 'custom', path: ['lat'], message: 'lat and lng must be sent together.' });
    }
    if (data.radiusKm !== undefined && data.lat === undefined) {
      ctx.addIssue({ code: 'custom', path: ['lat'], message: 'Send lat and lng to measure the range from.' });
    }
  });

module.exports = { browseQuerySchema };
