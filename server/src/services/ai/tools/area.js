const { discover } = require('../../discover.service');
const { discoverServices } = require('../../serviceDiscovery.service');

/**
 * One search, measured from where this shopper actually is (docs/29 Phase 2h).
 *
 * Both shopping tools used to ask the same city-wide question no matter what
 * the shopper meant, so "shops in my block" was answered with the whole city.
 * Here the shopper's own blocks are searched first; the city is only a labelled
 * second step, so a listing that is *not* in their block is never described as
 * nearby. The block ids come from `resolveShopperScope`, never from the model.
 */
const SEARCH_LIMIT = 12;

// How many shops a block holds is a different number from how many fit on this
// page, so the real total travels with the items instead of being guessed from
// the slice.
const totalOf = (result) => result.pagination?.total ?? result.items.length;

function commonArgs(ctx) {
  return {
    cityId: ctx.cityId || undefined,
    ...(ctx.lat !== null && ctx.lat !== undefined && ctx.lng !== null ? { lat: ctx.lat, lng: ctx.lng } : {}),
    limit: SEARCH_LIMIT,
  };
}

function blockNamesOf(ctx) {
  return ctx.blockNames || [];
}

/**
 * Run `search(scopeArgs)` over the shopper's blocks, then over the city, and
 * say plainly which of the two the items came from. `rememberNote` puts the
 * warning somewhere the agent building the sentence can pick it up.
 */
async function inBlockThenCity(ctx, { q, search, rememberNote }) {
  const base = commonArgs(ctx);
  const query = q || undefined;
  const blocks = ctx.blockIds || [];

  if (blocks.length) {
    const inBlock = await search({ ...base, q: query, scope: 'area', blockIds: blocks });
    if (inBlock.items.length) {
      return {
        items: inBlock.items,
        total: totalOf(inBlock),
        searched: { scope: 'block', blockNames: blockNamesOf(ctx) },
        outsideBlock: false,
      };
    }
    const inCity = await search({ ...base, q: query, scope: 'city' });
    const area = blockNamesOf(ctx).join(' or ') || 'this area';
    const note = inCity.items.length
      ? `Nothing was found in ${area}. These listings are from elsewhere in the city, not from your block.`
      : `Nothing in ${area} and nothing else in this city.`;
    // Remembered so the answer written for the shopper carries the same
    // warning the model was given.
    if (rememberNote) rememberNote(inCity.items.length ? note : null);
    return {
      items: inCity.items,
      total: totalOf(inCity),
      searched: { scope: 'city', blockNames: blockNamesOf(ctx) },
      outsideBlock: true,
      note,
    };
  }

  const inCity = await search({ ...base, q: query, scope: 'city' });
  return {
    items: inCity.items,
    total: totalOf(inCity),
    searched: { scope: 'city', blockNames: [] },
    outsideBlock: false,
  };
}

function discoverForShopper(ctx, { q } = {}) {
  return inBlockThenCity(ctx, {
    q,
    search: (scopeArgs) => discover(scopeArgs),
    rememberNote: (note) => {
      ctx.scopeNote = note;
    },
  });
}

/** The same rule for providers, whose own block is where they practise. */
function providersForShopper(ctx, { q, categoryId } = {}) {
  return inBlockThenCity(ctx, {
    q,
    search: ({ cityId, lat, lng, limit, scope, blockIds }) =>
      discoverServices({
        q,
        categoryId: categoryId || undefined,
        cityId,
        lat,
        lng,
        limit,
        scope,
        blockIds,
      }),
    rememberNote: (note) => {
      ctx.scopeNote = note;
    },
  });
}

module.exports = { discoverForShopper, providersForShopper, SEARCH_LIMIT };
