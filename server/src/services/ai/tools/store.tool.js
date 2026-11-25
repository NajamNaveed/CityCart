const { z } = require('zod');

const { discoverForShopper } = require('./area');

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
 * Stores page. When their own blocks are known those blocks are searched
 * first, so "shops in my block" is answered with shops actually in the block —
 * and with an honest none when the block has none (docs/29 Phase 2h).
 */
const storeTool = {
  name: 'find_stores',
  argsHint: '{ query?: string, limit?: 1-8 }',
  description:
    'Find shops near the shopper — in their block when a location is known, otherwise in their city. Use it when the shopper asks which store sells something, what is nearby, or what is in their area. Returns each shop with the blocks it is in and its distance. `total` is how many shops match, `items` is only the first few, so count from `total` and never from the list length.',
  argsSchema,
  async run(ctx, args) {
    const found = await discoverForShopper(ctx, { q: args.query });
    const limit = args.limit || DEFAULT_LIMIT;
    const items = found.items.slice(0, limit).map((store) => ({
      _id: String(store._id),
      name: store.name,
      slug: store.slug,
      nearestKm: store.nearestKm,
      acceptingNewOrders: store.acceptingNewOrders,
      blocks: [...new Set(store.branches.map((branch) => branch.blockName).filter(Boolean))].slice(0, 3),
      branchCount: store.branchCount,
      // Products listed here, not the shop's whole catalogue — a shop carries
      // more than a page can show.
      productsShown: store.products.length,
    }));

    return {
      count: items.length,
      total: found.total,
      searched: found.searched,
      ...(found.note ? { note: found.note } : {}),
      items,
    };
  },
};

module.exports = storeTool;
