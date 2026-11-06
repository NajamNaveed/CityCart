const ServiceProvider = require('../models/serviceProvider.model');
const ServiceOffering = require('../models/serviceOffering.model');
const Block = require('../models/block.model');
const { escapeRegex } = require('../utils/escapeRegex');
const { distanceKm, latLngFromPoint, roundKm, MONGO_EARTH_RADIUS_KM } = require('../utils/geo');

class ServiceDiscoveryError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 12;
const OFFERING_HIT_CAP = 1000;
const TOP_OFFERINGS = 3;

const PUBLIC_PROVIDER_POPULATE = [
  { path: 'categoryId', select: 'name slug' },
  { path: 'cityId', select: 'name' },
  { path: 'blockId', select: 'name center area' },
];

function blockPublic(block) {
  if (!block || !block.center) return null;
  return {
    _id: block._id,
    name: block.name,
    // The block centre is the public, approximate location. The provider's pin
    // is never returned until a booking is accepted (docs/24 §4.3).
    center: latLngFromPoint(block.center),
    ...(block.area && { area: block.area }),
  };
}

function serializePublicOffering(offering) {
  return {
    _id: offering._id,
    title: offering.title,
    slug: offering.slug,
    description: offering.description,
    images: offering.images,
    startingAtPrice: offering.startingAtPrice,
    durationMinutes: offering.durationMinutes,
    attributes: offering.attributes,
  };
}

/**
 * The public provider page (docs/24 §4.3). Only an approved provider is
 * published; a pending, suspended or terminated tenant answers 404 exactly
 * like a missing slug, so the public cannot enumerate applications.
 */
async function getPublicProvider(slug) {
  const provider = await ServiceProvider.findOne({
    slug,
    status: 'ACTIVE',
    verification: 'VERIFIED',
  }).populate(PUBLIC_PROVIDER_POPULATE);
  if (!provider) throw new ServiceDiscoveryError(404, 'Provider not found.');

  const offerings = await ServiceOffering.find({ providerId: provider._id, isActive: true }).sort({
    createdAt: -1,
  });

  const category = provider.categoryId && provider.categoryId.name ? provider.categoryId : null;
  const city = provider.cityId && provider.cityId.name ? provider.cityId : null;
  const block = provider.blockId && provider.blockId.name ? provider.blockId : null;

  return {
    _id: provider._id,
    displayName: provider.displayName,
    slug: provider.slug,
    bio: provider.bio,
    avatar: provider.avatar,
    coverImage: provider.coverImage,
    startingAtPrice: provider.startingAtPrice,
    ratingAvg: provider.ratingAvg,
    ratingCount: provider.ratingCount,
    completedBookings: provider.completedBookings,
    isNew: provider.completedBookings < 10,
    category: category ? { _id: category._id, name: category.name, slug: category.slug } : null,
    city: city ? { _id: city._id, name: city.name } : null,
    block: blockPublic(block),
    offerings: offerings.map(serializePublicOffering),
    // Availability and reviews arrive with the booking lifecycle (Phase 2c).
    availability: [],
    reviews: [],
  };
}

/**
 * Finds approved providers in the shopper's area. Each provider works in one
 * block, so block matching is a simple equality — no branch fan-out.
 *
 * The exact pin is never returned: shoppers see the provider's block and the
 * distance to its centre. Category, text search and sorting are applied on
 * the server so the client cannot widen the scope.
 */
async function discoverServices({
  q,
  scope,
  cityId,
  blockId,
  blockIds,
  categoryId,
  radiusKm,
  lat,
  lng,
  sort,
  page,
  limit,
}) {
  const pageNumber = page || DEFAULT_PAGE;
  const limitNumber = limit || DEFAULT_LIMIT;

  // ---- 1. Resolve the shopper's area -------------------------------------
  let block = null;
  let areaBlocks = [];
  if (blockId) {
    block = await Block.findOne({ _id: blockId, isActive: true });
    if (!block) throw new ServiceDiscoveryError(404, 'Block not found.');
    areaBlocks = [block];
  }
  if (scope === 'area') {
    areaBlocks = await Block.find({ _id: { $in: blockIds }, isActive: true });
    if (areaBlocks.length === 0) throw new ServiceDiscoveryError(404, 'Block not found.');
    if (new Set(areaBlocks.map((b) => String(b.cityId))).size > 1) {
      throw new ServiceDiscoveryError(400, 'Choose blocks from one city.');
    }
    [block] = areaBlocks;
  }
  const origin =
    lat !== undefined ? { lat, lng } : block && areaBlocks.length === 1 ? latLngFromPoint(block.center) : null;
  const effectiveRadius = scope === 'radius' || (scope === 'area' && radiusKm !== undefined) ? radiusKm : null;

  // ---- 2. Tenant filter ---------------------------------------------------
  const filter = { status: 'ACTIVE', verification: 'VERIFIED' };
  const effectiveCityId = cityId || (block && String(block.cityId));
  if (effectiveCityId) filter.cityId = effectiveCityId;
  if (scope === 'block') {
    filter.blockId = blockId;
  } else if (scope === 'area') {
    filter.blockId = { $in: areaBlocks.map((b) => b._id) };
    if (effectiveRadius !== null) {
      filter.location = {
        $geoWithin: { $centerSphere: [[origin.lng, origin.lat], effectiveRadius / MONGO_EARTH_RADIUS_KM] },
      };
    }
  } else if (scope === 'radius') {
    filter.location = {
      $geoWithin: { $centerSphere: [[lng, lat], radiusKm / MONGO_EARTH_RADIUS_KM] },
    };
  }
  if (categoryId) filter.categoryId = categoryId;

  // ---- 3. Text search over the provider and its offerings -----------------
  const search = q ? q.trim() : '';
  if (search) {
    const regex = { $regex: escapeRegex(search), $options: 'i' };
    const [nameMatches, offeringMatches] = await Promise.all([
      ServiceProvider.find(
        { status: 'ACTIVE', verification: 'VERIFIED', $or: [{ displayName: regex }, { bio: regex }] },
        '_id'
      ).limit(OFFERING_HIT_CAP),
      ServiceOffering.find(
        { isActive: true, $or: [{ title: regex }, { description: regex }] },
        'providerId'
      ).limit(OFFERING_HIT_CAP),
    ]);
    const ids = [
      ...new Set([
        ...nameMatches.map((p) => String(p._id)),
        ...offeringMatches.map((o) => String(o.providerId)),
      ]),
    ];
    filter._id = { $in: ids };
  }

  const sortSpec =
    sort === 'price'
      ? { startingAtPrice: 1, rankScore: -1, _id: 1 }
      : sort === 'rating'
        ? { ratingAvg: -1, ratingCount: -1, rankScore: -1, _id: 1 }
        : { rankScore: -1, ratingAvg: -1, completedBookings: -1, createdAt: -1, _id: 1 };

  const [providers, total] = await Promise.all([
    ServiceProvider.find(filter)
      .sort(sortSpec)
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber)
      .populate(PUBLIC_PROVIDER_POPULATE),
    ServiceProvider.countDocuments(filter),
  ]);

  const blocksMeta = areaBlocks.map((b) => ({ _id: b._id, name: b.name }));

  // ---- 4. Public offering summaries for the page -------------------------
  const items = providers.map((provider) => {
    const category = provider.categoryId && provider.categoryId.name ? provider.categoryId : null;
    const city = provider.cityId && provider.cityId.name ? provider.cityId : null;
    const blockDoc = provider.blockId && provider.blockId.name ? provider.blockId : null;
    const providerBlock = blockPublic(blockDoc);
    let km = null;
    if (origin && providerBlock) {
      km = roundKm(distanceKm(origin, providerBlock.center));
    }
    return {
      _id: provider._id,
      displayName: provider.displayName,
      slug: provider.slug,
      bio: provider.bio,
      avatar: provider.avatar,
      coverImage: provider.coverImage,
      startingAtPrice: provider.startingAtPrice,
      ratingAvg: provider.ratingAvg,
      ratingCount: provider.ratingCount,
      completedBookings: provider.completedBookings,
      isNew: provider.completedBookings < 10,
      category: category ? { _id: category._id, name: category.name, slug: category.slug } : null,
      city: city ? { _id: city._id, name: city.name } : null,
      block: providerBlock,
      distanceKm: km,
      offeringCount: 0,
      topOfferings: [],
    };
  });

  if (items.length > 0) {
    const offerings = await ServiceOffering.find({
      providerId: { $in: items.map((p) => p._id) },
      isActive: true,
    })
      .sort({ createdAt: -1 })
      .limit(OFFERING_HIT_CAP);
    const byProvider = new Map();
    for (const offering of offerings) {
      const key = String(offering.providerId);
      if (!byProvider.has(key)) byProvider.set(key, []);
      byProvider.get(key).push(offering);
    }
    for (const item of items) {
      const list = byProvider.get(String(item._id)) || [];
      item.offeringCount = list.length;
      item.topOfferings = list.slice(0, TOP_OFFERINGS).map(serializePublicOffering);
    }
  }

  return {
    items,
    pagination: {
      page: pageNumber,
      limit: limitNumber,
      total,
      pages: Math.ceil(total / limitNumber),
    },
    meta: {
      scope,
      radiusKm: effectiveRadius,
      origin,
      block: block ? { _id: block._id, name: block.name } : null,
      blocks: blocksMeta,
      totalOfferings: items.reduce((sum, item) => sum + item.offeringCount, 0),
    },
  };
}

module.exports = {
  ServiceDiscoveryError,
  getPublicProvider,
  discoverServices,
};
