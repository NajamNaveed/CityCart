const mongoose = require('mongoose');

const Address = require('../../models/address.model');
const Block = require('../../models/block.model');
const City = require('../../models/city.model');
const { activeBlocksContaining } = require('../block.service');
const { latLngFromPoint } = require('../../utils/geo');

/**
 * Where is this shopper measuring from? (docs/27 §3.4, docs/29 Phase 2h)
 *
 * The assistants used to answer location questions with only what the client
 * happened to send, and the Ask CityCart drawer sends coordinates solely when a
 * pin was dropped. A customer who picked a block from the Nearby list — the
 * normal path — therefore got city-wide answers to a block-sized question.
 *
 * Resolution order, most trusted first:
 *   1. coordinates in this request (a pin the shopper just dropped or the
 *      browser detected) — the freshest answer to "near me";
 *   2. this customer's own saved address, default first: the pin the shopper
 *      set as their delivery location, which is what checkout will use;
 *   3. block ids the client says are selected — kept only as a hint, because
 *      each one is re-read from the Block collection and must be active.
 * Everything else is the city.
 *
 * The blocks themselves are never taken from the client: they are worked out
 * from a position by `activeBlocksContaining`, the same rule as the Stores page,
 * so a redrawn zone changes the answer without anything having to be updated.
 * Reading the address row is safe by construction — it is looked up by the
 * authenticated `userId`, never by an id in the body.
 */
const MAX_BLOCK_HINTS = 10;

const objectId = (value) => (mongoose.isValidObjectId(String(value)) ? String(value) : null);

// A missing coordinate is missing, not zero: Number(null) is 0, and a pin at
// (0, 0) would outrank the shopper's real saved address and answer "no zone"
// about the middle of the ocean.
const coord = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

async function blocksAt(lat, lng) {
  const blocks = await activeBlocksContaining(lat, lng);
  // Overlapping zones can straddle two cities, and every search below is
  // city-scoped, so the answer is kept inside one city — the first block's.
  const cityId = blocks.length ? String(blocks[0].cityId) : null;
  return blocks
    .filter((block) => String(block.cityId) === cityId)
    .map((block) => ({ _id: String(block._id), name: block.name, cityId: String(block.cityId) }));
}

async function nameOf(model, id, fallback = null) {
  if (!id) return fallback;
  const doc = await model.findById(id).select('name').lean();
  return doc ? doc.name : fallback;
}

function emptyScope() {
  return {
    cityId: null,
    cityName: null,
    lat: null,
    lng: null,
    blockIds: [],
    blockNames: [],
    blocks: [],
    source: 'none',
    addressLabel: null,
    deliverable: null,
    hasLocation: false,
  };
}

async function resolveShopperScope({ userId, cityId = null, lat = null, lng = null, blockIds = [] } = {}) {
  const scope = emptyScope();
  scope.cityId = objectId(cityId);

  const pin = { lat: coord(lat), lng: coord(lng) };
  if (pin.lat !== null && pin.lng !== null) {
    scope.lat = pin.lat;
    scope.lng = pin.lng;
    scope.source = 'pin';
    scope.hasLocation = true;
  } else if (userId) {
    // The shopper's own saved delivery location: default first, then newest.
    const address = await Address.findOne({ userId: objectId(String(userId)) }).sort({
      isDefault: -1,
      createdAt: -1,
    });
    if (address && address.location && Array.isArray(address.location.coordinates)) {
      const point = latLngFromPoint(address.location);
      scope.lat = point.lat;
      scope.lng = point.lng;
      scope.source = 'address';
      scope.addressLabel = address.label || null;
      scope.hasLocation = true;
    }
  }

  if (scope.lat !== null) {
    scope.blocks = await blocksAt(scope.lat, scope.lng);
  } else {
    // Only a hint: each id must be a real, active block, and they must all be
    // in one city so a hand-made list cannot span the platform.
    const wanted = [...new Set((Array.isArray(blockIds) ? blockIds : []).map(objectId).filter(Boolean))].slice(
      0,
      MAX_BLOCK_HINTS
    );
    if (wanted.length) {
      const found = await Block.find({ _id: { $in: wanted }, isActive: true }).select('name cityId').lean();
      const cities = new Set(found.map((block) => String(block.cityId)));
      if (found.length && cities.size === 1) {
        scope.source = 'selected';
        scope.blocks = found.map((block) => ({ _id: String(block._id), name: block.name, cityId: String(block.cityId) }));
        scope.hasLocation = true;
      }
    }
  }

  scope.blockIds = scope.blocks.map((block) => block._id);
  scope.blockNames = scope.blocks.map((block) => block.name);
  // Blocks are city-scoped, so a resolved block also tells us the city when the
  // request did not name one.
  if (!scope.cityId && scope.blocks.length) scope.cityId = scope.blocks[0].cityId;
  scope.cityName = await nameOf(City, scope.cityId);
  // Three states, and they mean different things: null (no location to measure
  // from), false (a position outside every delivery zone), true (a real block).
  scope.deliverable = scope.lat === null && !scope.blockIds.length ? null : scope.blockIds.length > 0;

  return scope;
}

/**
 * The same scope for a free-text area name ("do you deliver to DHA?"). Searched
 * among active blocks of active cities, so a renamed or retired zone cannot be
 * answered as if it were live.
 */
async function findAreaBlocks(term, { cityId = null, limit = 5 } = {}) {
  const text = String(term || '').trim();
  if (text.length < 2) return [];
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const blocks = await Block.find({
    isActive: true,
    name: { $regex: `^\\s*${escaped}`, $options: 'i' },
    ...(cityId && objectId(cityId) ? { cityId: objectId(cityId) } : {}),
  })
    .sort({ name: 1 })
    .limit(limit)
    .lean();
  if (!blocks.length) return [];
  const cities = await City.find({ _id: { $in: [...new Set(blocks.map((b) => String(b.cityId)))] }, isActive: true })
    .select('name')
    .lean();
  const live = new Map(cities.map((city) => [String(city._id), city.name]));
  return blocks
    .filter((block) => live.has(String(block.cityId)))
    .map((block) => ({ _id: String(block._id), name: block.name, cityName: live.get(String(block.cityId)) }));
}

module.exports = { resolveShopperScope, findAreaBlocks, MAX_BLOCK_HINTS };
