const mongoose = require('mongoose');
const geoPointSchema = require('./geoPoint.schema');

/**
 * A customer's saved delivery address (Marketplace v2, Phase 3, docs/22).
 *
 * The pin (`location`) is what decides which blocks the address belongs to: the
 * blocks are worked out from it when needed, never stored here, so redrawing a zone
 * never leaves a stale copy. An order keeps its own SNAPSHOT of the address, so
 * editing or deleting a saved address never changes an old order.
 */
const addressSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    label: { type: String, required: true, trim: true, maxlength: 40 },
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    addressLine: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, trim: true },
    postalCode: { type: String, trim: true },
    country: { type: String, trim: true },
    // Standing delivery instructions, offered again at checkout ("ring twice").
    additionalInstructions: { type: String, trim: true },
    location: { type: geoPointSchema, required: true },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const Address = mongoose.model('Address', addressSchema);

module.exports = Address;
