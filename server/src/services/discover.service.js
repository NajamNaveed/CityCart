const Brand = require('../models/brand.model');
const Branch = require('../models/branch.model');
const Block = require('../models/block.model');
const Product = require('../models/product.model');
const { escapeRegex } = require('../utils/escapeRegex');
const { distanceKm, latLngFromPoint, roundKm, MONGO_EARTH_RADIUS_KM } = require('../utils/geo');
const { withAvailability } = require('./product.service');

/**
 * Location-based discovery: which brands can a shopper find in their block /
 * within a radius / across their city, and which of their products match?
 *
 * Public data only: ACTIVE brands, active branches, ACTIVE products. The
 * shopper's coordinates are used for this one query and never stored.
 *
 * v1 rule: a brand's catalogue is brand-wide, so every active branch of a
 * brand "offers" that brand's products (stock stays brand-level).
 */
class DiscoverError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 12;
const PRODUCTS_PER_BRAND = 4;
// Upper bounds on the fan-out queries so one broad search stays cheap.
const PRODUCT_HIT_CAP = 1000;
const PRODUCT_FETCH_CAP = 400;

async function discover({ q, scope, cityId, blockId, radiusKm, lat, lng, page, limit }) {
  const pageNumber = page || DEFAULT_PAGE;
  const limitNumber = limit || DEFAULT_LIMIT;

  // ---- 1. Where is the shopper measuring from? ---------------------------
  let block = null;
  if (blockId) {
    block = await Block.findOne({ _id: blockId, isActive: true });
    if (!block) {
      throw new DiscoverError(404, 'Block not found.');
    }
  }
  const origin =
    lat !== undefined ? { lat, lng } : block ? latLngFromPoint(block.center) : null;

  // ---- 2. Which brands could appear? -------------------------------------
  const brandFilter = { status: 'ACTIVE' };
  const effectiveCityId = cityId || (block && String(block.cityId));
  if (effectiveCityId) {
    brandFilter.cityId = effectiveCityId;
  }
  const brands = await Brand.find(brandFilter, '_id name slug logo');
  const brandById = new Map(brands.map((b) => [String(b._id), b]));

  const search = q ? q.trim() : '';
  const nameRegex = search ? new RegExp(escapeRegex(search), 'i') : null;

  let candidateIds = brands.map((b) => String(b._id));
  if (nameRegex && candidateIds.length > 0) {
    const nameMatched = brands.filter((b) => nameRegex.test(b.name)).map((b) => String(b._id));
    const productHits = await Product.find(
      {
        isActive: true,
        status: 'ACTIVE',
        brandId: { $in: candidateIds },
        name: { $regex: escapeRegex(search), $options: 'i' },
      },
      'brandId'
    ).limit(PRODUCT_HIT_CAP);
    candidateIds = [...new Set([...nameMatched, ...productHits.map((p) => String(p.brandId))])];
  }

  const empty = (extra = {}) => ({
    items: [],
    pagination: { page: pageNumber, limit: limitNumber, total: 0, pages: 0 },
    meta: {
      scope,
      radiusKm: scope === 'radius' ? radiusKm : null,
      origin,
      block: block ? { _id: block._id, name: block.name } : null,
      totalBranches: 0,
      ...extra,
    },
  });

  if (candidateIds.length === 0) {
    return empty();
  }

  // ---- 3. Which branches are in range? -----------------------------------
  const branchFilter = { isActive: true, brandId: { $in: candidateIds } };
  if (scope === 'block') {
    branchFilter.blockId = blockId;
  } else if (scope === 'radius') {
    // $geoWithin + $centerSphere is served by the 2dsphere index; distances
    // are computed below for display and ordering.
    branchFilter.location = {
      $geoWithin: {
        $centerSphere: [[origin.lng, origin.lat], radiusKm / MONGO_EARTH_RADIUS_KM],
      },
    };
  }
  const branches = await Branch.find(branchFilter);
  if (branches.length === 0) {
    return empty();
  }

  const blocks = await Block.find({ _id: { $in: [...new Set(branches.map((b) => String(b.blockId)))] } });
  const blockNameById = new Map(blocks.map((b) => [String(b._id), b.name]));

  // ---- 4. Group branches by brand, nearest first -------------------------
  const grouped = new Map();
  for (const branch of branches) {
    const key = String(branch.brandId);
    const km = origin ? roundKm(distanceKm(origin, latLngFromPoint(branch.location))) : null;
    const entry = {
      _id: branch._id,
      name: branch.name,
      address: branch.address,
      phone: branch.phone,
      blockId: branch.blockId,
      blockName: blockNameById.get(String(branch.blockId)) || '',
      distanceKm: km,
    };
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(entry);
  }

  const byDistance = (a, b) => {
    if (a.distanceKm === null && b.distanceKm === null) return 0;
    if (a.distanceKm === null) return 1;
    if (b.distanceKm === null) return -1;
    return a.distanceKm - b.distanceKm;
  };

  const results = [...grouped.entries()]
    .map(([brandKey, brandBranches]) => {
      const brand = brandById.get(brandKey);
      const sorted = [...brandBranches].sort(byDistance);
      return {
        _id: brand._id,
        name: brand.name,
        slug: brand.slug,
        logo: brand.logo,
        nearestKm: sorted[0].distanceKm,
        branchCount: sorted.length,
        branches: sorted,
        products: [],
      };
    })
    .sort((a, b) => byDistance({ distanceKm: a.nearestKm }, { distanceKm: b.nearestKm }) || a.name.localeCompare(b.name));

  const total = results.length;
  const pageItems = results.slice((pageNumber - 1) * limitNumber, pageNumber * limitNumber);

  // ---- 5. Products for the brands on this page ---------------------------
  if (pageItems.length > 0) {
    const products = await Product.find({
      isActive: true,
      status: 'ACTIVE',
      brandId: { $in: pageItems.map((b) => b._id) },
    })
      .sort({ createdAt: -1 })
      .limit(PRODUCT_FETCH_CAP);

    // Products that match the search come first, then the brand's newest.
    const decorated = products.map((p) => ({
      product: p,
      matched: nameRegex ? nameRegex.test(p.name) : false,
    }));
    decorated.sort((a, b) => Number(b.matched) - Number(a.matched));

    const picked = new Map();
    for (const { product, matched } of decorated) {
      const key = String(product.brandId);
      if (!picked.has(key)) picked.set(key, []);
      const list = picked.get(key);
      if (list.length < PRODUCTS_PER_BRAND) list.push({ product, matched });
    }

    const flat = [...picked.values()].flat();
    const withStock = await withAvailability(flat.map((entry) => entry.product));
    const stockById = new Map(withStock.map((p) => [String(p._id), p.availability]));

    for (const item of pageItems) {
      item.products = (picked.get(String(item._id)) || []).map(({ product, matched }) => ({
        _id: product._id,
        name: product.name,
        price: product.price,
        compareAtPrice: product.compareAtPrice,
        image: product.images && product.images[0],
        availability: stockById.get(String(product._id)) || 'OUT_OF_STOCK',
        matched,
      }));
    }
  }

  return {
    items: pageItems,
    pagination: {
      page: pageNumber,
      limit: limitNumber,
      total,
      pages: Math.ceil(total / limitNumber),
    },
    meta: {
      scope,
      radiusKm: scope === 'radius' ? radiusKm : null,
      origin,
      block: block ? { _id: block._id, name: block.name } : null,
      totalBranches: branches.length,
    },
  };
}

module.exports = { discover, DiscoverError, PRODUCTS_PER_BRAND };
