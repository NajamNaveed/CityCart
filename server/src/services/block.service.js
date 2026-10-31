const Block = require('../models/block.model');
const City = require('../models/city.model');
const { slugify } = require('../utils/slugify');
const { distanceKm, pointFromLatLng, latLngFromPoint, roundKm } = require('../utils/geo');
const { validateRing, innerPoint, toGeoJsonPolygon, ringFromGeoJson } = require('../utils/polygon');
const { recomputeCityBranches } = require('./branchBlocks.service');

/**
 * Block service — neighbourhoods inside a city (see models/block.model.js).
 * A block may have a drawn boundary (`area`); zones can overlap.
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
const NEAREST_BLOCKS = 5;

/**
 * API shape: GeoJSON flattened for clients. `latitude`/`longitude` is the centre,
 * `polygon` is the boundary as an open [lat, lng] ring (null for a legacy
 * centre-only block). `extras` carries admin hints such as `overlaps`.
 */
function serializeBlock(block, extras = {}) {
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
    polygon: ringFromGeoJson(plain.area),
    ...extras,
  };
}

async function listBlocks({ cityId, isActive } = {}) {
  const filter = {};
  if (cityId) filter.cityId = cityId;
  if (isActive !== undefined) filter.isActive = isActive;
  const blocks = await Block.find(filter).sort({ name: 1 });
  return blocks.map((b) => serializeBlock(b));
}

async function getBlockByIdRaw(id) {
  return Block.findById(id);
}

/** Checks a drawn outline and returns what to store: the boundary and its inside point. */
function buildArea(points) {
  const checked = validateRing(points);
  if (!checked.ok) {
    throw new BlockError(400, checked.message);
  }
  const inside = innerPoint(checked.ring);
  return { area: toGeoJsonPolygon(checked.ring), center: pointFromLatLng(inside.lat, inside.lng) };
}

/** Other active blocks of the same city whose boundary touches this one's. */
async function findOverlaps(block) {
  if (!block.area) return [];
  const others = await Block.find({
    cityId: block.cityId,
    _id: { $ne: block._id },
    isActive: true,
    area: { $geoIntersects: { $geometry: { type: 'Polygon', coordinates: block.area.coordinates } } },
  });
  return others.map((b) => ({ _id: b._id, name: b.name }));
}

async function createBlock({ cityId, name, latitude, longitude, polygon }) {
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

  // A drawn boundary decides the centre; otherwise the old centre-only block.
  const shape = polygon ? buildArea(polygon) : { center: pointFromLatLng(latitude, longitude) };

  try {
    const block = await Block.create({ cityId, name, slug, ...shape });
    const overlaps = await findOverlaps(block);
    // A new zone can swallow shops that were in no block.
    if (block.area) await recomputeCityBranches(cityId);
    return serializeBlock(block, { overlaps });
  } catch (err) {
    // Defense-in-depth against a race on the unique (cityId, slug) index.
    if (err.code === 11000) {
      throw new BlockError(409, 'A block with this name already exists in this city.');
    }
    throw err;
  }
}

async function updateBlock(id, { name, latitude, longitude, polygon, isActive }) {
  const block = await Block.findById(id);
  if (!block) {
    throw new BlockError(404, 'Block not found.');
  }

  const wasActive = block.isActive;
  let areaChanged = false;

  if (name !== undefined) block.name = name; // slug stays fixed, like City
  if (polygon === null) {
    block.area = undefined; // back to a centre-only block
    areaChanged = true;
  } else if (polygon !== undefined) {
    const shape = buildArea(polygon);
    block.area = shape.area;
    block.center = shape.center;
    areaChanged = true;
  } else if (latitude !== undefined) {
    if (block.area) {
      throw new BlockError(400, 'This block has a boundary, so its centre follows the shape. Edit the boundary instead.');
    }
    block.center = pointFromLatLng(latitude, longitude);
  }
  if (isActive !== undefined) block.isActive = isActive;

  const saved = await block.save();

  const extras = {};
  if (saved.area) extras.overlaps = await findOverlaps(saved);
  if (areaChanged || saved.isActive !== wasActive) {
    extras.branchesWithoutBlock = (await recomputeCityBranches(saved.cityId)).branchesWithoutBlock;
  }
  return serializeBlock(saved, extras);
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
  const saved = await block.save();
  const { branchesWithoutBlock } = await recomputeCityBranches(saved.cityId);
  return serializeBlock(saved, { branchesWithoutBlock });
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

/**
 * "Which blocks am I in?" — every active block whose boundary contains the
 * position (none, one, or several where zones overlap), plus the nearest other
 * blocks to offer when the position is on a border or outside every zone.
 * Only blocks of active cities are returned.
 */
async function blocksAtPoint({ lat, lng }) {
  const point = pointFromLatLng(lat, lng);
  const [inside, nearby] = await Promise.all([
    Block.find({ isActive: true, area: { $geoIntersects: { $geometry: point } } }),
    Block.find({
      isActive: true,
      center: { $near: { $geometry: point, $maxDistance: MAX_RESOLVE_KM * 1000 } },
    }).limit(NEAREST_BLOCKS + 5),
  ]);

  const cityIds = [...new Set([...inside, ...nearby].map((b) => String(b.cityId)))];
  const cities = cityIds.length ? await City.find({ _id: { $in: cityIds }, isActive: true }) : [];
  const activeCity = new Set(cities.map((c) => String(c._id)));

  const containing = inside.filter((b) => activeCity.has(String(b.cityId)));
  const insideIds = new Set(containing.map((b) => String(b._id)));
  const withDistance = (b) =>
    serializeBlock(b, { distanceKm: roundKm(distanceKm({ lat, lng }, latLngFromPoint(b.center))) });

  return {
    containing: containing.map(withDistance),
    nearest: nearby
      .filter((b) => activeCity.has(String(b.cityId)) && !insideIds.has(String(b._id)))
      .slice(0, NEAREST_BLOCKS)
      .map(withDistance),
  };
}

module.exports = {
  listBlocks,
  getBlockByIdRaw,
  createBlock,
  updateBlock,
  deactivateBlock,
  resolveBlock,
  blocksAtPoint,
  serializeBlock,
  BlockError,
  MAX_RESOLVE_KM,
};
