const {
  BillingError,
  generateMonthlyInvoices,
  adminListInvoices,
  adminGetInvoice,
  adminListClaims,
  adminGetClaimReceipt,
  adminDecideClaim,
  adminListSellers,
  adminOverrideFreeze,
  adminClearFreeze,
  adminGrantGrace,
  adminRevokeGrace,
  adminListHelp,
  adminResolveHelp,
  adminGetBillingSettings,
  adminUpdateBillingSettings,
  adminBillingReports,
} = require('../services/billing.service');
const {
  invoiceIdParamSchema,
  claimIdParamSchema,
  adminInvoicesQuerySchema,
  adminClaimsQuerySchema,
  adminClaimDecisionSchema,
  adminSellerParamSchema,
  adminSellersQuerySchema,
  freezeOverrideSchema,
  freezeClearSchema,
  graceSchema,
  billingSettingsSchema,
  resolveHelpSchema,
  adminHelpQuerySchema,
} = require('../validators/billing.validator');
const { objectId } = require('../validators/block.validator');
const { z } = require('zod');
const { recordAdminAction } = require('../services/adminAction.service');
const { formatZodError } = require('../utils/formatZodError');

const helpParamSchema = z.object({ id: objectId });

function invalid(res, error) {
  return res.status(400).json({ success: false, message: 'Validation failed.', errors: formatZodError(error) });
}

function handleError(err, res, next) {
  if (err instanceof BillingError) {
    return res.status(err.status).json({
      success: false,
      message: err.message,
      ...(err.code && { code: err.code }),
      ...(err.extra || {}),
    });
  }
  return next(err);
}

async function reports(req, res, next) {
  try {
    const report = await adminBillingReports();
    return res.status(200).json({ success: true, report });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function getSettings(req, res, next) {
  try {
    const settings = await adminGetBillingSettings();
    return res.status(200).json({ success: true, settings });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function patchSettings(req, res, next) {
  const body = billingSettingsSchema.safeParse(req.body);
  if (!body.success) return invalid(res, body.error);
  try {
    const settings = await adminUpdateBillingSettings(body.data);
    await recordAdminAction({
      actor: req.user,
      action: 'billing.settings.update',
      target: { type: 'PlatformSettings' },
      details: `Billing settings updated: ${Object.keys(body.data).join(', ')}.`,
    });
    return res.status(200).json({ success: true, message: 'Billing settings updated', settings });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function generateInvoices(req, res, next) {
  try {
    const result = await generateMonthlyInvoices({ createdBy: String(req.user._id) });
    await recordAdminAction({
      actor: req.user,
      action: 'billing.invoice.generate',
      target: { type: 'SellerInvoice' },
      details: `Invoices generated for ${result.periodKey}: ${result.issued.length} issued, ${result.skipped.length} skipped.`,
    });
    return res.status(200).json({
      success: true,
      message: 'Monthly invoices generated',
      periodKey: result.periodKey,
      issued: result.issued.length,
      skipped: result.skipped,
    });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function invoices(req, res, next) {
  const parsed = adminInvoicesQuerySchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const result = await adminListInvoices(parsed.data);
    return res.status(200).json({ success: true, invoices: result.items, pagination: result.pagination });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function invoice(req, res, next) {
  const params = invoiceIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  try {
    const detail = await adminGetInvoice(params.data.id);
    return res.status(200).json({ success: true, ...detail });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function claims(req, res, next) {
  const parsed = adminClaimsQuerySchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const result = await adminListClaims(parsed.data);
    return res.status(200).json({ success: true, claims: result.items, pagination: result.pagination });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function claimReceipt(req, res, next) {
  const params = claimIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  try {
    const link = await adminGetClaimReceipt(params.data.id);
    return res.status(200).json({ success: true, receipt: link });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function decideClaim(req, res, next) {
  const params = claimIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  const body = adminClaimDecisionSchema.safeParse(req.body);
  if (!body.success) return invalid(res, body.error);
  try {
    const outcome = await adminDecideClaim({
      admin: req.user,
      claimId: params.data.id,
      decision: body.data.decision,
      note: body.data.note,
    });
    await recordAdminAction({
      actor: req.user,
      action: body.data.decision === 'VERIFIED' ? 'billing.claim.verify' : 'billing.claim.reject',
      target: { type: 'SellerPaymentClaim', id: params.data.id },
      details: body.data.note || `Claim ${body.data.decision.toLowerCase()}.`,
    });
    return res.status(200).json({
      success: true,
      message: body.data.decision === 'VERIFIED' ? 'Payment verified.' : 'Payment rejected.',
      ...outcome,
    });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function sellers(req, res, next) {
  const parsed = adminSellersQuerySchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const result = await adminListSellers(parsed.data);
    return res.status(200).json({ success: true, sellers: result.items, pagination: result.pagination });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function overrideFreeze(req, res, next) {
  const params = adminSellerParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  const body = freezeOverrideSchema.safeParse(req.body);
  if (!body.success) return invalid(res, body.error);
  try {
    const result = await adminOverrideFreeze({
      admin: req.user,
      sellerType: params.data.type,
      sellerId: params.data.id,
      status: body.data.status,
      reason: body.data.reason,
      until: body.data.until,
    });
    await recordAdminAction({
      actor: req.user,
      action: 'billing.freeze.override',
      target: { type: params.data.type, id: params.data.id },
      details: `Billing status set to ${body.data.status}: ${body.data.reason}`,
    });
    return res.status(200).json({ success: true, message: 'Billing status updated', result });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function clearFreeze(req, res, next) {
  const params = adminSellerParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  const body = freezeClearSchema.safeParse(req.body);
  if (!body.success) return invalid(res, body.error);
  try {
    const result = await adminClearFreeze({
      sellerType: params.data.type,
      sellerId: params.data.id,
    });
    await recordAdminAction({
      actor: req.user,
      action: 'billing.freeze.clear',
      target: { type: params.data.type, id: params.data.id },
      details: body.data.reason,
    });
    return res.status(200).json({ success: true, message: 'Override cleared', result });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function grantGrace(req, res, next) {
  const params = adminSellerParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  const body = graceSchema.safeParse(req.body);
  if (!body.success) return invalid(res, body.error);
  try {
    const result = await adminGrantGrace({
      admin: req.user,
      sellerType: params.data.type,
      sellerId: params.data.id,
      until: body.data.until,
      reason: body.data.reason,
    });
    await recordAdminAction({
      actor: req.user,
      action: 'billing.grace.grant',
      target: { type: params.data.type, id: params.data.id },
      details: `Grace until ${body.data.until.toISOString()}: ${body.data.reason}`,
    });
    return res.status(200).json({ success: true, message: 'Grace period granted', result });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function revokeGrace(req, res, next) {
  const params = adminSellerParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  try {
    const result = await adminRevokeGrace({
      sellerType: params.data.type,
      sellerId: params.data.id,
    });
    await recordAdminAction({
      actor: req.user,
      action: 'billing.grace.revoke',
      target: { type: params.data.type, id: params.data.id },
    });
    return res.status(200).json({ success: true, message: 'Grace period removed', result });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function helpList(req, res, next) {
  const parsed = adminHelpQuerySchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const result = await adminListHelp(parsed.data);
    return res.status(200).json({ success: true, requests: result.items, pagination: result.pagination });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function resolveHelp(req, res, next) {
  const params = helpParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  const body = resolveHelpSchema.safeParse(req.body);
  if (!body.success) return invalid(res, body.error);
  try {
    const request = await adminResolveHelp({ admin: req.user, helpId: params.data.id, note: body.data.note });
    await recordAdminAction({
      actor: req.user,
      action: 'billing.help.resolve',
      target: { type: 'BillingHelpRequest', id: params.data.id },
      details: body.data.note,
    });
    return res.status(200).json({ success: true, message: 'Request answered', request });
  } catch (err) {
    return handleError(err, res, next);
  }
}

module.exports = {
  reports,
  getSettings,
  patchSettings,
  generateInvoices,
  invoices,
  invoice,
  claims,
  claimReceipt,
  decideClaim,
  sellers,
  overrideFreeze,
  clearFreeze,
  grace: grantGrace,
  revokeGrace,
  helpList,
  resolveHelp,
};
