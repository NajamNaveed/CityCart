const Branch = require('../models/branch.model');
const Block = require('../models/block.model');
const Brand = require('../models/brand.model');
const { distanceKm, pointFromLatLng, latLngFromPoint } = require('../utils/geo');

/**
 * Branch service — a brand's physical shops (see models/branch.model.js).
 * `brandId` is ALWAYS supplied by the caller from req.tenantBrandId, never
 * from the request body (AGENTS.md §9).
 */
class BranchError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const MAX_BRANCHES_PER_BRAND = 50;
// A dropped pin this far from its block's centre is almost certainly a typo
// (swapped lat/lng, wrong city) — reject instead of storing bad data.
const MAX_PIN_DISTANCE_KM = 25;

function serializeBranch(branch, block) {
  const plain = typeof branch.toObject === 'function' ? branch.toObject() : branch;
  const { lat, lng } = latLngFromPoint(plain.location);
  return {
    _id: plain._id,
    brandId: plain.brandId,
    blockId: plain.blockId,
    blockName: block ? block.name : undefined,
    name: plain.name,
    address: plain.address,
    phone: plain.phone,
    isActive: plain.isActive,
    latitude: lat,
    longitude: lng,
  };
}

/**
 * The block must exist, be active, and sit in the SAME city as the brand — a
 * brand is city-based (Brand.cityId), so it cannot open branches elsewhere.
 * A missing block and a block in another city give the same message.
 */
async function loadBlockForBrand(blockId, brandId) {
  const [block, brand] = await Promise.all([
    Block.findOne({ _id: blockId, isActive: true }),
    Brand.findById(brandId),
  ]);
  if (!block || !brand || String(block.cityId) !== String(brand.cityId)) {
    throw new BranchError(400, 'Invalid blockId — choose a block in your brand’s city.');
  }
  return block;
}

function assertPinNearBlock(latitude, longitude, block) {
  const km = distanceKm({ lat: latitude, lng: longitude }, latLngFromPoint(block.center));
  if (km > MAX_PIN_DISTANCE_KM) {
    throw new BranchError(400, 'The pin is too far from the selected block. Check the location.');
  }
}

async function listBrandBranches(brandId) {
  const branches = await Branch.find({ brandId }).sort({ createdAt: -1 });
  const blocks = branches.length
    ? await Block.find({ _id: { $in: branches.map((b) => b.blockId) } })
    : [];
  const blockById = new Map(blocks.map((b) => [String(b._id), b]));
  return branches.map((b) => serializeBranch(b, blockById.get(String(b.blockId))));
}

async function getBranchByIdRaw(id) {
  return Branch.findById(id);
}

async function createBranch(brandId, data) {
  const count = await Branch.countDocuments({ brandId });
  if (count >= MAX_BRANCHES_PER_BRAND) {
    throw new BranchError(400, `A brand can have at most ${MAX_BRANCHES_PER_BRAND} branches.`);
  }

  const block = await loadBlockForBrand(data.blockId, brandId);

  let location;
  if (data.latitude !== undefined) {
    assertPinNearBlock(data.latitude, data.longitude, block);
    location = pointFromLatLng(data.latitude, data.longitude);
  } else {
    location = block.center;
  }

  const branch = await Branch.create({
    brandId,
    blockId: block._id,
    name: data.name,
    address: data.address || '',
    phone: data.phone || '',
    location,
  });
  return serializeBranch(branch, block);
}

/**
 * `branch` is already loaded and ownership-verified by requireBrandOwnership.
 * Moving a branch to another block without a new pin resets the pin to the
 * new block's centre, so it can never point at the old neighbourhood.
 */
async function updateBranch(branch, data) {
  let block = await Block.findById(branch.blockId);

  if (data.blockId !== undefined && String(data.blockId) !== String(branch.blockId)) {
    block = await loadBlockForBrand(data.blockId, branch.brandId);
    branch.blockId = block._id;
    if (data.latitude === undefined) {
      branch.location = block.center;
    }
  }

  if (data.latitude !== undefined) {
    if (!block) {
      throw new BranchError(400, 'Branch block not found.');
    }
    assertPinNearBlock(data.latitude, data.longitude, block);
    branch.location = pointFromLatLng(data.latitude, data.longitude);
  }

  if (data.name !== undefined) branch.name = data.name;
  if (data.address !== undefined) branch.address = data.address;
  if (data.phone !== undefined) branch.phone = data.phone;
  if (data.isActive !== undefined) branch.isActive = data.isActive;

  return serializeBranch(await branch.save(), block);
}

/** Soft delete — the branch stops appearing in search but its record stays. */
async function deactivateBranch(branch) {
  branch.isActive = false;
  const block = await Block.findById(branch.blockId);
  return serializeBranch(await branch.save(), block);
}

module.exports = {
  listBrandBranches,
  getBranchByIdRaw,
  createBranch,
  updateBranch,
  deactivateBranch,
  serializeBranch,
  BranchError,
  MAX_BRANCHES_PER_BRAND,
  MAX_PIN_DISTANCE_KM,
};
