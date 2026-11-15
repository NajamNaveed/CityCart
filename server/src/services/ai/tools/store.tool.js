const { z } = require('zod');

const { discover } = require('../../discover.service');

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 8;

const argsSchema = z
  .object({
    query: z.string().trim().max(80).optional(),
    limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
  })
  .strict();

/**
 * Shops near the shopper, through the same public discovery used by the
 * Stores page. Only shops with an active branch in the city appear.
 */
const storeTool = {
  name: 'find_stores',
  argsHint: '{ query?: string, limit?: 1-8 }',
  description:
    'Find shops in the shopper’s city, nearest first. Use it when the shopper asks which store sells something or what is nearby.',
  argsSchema,
  async run(ctx, args) {
    const result = await discover({
      q: args.query || undefined,
      scope: 'city',
      cityId: ctx.cityId || undefined,
      lat: ctx.lat === null ? undefined : ctx.lat,
      lng: ctx.lng === null ? undefined : ctx.lng,
      limit: 12,
    });

    const limit = args.limit || DEFAULT_LIMIT;
    const items = result.items.slice(0, limit).map((store) => ({
      _id: String(store._id),
      name: store.name,
      slug: store.slug,
      nearestKm: store.nearestKm,
      acceptingNewOrders: store.acceptingNewOrders,
      blocks: [...new Set(store.branches.map((branch) => branch.blockName).filter(Boolean))].slice(0, 3),
      productCount: store.products.length,
    }));

    return { count: items.length, items };
  },
};

module.exports = storeTool;
