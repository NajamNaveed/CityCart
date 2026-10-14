const { exportBrandProducts, importBrandProducts, CsvImportError } = require('../services/productCsv.service');
const { PERMISSIONS } = require('../config/permissions');
const { ROLES } = require('../config/roles');

// A brand-staff-only feature: a super admin has no brand of their own.
function requireBrand(req, res) {
  if (!req.tenantBrandId) {
    res.status(403).json({ success: false, message: 'You are not authorized to perform this action.', code: 'NO_BRAND' });
    return false;
  }
  return true;
}

async function exportCsv(req, res, next) {
  if (!requireBrand(req, res)) return undefined;
  try {
    const csv = await exportBrandProducts(req.tenantBrandId);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="products.csv"',
      'Cache-Control': 'no-store',
    });
    // BOM so Excel opens non-English text (e.g. Urdu names) correctly.
    return res.status(200).send(`\uFEFF${csv}`);
  } catch (err) {
    return next(err);
  }
}

async function importCsv(req, res, next) {
  if (!requireBrand(req, res)) return undefined;
  // express.text() only fills the body for Content-Type: text/csv. Anything
  // else (including a cross-site form post, which can only send text/plain)
  // leaves it empty and is rejected here.
  if (typeof req.body !== 'string' || req.body.trim() === '') {
    return res.status(400).json({ success: false, message: 'Send the CSV file as the request body (Content-Type: text/csv).' });
  }

  // Stock is its own permission: employees without it can still import products.
  const canManageStock =
    req.user.role === ROLES.BRAND_ADMIN ||
    Boolean(req.employee && req.employee.permissions.includes(PERMISSIONS.INVENTORY_MANAGE));

  try {
    const result = await importBrandProducts(req.tenantBrandId, req.body, {
      dryRun: req.query.dryRun === 'true',
      canManageStock,
    });
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    if (err instanceof CsvImportError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    return next(err);
  }
}

module.exports = { exportCsv, importCsv };
