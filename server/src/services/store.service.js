const Store = require('../models/store.model');
const Brand = require('../models/brand.model');
const { slugify } = require('../utils/slugify');

class StoreError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Public single-store fetch — only ever returns an active store,
 * matching docs/05 §10 ("Public for active stores"). Same
 * hide-rather-than-403 pattern used for Brand's public fetch.
 */
async function getPublicStoreById(id) {
  const store = await Store.findOne({ _id: id, isActive: true });
  if (!store) {
    throw new StoreError(404, 'Store not found.');
  }
  return store;
}

/**
 * Fetches the authenticated brand's own store. The brand is always
 * `tenantBrandId`, derived from req.user by requireTenant — never from
 * any client-supplied value (docs/05 §10 — "/stores/me must derive the
 * brand from req.user.brandId, never from client input").
 */
async function getMyStore(brandId) {
  const store = await Store.findOne({ brandId });
  if (!store) {
    throw new StoreError(404, 'Store not found for this brand.');
  }
  return store;
}

/**
 * Raw fetch by id, no active filter — for the requireBrandOwnership
 * middleware's fetch callback on PATCH /stores/:id, which must be able
 * to load an inactive store too (an owner should still be able to
 * reactivate their own store).
 */
async function getStoreByIdRaw(id) {
  return Store.findById(id);
}

/**
 * Applies a store update. `store` is expected to already be loaded and
 * ownership-verified by requireBrandOwnership (see routes/store.routes.js)
 * — avoids a second fetch. `data` is expected to already be restricted
 * to allowed fields by validators/store.validator.js.
 */
async function applyStoreUpdate(store, data) {
  Object.assign(store, data);
  return store.save();
}

/**
 * Creates the brand's storefront. `brandId` is decided by the controller
 * (tenant for BRAND_ADMIN, body for SUPER_ADMIN) — never trusted from a
 * brand user's body. One store per brand (409 if it already exists).
 */
async function createStore(brandId, data) {
  const brand = await Brand.findById(brandId);
  if (!brand) {
    throw new StoreError(404, 'Brand not found.');
  }
  if (await Store.findOne({ brandId })) {
    throw new StoreError(409, 'This brand already has a store.');
  }
  if (await Store.findOne({ slug: slugify(data.name) })) {
    throw new StoreError(409, 'A store with this name already exists.');
  }
  const fields = { ...data };
  delete fields.brandId;
  try {
    return await Store.create({ ...fields, brandId, slug: slugify(data.name) });
  } catch (err) {
    if (err.code === 11000) {
      if (err.keyPattern && err.keyPattern.slug) {
        throw new StoreError(409, 'A store with this name already exists.');
      }
      throw new StoreError(409, 'This brand already has a store.');
    }
    throw err;
  }
}

module.exports = { createStore, getPublicStoreById, getMyStore, getStoreByIdRaw, applyStoreUpdate, StoreError };