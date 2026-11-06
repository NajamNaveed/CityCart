const mongoose = require('mongoose');

const Brand = require('../models/brand.model');
const Store = require('../models/store.model');
const Branch = require('../models/branch.model');
const Block = require('../models/block.model');
const User = require('../models/user.model');
const City = require('../models/city.model');
const { hashPassword } = require('../utils/password');
const { slugify } = require('../utils/slugify');
const { runInTransaction } = require('../utils/transaction');
const { blockIdsForPin } = require('./branchBlocks.service');
const { assertPinInBlock } = require('./branch.service');
const { pointFromLatLng } = require('../utils/geo');
const { ROLES } = require('../config/roles');
const { BrandError } = require('./brand.service');
const { sendVerificationEmail } = require('./emailAuth.service');

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

function duplicateError(err) {
  const text = `${err.message || ''} ${JSON.stringify(err.keyPattern || {})}`;
  if (text.includes('email')) return new BrandError(409, 'Email is already registered.');
  if (text.includes('brands')) return new BrandError(409, 'A brand with this name already exists.');
  if (text.includes('stores')) return new BrandError(409, 'This name is already in use. Choose another brand name.');
  return new BrandError(409, 'The brand name is already taken.');
}

/**
 * Self-service seller sign-up: creates the owner account (BRAND_ADMIN), the
 * brand, its internal storefront record and its FIRST PHYSICAL SHOP (branch)
 * together in ONE transaction. If anything fails nothing is created, so there
 * are never orphan accounts or half-built shops.
 *
 * The brand starts PENDING and the owner unverified: discovery and sign-in
 * stay closed until the emailed link is opened, then emailAuth.service
 * activates the brand. This keeps unverified sign-ups out of the marketplace.
 */
async function applyForBrand({ owner, brand, branch }) {
  const city = await City.findOne({ _id: brand.cityId, isActive: true });
  if (!city) {
    throw new BrandError(400, 'Invalid cityId — city does not exist or is not active.');
  }

  const brandSlug = slugify(brand.name);
  if (!brandSlug) {
    throw new BrandError(400, 'Brand name must contain letters or numbers.');
  }

  // The shop's block must be real, active and in the brand's own city.
  const block = await Block.findOne({ _id: branch.blockId, isActive: true });
  if (!block || String(block.cityId) !== String(city._id)) {
    throw new BrandError(400, 'Invalid blockId — choose a shop area in the selected city.');
  }

  // An optional map pin must sit inside that block (same rule as the branch
  // editor); without one the shop sits at the middle of the block.
  let location = block.center;
  if (branch.latitude !== undefined) {
    try {
      assertPinInBlock(branch.latitude, branch.longitude, block);
    } catch (err) {
      throw new BrandError(err.status || 400, err.message);
    }
    location = pointFromLatLng(branch.latitude, branch.longitude);
  }

  // Friendly pre-checks; the unique indexes below are the real guarantee.
  if (await User.findOne({ email: owner.email, accountType: 'BRAND' })) {
    throw new BrandError(409, 'Email is already registered.');
  }
  if (!(await isBrandNameAvailable(brand.name))) {
    throw new BrandError(409, 'A brand with this name already exists.');
  }

  const passwordHash = await hashPassword(owner.password); // slow: outside the transaction
  const brandId = new mongoose.Types.ObjectId();

  try {
    const result = await runInTransaction(async (session) => {
      const [createdBrand] = await Brand.create(
        [{ ...brand, _id: brandId, slug: brandSlug, status: 'PENDING' }],
        { session }
      );
      const [user] = await User.create(
        [
          {
            name: owner.name,
            email: owner.email,
            phone: owner.phone,
            passwordHash,
            role: ROLES.BRAND_ADMIN,
            accountType: 'BRAND',
            brandId,
            emailVerifiedAt: null,
          },
        ],
        { session }
      );
      // Internal one-per-brand storefront record, named after the brand.
      // Customers never see it; public discovery uses branches only.
      const [createdStore] = await Store.create([{ brandId, name: brand.name, slug: brandSlug }], { session });
      const [createdBranch] = await Branch.create(
        [
          {
            brandId,
            blockId: block._id,
            blockIds: await blockIdsForPin(location, block),
            name: branch.name,
            address: branch.address || '',
            // The owner's phone is the shop's phone unless they gave another.
            phone: branch.phone || owner.phone || '',
            location,
          },
        ],
        { session }
      );
      return { brand: createdBrand, store: createdStore, branch: createdBranch, user };
    });
    // Post-commit and best-effort: a provider outage never rolls back an
    // application, and the owner can resend the link from sign-in.
    await sendVerificationEmail(result.user);
    return result;
  } catch (err) {
    if (err.code === 11000) {
      throw duplicateError(err);
    }
    throw err;
  }
}

module.exports = { applyForBrand, isBrandNameAvailable };
