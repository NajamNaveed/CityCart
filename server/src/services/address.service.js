const Address = require('../models/address.model');
const { pointFromLatLng, latLngFromPoint } = require('../utils/geo');
const { activeBlocksContaining } = require('./block.service');

class AddressError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

const MAX_ADDRESSES = 10;

/** API shape: the pin as latitude/longitude, plus the blocks that currently hold it. */
async function serialize(address) {
  const plain = typeof address.toObject === 'function' ? address.toObject() : address;
  const { lat, lng } = latLngFromPoint(plain.location);
  const blocks = await activeBlocksContaining(lat, lng);
  const rest = { ...plain };
  delete rest.location; // clients get latitude/longitude instead
  return {
    ...rest,
    latitude: lat,
    longitude: lng,
    blocks: blocks.map((b) => ({ _id: b._id, name: b.name })),
  };
}

/**
 * A saved address must be somewhere we deliver: its pin must be inside at least
 * one active block, so the customer is told when they save it, not at checkout.
 */
async function assertDeliverable(latitude, longitude) {
  const blocks = await activeBlocksContaining(latitude, longitude);
  if (blocks.length === 0) {
    throw new AddressError(400, 'We do not deliver to this location yet. Pick a spot inside a delivery zone.', {
      code: 'OUTSIDE_DELIVERY_ZONE',
    });
  }
}

async function listAddresses(userId) {
  const addresses = await Address.find({ userId }).sort({ isDefault: -1, createdAt: -1 });
  return Promise.all(addresses.map(serialize));
}

async function createAddress(userId, data) {
  const { latitude, longitude, isDefault, ...fields } = data;
  await assertDeliverable(latitude, longitude);

  const existing = await Address.countDocuments({ userId });
  if (existing >= MAX_ADDRESSES) {
    throw new AddressError(409, `You can save up to ${MAX_ADDRESSES} addresses. Delete one first.`, {
      code: 'ADDRESS_LIMIT',
    });
  }

  // The first address is the default; asking for a default moves it here.
  const makeDefault = existing === 0 || isDefault === true;
  if (makeDefault) {
    await Address.updateMany({ userId, isDefault: true }, { $set: { isDefault: false } });
  }
  const address = await Address.create({
    ...fields,
    userId,
    location: pointFromLatLng(latitude, longitude),
    isDefault: makeDefault,
  });
  return serialize(address);
}

/** Loads one of the caller's own addresses, or 404 (never reveals another user's). */
async function getOwnAddress(userId, id) {
  const address = await Address.findOne({ _id: id, userId });
  if (!address) {
    throw new AddressError(404, 'Address not found.');
  }
  return address;
}

async function updateAddress(userId, id, data) {
  const address = await getOwnAddress(userId, id);
  const { latitude, longitude, ...fields } = data;
  if (latitude !== undefined) {
    await assertDeliverable(latitude, longitude);
    address.location = pointFromLatLng(latitude, longitude);
  }
  Object.assign(address, fields);
  return serialize(await address.save());
}

async function setDefaultAddress(userId, id) {
  const address = await getOwnAddress(userId, id);
  if (!address.isDefault) {
    await Address.updateMany({ userId, isDefault: true }, { $set: { isDefault: false } });
    address.isDefault = true;
    await address.save();
  }
  return serialize(address);
}

/** Deleting the default promotes the most recent remaining address. */
async function deleteAddress(userId, id) {
  const address = await getOwnAddress(userId, id);
  const wasDefault = address.isDefault;
  await Address.deleteOne({ _id: address._id });
  if (wasDefault) {
    const next = await Address.findOne({ userId }).sort({ createdAt: -1 });
    if (next) {
      next.isDefault = true;
      await next.save();
    }
  }
}

module.exports = {
  listAddresses,
  createAddress,
  updateAddress,
  setDefaultAddress,
  deleteAddress,
  getOwnAddress,
  AddressError,
  MAX_ADDRESSES,
};
