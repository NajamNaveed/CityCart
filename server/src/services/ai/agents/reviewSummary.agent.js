const mongoose = require('mongoose');
const { z } = require('zod');

const Review = require('../../../models/review.model');
const Product = require('../../../models/product.model');
const Brand = require('../../../models/brand.model');
const { generate } = require('../index');
const { getCached, setCached } = require('../cache');
const { sanitizeUserText, parseModelJson } = require('../guard');
const { buildReviewSummaryMessages } = require('../prompts/reviewSummary.prompt');

const MIN_REVIEWS = 3;
const MAX_REVIEWS = 30;
const COMMENT_LIMIT = 500;
const TITLE_LIMIT = 120;
const CACHE_TTL_SECONDS = 60 * 60;

class ReviewSummaryError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const modelSchema = z.object({
  summary: z.string().trim().min(20).max(600),
});

// Same public rule as the reviews list: an active product in an active brand.
async function loadPublicProduct(productId) {
  const product = await Product.findOne({ _id: productId, status: 'ACTIVE', isActive: true })
    .select('name brandId')
    .lean();
  if (!product) return null;
  const brand = await Brand.exists({ _id: product.brandId, status: 'ACTIVE' });
  return brand ? product : null;
}

// The review count is in the key, so a new, edited-away or deleted review
// that changes the count regenerates the summary (docs/29 Phase 1b).
function cacheKeyOf(productId, reviewCount) {
  return `review-summary:${productId}:${reviewCount}`;
}

async function draftReviewSummary({ productId, ctx }) {
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throw new ReviewSummaryError(404, 'Product not found.');
  }

  const product = await loadPublicProduct(productId);
  if (!product) throw new ReviewSummaryError(404, 'Product not found.');

  const filter = { productId, isApproved: true };
  const [reviews, reviewCount] = await Promise.all([
    Review.find(filter).sort({ createdAt: -1 }).limit(MAX_REVIEWS).lean(),
    Review.countDocuments(filter),
  ]);

  const key = cacheKeyOf(productId, reviewCount);
  const cached = await getCached(key);
  if (cached) return cached;

  if (reviewCount < MIN_REVIEWS) {
    return { summary: null, reviewCount, minimumReviews: MIN_REVIEWS };
  }

  const result = await generate({
    task: 'review-summary',
    messages: buildReviewSummaryMessages({
      productName: product.name,
      reviewCount,
      reviews: reviews.map((review) => ({
        rating: review.rating,
        title: sanitizeUserText(review.title || '', TITLE_LIMIT),
        comment: sanitizeUserText(review.comment || '', COMMENT_LIMIT),
      })),
    }),
    json: true,
    temperature: 0.3,
    maxTokens: 400,
    userId: ctx.userId,
    role: ctx.role,
  });

  const parsed = parseModelJson(result.text, modelSchema);
  const value = { summary: parsed.summary, reviewCount, minimumReviews: MIN_REVIEWS };
  await setCached(key, value, CACHE_TTL_SECONDS);
  return value;
}

module.exports = {
  draftReviewSummary,
  ReviewSummaryError,
  MIN_REVIEWS,
  MAX_REVIEWS,
  cacheKeyOf,
};
