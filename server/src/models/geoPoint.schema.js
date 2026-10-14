const mongoose = require('mongoose');

/**
 * GeoJSON Point sub-schema shared by Block (centre) and Branch (location).
 * Coordinates are `[longitude, latitude]` — see utils/geo.js. Validated here
 * so an out-of-range pair can never reach a 2dsphere index (MongoDB rejects
 * the whole write otherwise, with an unhelpful error).
 */
const geoPointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point', required: true },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (v) =>
          Array.isArray(v) &&
          v.length === 2 &&
          v[0] >= -180 &&
          v[0] <= 180 &&
          v[1] >= -90 &&
          v[1] <= 90,
        message: 'coordinates must be [longitude, latitude] within valid ranges.',
      },
    },
  },
  { _id: false }
);

module.exports = geoPointSchema;
