const mongoose = require('mongoose');

/**
 * City model — geographic marketplace areas supported by CityCart.
 *
 * Source of truth: docs/04-database-design.md, §8 (City Model).
 * A city may contain multiple brands (Brand.cityId references this model).
 */
const citySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    state: {
      type: String,
      trim: true,
    },
    country: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    image: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const City = mongoose.model('City', citySchema);

module.exports = City;