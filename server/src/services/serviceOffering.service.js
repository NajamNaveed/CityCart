const ServiceOffering = require('../models/serviceOffering.model');
const ServiceProvider = require('../models/serviceProvider.model');
const { slugify } = require('../utils/slugify');

class ServiceOfferingError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function serializeOffering(offering) {
  return {
    _id: offering._id,
    providerId: offering.providerId,
    categoryId: offering.categoryId,
    title: offering.title,
    slug: offering.slug,
    description: offering.description,
    images: offering.images,
    startingAtPrice: offering.startingAtPrice,
    durationMinutes: offering.durationMinutes,
    attributes: offering.attributes,
    isActive: offering.isActive,
    createdAt: offering.createdAt,
    updatedAt: offering.updatedAt,
  };
}

async function listOwnOfferings(providerId) {
  const items = await ServiceOffering.find({ providerId }).sort({ createdAt: -1 });
  return items.map(serializeOffering);
}

/**
 * Creates an offering for the signed-in provider. The tenant and the category
 * are taken from the provider document, never from the request body, so a
 * caller cannot write into another provider or another category.
 */
async function createOffering(providerId, data) {
  const provider = await ServiceProvider.findById(providerId);
  if (!provider) throw new ServiceOfferingError(404, 'Provider not found.');

  const slug = slugify(data.title);
  if (!slug) throw new ServiceOfferingError(400, 'Title must contain letters or numbers.');

  if (await ServiceOffering.exists({ providerId, slug })) {
    throw new ServiceOfferingError(409, 'You already offer a service with this title.', 'OFFERING_EXISTS');
  }

  try {
    const offering = await ServiceOffering.create({
      providerId: provider._id,
      categoryId: provider.categoryId,
      title: data.title,
      slug,
      description: data.description || '',
      images: data.images || [],
      startingAtPrice: data.startingAtPrice,
      durationMinutes: data.durationMinutes,
      attributes: data.attributes || {},
      isActive: data.isActive !== false,
    });
    return serializeOffering(offering);
  } catch (err) {
    if (err.code === 11000) {
      throw new ServiceOfferingError(409, 'You already offer a service with this title.', 'OFFERING_EXISTS');
    }
    throw err;
  }
}

async function getOwnOffering(providerId, offeringId) {
  const offering = await ServiceOffering.findOne({ _id: offeringId, providerId });
  if (!offering) throw new ServiceOfferingError(404, 'Offering not found.');
  return offering;
}

/**
 * Updates an offering that belongs to the signed-in provider. The title may
 * change but the slug does not: it is the stable key derived once at creation.
 */
async function updateOffering(providerId, offeringId, data) {
  const offering = await getOwnOffering(providerId, offeringId);
  for (const key of [
    'title',
    'description',
    'images',
    'startingAtPrice',
    'durationMinutes',
    'attributes',
    'isActive',
  ]) {
    if (data[key] !== undefined) offering[key] = data[key];
  }
  await offering.save();
  return serializeOffering(offering);
}

/** Soft delete: the offering stops appearing publicly but its history stays. */
async function deactivateOffering(providerId, offeringId) {
  const offering = await getOwnOffering(providerId, offeringId);
  if (offering.isActive) {
    offering.isActive = false;
    await offering.save();
  }
  return serializeOffering(offering);
}

module.exports = {
  ServiceOfferingError,
  listOwnOfferings,
  createOffering,
  updateOffering,
  deactivateOffering,
  serializeOffering,
};
