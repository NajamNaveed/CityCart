const Block = require('../models/block.model');
const Branch = require('../models/branch.model');
const Brand = require('../models/brand.model');
const Product = require('../models/product.model');
const CatalogProduct = require('../models/catalogProduct.model');
const { distanceKm, latLngFromPoint, roundKm, MONGO_EARTH_RADIUS_KM } = require('../utils/geo');
const { withAvailability } = require('./product.service');

/**
 * The offers for one catalogue product inside a shopping area (Marketplace v2,
 * Phase 3, docs/22 §C): every store in the area that sells it, cheapest first —
 * "Dalda Ghee 1 kg", "from Rs 1,200 · 3 stores".
 *
 * Public data only: ACTIVE brands, active shops, ACTIVE listings. The shopper's
 * position is used for this one request and never stored.
 *
 * Catalogue rule (same as discovery): a listing with no `branchIds` is sold at every
 * shop of its store; one with `branchIds` only at those shops. A listing is in the
 * area when at least one shop that carries it is in the area (and in range).
 *
 * v2 keeps this in memory: an area holds a few thousand listings at most. A much
 * larger catalogue would move the grouping into a database aggregation.
 */
class CatalogBrowseError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Blocks, shops in range, and the live brands behind them. */
async function loadArea({ blockIds, lat, lng, radiusKm }) {
  const blocks = await Block.find({ _id: { $in: blockIds }, isActive: true });
  if (blocks.length === 0) {
    throw new CatalogBrowseError(404, 'Block not found.');
  }
  if (new Set(blocks.map((b) => String(b.cityId))).size > 1) {
    throw new CatalogBrowseError(400, 'Choose blocks from one city.');
  }

  const origin = lat !== undefined ? { lat, lng } : null;
  const branchFilter = { isActive: true, blockIds: { $in: blocks.map((b) => b._id) } };
  if (radiusKm !== undefined && origin) {
    branchFilter.location = {
      $geoWithin: { $centerSphere: [[origin.lng, origin.lat], radiusKm / MONGO_EARTH_RADIUS_KM] },
    };
  }
  const branches = await Branch.find(branchFilter);
  const brandIds = [...new Set(branches.map((b) => String(b.brandId)))];
  const brands = brandIds.length
    ? await Brand.find({ _id: { $in: brandIds }, cityId: blocks[0].cityId, status: 'ACTIVE' })
    : [];
  const brandById = new Map(brands.map((b) => [String(b._id), b]));

  const branchesByBrand = new Map();
  for (const branch of branches) {
    const key = String(branch.brandId);
    if (!brandById.has(key)) continue;
    if (!branchesByBrand.has(key)) branchesByBrand.set(key, []);
    branchesByBrand.get(key).push(branch);
  }
  return { blocks, origin, radiusKm: radiusKm ?? null, brandById, branchesByBrand };
}

/** The shops of a store that carry a listing, within the area. */
function carryingBranches(listing, brandBranches) {
  if (!listing.branchIds || listing.branchIds.length === 0) return brandBranches;
  const carried = new Set(listing.branchIds.map(String));
  return brandBranches.filter((b) => carried.has(String(b._id)));
}

function offerFor(listing, area) {
  const brand = area.brandById.get(String(listing.brandId));
  const carrying = carryingBranches(listing, area.branchesByBrand.get(String(listing.brandId)) || []);
  if (!brand || carrying.length === 0) return null;
  const nearest = area.origin
    ? Math.min(...carrying.map((b) => distanceKm(area.origin, latLngFromPoint(b.location))))
    : null;
  return {
    productId: listing._id,
    brandId: brand._id,
    brandName: brand.name,
    brandSlug: brand.slug,
    brandLogo: brand.logo,
    price: listing.price,
    compareAtPrice: listing.compareAtPrice,
    availability: listing.availability,
    branchCount: carrying.length,
    nearestKm: nearest === null ? null : roundKm(nearest),
  };
}

const byPrice = (a, b) => a.price - b.price;
const byNearest = (a, b) => {
  if (a.nearestKm === null && b.nearestKm === null) return 0;
  if (a.nearestKm === null) return 1;
  if (b.nearestKm === null) return -1;
  return a.nearestKm - b.nearestKm;
};

/** Listings -> one entry per catalogue product with its offers, cheapest first. */
async function groupOffers(listings, area) {
  const withStock = await withAvailability(listings);
  const groups = new Map();
  for (const listing of withStock) {
    const offer = offerFor(listing, area);
    if (!offer) continue;
    const key = String(listing.catalogProductId);
    if (!groups.has(key)) groups.set(key, { listing, offers: [] });
    groups.get(key).offers.push(offer);
  }
  if (groups.size === 0) return [];

  const items = await CatalogProduct.find({ _id: { $in: [...groups.keys()] } });
  const itemById = new Map(items.map((i) => [String(i._id), i]));

  return [...groups.entries()].map(([key, { listing, offers }]) => {
    const item = itemById.get(key);
    const sorted = [...offers].sort(byPrice);
    return {
      catalogProductId: key,
      name: item ? item.name : listing.name,
      slug: item ? item.slug : listing.slug,
      manufacturer: item?.manufacturer,
      size: item?.size,
      images: (item ? item.images : listing.images) || [],
      categoryId: item ? item.categoryId : listing.categoryId,
      minPrice: sorted[0].price,
      maxPrice: sorted[sorted.length - 1].price,
      offerCount: sorted.length,
      inStock: sorted.some((o) => o.availability !== 'OUT_OF_STOCK'),
      nearestKm: [...offers].sort(byNearest)[0].nearestKm,
      offers: sorted,
    };
  });
}

/** One catalogue product with all its offers in the area (the product page). */
async function getCatalogOffers(catalogProductId, params) {
  const area = await loadArea(params);
  const listings = area.brandById.size
    ? await Product.find({
        brandId: { $in: [...area.branchesByBrand.keys()] },
        catalogProductId,
        status: 'ACTIVE',
        isActive: true,
      })
    : [];
  const [group] = await groupOffers(listings, area);
  if (!group) {
    throw new CatalogBrowseError(404, 'This product is not sold in your area.');
  }
  return {
    item: group,
    meta: { blocks: area.blocks.map((b) => ({ _id: b._id, name: b.name })), radiusKm: area.radiusKm, origin: area.origin },
  };
}

module.exports = { getCatalogOffers, CatalogBrowseError };
