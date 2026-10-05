const {
  createReviewSchema,
  updateReviewSchema,
  listReviewsQuerySchema,
  summaryQuerySchema,
  myReviewsQuerySchema,
  brandReviewsQuerySchema,
  adminReviewsQuerySchema,
  setApprovalSchema,
} = require('../validators/review.validator');
const {
  ReviewError,
  listProductReviews,
  ratingsFor,
  createReview,
  listMyReviews,
  updateMyReview,
  removeMyReview,
  listBrandReviews,
  listAdminReviews,
  setReviewApproval,
} = require('../services/review.service');
const { formatZodError } = require('../utils/formatZodError');

function invalid(res, error) {
  return res.status(400).json({ success: false, message: 'Validation failed.', errors: formatZodError(error) });
}

function handleError(err, res, next) {
  if (err instanceof ReviewError) {
    return res.status(err.status).json({ success: false, message: err.message, ...err.extra });
  }
  return next(err);
}

// GET /products/:id/reviews (public)
async function forProduct(req, res, next) {
  const parsed = listReviewsQuerySchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const result = await listProductReviews(req.params.id, parsed.data);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return handleError(err, res, next);
  }
}

// GET /reviews/summary?productIds=a,b,c (public)
async function summary(req, res, next) {
  const parsed = summaryQuerySchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const ratings = await ratingsFor(parsed.data.productIds.split(',').map((id) => id.trim()).filter(Boolean));
    return res.status(200).json({ success: true, ratings });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function create(req, res, next) {
  const parsed = createReviewSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const review = await createReview(req.user._id, parsed.data);
    return res.status(201).json({ success: true, message: 'Review posted', review });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function mine(req, res, next) {
  const parsed = myReviewsQuerySchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const reviews = await listMyReviews(req.user._id, parsed.data);
    return res.status(200).json({ success: true, reviews });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function update(req, res, next) {
  const parsed = updateReviewSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const review = await updateMyReview(req.user._id, req.params.id, parsed.data);
    return res.status(200).json({ success: true, message: 'Review updated', review });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function remove(req, res, next) {
  try {
    await removeMyReview(req.user._id, req.params.id);
    return res.status(200).json({ success: true, message: 'Review deleted' });
  } catch (err) {
    return handleError(err, res, next);
  }
}

// GET /reviews/brand: the caller's own brand only (tenant comes from the login, never the request).
async function brandList(req, res, next) {
  const parsed = brandReviewsQuerySchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed.error);
  if (!req.tenantBrandId) {
    return res
      .status(403)
      .json({ success: false, message: 'You are not authorized to perform this action.', code: 'NO_BRAND' });
  }
  try {
    const result = await listBrandReviews(req.tenantBrandId, parsed.data);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return handleError(err, res, next);
  }
}

// GET /admin/reviews
async function adminList(req, res, next) {
  const parsed = adminReviewsQuerySchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const result = await listAdminReviews(parsed.data);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return handleError(err, res, next);
  }
}

// PATCH /admin/reviews/:id  { isApproved }  hides or shows a review
async function adminSetApproval(req, res, next) {
  const parsed = setApprovalSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const review = await setReviewApproval(req.params.id, parsed.data.isApproved);
    return res.status(200).json({ success: true, message: parsed.data.isApproved ? 'Review shown' : 'Review hidden', review });
  } catch (err) {
    return handleError(err, res, next);
  }
}

module.exports = { forProduct, summary, create, mine, update, remove, brandList, adminList, adminSetApproval };