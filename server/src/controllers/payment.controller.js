const { orderIdParamSchema, updatePaymentStatusSchema, proofQueueQuerySchema, proofDecisionSchema } = require('../validators/payment.validator');
const { objectIdParamSchema } = require('../validators/common.validator');
const { getPaymentForOrder, updatePaymentStatus, toPaymentView } = require('../services/payment.service');
const { listProofs, getProofLink, decideProof } = require('../services/paymentProof.service');
const { OrderError } = require('../services/order.service');
const { formatZodError } = require('../utils/formatZodError');
const { recordAdminAction } = require('../services/adminAction.service');
const { ROLES } = require('../config/roles');

const isPlatformAdmin = (user) => user.role === ROLES.SUPER_ADMIN || user.role === ROLES.ADMIN_PARTNER;

function invalid(res, error) {
  return res.status(400).json({ success: false, message: 'Validation failed.', errors: formatZodError(error) });
}

function handleError(err, res, next) {
  if (err instanceof OrderError) {
    return res.status(err.status).json({ success: false, message: err.message, ...err.extra });
  }
  return next(err);
}

// req.tenantBrandId is set for brand users only (undefined/null otherwise).
async function getForOrder(req, res, next) {
  const params = orderIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  try {
    const payment = await getPaymentForOrder(req.user, req.tenantBrandId, params.data.orderId);
    return res.status(200).json({ success: true, payment });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function updateStatus(req, res, next) {
  const params = objectIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  const body = updatePaymentStatusSchema.safeParse(req.body);
  if (!body.success) return invalid(res, body.error);
  try {
    const payment = await updatePaymentStatus({
      userId: req.user._id,
      tenantBrandId: req.tenantBrandId || null,
      paymentId: params.data.id,
      ...body.data,
    });
    if (isPlatformAdmin(req.user)) {
      await recordAdminAction({
        actor: req.user,
        action: 'payment.status',
        target: { type: 'Payment', id: params.data.id },
        details: `Status set to ${body.data.status}.`,
      });
    }
    return res.status(200).json({ success: true, message: 'Payment status updated', payment: toPaymentView(req.user, payment) });
  } catch (err) {
    return handleError(err, res, next);
  }
}

// --- Payment proof photos taken at the door (docs/21 §I) ---
async function proofs(req, res, next) {
  const parsed = proofQueueQuerySchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const result = await listProofs(req.user, req.tenantBrandId || null, parsed.data);
    return res.status(200).json({ success: true, proofs: result.items, pagination: result.pagination });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function proofLink(req, res, next) {
  const params = objectIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  try {
    const link = await getProofLink(req.user, req.tenantBrandId || null, params.data.id);
    return res.status(200).json({ success: true, proof: link });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function decide(req, res, next) {
  const params = objectIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  const body = proofDecisionSchema.safeParse(req.body);
  if (!body.success) return invalid(res, body.error);
  try {
    const proof = await decideProof({
      user: req.user,
      tenantBrandId: req.tenantBrandId || null,
      paymentId: params.data.id,
      ...body.data,
    });
    if (isPlatformAdmin(req.user)) {
      await recordAdminAction({
        actor: req.user,
        action: 'payment.proof',
        target: { type: 'Payment', id: params.data.id },
        details: `Proof ${body.data.verification.toLowerCase()}${body.data.note ? `: ${body.data.note}` : '.'}`,
      });
    }
    return res.status(200).json({ success: true, message: 'Payment proof updated', proof });
  } catch (err) {
    return handleError(err, res, next);
  }
}

module.exports = { getForOrder, updateStatus, proofs, proofLink, decide };
