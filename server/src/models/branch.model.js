const mongoose = require('mongoose');

const geoPointSchema = require('./geoPoint.schema');

/**
 * Branch model — one physical shop of a Brand. `blockId` is its home block (chosen
 * by the brand); `blockIds` lists every block it can be found in.
 *
 * A Brand has one City (Brand.cityId) and may have many Branches; every
 * Branch's Block must belong to that same city (enforced in
 * services/branch.service.js). The branch's own `location` pin is what
 * distance and radius searches use; if the brand doesn't drop a pin it
 * defaults to the block centre.
 *
 * v1 scope: branches decide WHERE a brand can be found. The product catalogue
 * and stock stay brand-wide (see Inventory) — per-branch stock is a separate,
 * approval-gated change because it touches checkout and inventory rules.
 */
const branchSchema = new mongoose.Schema(
  {
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Brand',
      required: true,
      index: true,
    },
    blockId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Block',
      required: true,
      index: true,
    },
    // Every active block whose boundary contains the shop's pin, plus (for a legacy
    // centre-only block) the shop's own block. A shop in an overlap belongs to
    // several blocks. Maintained by services/branchBlocks.service.js, never by clients.
    blockIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Block' }],
      default: [],
      index: true,
    },
    name: { type: String, required: true, trim: true },
    address: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    location: { type: geoPointSchema, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

branchSchema.index({ location: '2dsphere' });

const Branch = mongoose.model('Branch', branchSchema);

module.exports = Branch;
