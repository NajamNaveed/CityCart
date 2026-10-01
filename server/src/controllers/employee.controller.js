const {
  createEmployeeSchema,
  updateEmployeeSchema,
  updatePermissionsSchema,
  listEmployeesQuerySchema,
} = require('../validators/employee.validator');
const { objectIdParamSchema } = require('../validators/common.validator');
const {
  listEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  setEmployeePermissions,
  actorPermissionsFor,
  EmployeeError,
} = require('../services/employee.service');
const { ROLES } = require('../config/roles');
const { formatZodError } = require('../utils/formatZodError');

function invalid(res, error) {
  return res.status(400).json({ success: false, message: 'Validation failed.', errors: formatZodError(error) });
}

function handleError(err, res, next) {
  if (err instanceof EmployeeError) {
    return res.status(err.status).json({ success: false, message: err.message, ...err.extra });
  }
  return next(err);
}

/**
 * Brand users are ALWAYS scoped to their own brand (req.tenantBrandId from
 * requireTenant). A brandId in the body/query is honored only for
 * SUPER_ADMIN, who has no tenant; null means platform-wide.
 */
const resolveBrandId = (req, requested) =>
  req.tenantBrandId || (req.user.role === ROLES.SUPER_ADMIN ? requested || null : null);

async function list(req, res, next) {
  const parsed = listEmployeesQuerySchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const { items, pagination } = await listEmployees({
      ...parsed.data,
      brandId: resolveBrandId(req, parsed.data.brandId),
    });
    return res.status(200).json({ success: true, employees: items, pagination });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function getById(req, res, next) {
  const params = objectIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  try {
    const employee = await getEmployee({ brandId: resolveBrandId(req), id: params.data.id });
    return res.status(200).json({ success: true, employee });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function create(req, res, next) {
  const parsed = createEmployeeSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  const brandId = resolveBrandId(req, parsed.data.brandId);
  if (!brandId) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: [{ field: 'brandId', message: 'brandId is required for SUPER_ADMIN' }],
    });
  }
  try {
    const employee = await createEmployee({
      brandId,
      actorPermissions: actorPermissionsFor(req.user, req.employee),
      data: parsed.data,
    });
    return res.status(201).json({ success: true, message: 'Employee created', employee });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function update(req, res, next) {
  const params = objectIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  const body = updateEmployeeSchema.safeParse(req.body);
  if (!body.success) return invalid(res, body.error);
  try {
    const employee = await updateEmployee({
      brandId: resolveBrandId(req),
      id: params.data.id,
      actorUserId: req.user._id,
      data: body.data,
    });
    return res.status(200).json({ success: true, message: 'Employee updated', employee });
  } catch (err) {
    return handleError(err, res, next);
  }
}

// Soft deactivation only (docs/04 §36) — employees are never hard-deleted.
async function remove(req, res, next) {
  const params = objectIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  try {
    const employee = await updateEmployee({
      brandId: resolveBrandId(req),
      id: params.data.id,
      actorUserId: req.user._id,
      data: { isActive: false },
    });
    return res.status(200).json({ success: true, message: 'Employee deactivated', employee });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function updatePermissions(req, res, next) {
  const params = objectIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  const body = updatePermissionsSchema.safeParse(req.body);
  if (!body.success) return invalid(res, body.error);
  try {
    const employee = await setEmployeePermissions({
      brandId: resolveBrandId(req),
      id: params.data.id,
      actorUserId: req.user._id,
      actorPermissions: actorPermissionsFor(req.user, req.employee),
      permissions: body.data.permissions,
    });
    return res.status(200).json({ success: true, message: 'Employee permissions updated', employee });
  } catch (err) {
    return handleError(err, res, next);
  }
}

module.exports = { list, getById, create, update, remove, updatePermissions };
