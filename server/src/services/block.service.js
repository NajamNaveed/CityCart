const Block = require('../models/block.model');
const City = require('../models/city.model');
const { slugify } = require('../utils/slugify');
const { distanceKm, pointFromLatLng, latLngFromPoint, roundKm } = require('../utils/geo');

/**
 * Block service — neighbourhoods inside a city (see models/block.model.js).
 * Errors carry a `status`, same pattern as city.service.js.
 */
class BlockError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// A shopper further than this from every block centre is treated as outside
// the supported area rather than being matched to a far-away block.
const MAX_RESOLVE_KM = 10;

/** API shape: GeoJSON centre flattened to latitude/longitude for clients. */
function serializeBlock(block) {
  const plain = typeof block.toObject === 'function' ? block.toObject() : block;
  const { lat, lng } = latLngFromPoint(plain.center);
  return {
    _id: plain._id,
    cityId: plain.cityId,
    name: plain.name,
    slug: plain.slug,
    isActive: plain.isActive,
    latitude: lat,
    longitude: lng,
  };
}

async function listBlocks({ cityId, isActive } = {}) {
  const filter = {};
  if (cityId) filter.cityId = cityId;
  if (isActive !== undefined) filter.isActive = isActive;
  const blocks = await Block.find(filter).sort({ name: 1 });
  return blocks.map(serializeBlock);
}

async function getBlockByIdRaw(id) {
  return Block.findById(id);
}

async function createBlock({ cityId, name, latitude, longitude }) {
  const city = await City.findById(cityId);
  if (!city) {
    throw new BlockError(404, 'City not found.');
  }

  const slug = slugify(name);
  if (!slug) {
    throw new BlockError(400, 'name must contain letters or numbers.');
  }
  const existing = await Block.findOne({ cityId, slug });
  if (existing) {
    throw new BlockError(409, 'A block with this name already exists in this city.');
  }

  try {
    const block = await Block.create({
      cityId,
      name,
      slug,
      center: pointFromLatLng(latitude, longitude),
    });
    return serializeBlock(block);
  } catch (err) {
    // Defense-in-depth against a race on the unique (cityId, slug) index.
    if (err.code === 11000) {
      throw new BlockError(409, 'A block with this name already exists in this city.');
    }
    throw err;
  }
}

async function updateBlock(id, { name, latitude, longitude, isActive }) {
  const block = await Block.findById(id);
  if (!block) {
    throw new BlockError(404, 'Block not found.');
  }

  if (name !== undefined) block.name = name; // slug stays fixed, like City
  if (latitude !== undefined) block.center = pointFromLatLng(latitude, longitude);
  if (isActive !== undefined) block.isActive = isActive;

  return serializeBlock(await block.save());
}

/**
 * Soft delete: a block that branches point at is never removed, only hidden
 * from pickers (docs/05 §8 — prefer deactivation to destructive deletion).
 */
async function deactivateBlock(id) {
  const block = await Block.findById(id);
  if (!block) {
    throw new BlockError(404, 'Block not found.');
  }
  block.isActive = false;
  return serializeBlock(await block.save());
}

/**
 * Turns a position into { block, city, distanceKm } using the nearest ACTIVE
 * block (in an ACTIVE city) within MAX_RESOLVE_KM. Returns null when the
 * position is outside the supported area — callers fall back to a manual pick.
 * `$near` returns blocks already sorted nearest-first.
 */
async function resolveBlock({ lat, lng }) {
  const nearby = await Block.find({
    isActive: true,
    center: {
      $near: {
        $geometry: pointFromLatLng(lat, lng),
        $maxDistance: MAX_RESOLVE_KM * 1000,
      },
    },
  }).limit(5);

  if (nearby.length === 0) {
    return null;
  }

  const cities = await City.find({ _id: { $in: nearby.map((b) => b.cityId) }, isActive: true });
  const cityById = new Map(cities.map((c) => [String(c._id), c]));

  const match = nearby.find((b) => cityById.has(String(b.cityId)));
  if (!match) {
    return null;
  }

  return {
    block: serializeBlock(match),
    city: cityById.get(String(match.cityId)),
    distanceKm: roundKm(distanceKm({ lat, lng }, latLngFromPoint(match.center))),
  };
}

module.exports = {
  listBlocks,
  getBlockByIdRaw,
  createBlock,
  updateBlock,
  deactivateBlock,
  resolveBlock,
  serializeBlock,
  BlockError,
  MAX_RESOLVE_KM,
};
