const { z } = require('zod');

const Address = require('../../../models/address.model');
const { discover } = require('../../discover.service');
const { latLngFromPoint } = require('../../../utils/geo');
const { activeBlocksContaining } = require('../../block.service');
const { findAreaBlocks } = require('../location');

/**
 * The two location questions the shopping tools cannot answer (docs/29 Phase 2h).
 *
 * "Which block did I set?" is about the shopper's own saved address, and "do you
 * deliver to DHA?" is about a zone the shopper typed. Both are read here, from
 * the database, and returned as names and counts only: no coordinates and no
 * address lines, because the assistant needs to say where the shopper is, not
 * to repeat their pin back to them.
 *
 * Addresses are looked up by the authenticated `userId` — never by an id in the
 * message — so one customer can never read another's.
 */
const MAX_ADDRESSES = 4;
const STORE_NAMES_PER_AREA = 4;

const myLocationTool = {
  name: 'my_location',
  argsHint: '{}',
  description:
    "The signed-in shopper's own location: the delivery blocks their saved address falls in, the city, and the labels of their saved addresses. Use it for 'which block am I in' and 'what is my location'. Never invent a block name.",
  argsSchema: z.object({}).strict(),
  async run(ctx) {
    const addresses = await Address.find({ userId: ctx.userId })
      .sort({ isDefault: -1, createdAt: -1 })
      .limit(MAX_ADDRESSES)
      .select('label location city isDefault')
      .lean();

    const saved = [];
    for (const address of addresses) {
      if (!address.location || !Array.isArray(address.location.coordinates)) continue;
      const point = latLngFromPoint(address.location);
      const blocks = await activeBlocksContaining(point.lat, point.lng);
      saved.push({
        label: address.label || null,
        city: address.city || null,
        isDefault: Boolean(address.isDefault),
        blockNames: blocks.map((block) => block.name),
      });
    }

    return {
      // What the assistants already resolved for this request, in one place so
      // the model quotes the same area the stores were searched in.
      current: {
        source: ctx.locationSource || 'none',
        addressLabel: ctx.addressLabel || null,
        blockNames: ctx.blockNames || [],
        cityName: ctx.cityName || null,
        deliverable: ctx.deliverable ?? null,
      },
      savedAddresses: saved,
    };
  },
};

const checkAreaTool = {
  name: 'check_area',
  argsHint: '{ area: string }',
  description:
    "Check whether CityCart delivers to a named area (for example 'DHA', 'Gulberg', 'Bahadurabad') and which shops are there. Use it before saying an area is covered or not covered. Returns real block names and shop names only.",
  argsSchema: z.object({ area: z.string().trim().min(2).max(60) }).strict(),
  async run(ctx, args) {
    const blocks = await findAreaBlocks(args.area, { cityId: ctx.cityId });
    if (!blocks.length) {
      return { area: args.area, found: false, matches: [], note: 'No delivery zone has that name.' };
    }

    const matches = [];
    for (const block of blocks.slice(0, 3)) {
      const result = await discover({ scope: 'area', blockIds: [block._id], limit: STORE_NAMES_PER_AREA });
      matches.push({
        blockName: block.name,
        cityName: block.cityName,
        storeCount: result.pagination.total,
        storeNames: result.items.map((store) => store.name),
      });
    }

    return { area: args.area, found: true, matches };
  },
};

module.exports = { myLocationTool, checkAreaTool };
