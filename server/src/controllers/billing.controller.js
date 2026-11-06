const {
  BillingError,
  getSellerBillingSummary,
  listSellerInvoices,
  getSellerInvoice,
  listSellerClaims,
  receiptSignature,
  createPaymentClaim,
  getSellerClaimReceipt,
  submitBillingHelp,
  listSellerBillingHelp,
} = require('../services/billing.service');
const {
  claimSchema,
  helpSchema,
  invoiceIdParamSchema,
  claimIdParamSchema,
  sellerInvoicesQuerySchema,
  sellerClaimsQuerySchema,
} = require('../validators/billing.validator');
const { formatZodError } = require('../utils/formatZodError');

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

/** The seller account behind every handler comes from the session. */
async function account(req, res, next) {
  try {
    const summary = await getSellerBillingSummary(req.seller.type, req.seller.id);
    return res.status(200).json({ success: true, billing: summary });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function invoices(req, res, next) {
  const parsed = sellerInvoicesQuerySchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const result = await listSellerInvoices(req.seller.type, req.seller.id, parsed.data);
    return res.status(200).json({ success: true, invoices: result.items, pagination: result.pagination });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function invoice(req, res, next) {
  const params = invoiceIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  try {
    const detail = await getSellerInvoice(req.seller.type, req.seller.id, params.data.id);
    return res.status(200).json({ success: true, ...detail });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function claims(req, res, next) {
  const parsed = sellerClaimsQuerySchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const result = await listSellerClaims(req.seller.type, req.seller.id, parsed.data);
    return res.status(200).json({ success: true, claims: result.items, pagination: result.pagination });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function submitClaim(req, res, next) {
  const params = invoiceIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  const body = claimSchema.safeParse(req.body);
  if (!body.success) return invalid(res, body.error);
  try {
    const claim = await createPaymentClaim({
      sellerType: req.seller.type,
      sellerId: req.seller.id,
      invoiceId: params.data.id,
      data: body.data,
    });
    return res.status(201).json({ success: true, message: 'Payment submitted for verification.', claim });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function claimReceipt(req, res, next) {
  const params = claimIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  try {
    const link = await getSellerClaimReceipt({
      sellerType: req.seller.type,
      sellerId: req.seller.id,
      claimId: params.data.id,
    });
    return res.status(200).json({ success: true, receipt: link });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function uploadSignature(req, res, next) {
  try {
    const upload = receiptSignature(req.seller.type, req.seller.id);
    return res.status(200).json({ success: true, upload });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function helpList(req, res, next) {
  try {
    const result = await listSellerBillingHelp(req.seller.type, req.seller.id, { page: 1, limit: 20 });
    return res.status(200).json({ success: true, requests: result.items, pagination: result.pagination });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function helpCreate(req, res, next) {
  const body = helpSchema.safeParse(req.body);
  if (!body.success) return invalid(res, body.error);
  try {
    const request = await submitBillingHelp({
      sellerType: req.seller.type,
      sellerId: req.seller.id,
      subject: body.data.subject,
      message: body.data.message,
    });
    return res.status(201).json({ success: true, message: 'Your request was sent to the platform team.', request });
  } catch (err) {
    return handleError(err, res, next);
  }
}

module.exports = {
  account,
  invoices,
  invoice,
  claims,
  submitClaim,
  claimReceipt,
  uploadSignature,
  helpList,
  helpCreate,
};
