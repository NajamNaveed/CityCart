const {
  createCitySchema,
  updateCitySchema,
  listCitiesQuerySchema,
} = require('../validators/city.validator');
const { objectIdParamSchema } = require('../validators/common.validator');
const {
  listCities,
  getCityById,
  createCity,
  updateCity,
  deactivateCity,
  CityError,
} = require('../services/city.service');
const { formatZodError } = require('../utils/formatZodError');

async function list(req, res, next) {
  const parsedQuery = listCitiesQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsedQuery.error),
    });
  }

  try {
    const cities = await listCities(parsedQuery.data);
    return res.status(200).json({ success: true, cities });
  } catch (err) {
    return next(err);
  }
}

async function getById(req, res, next) {
  const parsedParams = objectIdParamSchema.safeParse(req.params);
  if (!parsedParams.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsedParams.error),
    });
  }

  try {
    const city = await getCityById(parsedParams.data.id);
    return res.status(200).json({ success: true, city });
  } catch (err) {
    if (err instanceof CityError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    return next(err);
  }
}

async function create(req, res, next) {
  const parsedBody = createCitySchema.safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsedBody.error),
    });
  }

  try {
    const city = await createCity(parsedBody.data);
    return res.status(201).json({ success: true, message: 'City created', city });
  } catch (err) {
    if (err instanceof CityError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    return next(err);
  }
}

async function update(req, res, next) {
  const parsedParams = objectIdParamSchema.safeParse(req.params);
  if (!parsedParams.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsedParams.error),
    });
  }

  const parsedBody = updateCitySchema.safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsedBody.error),
    });
  }

  try {
    const city = await updateCity(parsedParams.data.id, parsedBody.data);
    return res.status(200).json({ success: true, message: 'City updated', city });
  } catch (err) {
    if (err instanceof CityError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    return next(err);
  }
}

async function remove(req, res, next) {
  const parsedParams = objectIdParamSchema.safeParse(req.params);
  if (!parsedParams.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsedParams.error),
    });
  }

  try {
    const city = await deactivateCity(parsedParams.data.id);
    return res.status(200).json({ success: true, message: 'City deactivated', city });
  } catch (err) {
    if (err instanceof CityError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    return next(err);
  }
}

module.exports = { list, getById, create, update, remove };