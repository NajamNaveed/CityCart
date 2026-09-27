const Brand = require('../models/brand.model');
const City = require('../models/city.model');
const { slugify } = require('../utils/slugify');

class BrandError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Public brand listing, per docs/05-api-specification.md §9:
 * "Public users should normally only receive active brands." Read as a
 * default rather than an absolute (see validators/brand.validator.js
 * comment) — an explicit ?status= is honored, but the default (no
 * status given) is ACTIVE-only. This is a judgment call on ambiguous
 * wording ("normally"); flagged in the Phase 6 report.
 */
async function listPublicBrands({ cityId, status, search } = {}) {
  const filter = {};

  if (cityId) {
    filter.cityId = cityId;
  }
  filter.status = status || 'ACTIVE';
  if (search) {
    filter.name = { $regex: search, $options: 'i' };
  }

  return Brand.find(filter).sort({ name: 1 });
}

/**
 * Public single-brand fetch. Unlike the list endpoint, a specific
 * non-active brand is never revealed here (404, not 403 — docs/02 §16's
 * "avoid exposing unnecessary information about resources belonging to
 * another tenant" applied to status rather than tenant here).
 */
async function getPublicBrandById(id) {
  const brand = await Brand.findOne({ _id: id, status: 'ACTIVE' });
  if (!brand) {
    throw new BrandError(404, 'Brand not found.');
  }
  return brand;
}

/**
 * Raw fetch by id, with no status filtering — for authenticated/admin
 * paths (ownership checks, status updates) that must be able to see a
 * PENDING/SUSPENDED/REJECTED brand.
 */
async function getBrandByIdRaw(id) {
  return Brand.findById(id);
}

/**
 * Creates a brand. SUPER_ADMIN only (enforced by route middleware, not
 * here). The brand is platform-owned: status always starts at the
 * schema default (PENDING) — this function never accepts a status
 * argument, and cityId must reference a real City.
 */
async function createBrand(data) {
  const city = await City.findById(data.cityId);
  if (!city) {
    throw new BrandError(400, 'Invalid cityId — city does not exist.');
  }

  const slug = slugify(data.name);
  const existing = await Brand.findOne({ slug });
  if (existing) {
    throw new BrandError(409, 'A brand with this name already exists.');
  }

  try {
    return await Brand.create({ ...data, slug });
  } catch (err) {
    if (err.code === 11000) {
      throw new BrandError(409, 'A brand with this name already exists.');
    }
    throw err;
  }
}

/**
 * Applies a brand profile update. `brand` is expected to already be
 * loaded and ownership-verified by the requireBrandOwnership middleware
 * (see routes/brand.routes.js) — this avoids a second database fetch for
 * a document the middleware chain already loaded. `data` is expected to
 * already be restricted to allowed fields by
 * validators/brand.validator.js (updateBrandSchema).
 */
async function applyBrandUpdate(brand, data) {
  Object.assign(brand, data);
  return brand.save();
}

/**
 * Changes brand status. SUPER_ADMIN only (enforced by route
 * middleware). This is the only path that may ever change
 * Brand.status — general brand updates (applyBrandUpdate above) cannot.
 */
async function updateBrandStatus(id, status) {
  const brand = await Brand.findById(id);
  if (!brand) {
    throw new BrandError(404, 'Brand not found.');
  }

  brand.status = status;
  return brand.save();
}

module.exports = {
  listPublicBrands,
  getPublicBrandById,
  getBrandByIdRaw,
  createBrand,
  applyBrandUpdate,
  updateBrandStatus,
  BrandError,
};