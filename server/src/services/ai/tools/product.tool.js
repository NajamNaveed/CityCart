const { z } = require('zod');

const { discoverForShopper } = require('./area');

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 12;

const argsSchema = z
  .object({
    query: z.string().trim().max(80).optional(),
    // Rupees, the same unit as Product.price.
    maxPrice: z.number().int().positive().max(1000000).optional(),
    limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
  })
  .strict();

/**
 * Product search for the shopping assistants. It runs the same public
 * discovery query the Stores page uses (ACTIVE products of ACTIVE, non-frozen
 * brands), so the assistant can never surface a listing a guest could not buy.
 *
 * With a known block the block is searched first: a shopper who asks for
 * something "near me" and gets a result from the other side of the city must be
 * told that, which is what `searched` and the `note` are for.
 *
 * The shop's name travels with each product because the model needs it to
 * answer "which store has it", while the client only needs the product id.
 */
const productTool = {
  name: 'search_products',
  argsHint: '{ query?: string, maxPrice?: number (rupees), limit?: 1-12 }',
  description:
    'Find products sold near the shopper — in their block when a location is known, otherwise in their city. Use short search words (for example "rice", "milk", "gift") rather than a whole sentence. Returns real products with their id, price, stock state and shop name.',
  argsSchema,
  async run(ctx, args) {
    const found = await discoverForShopper(ctx, { q: args.query });

    const items = [];
    for (const store of found.items) {
      for (const product of store.products) {
        if (args.maxPrice && product.price > args.maxPrice) continue;
        if (product.availability === 'OUT_OF_STOCK') continue;
        items.push(
          ctx.rememberProduct({
            _id: String(product._id),
            name: product.name,
            price: product.price,
            compareAtPrice: product.compareAtPrice ?? null,
            image: product.image ?? null,
            availability: product.availability,
            brandName: store.name,
            brandSlug: store.slug,
            availableAt: Array.isArray(product.availableAt) ? product.availableAt.slice(0, 3) : null,
          })
        );
      }
    }

    const limit = args.limit || DEFAULT_LIMIT;
    return {
      count: items.length,
      searched: found.searched,
      ...(found.note ? { note: found.note } : {}),
      items: items.slice(0, limit),
    };
  },
};

module.exports = productTool;
