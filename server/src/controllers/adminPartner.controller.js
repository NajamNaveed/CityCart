const {
  listPartners,
  createPartner,
  updatePartner,
  purgePartner,
  resetPartnerPassword,
  AdminPartnerError,
} = require('../services/adminPartner.service');
const {
  createPartnerSchema,
  updatePartnerSchema,
  resetPartnerPasswordSchema,
  listPartnersQuerySchema,
  removePartnerQuerySchema,
} = require('../validators/adminPartner.validator');
const { formatZodError } = require('../utils/formatZodError');

function invalid(res, error) {
  return res.status(400).json({ success: false, message: 'Validation failed.', errors: formatZodError(error) });
}

function fail(res, err, next) {
  if (err instanceof AdminPartnerError) {
    return res.status(err.status).json({ success: false, message: err.message, ...err.extra });
  }
  return next(err);
}

async function list(req, res, next) {
  const parsed = listPartnersQuerySchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    return res.status(200).json({ success: true, ...(await listPartners(parsed.data)) });
  } catch (err) {
    return next(err);
  }
}

async function create(req, res, next) {
  const parsed = createPartnerSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const partner = await createPartner({ actor: req.user, data: parsed.data });
    return res.status(201).json({ success: true, message: 'Partner added.', partner });
  } catch (err) {
    return fail(res, err, next);
  }
}

async function update(req, res, next) {
  const parsed = updatePartnerSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const partner = await updatePartner({ actor: req.user, id: req.params.id, data: parsed.data });
    return res.status(200).json({ success: true, message: 'Partner updated.', partner });
  } catch (err) {
    return fail(res, err, next);
  }
}

async function deactivate(req, res, next) {
  const query = removePartnerQuerySchema.safeParse(req.query);
  if (!query.success) return invalid(res, query.error);
  const purge = query.data.purge === 'account';
  try {
    const partner = purge
      ? await purgePartner({ actor: req.user, id: req.params.id })
      : await updatePartner({ actor: req.user, id: req.params.id, data: { isActive: false } });
    return res.status(200).json({
      success: true,
      message: purge ? 'Partner account deleted.' : 'Partner deactivated.',
      partner,
    });
  } catch (err) {
    return fail(res, err, next);
  }
}

async function resetPassword(req, res, next) {
  const parsed = resetPartnerPasswordSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const partner = await resetPartnerPassword({ actor: req.user, id: req.params.id, password: parsed.data.password });
    return res
      .status(200)
      .json({ success: true, message: 'Password reset. The partner must change it at next sign-in.', partner });
  } catch (err) {
    return fail(res, err, next);
  }
}

module.exports = { list, create, update, deactivate, resetPassword };
