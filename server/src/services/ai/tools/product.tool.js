const { z } = require('zod');

const { discover } = require('../../discover.service');

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
 * Product search for the shopping assistant. It runs the same public
 * discovery query the Stores page uses (ACTIVE products of ACTIVE, non-frozen
 * brands), so the assistant can never surface a listing a guest could not buy.
 *
 * The shop's name travels with each product because the model needs it to
 * answer "which store has it", while the client only needs the product id.
 */
const productTool = {
  name: 'search_products',
  argsHint: '{ query?: string, maxPrice?: number (rupees), limit?: 1-12 }',
  description:
    'Find products sold in the shopper’s city. Use short search words (for example "rice", "milk", "gift") rather than a whole sentence. Returns real products with their id, price, stock state and shop name.',
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

    const items = [];
    for (const store of result.items) {
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
    return { count: items.length, items: items.slice(0, limit) };
  },
};

module.exports = productTool;
