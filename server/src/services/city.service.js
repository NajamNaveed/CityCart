const City = require('../models/city.model');
const { slugify } = require('../utils/slugify');

/**
 * City service, per docs/05-api-specification.md §8 (City Endpoints).
 *
 * Thrown errors carry a `status` (HTTP status code), matching the
 * pattern already established in services/auth.service.js's AuthError.
 */
class CityError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function listCities({ isActive } = {}) {
  const filter = {};
  if (isActive !== undefined) {
    filter.isActive = isActive;
  }
  return City.find(filter).sort({ name: 1 });
}

async function getCityById(id) {
  const city = await City.findById(id);
  if (!city) {
    throw new CityError(404, 'City not found.');
  }
  return city;
}

async function createCity(data) {
  const slug = slugify(data.name);

  const existing = await City.findOne({ slug });
  if (existing) {
    throw new CityError(409, 'A city with this name already exists.');
  }

  try {
    return await City.create({ ...data, slug });
  } catch (err) {
    // Defense-in-depth against a race on the unique slug index (same
    // pattern as auth.service.js's duplicate-email handling).
    if (err.code === 11000) {
      throw new CityError(409, 'A city with this name already exists.');
    }
    throw err;
  }
}

/**
 * Updates a city. `name` never regenerates the slug (see
 * validators/city.validator.js) — the slug is fixed at creation.
 */
async function updateCity(id, data) {
  const city = await City.findById(id);
  if (!city) {
    throw new CityError(404, 'City not found.');
  }

  Object.assign(city, data);
  return city.save();
}

/**
 * Deactivates a city (soft delete), per docs/05 §8 — "Where possible,
 * deactivation should be preferred over destructive deletion." No
 * document is ever removed here.
 */
async function deactivateCity(id) {
  const city = await City.findById(id);
  if (!city) {
    throw new CityError(404, 'City not found.');
  }

  city.isActive = false;
  return city.save();
}

module.exports = { listCities, getCityById, createCity, updateCity, deactivateCity, CityError };