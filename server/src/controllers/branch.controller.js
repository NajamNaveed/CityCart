const { createBranchSchema, updateBranchSchema } = require('../validators/branch.validator');
const {
  listBrandBranches,
  createBranch,
  updateBranch,
  deactivateBranch,
  BranchError,
} = require('../services/branch.service');
const { formatZodError } = require('../utils/formatZodError');

function invalid(res, error) {
  return res.status(400).json({
    success: false,
    message: 'Validation failed.',
    errors: formatZodError(error),
  });
}

function sendError(err, res, next) {
  if (err instanceof BranchError) {
    return res.status(err.status).json({ success: false, message: err.message });
  }
  return next(err);
}

// Always the caller's own brand: req.tenantBrandId comes from requireTenant.
async function list(req, res, next) {
  try {
    const branches = await listBrandBranches(req.tenantBrandId);
    return res.status(200).json({ success: true, branches });
  } catch (err) {
    return next(err);
  }
}

async function create(req, res, next) {
  const parsed = createBranchSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);

  try {
    const branch = await createBranch(req.tenantBrandId, parsed.data);
    return res.status(201).json({ success: true, message: 'Branch created', branch });
  } catch (err) {
    return sendError(err, res, next);
  }
}

async function update(req, res, next) {
  const parsed = updateBranchSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);

  try {
    // req.resource was loaded and ownership-checked by requireBrandOwnership.
    const branch = await updateBranch(req.resource, parsed.data);
    return res.status(200).json({ success: true, message: 'Branch updated', branch });
  } catch (err) {
    return sendError(err, res, next);
  }
}

async function remove(req, res, next) {
  try {
    const branch = await deactivateBranch(req.resource);
    return res.status(200).json({ success: true, message: 'Branch deactivated', branch });
  } catch (err) {
    return sendError(err, res, next);
  }
}

module.exports = { list, create, update, remove };
