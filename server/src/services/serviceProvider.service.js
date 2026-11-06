const mongoose = require('mongoose');

const ServiceProvider = require('../models/serviceProvider.model');
const ServiceCategory = require('../models/serviceCategory.model');
const User = require('../models/user.model');
const City = require('../models/city.model');
const Block = require('../models/block.model');
const { hashPassword } = require('../utils/password');
const { slugify } = require('../utils/slugify');
const { escapeRegex } = require('../utils/escapeRegex');
const { runInTransaction } = require('../utils/transaction');
const { pointFromLatLng } = require('../utils/geo');
const { assertPinInBlock } = require('./branch.service');
const { sendVerificationEmail } = require('./emailAuth.service');
const { notifyProviderStatusChanged } = require('./notification.service');
const { PROVIDER_STATUS_TRANSITIONS } = require('../config/serviceProviderStatuses');
const { ROLES } = require('../config/roles');

const DEFAULT_LIMIT = 20;

class ServiceProviderError extends Error {
  constructor(status, message, code, extra) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

const safeUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  // The super admin must see inbox proof before approving (docs/24 §4.1).
  emailVerified: user.emailVerifiedAt !== null && user.emailVerifiedAt !== undefined,
  phone: user.phone,
  isActive: user.isActive,
});

function serializeProvider(provider) {
  if (!provider) return null;
  const category = provider.categoryId && provider.categoryId.name ? provider.categoryId : null;
  const city = provider.cityId && provider.cityId.name ? provider.cityId : null;
  const block = provider.blockId && provider.blockId.name ? provider.blockId : null;
  return {
    _id: provider._id,
    userId: provider.userId,
    displayName: provider.displayName,
    legalName: provider.legalName,
    slug: provider.slug,
    categoryId: category ? category._id : provider.categoryId,
    category: category ? { _id: category._id, name: category.name, slug: category.slug } : null,
    cityId: city ? city._id : provider.cityId,
    city: city ? { _id: city._id, name: city.name } : null,
    blockId: block ? block._id : provider.blockId,
    block: block ? { _id: block._id, name: block.name } : null,
    location: provider.location,
    addressLine: provider.addressLine,
    phone: provider.phone,
    bio: provider.bio,
    avatar: provider.avatar,
    coverImage: provider.coverImage,
    startingAtPrice: provider.startingAtPrice,
    status: provider.status,
    verification: provider.verification,
    ratingAvg: provider.ratingAvg,
    ratingCount: provider.ratingCount,
    completedBookings: provider.completedBookings,
    rankScore: provider.rankScore,
    billingStatus: provider.billingStatus,
    blockChangedAt: provider.blockChangedAt,
    approvedAt: provider.approvedAt,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
  };
}

const PROVIDER_POPULATE = [
  { path: 'categoryId', select: 'name slug' },
  { path: 'cityId', select: 'name' },
  { path: 'blockId', select: 'name' },
];

function duplicateError(err) {
  const text = `${err.message || ''} ${JSON.stringify(err.keyPattern || {})}`;
  if (text.includes('email') || text.includes('accountType')) {
    return new ServiceProviderError(409, 'Email is already registered.');
  }
  if (text.includes('slug')) {
    return new ServiceProviderError(409, 'A provider with this name already exists.');
  }
  return new ServiceProviderError(409, 'The provider name is already taken.');
}

/**
 * Loads the block the provider may work in. It must be active and in the
 * provider's city; city is fixed at signup so a provider never jumps cities.
 */
async function loadBlockForProvider(blockId, cityId) {
  const block = await Block.findOne({ _id: blockId, isActive: true });
  if (!block || String(block.cityId) !== String(cityId)) {
    throw new ServiceProviderError(400, 'Invalid blockId — choose an area in the selected city.');
  }
  return block;
}

function pinLocation(latitude, longitude, block) {
  try {
    assertPinInBlock(latitude, longitude, block);
  } catch (err) {
    throw new ServiceProviderError(err.status || 400, err.message);
  }
  return pointFromLatLng(latitude, longitude);
}

/**
 * Public provider sign-up: one account, one provider tenant and its block in
 * a single transaction. The provider starts PENDING and its owner unverified;
 * the super admin reviews it after the owner proves the inbox (docs/24 §4.1).
 */
async function applyForProvider({ owner, provider }) {
  const [city, category] = await Promise.all([
    City.findOne({ _id: provider.cityId, isActive: true }),
    ServiceCategory.findOne({ _id: provider.categoryId, isActive: true }),
  ]);
  if (!city) {
    throw new ServiceProviderError(400, 'Invalid cityId — city does not exist or is not active.');
  }
  if (!category) {
    throw new ServiceProviderError(400, 'Invalid categoryId — choose an active service category.');
  }

  const block = await loadBlockForProvider(provider.blockId, city._id);
  const location = pinLocation(provider.latitude, provider.longitude, block);

  const slug = slugify(provider.displayName);
  if (!slug) {
    throw new ServiceProviderError(400, 'Display name must contain letters or numbers.');
  }

  // Friendly pre-checks; the unique indexes are the real guarantee.
  if (await User.findOne({ email: owner.email, accountType: 'SERVICE' })) {
    throw new ServiceProviderError(409, 'Email is already registered.');
  }
  if (await ServiceProvider.exists({ slug })) {
    throw new ServiceProviderError(409, 'A provider with this name already exists.');
  }

  const passwordHash = await hashPassword(owner.password); // slow: outside the transaction
  const userId = new mongoose.Types.ObjectId();
  const now = new Date();

  try {
    const result = await runInTransaction(async (session) => {
      const [createdProvider] = await ServiceProvider.create(
        [
          {
            userId,
            displayName: provider.displayName,
            legalName: provider.legalName,
            slug,
            categoryId: category._id,
            cityId: city._id,
            blockId: block._id,
            location,
            addressLine: provider.addressLine || '',
            // The owner's phone is the provider's phone unless another was given.
            phone: provider.phone || owner.phone,
            bio: provider.bio || '',
            avatar: provider.avatar,
            coverImage: provider.coverImage,
            startingAtPrice: provider.startingAtPrice,
            status: 'PENDING',
            verification: 'UNVERIFIED',
            blockChangedAt: now,
            blockHistory: [{ blockId: block._id, changedAt: now, changedBy: userId }],
          },
        ],
        { session }
      );
      const [user] = await User.create(
        [
          {
            _id: userId,
            name: owner.name,
            email: owner.email,
            phone: owner.phone,
            passwordHash,
            role: ROLES.SERVICE_PROVIDER,
            accountType: 'SERVICE',
            emailVerifiedAt: null,
          },
        ],
        { session }
      );
      return { provider: createdProvider, user };
    });

    // Post-commit and best-effort, like brand sign-up.
    await sendVerificationEmail(result.user);
    return result;
  } catch (err) {
    if (err.code === 11000) throw duplicateError(err);
    throw err;
  }
}

async function getProviderForOwner(providerId) {
  const provider = await ServiceProvider.findById(providerId).populate(PROVIDER_POPULATE);
  if (!provider) throw new ServiceProviderError(404, 'Provider not found.');
  const owner = await User.findById(provider.userId);
  return { provider: serializeProvider(provider), owner: owner ? safeUser(owner) : null };
}

/**
 * Profile fields only. The slug and category are intentionally immutable:
 * public links stay stable, and changing the category is an admin decision
 * not part of Phase 2a.
 */
async function updateProviderProfile(providerId, data) {
  const provider = await ServiceProvider.findById(providerId);
  if (!provider) throw new ServiceProviderError(404, 'Provider not found.');

  for (const key of [
    'displayName',
    'legalName',
    'phone',
    'bio',
    'addressLine',
    'avatar',
    'coverImage',
    'startingAtPrice',
  ]) {
    if (data[key] !== undefined) provider[key] = data[key];
  }
  await provider.save();

  const populated = await ServiceProvider.findById(provider._id).populate(PROVIDER_POPULATE);
  return serializeProvider(populated);
}

function sameCalendarMonth(a, b) {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();
}

/**
 * Moves the provider inside its city. A pin move inside the current block is
 * always allowed; changing to another block is limited to once per calendar
 * month (docs/24 §4.3). Existing bookings are untouched.
 */
async function changeProviderBlock(providerId, { blockId, latitude, longitude }) {
  const provider = await ServiceProvider.findById(providerId);
  if (!provider) throw new ServiceProviderError(404, 'Provider not found.');

  const block = await loadBlockForProvider(blockId, provider.cityId);
  const location = pinLocation(latitude, longitude, block);
  const now = new Date();
  const movingBlock = String(provider.blockId) !== String(block._id);

  if (movingBlock && provider.blockChangedAt && sameCalendarMonth(provider.blockChangedAt, now)) {
    throw new ServiceProviderError(
      409,
      'You can change your block only once a month. Try again next month.',
      'BLOCK_CHANGE_LIMIT'
    );
  }

  provider.blockId = block._id;
  provider.location = location;
  if (movingBlock) {
    provider.blockChangedAt = now;
    provider.blockHistory.push({ blockId: block._id, changedAt: now, changedBy: provider.userId });
  }
  await provider.save();

  const populated = await ServiceProvider.findById(provider._id).populate(PROVIDER_POPULATE);
  return serializeProvider(populated);
}

async function listServiceCategories() {
  return ServiceCategory.find({ isActive: true }).sort({ order: 1, name: 1 });
}

// --------------------------------------------------------------------------
// Platform admin (super admin only in Phase 2a)
// --------------------------------------------------------------------------

async function listProvidersForAdmin({ status, search, page, limit } = {}) {
  const filter = {};
  if (status) filter.status = status;
  if (search) {
    const escaped = escapeRegex(search);
    filter.$or = [
      { displayName: { $regex: escaped, $options: 'i' } },
      { legalName: { $regex: escaped, $options: 'i' } },
      { slug: { $regex: escaped, $options: 'i' } },
    ];
  }
  const pageNumber = page || 1;
  const limitNumber = limit || DEFAULT_LIMIT;
  const [items, total] = await Promise.all([
    ServiceProvider.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber)
      .populate(PROVIDER_POPULATE),
    ServiceProvider.countDocuments(filter),
  ]);
  const owners = await User.find({ _id: { $in: items.map((p) => p.userId) } });
  const ownerById = new Map(owners.map((u) => [String(u._id), safeUser(u)]));
  return {
    items: items.map((provider) => ({
      ...serializeProvider(provider),
      owner: ownerById.get(String(provider.userId)) || null,
    })),
    pagination: { page: pageNumber, limit: limitNumber, total, pages: Math.ceil(total / limitNumber) },
  };
}

async function getProviderForAdmin(id) {
  const provider = await ServiceProvider.findById(id).populate(PROVIDER_POPULATE);
  if (!provider) throw new ServiceProviderError(404, 'Provider not found.');
  const owner = await User.findById(provider.userId);
  return { provider: serializeProvider(provider), owner: owner ? safeUser(owner) : null };
}

/**
 * Approves, suspends, reinstates or terminates a provider. The transition
 * table is in config/serviceProviderStatuses.js; approval is what makes the
 * provider discoverable.
 */
async function changeProviderStatus({ providerId, status, reason, adminId } = {}) {
  const provider = await ServiceProvider.findById(providerId);
  if (!provider) throw new ServiceProviderError(404, 'Provider not found.');

  const previous = provider.status;
  const allowed = PROVIDER_STATUS_TRANSITIONS[previous] || [];
  if (!allowed.includes(status)) {
    throw new ServiceProviderError(
      409,
      `A ${previous.toLowerCase()} provider cannot become ${status.toLowerCase()}.`,
      'INVALID_PROVIDER_STATUS'
    );
  }

  provider.status = status;
  if (status === 'ACTIVE') {
    provider.approvedAt = new Date();
    provider.approvedBy = adminId || provider.approvedBy;
    provider.verification = 'VERIFIED';
  } else if (status === 'SUSPENDED' && previous === 'PENDING') {
    // Refusing an application.
    provider.verification = 'REJECTED';
  }
  await provider.save();

  await notifyProviderStatusChanged(provider, status);
  const populated = await ServiceProvider.findById(provider._id).populate(PROVIDER_POPULATE);
  return { provider: serializeProvider(populated), reason: reason || null };
}

module.exports = {
  ServiceProviderError,
  applyForProvider,
  getProviderForOwner,
  updateProviderProfile,
  changeProviderBlock,
  listServiceCategories,
  listProvidersForAdmin,
  getProviderForAdmin,
  changeProviderStatus,
  serializeProvider,
};
