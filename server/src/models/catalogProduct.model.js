const mongoose = require('mongoose');

/**
 * CatalogProduct: one record per real-world item ("Dalda Ghee 1 kg"), shared by
 * every store that sells it. A store's own price, stock and branches live on its
 * Product (the store LISTING), which points here with `catalogProductId`.
 *
 * Marketplace v2, Phase 1b (docs/22). The maker of an item is `manufacturer`,
 * because "Brand" in this project means a seller.
 */
const STATUSES = ['ACTIVE', 'PENDING', 'REJECTED', 'ARCHIVED'];
const SCOPES = ['GLOBAL', 'PRIVATE'];

const catalogProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, index: true },
    manufacturer: { type: String, trim: true },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
      index: true,
    },
    description: { type: String, trim: true },
    images: { type: [String], default: [] },
    size: {
      value: { type: Number, min: 0 },
      unit: { type: String, trim: true },
    },
    // GTIN / EAN / UPC when the item has one. Unique across the catalogue.
    barcode: { type: String, trim: true },
    // GLOBAL items are visible to every store once ACTIVE. PRIVATE items belong
    // to one store (`brandId`) and are never shown to others.
    scope: { type: String, enum: SCOPES, default: 'GLOBAL', index: true },
    status: { type: String, enum: STATUSES, default: 'ACTIVE', index: true },
    // The store that requested it (GLOBAL, pending) or owns it (PRIVATE).
    // Empty for items the platform created itself.
    brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewNote: { type: String, trim: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    // Set when this record was merged into another and archived.
    mergedIntoId: { type: mongoose.Schema.Types.ObjectId, ref: 'CatalogProduct' },
  },
  { timestamps: true }
);

// A barcode identifies exactly one catalogue item. Sparse: items without one are fine.
catalogProductSchema.index({ barcode: 1 }, { unique: true, sparse: true });

const CatalogProduct = mongoose.model('CatalogProduct', catalogProductSchema);

module.exports = CatalogProduct;
module.exports.STATUSES = STATUSES;
module.exports.SCOPES = SCOPES;
