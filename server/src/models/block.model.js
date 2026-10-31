const mongoose = require('mongoose');

const geoPointSchema = require('./geoPoint.schema');
const geoPolygonSchema = require('./geoPolygon.schema');

/**
 * Block model — a named neighbourhood inside a City (e.g. "Peoples Colony",
 * "Madina Town"). Used for location-based discovery: a shopper's position
 * resolves to the nearest block, and brands' branches belong to a block.
 *
 * v1 stores one centre point per block (no boundary polygon), so "which block
 * is the shopper in" means "which block centre is nearest". A polygon can be
 * added later without changing the API.
 */
const blockSchema = new mongoose.Schema(
  {
    cityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'City',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    // Derived from `name` on create and immutable afterwards (same rule as City).
    slug: { type: String, required: true, lowercase: true, trim: true },
    // A point inside the zone: used to sort, frame the map and as the default pin
    // of a new shop. With a boundary it is derived from the shape.
    center: { type: geoPointSchema, required: true },
    // The zone's boundary (Marketplace v2, docs/22). Optional: a block without one
    // is a legacy centre-only block and falls back to "nearest centre" matching.
    // Zones may overlap; a shop inside the overlap belongs to every block holding it.
    area: { type: geoPolygonSchema },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Block names are unique within a city, not platform-wide.
blockSchema.index({ cityId: 1, slug: 1 }, { unique: true });
blockSchema.index({ center: '2dsphere' });
blockSchema.index({ area: '2dsphere' });

const Block = mongoose.model('Block', blockSchema);

module.exports = Block;
