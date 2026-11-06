const {
  createServiceReviewSchema,
  replyToReviewSchema,
  listProviderReviewsQuerySchema,
  adminListServiceReviewsQuerySchema,
  setServiceReviewApprovalSchema,
  serviceReviewParamSchema,
  bookingParamSchema,
} = require('../validators/serviceReview.validator');
const {
  ServiceReviewError,
  createServiceReview,
  getBookingReview,
  replyToServiceReview,
  listProviderReviews,
  listAdminServiceReviews,
  setServiceReviewApproval,
} = require('../services/serviceReview.service');
const { formatZodError } = require('../utils/formatZodError');
const { recordAdminAction } = require('../services/adminAction.service');

function invalid(res, error) {
  return res.status(400).json({ success: false, message: 'Validation failed.', errors: formatZodError(error) });
}

function handleError(err, res, next) {
  if (err instanceof ServiceReviewError) {
    return res.status(err.status).json({
      success: false,
      message: err.message,
      ...(err.extra || {}),
    });
  }
  return next(err);
}

async function create(req, res, next) {
  const params = bookingParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  const parsed = createServiceReviewSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const review = await createServiceReview(req.user._id, params.data.id, parsed.data);
    return res.status(201).json({ success: true, message: 'Review posted.', review });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function bookingReview(req, res, next) {
  const params = bookingParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  try {
    const review = await getBookingReview(req.user._id, params.data.id);
    return res.status(200).json({ success: true, review });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function providerList(req, res, next) {
  const parsed = listProviderReviewsQuerySchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const result = await listProviderReviews(req.tenantProviderId, parsed.data);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function reply(req, res, next) {
  const params = serviceReviewParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  const parsed = replyToReviewSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const review = await replyToServiceReview(req.tenantProviderId, params.data.id, parsed.data);
    return res.status(200).json({ success: true, message: 'Reply posted.', review });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function adminList(req, res, next) {
  const parsed = adminListServiceReviewsQuerySchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const result = await listAdminServiceReviews(parsed.data);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function adminSetApproval(req, res, next) {
  const params = serviceReviewParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  const parsed = setServiceReviewApprovalSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const review = await setServiceReviewApproval(params.data.id, parsed.data.isApproved);
    await recordAdminAction({
      actor: req.user,
      action: 'serviceReview.moderate',
      target: { type: 'ServiceReview', id: review._id },
      details: parsed.data.isApproved ? 'Service review shown.' : 'Service review hidden.',
    });
    return res.status(200).json({
      success: true,
      message: parsed.data.isApproved ? 'Review shown' : 'Review hidden',
      review,
    });
  } catch (err) {
    return handleError(err, res, next);
  }
}

module.exports = { create, bookingReview, providerList, reply, adminList, adminSetApproval };
