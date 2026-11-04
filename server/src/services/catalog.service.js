const CatalogProduct = require('../models/catalogProduct.model');
const Product = require('../models/product.model');
const { slugify } = require('../utils/slugify');
const { escapeRegex } = require('../utils/escapeRegex');
const { getUnusableCategoryReason } = require('./category.service');

class CatalogError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

function paginate(page, limit) {
  return { pageNumber: page || DEFAULT_PAGE, limitNumber: limit || DEFAULT_LIMIT };
}

function applySearch(filter, { q, categoryId }) {
  if (categoryId) filter.categoryId = categoryId;
  if (q) {
    const rx = { $regex: escapeRegex(q), $options: 'i' };
    filter.$and = [...(filter.$and || []), { $or: [{ name: rx }, { manufacturer: rx }, { barcode: q }] }];
  }
  return filter;
}

async function runList(filter, query) {
  const { pageNumber, limitNumber } = paginate(query.page, query.limit);
  const [items, total] = await Promise.all([
    CatalogProduct.find(filter)
      .sort({ name: 1 })
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber),
    CatalogProduct.countDocuments(filter),
  ]);
  return {
    items,
    pagination: { page: pageNumber, limit: limitNumber, total, pages: Math.ceil(total / limitNumber) },
  };
}

/**
 * What a store can pick from: every ACTIVE global item plus its own private items.
 */
async function listForBrand(brandId, query = {}) {
  const filter = applySearch(
    { status: 'ACTIVE', $or: [{ scope: 'GLOBAL' }, { scope: 'PRIVATE', brandId }] },
    query
  );
  return runList(filter, query);
}

/**
 * A store's own requests and private items, in every status, so it can follow
 * what happened to a request.
 */
async function listMine(brandId, query = {}) {
  const filter = applySearch({ brandId, status: { $ne: 'ARCHIVED' } }, query);
  return runList(filter, query);
}

/** Platform admin view: everything, with optional status and scope filters. */
async function listForAdmin(query = {}) {
  const filter = applySearch({}, query);
  if (query.status) filter.status = query.status;
  if (query.scope) filter.scope = query.scope;
  return runList(filter, query);
}

async function getCatalogByIdRaw(id) {
  return CatalogProduct.findById(id);
}

/** A store may read ACTIVE global items and anything of its own. */
async function getCatalogForBrand(brandId, id) {
  const item = await CatalogProduct.findById(id);
  const visible =
    item && ((item.scope === 'GLOBAL' && item.status === 'ACTIVE') || String(item.brandId) === String(brandId));
  if (!visible) throw new CatalogError(404, 'Catalogue product not found.');
  return item;
}

async function assertUsableCategory(categoryId) {
  const reason = await getUnusableCategoryReason(categoryId);
  if (reason) throw new CatalogError(400, reason);
}

/**
 * Two live items must not describe the same thing: barcodes are unique, and a
 * GLOBAL item's name is unique among GLOBAL items that are active or pending.
 * A PRIVATE item's name is unique within its own store.
 */
async function assertNotDuplicate({ slug, barcode, scope, brandId }, exceptId) {
  const isOther = (doc) => doc && String(doc._id) !== String(exceptId || '');
  if (barcode) {
    const byBarcode = await CatalogProduct.findOne({ barcode });
    if (isOther(byBarcode)) {
      throw new CatalogError(409, 'A catalogue product with this barcode already exists.');
    }
  }
  const sameName =
    scope === 'PRIVATE'
      ? await CatalogProduct.findOne({ slug, scope: 'PRIVATE', brandId, status: { $ne: 'ARCHIVED' } })
      : await CatalogProduct.findOne({ slug, scope: 'GLOBAL', status: { $in: ['ACTIVE', 'PENDING'] } });
  if (isOther(sameName)) {
    throw new CatalogError(409, 'A catalogue product with this name already exists.');
  }
}

async function saveNew(doc) {
  try {
    return await CatalogProduct.create(doc);
  } catch (err) {
    if (err.code === 11000) {
      throw new CatalogError(409, 'A catalogue product with this barcode already exists.');
    }
    throw err;
  }
}

/** Platform admin: creates a GLOBAL, ACTIVE item. */
async function createCatalogProduct(data, userId) {
  await assertUsableCategory(data.categoryId);
  const slug = slugify(data.name);
  await assertNotDuplicate({ slug, barcode: data.barcode, scope: 'GLOBAL' });
  return saveNew({ ...data, slug, scope: 'GLOBAL', status: 'ACTIVE', createdBy: userId });
}

/**
 * A store asks for an item that is not in the catalogue. A private item is
 * usable at once (and only by that store); a public one waits for approval.
 */
async function requestCatalogProduct(brandId, data, userId) {
  const { private: isPrivate, ...fields } = data;
  await assertUsableCategory(fields.categoryId);
  const slug = slugify(fields.name);
  const scope = isPrivate ? 'PRIVATE' : 'GLOBAL';
  await assertNotDuplicate({ slug, barcode: fields.barcode, scope, brandId });
  return saveNew({
    ...fields,
    slug,
    scope,
    brandId,
    status: isPrivate ? 'ACTIVE' : 'PENDING',
    createdBy: userId,
  });
}

/** The fields a listing copies from its catalogue item. */
function listingFieldsOf(item) {
  return {
    name: item.name,
    description: item.description,
    images: item.images || [],
    categoryId: item.categoryId,
  };
}

/** Platform admin: edits an item and refreshes every store listing that uses it. */
async function updateCatalogProduct(item, data) {
  if (data.categoryId && String(data.categoryId) !== String(item.categoryId)) {
    await assertUsableCategory(data.categoryId);
  }
  const slug = data.name ? slugify(data.name) : item.slug;
  if (data.name || data.barcode) {
    await assertNotDuplicate(
      { slug, barcode: data.barcode, scope: item.scope, brandId: item.brandId },
      item._id
    );
  }
  Object.assign(item, data, { slug });
  const saved = await item.save();
  await Product.updateMany({ catalogProductId: item._id }, { $set: listingFieldsOf(saved) });
  return saved;
}

function assertPending(item) {
  if (item.status !== 'PENDING') {
    throw new CatalogError(409, 'Only a pending request can be approved or rejected.');
  }
}

async function approveCatalogProduct(item, userId) {
  assertPending(item);
  await assertUsableCategory(item.categoryId);
  await assertNotDuplicate(
    { slug: item.slug, barcode: item.barcode, scope: 'GLOBAL' },
    item._id
  );
  item.status = 'ACTIVE';
  item.reviewedBy = userId;
  item.reviewedAt = new Date();
  item.reviewNote = undefined;
  return item.save();
}

async function rejectCatalogProduct(item, note, userId) {
  assertPending(item);
  item.status = 'REJECTED';
  item.reviewNote = note;
  item.reviewedBy = userId;
  item.reviewedAt = new Date();
  return item.save();
}

/** Soft delete. Refused while any store still lists the item. */
async function archiveCatalogProduct(item) {
  const listings = await Product.countDocuments({ catalogProductId: item._id, status: { $ne: 'ARCHIVED' } });
  if (listings > 0) {
    throw new CatalogError(409, 'Cannot archive an item that stores still list. Merge it into another item first.');
  }
  item.status = 'ARCHIVED';
  return item.save();
}

/**
 * Merges a duplicate into the item it duplicates: every store listing moves over
 * and the duplicate is archived. Refused when one store lists both (the store
 * must remove one listing first), because a store may list an item only once.
 */
async function mergeCatalogProducts(from, into) {
  if (String(from._id) === String(into._id)) {
    throw new CatalogError(400, 'Choose a different item to merge into.');
  }
  if (into.status !== 'ACTIVE' || into.scope !== 'GLOBAL') {
    throw new CatalogError(400, 'Items can only be merged into an active global item.');
  }
  const intoBrands = await Product.distinct('brandId', {
    catalogProductId: into._id,
    status: { $ne: 'ARCHIVED' },
  });
  const clashes = await Product.countDocuments({
    catalogProductId: from._id,
    status: { $ne: 'ARCHIVED' },
    brandId: { $in: intoBrands },
  });
  if (clashes > 0) {
    throw new CatalogError(
      409,
      `${clashes} store(s) list both items. Ask them to remove one listing before merging.`
    );
  }
  await Product.updateMany({ catalogProductId: from._id }, { $set: { catalogProductId: into._id, ...listingFieldsOf(into) } });
  from.status = 'ARCHIVED';
  from.mergedIntoId = into._id;
  return from.save();
}

module.exports = {
  listForBrand,
  listMine,
  listForAdmin,
  getCatalogByIdRaw,
  getCatalogForBrand,
  createCatalogProduct,
  requestCatalogProduct,
  updateCatalogProduct,
  approveCatalogProduct,
  rejectCatalogProduct,
  archiveCatalogProduct,
  mergeCatalogProducts,
  CatalogError,
};
