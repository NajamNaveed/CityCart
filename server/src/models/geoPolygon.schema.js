const mongoose = require('mongoose');

/**
 * GeoJSON Polygon with a single ring ([lng, lat] pairs, closed). Used for the
 * boundary of a Block. The service layer validates the shape (no self-crossing,
 * sensible size) before it is stored; this schema only guards the structure.
 */
const geoPolygonSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Polygon'], default: 'Polygon', required: true },
    coordinates: {
      type: [[[Number]]],
      required: true,
      validate: {
        validator: (rings) =>
          Array.isArray(rings) &&
          rings.length === 1 &&
          rings[0].length >= 4 &&
          rings[0].every(
            (p) => Array.isArray(p) && p.length === 2 && p[0] >= -180 && p[0] <= 180 && p[1] >= -90 && p[1] <= 90
          ),
        message: 'coordinates must be one closed ring of [longitude, latitude] pairs.',
      },
    },
  },
  { _id: false }
);

module.exports = geoPolygonSchema;
