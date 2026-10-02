const mongoose = require('mongoose');

const Brand = require('../models/brand.model');
const Store = require('../models/store.model');
const User = require('../models/user.model');
const City = require('../models/city.model');
const { hashPassword } = require('../utils/password');
const { slugify } = require('../utils/slugify');
const { runInTransaction } = require('../utils/transaction');
const { ROLES } = require('../config/roles');
const { BrandError } = require('./brand.service');

/**
 * Names are unique platform-wide and compared case-insensitively through
 * their slug (slugify lowercases and normalises punctuation, so "Nike",
 * "NIKE" and "nike!" all collide). Used by the live "is this name taken?"
 * checks on the sign-up form and re-checked inside the application.
 */
async function isBrandNameAvailable(name) {
  const slug = slugify(name);
  return slug.length > 0 && !(await Brand.exists({ slug }));
}

async function isStoreNameAvailable(name) {
  const slug = slugify(name);
  return slug.length > 0 && !(await Store.exists({ slug }));
}

function duplicateError(err) {
  const text = `${err.message || ''} ${JSON.stringify(err.keyPattern || {})}`;
  if (text.includes('email')) return new BrandError(409, 'Email is already registered.');
  if (text.includes('stores')) return new BrandError(409, 'A store with this name already exists.');
  if (text.includes('brands')) return new BrandError(409, 'A brand with this name already exists.');
  return new BrandError(409, 'The brand or store name is already taken.');
}

/**
 * Self-service seller sign-up: creates the owner account (BRAND_ADMIN), the
 * brand and its store together in ONE transaction. The brand is ACTIVE
 * immediately — the data validation IS the gate — and a super admin can
 * suspend or terminate it later. If anything fails nothing is created, so
 * there are never orphan accounts or half-built stores.
 */
async function applyForBrand({ owner, brand, store }) {
  const city = await City.findOne({ _id: brand.cityId, isActive: true });
  if (!city) {
    throw new BrandError(400, 'Invalid cityId — city does not exist or is not active.');
  }

  const brandSlug = slugify(brand.name);
  const storeSlug = slugify(store.name);
  if (!brandSlug || !storeSlug) {
    throw new BrandError(400, 'Brand and store names must contain letters or numbers.');
  }

  // Friendly pre-checks; the unique indexes below are the real guarantee.
  if (await User.findOne({ email: owner.email })) {
    throw new BrandError(409, 'Email is already registered.');
  }
  if (!(await isBrandNameAvailable(brand.name))) {
    throw new BrandError(409, 'A brand with this name already exists.');
  }
  if (!(await isStoreNameAvailable(store.name))) {
    throw new BrandError(409, 'A store with this name already exists.');
  }

  const passwordHash = await hashPassword(owner.password); // slow: outside the transaction
  const brandId = new mongoose.Types.ObjectId();

  try {
    return await runInTransaction(async (session) => {
      const [createdBrand] = await Brand.create(
        [{ ...brand, _id: brandId, slug: brandSlug, status: 'ACTIVE' }],
        { session }
      );
      const [user] = await User.create(
        [{ name: owner.name, email: owner.email, phone: owner.phone, passwordHash, role: ROLES.BRAND_ADMIN, brandId }],
        { session }
      );
      const [createdStore] = await Store.create([{ ...store, brandId, slug: storeSlug }], { session });
      return { brand: createdBrand, store: createdStore, user };
    });
  } catch (err) {
    if (err.code === 11000) {
      throw duplicateError(err);
    }
    throw err;
  }
}

module.exports = { applyForBrand, isBrandNameAvailable, isStoreNameAvailable };
