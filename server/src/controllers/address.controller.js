const { createAddressSchema, updateAddressSchema } = require('../validators/address.validator');
const { objectIdParamSchema } = require('../validators/common.validator');
const service = require('../services/address.service');
const { formatZodError } = require('../utils/formatZodError');

const { AddressError } = service;

const invalid = (res, error) => res.status(400).json({ success: false, errors: formatZodError(error) });

function fail(err, res, next) {
  if (err instanceof AddressError) {
    return res
      .status(err.status)
      .json({ success: false, message: err.message, ...(err.code && { code: err.code }) });
  }
  return next(err);
}

async function list(req, res, next) {
  try {
    return res.status(200).json({ success: true, addresses: await service.listAddresses(req.user._id) });
  } catch (err) {
    return fail(err, res, next);
  }
}

async function create(req, res, next) {
  const body = createAddressSchema.safeParse(req.body);
  if (!body.success) return invalid(res, body.error);
  try {
    const address = await service.createAddress(req.user._id, body.data);
    return res.status(201).json({ success: true, address });
  } catch (err) {
    return fail(err, res, next);
  }
}

async function update(req, res, next) {
  const params = objectIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  const body = updateAddressSchema.safeParse(req.body);
  if (!body.success) return invalid(res, body.error);
  try {
    const address = await service.updateAddress(req.user._id, params.data.id, body.data);
    return res.status(200).json({ success: true, address });
  } catch (err) {
    return fail(err, res, next);
  }
}

async function makeDefault(req, res, next) {
  const params = objectIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  try {
    const address = await service.setDefaultAddress(req.user._id, params.data.id);
    return res.status(200).json({ success: true, address });
  } catch (err) {
    return fail(err, res, next);
  }
}

async function remove(req, res, next) {
  const params = objectIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  try {
    await service.deleteAddress(req.user._id, params.data.id);
    return res.status(200).json({ success: true, message: 'Address deleted.' });
  } catch (err) {
    return fail(err, res, next);
  }
}

module.exports = { list, create, update, makeDefault, remove };
